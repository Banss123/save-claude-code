---
name: situation-recommend
description: Use when the user describes their current business situation and wants session recommendations — finds the most relevant sessions from SITUATION_MAP and MASTER_INDEX
allowed-tools: [Read, Glob]
---

# 상황 기반 세션 추천

## Overview

사용자의 현재 비즈니스 상황을 듣고, SITUATION_MAP과 MASTER_INDEX를 기반으로 가장 관련성 높은 세션을 추천한다.

## 입력

- 사용자의 현재 상황 설명 (자유 형식)
- 또는 SITUATION_MAP의 12개 상황 중 선택

## 실행 순서

1. 사용자 상황을 SITUATION_MAP의 12개 상황 카테고리에 매핑
2. 해당 상황의 세션 목록에서 P1 우선순위 + ⬜ 미시작 세션 필터링
3. 추천 리스트 출력:
   - 1순위: 해당 상황 직접 매핑 세션 (P1 우선)
   - 2순위: 인접 상황의 보조 세션
   - 3순위: 이미 완료된 관련 세션 (복습 제안)
4. 각 추천 세션에 "왜 지금 이걸 봐야 하는지" 한 줄 이유 포함

## 출력 포맷

```
현재 상황: {매핑된 상황 카테고리}

추천 세션 (미시작 P1):
1. S{ID}: {제목} — {추천 이유 한 줄}
2. ...

보조 세션:
- S{ID}: {제목} — {인접 상황에서 가져온 이유}

복습 추천 (완료된 세션):
- S{ID}: {제목} — {다시 볼 이유}
```

## 규칙

- 한번에 5개 이하로 추천 (선택지 과부하 방지)
- 완료 세션은 "내 상황 적용" 칸이 채워진 경우에만 복습 추천
- 여러 상황에 걸치는 경우 교차 세션 우선 추천
