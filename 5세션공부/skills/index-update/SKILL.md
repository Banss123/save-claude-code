---
name: index-update
description: Use after a knowledge card is completed — updates MASTER_INDEX status and adds links to SITUATION_MAP
allowed-tools: [Read, Edit, Glob]
---

# 인덱스 업데이트

## Overview

지식카드 완료 후 MASTER_INDEX 상태를 업데이트하고, SITUATION_MAP에 해당 세션 링크를 추가한다.
카드 생성 직후 자동 실행하거나, 사용자가 명시적으로 요청 시 실행.

## 입력

- 완료된 세션 ID (예: S081)
- 지식카드 파일 경로

## 실행 순서

1. `_INDEX/MASTER_INDEX.md`에서 해당 세션 행 찾기
2. 상태를 ✅로 변경, 링크 컬럼에 상대경로 추가
3. `_INDEX/SITUATION_MAP.md`에서 해당 세션이 포함된 상황 섹션 찾기
4. 세션 항목 뒤에 ✅ 표시 추가
5. 변경 내용 요약 보고

## 규칙

- MASTER_INDEX: 상태 컬럼만 변경 (⬜ → ✅), 우선순위/제목은 건드리지 마라
- SITUATION_MAP: 기존 세션 항목 뒤에 ✅만 추가, 구조 변경 금지
- 해당 세션이 SITUATION_MAP에 없으면: 관련 상황 섹션을 제안하되, 사용자 승인 후 추가
- 한번에 여러 세션 업데이트도 가능 (배치)
