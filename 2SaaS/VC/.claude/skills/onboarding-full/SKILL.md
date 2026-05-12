---
name: onboarding-full
description: 배민 매장 온보딩 파이프라인 전체를 한 번에 실행한다(로그인→메뉴/옵션 수집→통계·광고·NOW바 수집→MenuPlan 생성→SolutionPlan 조립→XLSX/DOCX 생성→자동 검수→바탕화면 복사). 매장명 하나로 엔드투엔드 실행이 필요할 때 이 스킬을 사용한다.
---

## 정본 참조

- **정본 문서**: `data/references/목표매출_산정로직.md` — 목표매출 산정의 유일한 권위 문서.
- 본 스킬은 정본 §산정 프레임워크(4 레버) §산정 공식(Step 1~5) 을 그대로 구현한
  `src.planner.lever_analysis.py` / `src.planner.target_revenue.py` 를 호출한다.
  - 정본 §Step 1: 플랫폼별 현재 매출 확정 → `LeverInput.baemin/coupang_eats/yogiyo` 중첩
  - 정본 §Step 2: 배민 단기/중기 개선 매출 산정 → `compute_targets()` 의 레버 곱셈
  - 정본 §Step 3: 타 플랫폼 → `_platform_target_placeholder()` ('데이터 부족' 고정)
  - 정본 §Step 4: 합산 + 확률 검증 → `total_tier_1/2`, 확률 재조정 루프
  - 정본 §Step 5: 수수료 상한 200만원 → `fee_cap_ok` 체크
- 파이프라인 종료 시 `src.validator.reference_check.check_reference()` 가
  §필수 준수 1~8 을 자동 검증하여 ValidationReport에 "정본 §필수 준수 검증" 그룹을 추가한다.

## 입력

- **매장명** (필수) — `data/담당자/accounts.csv`에 등록된 상호명과 정확히 일치해야 한다.
- **cuisine** (선택) — 업종 키워드 DB 매칭용. 기본값: `"돈까스·회·일식"`.
- **location** (선택) — 매장 주소. 미지정 시 스크래핑된 값 사용.
- **skip_scrape** (선택, boolean) — `true`면 기존 스크래핑 결과 재사용(3단계부터 실행).

### 전제 조건

- `data/담당자/accounts.csv`에 해당 매장의 배민 ID/PW가 존재
- `uv`가 설치되어 있고 `pyproject.toml`의 의존성이 설치 완료
- 작업 디렉토리: `C:/Users/반민성/.claude/a`

## 실행

```bash
# 기본 (스크래핑 포함)
uv run python -m src.orchestrator "<매장명>"

# 업종/위치 명시
uv run python -m src.orchestrator "<매장명>" --cuisine "<업종>" --location "<위치>"

# 스크래핑 스킵 (기존 output/<매장명>_현안.json + output/final/<매장명>_* 재사용)
uv run python -m src.orchestrator "<매장명>" --skip-scrape
```

내부 실행 단계 (참고용, 사용자가 개입할 필요 없음):
1. `src.scraper.baemin` — 메뉴/옵션 스크래핑
2. `src.scraper.baemin_final` — NOW바 + 통계 + 광고 수집
3. `src.planner.menu_plan_builder.build_menu_plan` — 현안+가안 MenuPlan 생성
4. `src.planner.solution_builder.build_solution_plan` — 규칙 기반 SolutionPlan 조립
5. `src.pipeline` — JSON → XLSX/DOCX + 검수
6. 바탕화면 복사

## 출력

`C:/Users/반민성/.claude/a/output/` 하위에 생성:

- `<매장명>_현안.json` — 스크래핑된 원본 메뉴/옵션
- `output/final/<매장명>_<YYYYMMDD_HHMMSS>/final.json` — 통계·광고·NOW바
- `<매장명>_menu_plan.json` — MenuPlan (Pydantic 스키마)
- `<매장명>_solution_plan.json` — SolutionPlan (Pydantic 스키마)
- `<매장명>_메뉴판_가안.xlsx` — 최종 엑셀
- `<매장명>_솔루션_계획서.docx` — 최종 워드
- `<매장명>_timing.json` — 단계별 소요 시간

그리고 `~/Desktop/`에 xlsx·docx 복사본.

## 검증

### 필수 파일 존재
- [ ] `output/<매장명>_menu_plan.json`
- [ ] `output/<매장명>_solution_plan.json`
- [ ] `output/<매장명>_메뉴판_가안.xlsx`
- [ ] `output/<매장명>_솔루션_계획서.docx`
- [ ] `output/<매장명>_timing.json`

### 정본 §필수 준수 검증 체크리스트

규칙 8건(REF-1~8) 정의·심각도·판정 기준·체크리스트는 [`../references/reference_check_rules.md`](../references/reference_check_rules.md) 참조 (단일 진실 출처).

ValidationReport 의 "정본 §필수 준수 검증" 그룹에서 8건이 모두 PASS 인지 확인. error 등급 FAIL 1건 이상이면 pipeline exit=1 로 차단된다.

### 종료 코드 해석
- `0` — 전체 성공, 검수 통과
- `1` — 문서 생성 성공, 검수 FAIL 존재 (문서는 전달 가능하나 FAIL 항목 확인 필요)
- `2` — 입력 파일 없음 / 업장명 불일치 / Pydantic 검증 실패
- `3` — 그 외 예외

### JSON 필드 스팟 체크 (선택)
- `menu_plan.json` → `current.store_name == proposed.store_name == <매장명>`
- `solution_plan.json` → `store.name == <매장명>`, `sections` 배열 비어있지 않음

## 에러 처리

| 증상 | 원인 | 대응 |
|------|------|------|
| `accounts.csv에 '<매장명>' 없음` | 계정 미등록 또는 오타 | 사용자에게 CSV 보강 또는 매장명 확인 요청 |
| `FileNotFoundError: accounts.csv` | `data/담당자/accounts.csv` 자체가 없음 | 파일 생성/복사 후 재실행 |
| 1단계 실패 (메뉴 스크래핑) | 로그인 실패·세션 만료·DOM 변화 | `data/담당자/sessions/baemin_*.json` 삭제 후 재시도. 3회 실패 시 담당자 에스컬레이션 |
| 2단계 실패 (통계/NOW바) | 대시보드 UI 변화 | stderr 확인. `--skip-scrape`로 우회 가능한지 확인 |
| 3단계 실패 (`[ERROR] 메뉴 스크래핑 결과 없음`) | 1단계가 JSON을 쓰지 못함 | 1단계 로그 재검토 |
| 4단계 `ValidationError` | 플래너 입력 JSON 스키마 위반 | raw JSON 필드 누락 의심. 사용자에게 원본 JSON 경로·에러 전문 보고 |
| 5단계 exit=1 | 검수 FAIL 있음 | 문서는 생성됨. `detail_report` 출력의 FAIL 항목 인용해서 사용자에게 확인 요청. 재실행 전 원인 수정 필요 |
| 5단계 exit=2 | 업장명 불일치 | 캐시 오염 의심. `output/<매장명>_*.json` 삭제 후 재실행 |
| 5단계 exit=3 | 그 외 | stderr 전체를 사용자에게 보여주고 정지. 임의 재시도 금지 |

### 재시도 정책
- 네트워크성 실패(타임아웃, 간헐적 DOM 로드 실패)는 1회 재시도
- 로그인 실패는 세션 삭제 후 1회 재시도
- 스키마/비즈니스 룰 실패는 **재시도하지 말고** 사용자에게 보고
