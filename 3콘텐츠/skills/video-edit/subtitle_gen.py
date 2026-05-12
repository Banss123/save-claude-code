#!/usr/bin/env python3
"""
subtitle_gen.py - Whisper 기반 자막(SRT) 생성기
컷 포인트 동기화 지원 — 컷이 바뀔 때 자막도 같이 전환

사용법:
  python subtitle_gen.py "영상_cut.mp4"
  python subtitle_gen.py "영상_cut.mp4" --max-chars 12 --max-duration 2
  python subtitle_gen.py "영상_cut.mp4" --model large-v3
"""

import sys
import os
import json
import argparse
from pathlib import Path


def format_srt_time(seconds):
    """초 → SRT 타임코드 (HH:MM:SS,mmm)"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def load_cut_points(input_file):
    """silence_cutter가 생성한 .cuts.json 자동 탐지"""
    cuts_path = str(Path(input_file).with_suffix(".cuts.json"))
    if os.path.exists(cuts_path):
        with open(cuts_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        points = data.get("cut_points", [])
        print(f"  컷 포인트 로드: {len(points)}개 ({Path(cuts_path).name})")
        return points
    return []


def transcribe(input_file, model_size="large-v3", language="ko"):
    """Whisper로 음성 인식 → word 단위 리스트 반환"""
    from faster_whisper import WhisperModel

    print(f"  모델 로딩 중... ({model_size}, CPU)")
    if model_size.startswith("large"):
        print(f"  (large 모델 첫 실행 시 다운로드 ~3GB, 이후 캐시)")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"  음성 인식 중... (언어: {language})")
    segments_iter, info = model.transcribe(
        input_file,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=200,
            speech_pad_ms=80,
        ),
    )

    print(f"  감지된 언어: {info.language} (확률: {info.language_probability:.1%})")

    # 모든 word를 평탄화
    words = []
    for segment in segments_iter:
        if segment.words:
            for w in segment.words:
                text = w.word.strip()
                if text:
                    words.append({
                        "text": text,
                        "start": w.start,
                        "end": w.end,
                    })
        else:
            # word timestamps 없으면 세그먼트 통째로
            text = segment.text.strip()
            if text:
                words.append({
                    "text": text,
                    "start": segment.start,
                    "end": segment.end,
                })

    print(f"  인식된 단어: {len(words)}개")
    return words


def build_subtitles(words, cut_points, max_chars=12, max_duration=2.0,
                    min_duration=0.3):
    """
    word 리스트 → 자막 리스트 생성
    컷 포인트에서 강제 분할하여 컷 전환과 자막 전환이 동기화됨
    """
    if not words:
        return []

    # 컷 포인트를 set으로 (빠른 조회용)
    cut_set = sorted(cut_points) if cut_points else []

    def crosses_cut(start, end):
        """구간 사이에 컷 포인트가 있는지"""
        for cp in cut_set:
            if start < cp < end:
                return cp
        return None

    subtitles = []
    current_text = ""
    current_start = None
    current_end = None

    def flush():
        nonlocal current_text, current_start, current_end
        if current_text and current_start is not None:
            duration = current_end - current_start
            if duration < min_duration:
                current_end = current_start + min_duration
            subtitles.append({
                "start": current_start,
                "end": current_end,
                "text": current_text,
            })
        current_text = ""
        current_start = None
        current_end = None

    for word in words:
        w_text = word["text"]
        w_start = word["start"]
        w_end = word["end"]

        if current_start is None:
            # 새 자막 시작
            current_start = w_start
            current_text = w_text
            current_end = w_end
            continue

        # 컷 포인트가 현재 자막과 이 단어 사이에 있는지
        cp = crosses_cut(current_end, w_start)
        if cp is not None:
            # 컷 전환점 → 강제 분할
            flush()
            current_start = w_start
            current_text = w_text
            current_end = w_end
            continue

        # 일반 분할 조건
        new_len = len(current_text) + len(w_text) + 1
        new_duration = w_end - current_start
        gap = w_start - current_end

        split = False
        if new_len > max_chars:
            split = True
        elif new_duration > max_duration:
            split = True
        elif gap > 0.4:
            split = True

        if split:
            flush()
            current_start = w_start
            current_text = w_text
            current_end = w_end
        else:
            current_text += " " + w_text
            current_end = w_end

    flush()
    return subtitles


def write_srt(subtitles, output_path):
    """자막 리스트 → SRT 파일 저장"""
    with open(output_path, "w", encoding="utf-8") as f:
        for i, sub in enumerate(subtitles, 1):
            f.write(f"{i}\n")
            f.write(f"{format_srt_time(sub['start'])} --> {format_srt_time(sub['end'])}\n")
            f.write(f"{sub['text']}\n")
            f.write("\n")


def main():
    parser = argparse.ArgumentParser(
        description="Whisper 자막 생성 - 컷 동기화, 프리미어 프로 호환"
    )
    parser.add_argument("input", help="입력 영상/오디오 파일")
    parser.add_argument(
        "-o", "--output",
        help="출력 SRT 경로 (기본: 입력파일.srt)"
    )
    parser.add_argument(
        "-m", "--model", default="large-v3",
        help="Whisper 모델 (tiny/base/small/medium/large-v3, 기본: large-v3)"
    )
    parser.add_argument(
        "-l", "--language", default="ko",
        help="언어 코드 (기본: ko)"
    )
    parser.add_argument(
        "--max-chars", type=int, default=12,
        help="자막 한 줄 최대 글자수 (기본: 12)"
    )
    parser.add_argument(
        "--max-duration", type=float, default=2.0,
        help="자막 하나 최대 길이 초 (기본: 2.0)"
    )
    parser.add_argument(
        "--min-duration", type=float, default=0.3,
        help="자막 하나 최소 길이 초 (기본: 0.3)"
    )
    parser.add_argument(
        "--no-cut-sync", action="store_true",
        help="컷 포인트 동기화 비활성화"
    )

    args = parser.parse_args()

    input_file = args.input
    if not os.path.exists(input_file):
        print(f"  파일을 찾을 수 없습니다: {input_file}")
        sys.exit(1)

    if args.output:
        output_file = args.output
    else:
        p = Path(input_file)
        output_file = str(p.parent / f"{p.stem}.srt")

    print()
    print("=" * 55)
    print("  SUBTITLE GEN - 자막 자동 생성 (컷 동기화)")
    print("=" * 55)
    print(f"  입력:       {Path(input_file).name}")
    print(f"  모델:       {args.model} (CPU)")
    print(f"  자막 설정:  최대 {args.max_chars}자, {args.max_duration}초/줄")
    print()

    # 1. 컷 포인트 로드
    cut_points = []
    if not args.no_cut_sync:
        cut_points = load_cut_points(input_file)

    # 2. Whisper 음성 인식
    words = transcribe(
        input_file,
        model_size=args.model,
        language=args.language,
    )

    if not words:
        print("  음성이 감지되지 않았습니다.")
        sys.exit(1)

    # 3. 자막 생성 (컷 동기화 포함)
    subtitles = build_subtitles(
        words,
        cut_points,
        max_chars=args.max_chars,
        max_duration=args.max_duration,
        min_duration=args.min_duration,
    )

    if not subtitles:
        print("  자막 생성 실패.")
        sys.exit(1)

    # 4. SRT 저장
    write_srt(subtitles, output_file)

    # 5. Summary
    total_subs = len(subtitles)
    avg_len = sum(len(s["text"]) for s in subtitles) / total_subs
    avg_dur = sum(s["end"] - s["start"] for s in subtitles) / total_subs

    print()
    print("  " + "-" * 40)
    print(f"  완료!")
    print(f"  출력:      {output_file}")
    print(f"  자막 수:   {total_subs}개")
    print(f"  평균 길이: {avg_len:.1f}자, {avg_dur:.2f}초/줄")
    if cut_points:
        print(f"  컷 동기화: {len(cut_points)}개 컷 포인트 적용됨")
    print()
    print("  프리미어 프로: 파일 > 캡션 > 자막 파일 가져오기")
    print("  " + "-" * 40)
    print()


if __name__ == "__main__":
    main()
