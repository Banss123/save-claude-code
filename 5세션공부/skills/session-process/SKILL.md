---
name: session-process
description: Use when the user pastes a YouTube transcript or asks to create a knowledge card from a session — generates a structured knowledge card in the standard format
allowed-tools: [Read, Write, Glob]
---

# 세션 지식카드 생성

## Overview

YouTube 자막 텍스트를 받아 표준 지식카드 포맷으로 변환한다.
자막만 붙여넣으면 한번에 완성된 카드를 생성.

## 입력

- YouTube 자막 텍스트 (타임스탬프 포함/미포함 모두 가능)
- 세션 ID (없으면 MASTER_INDEX에서 매칭하거나 사용자에게 확인)
- 카테고리 (없으면 내용 기반 자동 분류 후 확인)

## 실행 순서

1. 자막에서 핵심 내용 추출
2. MASTER_INDEX에서 해당 세션 ID/제목/카테고리/우선순위 확인
3. 표준 포맷에 맞춰 지식카드 생성:
   - 핵심 요약 3줄 (한 줄에 하나의 핵심 인사이트)
   - 핵심 원리 (표, 플로우차트, 비교 구조 적극 활용)
   - 레퍼런스 시나리오 10개 (다양한 업종/규모)
   - 내 상황 적용 3칸 (빈칸으로 남김)
   - 연결 세션 추천 (MASTER_INDEX/SITUATION_MAP 기반)
4. 해당 카테고리 폴더에 `S{ID}_{제목요약}.md`로 저장

## 품질 기준

- 핵심 요약: 이 카드만 읽어도 세션의 핵심을 알 수 있어야 함
- 핵심 원리: 이론 나열이 아닌 "이걸 어떻게 쓰는가" 중심
- 시나리오: 실제 사업 상황에서 바로 적용 가능한 수준
  - 업종 다양성: F&B, 의료/뷰티, SaaS, 커머스, 교육, 컨설팅 등
  - 규모 다양성: 1인 사업 ~ 스타트업 ~ 중소기업
- 연결 세션: "왜 이걸 다음에 봐야 하는지" 이유 포함
- 내 상황 적용 필드는 절대 미리 채우지 마라

## 출력 경로

`세션공부/{카테고리 폴더}/S{ID}_{제목요약}.md`
