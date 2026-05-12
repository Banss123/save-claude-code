---
name: quality-check
description: 이미 생성된 MenuPlan/SolutionPlan JSON과 XLSX/DOCX에 대해 자동 검수만 재실행한다(XLSX 구조·DOCX 구조·교차 검증·비즈니스 룰·hallucination). 검수 로직을 수정했거나 수동 편집 후 최종 확인이 필요할 때 사용.
---

## 정본 참조

본 스킬은 아래 검수 모듈들을 병렬 실행한다. 각 모듈이 담당하는 정본 항목:

| 모듈 | 정본 매핑 |
|------|----------|
| `src/validator/xlsx_check.py` | 메뉴판 가안 구조 (정본 범위 외: 부속 산출물) |
| `src/validator/docx_check.py` | 솔루션 계획서 구조 (정본 §출력 형식 6섹션) |
| `src/validator/cross_check.py` | MenuPlan ↔ SolutionPlan 교차 무결성 |
| `src/validator/business_rules_check.py` | CPC/CMG/1인 메뉴/tier 단조증가 등 도메인 룰 |
| `src/validator/reference_check.py` | **정본 §필수 준수 1~8** (핵심 게이트) |
| `src/validator/raw_check.py` (선택) | raw JSON 존재 시 hallucination 검수 |

### reference_check 규칙 목록 (정본 §필수 준수 1~8)

규칙 8건(REF-1~8) 정의·심각도·판정 기준 + 등급 영향은 [`../references/reference_check_rules.md`](../references/reference_check_rules.md) 참조 (단일 진실 출처).

## 입력

- **menu_json** (필수) — MenuPlan JSON (`output/<매장명>_menu_plan.json`)
- **solution_json** (필수) — SolutionPlan JSON (`output/<매장명>_solution_plan.json`)
- **xlsx_path** (필수) — 이미 생성된 `<매장명>_메뉴판_가안.xlsx`
- **docx_path** (필수) — 이미 생성된 `<매장명>_솔루션_계획서.docx`
- **raw_json** (선택) — 스크래핑 raw JSON. 있으면 hallucination 그룹이 리포트 최상단에 추가됨

## 실행

검수 단독 CLI는 없으므로, `src.pipeline`에 **이미 생성된 파일과 같은 출력 디렉토리**를 지정해서 재실행한다. pipeline은 결정론이므로 동일 JSON 입력에 대해 동일 XLSX/DOCX를 덮어쓰며, 검수 리포트를 다시 생성한다.

```bash
uv run python -m src.pipeline \
  --menu "output/<매장명>_menu_plan.json" \
  --solution "output/<매장명>_solution_plan.json" \
  --output-dir "output" \
  --raw "output/<매장명>_현안.json" \
  --save-report "output/<매장명>_validation.json"
```

`--raw`와 `--save-report`는 이 스킬에서 **항상 함께 사용**한다(최대 커버리지 + 리포트 보존).

### 참고 — 프로그래매틱 검수만 호출

다른 스크립트에서 검수만 돌리고 싶다면 `src.validator.validate_all`을 사용하면 되지만, 이 스킬은 **CLI로만 실행**한다(새 의존성/스크립트 생성 금지).

## 출력

- `output/<매장명>_메뉴판_가안.xlsx` (결정적 재생성, 내용 불변)
- `output/<매장명>_솔루션_계획서.docx` (결정적 재생성, 내용 불변)
- `output/<매장명>_validation.json` — ValidationReport JSON
- stdout: 검수 상세 리포트

### ValidationReport JSON 구조 (핵심 필드)

```json
{
  "store_name": "<매장명>",
  "groups": [
    {"name": "XLSX 검수", "items": [{"name": "...", "status": "pass|fail|warn", "message": "..."}]},
    {"name": "DOCX 검수", "items": [...]},
    {"name": "교차 검증", "items": [...]},
    {"name": "비즈니스 룰", "items": [...]}
  ],
  "total_checks": <int>,
  "total_passed": <int>,
  "total_failed": <int>,
  "is_ok": <bool>
}
```

`raw_json`이 제공되면 `groups[0]`에 `hallucination` 그룹이 추가된다.

## 검증

- [ ] `output/<매장명>_validation.json` 생성됨
- [ ] JSON의 `store_name` == 입력 매장명
- [ ] exit code 0 (통과) 또는 1 (FAIL 존재)

## 에러 처리

| 증상 | 원인 | 대응 |
|------|------|------|
| exit=1 + FAIL 항목 발생 | 실제 검수 실패 | `validation.json` 읽어서 `status == "fail"` 항목들만 정리해 사용자에게 보고 |
| exit=2 `업장명 불일치` | menu/solution 매장명 상이 | 어느 JSON이 잘못됐는지 사용자에게 확인 요청 |
| exit=2 Pydantic 오류 | JSON 필드 파손 | 에러 전문 그대로 보고, 수동 수정 유도 금지(결정론 유지) |

### 재시도 정책
- 결정론이므로 동일 입력에 대한 재시도는 의미 없음
- JSON/문서를 수정한 경우에만 재실행
