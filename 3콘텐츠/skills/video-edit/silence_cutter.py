#!/usr/bin/env python3
"""
silence_cutter.py - 무음 구간 자동 제거 도구
메타광고/브랜딩 릴스용 빠른 템포 편집

사용법:
  python silence_cutter.py "영상.MOV"
  python silence_cutter.py "영상.MOV" --gap 0.15
  python silence_cutter.py "영상.MOV" --gap 0.1 --threshold -28
  python silence_cutter.py "영상.MOV" --dry-run          # 분석만
  python silence_cutter.py "영상.MOV" --config config.json
"""

import subprocess
import json
import re
import sys
import os
import argparse
import tempfile
from pathlib import Path


def get_duration(input_file):
    """영상 길이(초) 반환"""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", input_file
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ffprobe 에러: {result.stderr[:300]}")
        sys.exit(1)
    return float(json.loads(result.stdout)["format"]["duration"])


def detect_silence(input_file, threshold_db, min_duration):
    """FFmpeg silencedetect로 무음 구간 감지. [(start, end), ...] 반환"""
    print(f"  무음 감지 중... (기준: {threshold_db}dB, 최소 {min_duration}초)")

    cmd = [
        "ffmpeg", "-i", input_file,
        "-af", f"silencedetect=noise={threshold_db}dB:d={min_duration}",
        "-f", "null", "-"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    silences = []
    silence_start = None

    for line in result.stderr.split("\n"):
        if "silence_start:" in line:
            m = re.search(r"silence_start:\s*([\d.]+)", line)
            if m:
                silence_start = float(m.group(1))
        elif "silence_end:" in line:
            m = re.search(r"silence_end:\s*([\d.]+)", line)
            if m and silence_start is not None:
                silences.append((silence_start, float(m.group(1))))
                silence_start = None

    return silences


def get_speaking_segments(silences, total_duration, padding):
    """무음 구간의 역 = 음성 구간 리스트 추출"""
    if not silences:
        return [(0, total_duration)]

    segments = []
    pos = 0.0

    for sil_start, sil_end in silences:
        if sil_start > pos:
            start = max(0, pos - padding) if pos > 0 else 0
            end = min(total_duration, sil_start + padding)
            segments.append((round(start, 3), round(end, 3)))
        pos = sil_end

    # 마지막 무음 이후 남은 음성
    if pos < total_duration:
        start = max(0, pos - padding)
        segments.append((round(start, 3), round(total_duration, 3)))

    if not segments:
        return [(0, total_duration)]

    # 겹치는 구간 병합
    merged = [segments[0]]
    for s, e in segments[1:]:
        if s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))

    return merged


def render(input_file, output_file, segments, crf="18", preset="medium"):
    """세그먼트별 추출 후 concat demuxer로 합치기"""
    print(f"  렌더링 중... ({len(segments)}개 세그먼트)")

    with tempfile.TemporaryDirectory() as tmpdir:
        seg_files = []

        for i, (start, end) in enumerate(segments):
            seg_file = os.path.join(tmpdir, f"seg_{i:04d}.mp4")
            duration = end - start
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start), "-i", input_file,
                "-t", str(duration),
                "-filter_complex",
                "[0:v]format=yuv420p[outv];[0:a:0]anull[outa]",
                "-map", "[outv]", "-map", "[outa]",
                "-c:v", "libx264", "-crf", crf, "-preset", preset,
                "-c:a", "aac", "-b:a", "192k",
                seg_file
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                print(f"  세그먼트 {i+1} 에러: {result.stderr[-200:]}")
                sys.exit(1)
            seg_files.append(seg_file)

            # 진행률 표시
            pct = (i + 1) / len(segments) * 100
            if (i + 1) % 5 == 0 or i == len(segments) - 1:
                print(f"    [{pct:5.1f}%] {i+1}/{len(segments)} 세그먼트 완료")

        # concat 리스트 생성
        list_file = os.path.join(tmpdir, "concat.txt")
        with open(list_file, "w", encoding="utf-8") as f:
            for seg in seg_files:
                safe_path = seg.replace("\\", "/")
                f.write(f"file '{safe_path}'\n")

        # concat demuxer로 합치기 (re-encode 없이 복사)
        print("  합치는 중...")
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", list_file,
            "-c", "copy",
            "-movflags", "+faststart",
            output_file
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  합치기 에러: {result.stderr[-300:]}")
            sys.exit(1)


def format_time(seconds):
    """초 → M:SS 포맷"""
    m = int(seconds // 60)
    s = seconds % 60
    return f"{m}:{s:05.2f}"


def main():
    parser = argparse.ArgumentParser(
        description="무음 구간 자동 제거 - 메타광고/릴스용"
    )
    parser.add_argument("input", help="입력 영상 파일 경로")
    parser.add_argument(
        "-o", "--output",
        help="출력 파일 경로 (기본: 입력파일_cut.mp4)"
    )
    parser.add_argument(
        "-g", "--gap", type=float, default=0.25,
        help="최대 허용 갭 초 (기본: 0.25 / 광고용: 0.1 / 자연스러운: 0.3)"
    )
    parser.add_argument(
        "-t", "--threshold", type=int, default=-30,
        help="무음 판단 기준 dB (기본: -30 / 시끄러운 환경: -25)"
    )
    parser.add_argument(
        "-d", "--min-silence", type=float, default=0.4,
        help="이 길이 이상의 무음만 제거 (초, 기본: 0.4)"
    )
    parser.add_argument(
        "-p", "--padding", type=float, default=0.04,
        help="음성 구간 앞뒤 여유 패딩 (초, 기본: 0.04)"
    )
    parser.add_argument(
        "--crf", default="18",
        help="영상 품질 CRF (기본: 18 / 고화질: 15 / 용량절약: 23)"
    )
    parser.add_argument(
        "--preset", default="medium",
        help="인코딩 속도 (ultrafast/fast/medium/slow, 기본: medium)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="분석만 하고 렌더링하지 않음"
    )
    parser.add_argument("--config", help="설정 파일 경로 (JSON)")

    args = parser.parse_args()

    # Config file
    if args.config and os.path.exists(args.config):
        with open(args.config, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        args.gap = cfg.get("max_gap_seconds", args.gap)
        args.threshold = cfg.get("silence_threshold_db", args.threshold)
        args.min_silence = cfg.get("min_silence_duration", args.min_silence)
        args.padding = cfg.get("padding", args.padding)
        args.crf = str(cfg.get("video_quality", args.crf))
        args.preset = cfg.get("preset", args.preset)

    input_file = args.input
    if not os.path.exists(input_file):
        print(f"  파일을 찾을 수 없습니다: {input_file}")
        sys.exit(1)

    if args.output:
        output_file = args.output
    else:
        p = Path(input_file)
        output_file = str(p.parent / f"{p.stem}_cut.mp4")

    # Header
    print()
    print("=" * 55)
    print("  SILENCE CUTTER - 무음 자동 제거")
    print("=" * 55)
    print(f"  입력:     {Path(input_file).name}")
    print(f"  설정:     갭={args.gap}초 | 기준={args.threshold}dB | 최소무음={args.min_silence}초")
    print()

    # 1. Duration
    total_duration = get_duration(input_file)
    print(f"  원본 길이: {format_time(total_duration)} ({total_duration:.1f}초)")

    # 2. Detect silence
    silences = detect_silence(input_file, args.threshold, args.min_silence)
    total_silence = sum(e - s for s, e in silences)
    print(f"  무음 구간: {len(silences)}개, 총 {total_silence:.1f}초")

    if not silences:
        print("\n  무음 구간이 없습니다. 원본 그대로 유지.")
        print("  (--threshold 값을 높이거나 --min-silence 값을 낮춰보세요)")
        return

    # 3. Speaking segments
    segments = get_speaking_segments(silences, total_duration, args.padding)
    kept_duration = sum(e - s for s, e in segments)
    removed = total_duration - kept_duration

    print(f"  음성 구간: {len(segments)}개")
    print()
    print(f"  >>> 예상 결과: {format_time(kept_duration)} ({kept_duration:.1f}초)")
    print(f"  >>> 제거량:   {removed:.1f}초 ({removed / total_duration * 100:.1f}%)")
    print()

    # 4. Dry run detail
    if args.dry_run:
        print("  [DRY RUN] 세그먼트 상세:")
        print(f"  {'#':>4}  {'시작':>10}  {'끝':>10}  {'길이':>8}")
        print(f"  {'-'*4}  {'-'*10}  {'-'*10}  {'-'*8}")
        for i, (s, e) in enumerate(segments):
            print(f"  {i+1:4d}  {format_time(s):>10}  {format_time(e):>10}  {e-s:7.3f}s")

        print(f"\n  무음 구간 상세:")
        print(f"  {'#':>4}  {'시작':>10}  {'끝':>10}  {'길이':>8}")
        print(f"  {'-'*4}  {'-'*10}  {'-'*10}  {'-'*8}")
        for i, (s, e) in enumerate(silences):
            print(f"  {i+1:4d}  {format_time(s):>10}  {format_time(e):>10}  {e-s:7.3f}s")

        print(f"\n  렌더링 건너뜀 (--dry-run 모드)")
        print(f"  실제 렌더링: --dry-run 빼고 다시 실행\n")
        return

    # 5. Render
    render(input_file, output_file, segments, args.crf, args.preset)

    # 6. 컷 포인트 JSON 저장 (자막 동기화용)
    cut_points = []
    pos = 0.0
    for start, end in segments:
        pos += (end - start)
        cut_points.append(round(pos, 3))
    cut_points = cut_points[:-1]  # 마지막은 영상 끝이므로 제외

    cuts_file = str(Path(output_file).with_suffix(".cuts.json"))
    with open(cuts_file, "w", encoding="utf-8") as f:
        json.dump({
            "cut_points": cut_points,
            "total_cuts": len(cut_points),
            "source": os.path.basename(input_file),
        }, f, ensure_ascii=False, indent=2)

    # 7. Verify
    if os.path.exists(output_file):
        out_duration = get_duration(output_file)
        out_size = os.path.getsize(output_file) / (1024 * 1024)
        in_size = os.path.getsize(input_file) / (1024 * 1024)

        print()
        print("  " + "-" * 40)
        print(f"  완료!")
        print(f"  출력:  {output_file}")
        print(f"  컷맵:  {cuts_file}")
        print(f"  길이:  {format_time(total_duration)} -> {format_time(out_duration)}  (-{total_duration - out_duration:.1f}초)")
        print(f"  크기:  {in_size:.1f}MB -> {out_size:.1f}MB")
        print("  " + "-" * 40)
        print()
    else:
        print("  출력 파일 생성 실패!")
        sys.exit(1)


if __name__ == "__main__":
    main()
