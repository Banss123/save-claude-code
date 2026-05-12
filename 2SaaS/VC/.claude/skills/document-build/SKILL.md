---
name: document-build
description: MenuPlan·SolutionPlan JSON을 입력받아 결정론 코드로 XLSX(메뉴판 가안) + DOCX(솔루션 계획서) + 검수 리포트를 생성한다. 스크래핑·플래너를 다시 돌리지 않고 문서만 재생성해야 할 때 사용한다.
---

## 정본 참조

- **목표매출 산정 정본**: `data/references/목표매출_산정로직.md` §출력 형식(라인 199-303).
- **솔루션 양식 마스터**: `data/references/_솔루션양식_표준.md` (docx_builder.py L8 명시).
- **DOCX 명세 v1.0**: `docs/DOCX_SPEC.md` (레퍼런스 6건 분석 결과).
- **XLSX 디자인 상수**: `src/generator/xlsx_builder.py` L14-50 (코드 자체가 정본).
- **6섹션 정본 ↔ 코드 매핑**: [`../references/output_format_6sections.md`](../references/output_format_6sections.md) (단일 진실 출처).

## 입력

- **menu_json** (필수) — MenuPlan JSON 경로 (예: `output/<매장명>_menu_plan.json`)
- **solution_json** (필수) — SolutionPlan JSON 경로 (예: `output/<매장명>_solution_plan.json`)
- **output_dir** (선택) — 출력 디렉토리. 기본 `output/`
- **raw_json** (선택) — 스크래핑 raw JSON 경로. 제공 시 hallucination 검수 추가 활성화

### 전제 조건
- 두 JSON 파일 내부의 `store.name` / `current.store_name`이 **동일한 매장명**이어야 한다(불일치 시 exit=2)
- JSON은 Pydantic 스키마(`MenuPlan`, `SolutionPlan`)에 맞아야 한다

## 실행

```bash
# 기본
uv run python -m src.pipeline \
  --menu "output/<매장명>_menu_plan.json" \
  --solution "output/<매장명>_solution_plan.json" \
  --output-dir "output"

# raw 첨부 (hallucination 검수 활성화)
uv run python -m src.pipeline \
  --menu "output/<매장명>_menu_plan.json" \
  --solution "output/<매장명>_solution_plan.json" \
  --output-dir "output" \
  --raw "output/<매장명>_현안.json"

# 검수 리포트 별도 저장
uv run python -m src.pipeline \
  --menu "output/<매장명>_menu_plan.json" \
  --solution "output/<매장명>_solution_plan.json" \
  --output-dir "output" \
  --save-report "output/<매장명>_validation.json"
```

## 출력

- `<output_dir>/<매장명>_메뉴판_가안.xlsx`
- `<output_dir>/<매장명>_솔루션_계획서.docx`
- stdout에 `detail_report()` 텍스트 (검수 결과 그룹별 요약)
- (선택) `--save-report`로 지정한 경로에 ValidationReport JSON

## 검증

- [ ] XLSX 파일 존재, 크기 > 0
- [ ] DOCX 파일 존재, 크기 > 0
- [ ] stdout 마지막에 검수 결과 출력 (`total_checks`, `passed`, `failed`)
- [ ] exit code: `0` 통과 / `1` 검수 FAIL 있음(문서는 생성됨) / `2` 입력 오류 / `3` 그 외

### 산정서 6섹션 체크리스트 (정본 §출력 형식)

6섹션 순서·내용 체크리스트는 [`../references/output_format_6sections.md`](../references/output_format_6sections.md) §검수 체크리스트 참조.

### 종료 코드 처리
- `0`: 그대로 완료 보고
- `1`: 문서는 전달 가능하지만 FAIL 항목 사용자에게 인용해서 확인 요청
- `2`: 문서 미생성. JSON 점검 필요 (스키마 에러 메시지 그대로 사용자에게 전달)
- `3`: stderr 전체를 보여주고 정지

## 에러 처리

| 증상 | 원인 | 대응 |
|------|------|------|
| `[ERROR] 입력 파일 없음` (exit=2) | menu/solution JSON 경로 오타 | 경로 확인 후 재실행 |
| `[ERROR] 검증 실패: 업장명 불일치` (exit=2) | menu_plan의 store_name ≠ solution_plan의 store.name | JSON 각각의 상호명 필드 확인, 재생성 필요 (이 스킬 범위 밖) |
| `pydantic.ValidationError` (exit=2) | JSON 필드가 스키마와 불일치 | 에러 메시지의 필드 경로를 그대로 사용자에게 보고. 플래너 재실행 필요 가능성 |
| `exit=1` 검수 FAIL | 비즈니스 룰·교차 검증·XLSX/DOCX 구조 검수 중 일부 실패 | stdout의 `detail_report()` 내용에서 FAIL 항목 인용. 문서는 생성되었으므로 전달 가부 사용자 판단 |
| openpyxl / python-docx 예외 (exit=3) | 폰트/템플릿 문제 또는 코드 버그 | stderr 전문 보고, 임의 수정 금지 |

### 재시도 정책
- 결정론 실행이므로 **동일 입력 재시도해도 결과 불변**. 재시도 의미 없음.
- 입력 JSON을 고친 경우에만 재실행.
