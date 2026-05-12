---
name: silence-cut
description: Use when the user asks for auto-cutting, silence removal, or gap trimming on a video/audio file. Detects silent gaps via ffmpeg silencedetect and trims them to a target duration. Triggers on keywords like "컷편집", "무음구간", "무음 제거", "뜸 제거", "갭 제거", "자동 컷".
allowed-tools: [Bash, Read]
---

# 무음 구간 자동 컷편집

## Overview

영상/오디오 파일에서 무음 구간을 감지하고, 지정된 길이(기본 0.25초)로 줄여서 이어붙인다.
ffmpeg `silencedetect` 필터 기반. 대사는 보존하고 뜸만 줄인다.

---

## 기본 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| NOISE_THRESHOLD | -40dB | 이 이하를 무음으로 판단. 낮을수록 보수적 (대사 보호) |
| MIN_SILENCE_DUR | 0.4초 | 이 이상 지속되는 무음만 처리. 짧은 숨쉬기는 유지 |
| KEEP_SILENCE | 0.25초 | 무음 구간을 이 길이로 줄임 (완전 제거 X) |

### 파라미터 조정 가이드

- 대사가 잘리면: NOISE_THRESHOLD를 낮춤 (-40 → -45dB)
- 뜸이 남으면: MIN_SILENCE_DUR를 낮춤 (0.4 → 0.3초)
- 너무 빡빡하면: KEEP_SILENCE를 올림 (0.25 → 0.35초)

---

## 실행 방법

1. 사용자에게 **입력 파일 경로** 확인
2. `skills/silence-cut/silence_cut.py` 실행
3. 출력 파일: 원본명_final.mp4 (같은 폴더)
4. 결과 보고: 원본 길이, 결과 길이, 제거된 시간, 감지된 무음 구간 수

## 스크립트

`silence_cut.py`를 사용하되, 사용자 요청에 따라 파라미터 조정 가능.

---

## 사용 흐름

```
사용자: "이 영상 컷편집해줘" + 파일 경로
  ↓
1. 파일 존재 확인 (ffprobe)
2. silence_cut.py 실행 (기본 파라미터)
3. 결과 보고 (before/after 길이)
4. 사용자 피드백 → 파라미터 조정 후 재실행
```

---

## 인코딩 우선순위

1. h264_nvenc (GPU) — 빠름
2. libx264 (CPU) — 폴백, -preset fast -crf 18
