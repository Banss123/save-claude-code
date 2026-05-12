# 밸류체인 온보딩 — Claude Code 래퍼

이 `.claude/` 디렉토리는 `src/` 아래 완성된 Python 파이프라인을 Claude Code의 에이전트·스킬·슬래시 커맨드로 래핑합니다. 모든 실행은 `uv run python -m src.xxx` CLI를 통해 이루어지며, LLM은 순서 제어와 검증만 담당합니다(결정론 유지).

## 빠른 사용법

- `/온보딩 홍콩반점` — 매장 1곳 원샷 실행 (스크래핑 → 문서 → 검수 → 바탕화면 복사)
- `/온보딩 홍콩반점 --skip-scrape` — 기존 스크래핑 결과 재사용
- `/온보딩-배치 홍콩반점, 맛나분식` — 매장 여러 곳 순차 실행

## 구성

- `agents/value-chain-onboarding.md` — 실행·검증 오케스트레이터 (sonnet)
- `skills/onboarding-full/` — `src.orchestrator` 원샷 호출(기본 경로)
- `skills/baemin-collect/` — 스크래핑만 단독 재실행
- `skills/document-build/` — JSON→XLSX/DOCX만 재생성
- `skills/quality-check/` — 자동 검수만 재실행 + 리포트 저장
- `commands/온보딩.md`, `commands/온보딩-배치.md` — 슬래시 커맨드

## 전제 조건

- `data/담당자/accounts.csv`에 매장 배민 ID/PW 등록
- `uv sync`로 의존성 설치 완료
- 작업 디렉토리는 `C:/Users/반민성/.claude/a`
