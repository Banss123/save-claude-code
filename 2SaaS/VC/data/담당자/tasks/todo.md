# 밸류체인 파이프라인 완성 Task

> 착수: 2026-04-11
> 목표: Phase 2(AI 분석) + 오케스트레이터(`pipeline.py`) 완성

---

## 수락 기준 (Definition of Done)

- [x] `src/pipeline.py` 존재, CLI로 실행 가능
- [x] `MenuPlan` JSON + `SolutionPlan` JSON → XLSX/DOCX + 검수 리포트 E2E 성공
- [x] 맛나치킨 강남점 샘플로 실제 검증 통과 (FAIL 0건, WARN 2건 — 의도된 차이)
- [x] `ValidationReport.is_ok == True` 확인 (종료 코드 0)

---

## 핵심 제약 / 불변량

- **AI 분석은 Anthropic API 호출 금지.** Claude Code 대화 내에서 판단 → JSON 파일로 저장
- **`anthropic` SDK 의존성 추가 금지.** pyproject.toml 그대로 유지 (비용 0원)
- **`src/analyzer/solution_analyzer.py`는 보존.** 절대 수정/삭제 금지 (나중에 API 모드 전환 대비)
- **`src/pipeline.py`는 `src/analyzer/*` import 금지.** (anthropic 미설치 상태에서 pipeline 실행 시 import chain 깨짐 방지)
- **문서 포맷/디자인은 코드 고정.** JSON에 포맷팅 지시 없음

---

## 실행 체크리스트

### Phase C: 파이프라인 오케스트레이터

- [x] C-1. `tasks/todo.md` 작성 (이 파일)
- [x] C-2. `src/pipeline.py` 작성
  - 입력: `--menu`, `--solution`, `--output-dir` CLI 인자
  - 단계: JSON 로드 (Pydantic 검증) → 업장명 일치 확인 → XLSX/DOCX 생성 → `validate_all()` → 리포트 출력
  - 재사용: `validator.validate_all()`, `ValidationReport.detail_report()`
  - 에러 처리: FileNotFoundError(2), ValueError(2), 기타 예외(3) / 검수 FAIL(1), 정상(0)

### Phase D: 샘플 E2E 검증

- [x] D-1. 맛나치킨 강남점 MenuPlan JSON 생성 (`data/samples/맛나치킨_menu_plan.json`)
- [x] D-2. 기존 `output/맛나치킨 강남점_솔루션.json` 스키마 호환 확인 (통과)
- [x] D-3. E2E 실행 성공 (`uv run python -m src.pipeline`)
- [x] D-4. 검수 리포트 확인 — 17/19 PASS, FAIL 0, WARN 2 (의도된 차이)
- [x] D-5. 재실행 불필요 (첫 시도 통과)

### Phase E: (추가) uv 환경 구축

- [x] E-1. `uv 0.11.3` 확인, `uv sync`로 `.venv` 생성 + `uv.lock` 생성
- [x] E-2. 의존성 설치: python-docx 1.2.0, openpyxl 3.1.5, pydantic 2.12.5 등 9개

---

## 발견된 제약/함정

- `src/validator/__init__.py`에 이미 `validate_all()` 있음 → 재사용 (dataclass 재정의 불필요)
- `src/schemas/validation.py`의 `ValidationReport`에 `is_ok`, `summary()`, `detail_report()` 완비 → 그대로 활용
- `anthropic` 패키지가 `pyproject.toml`에 없음 → `src/analyzer/solution_analyzer.py`를 import하는 순간 `ModuleNotFoundError` 발생 가능 → `pipeline.py`는 `analyzer/` 일체 import 금지
- `테스트업장_raw.json`의 `store_name`은 "맛나치킨 강남점" → `SolutionPlan.store.name` 과 일치 확인 필요
- `더피플버거_menu_sample.json`이 이미 MenuPlan 형태 → MenuPlan JSON 구조 참조 샘플로 활용 가능
- 기존 `output/맛나치킨 강남점_솔루션.json`은 v1 결과물 — 만약 파일 구조가 현재 SolutionPlan 스키마와 다르면 재생성 필요

---

## 다음 이터레이션 후보 (이번 스코프 아님)

- `anthropic` SDK 도입 → API 모드 (Opus/Sonnet 선택)
- `menu_analyzer.py` 신규 (현재 단계는 Claude Code 대화로 대체)
- Prompt Caching + Batch API
- 슬랙 봇 (`src/bot/`)
- Playwright 스크래핑 (`src/scraper/`)
