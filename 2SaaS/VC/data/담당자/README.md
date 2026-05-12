# 밸류체인 자동화 파이프라인

요식업 배달 컨설팅 업체의 **온보딩 업무 자동화** 시스템.
AI 판단(솔루션/메뉴 가안)은 Claude Code 대화에서 수행하고,
문서 생성(XLSX/DOCX)은 결정적 Python 코드로 처리합니다.

---

## 핵심 설계

```
[raw 데이터]
    │
    ▼
① Claude Code 대화 ─── 솔루션 판단 + 메뉴 가안 생성 → JSON 파일로 저장
    │                    (prompts/solution_planning.md 규칙 적용)
    ▼
② Python 파이프라인 ── JSON 로드 → XLSX/DOCX 생성 → 자동 검수
    │                    (src/pipeline.py, 결정적)
    ▼
[검수 통과된 문서]
```

**AI 역할**은 "판단"만, **포맷팅**은 코드로 분리 → 동일 입력 = 동일 출력 보장.

---

## 요구사항

- **Python 3.11 이상** (확인: `python --version`)
- **uv** — Python 패키지 매니저 ([설치 가이드](https://docs.astral.sh/uv/))

---

## 설치 (담당자 최초 1회)

```powershell
# 1. uv 설치 (최초 1회만)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
# 또는:
python -m pip install uv

# 2. 프로젝트 폴더로 이동
cd C:\경로\valuechain

# 3. 의존성 자동 설치 (.venv 가상환경 자동 생성)
python -m uv sync

# 4. 동작 확인
python -m uv run python -m src.pipeline --help
```

`uv sync`는 `uv.lock`에 고정된 버전(python-docx, openpyxl, pydantic 등)을 자동 설치합니다.

---

## 사용법

### 1단계: Claude Code로 AI 분석

업장 raw 데이터를 Claude Code에 제공하고 요청:

> "이 업장 데이터를 바탕으로 `MenuPlan` JSON과 `SolutionPlan` JSON을 생성해주세요.
> `prompts/solution_planning.md` 규칙을 따르고,
> `data/samples/맛나치킨_menu_plan.json`, `data/samples/맛나치킨_solution_plan.json`과
> 같은 형식으로 저장해주세요."

Claude Code가 두 JSON 파일을 `data/samples/` 또는 `output/`에 저장합니다.

### 2단계: 파이프라인 실행

```powershell
python -m uv run python -m src.pipeline `
  --menu data/samples/[업장명]_menu_plan.json `
  --solution data/samples/[업장명]_solution_plan.json `
  --output-dir output
```

### 3단계: 산출물 확인

`output/` 폴더에 생성:
- `[업장명]_메뉴판_가안.xlsx` — 현안/가안 비교 엑셀
- `[업장명]_솔루션_계획서.docx` — 솔루션 계획서 워드

콘솔에 검수 리포트가 출력됩니다:
- ✅ **통과**: 종료 코드 0 — 산출물 그대로 고객에게 전달 가능
- ⚠️ **WARN**: 치명적 아님, 확인 권장
- ❌ **FAIL**: 재분석 필요 — Claude Code에서 JSON 수정 후 재실행

---

## 예시 실행 (샘플 포함)

```powershell
python -m uv run python -m src.pipeline `
  --menu data/samples/맛나치킨_menu_plan.json `
  --solution data/samples/맛나치킨_solution_plan.json `
  --output-dir output
```

정상 실행 시 출력 예시:
```
============================================================
파이프라인 완료: 맛나치킨 강남점
============================================================
[출력]
  XLSX: output\맛나치킨 강남점_메뉴판_가안.xlsx
  DOCX: output\맛나치킨 강남점_솔루션_계획서.docx

✅ 맛나치킨 강남점 검수: 17/19 통과
...
```

---

## 프로젝트 구조

```
valuechain/
├── CLAUDE.md                        ← Claude Code 프로젝트 규칙 (자동 로드됨)
├── README.md                        ← 이 파일
├── 밸류체인_자동화_프로젝트.md          ← 기획 문서 (v3 아키텍처)
├── pyproject.toml                   ← 의존성 선언
├── uv.lock                          ← 버전 잠금 (재현성 보장)
│
├── src/
│   ├── pipeline.py                  ← CLI 진입점 (python -m src.pipeline)
│   ├── schemas/                     ← Pydantic 모델 (JSON 검증)
│   │   ├── menu.py                  ← MenuPlan, MenuSheet 등
│   │   ├── solution.py              ← SolutionPlan, KpiBox 등
│   │   └── validation.py            ← CheckItem, ValidationReport
│   ├── generator/
│   │   ├── xlsx_builder.py          ← MenuPlan → XLSX
│   │   └── docx_builder.py          ← SolutionPlan → DOCX
│   ├── validator/
│   │   ├── xlsx_check.py            ← XLSX ↔ JSON 교차검증
│   │   ├── docx_check.py            ← DOCX ↔ JSON 교차검증
│   │   └── cross_check.py           ← 메뉴 ↔ 솔루션 교차검증
│   └── analyzer/
│       └── solution_analyzer.py     ← (향후 API 모드용, 현재 미사용)
│
├── prompts/
│   └── solution_planning.md         ← AI 판단 규칙 (CPC/CMG/메뉴 규칙 등)
│
├── docs/
│   ├── 솔루션_판단_규칙.md            ← 상세 판단 체계
│   ├── 레퍼런스_분석_요약.md
│   ├── DOCX_SPEC.md
│   ├── 피드백_XLSX_비교분석.md
│   └── 피드백_DOCX_비교분석.md
│
├── data/samples/                    ← 참조용 샘플 데이터
│   ├── 맛나치킨_menu_plan.json
│   ├── 맛나치킨_solution_plan.json
│   ├── 테스트업장_raw.json
│   ├── 더피플버거_raw.json
│   ├── 더피플버거_menu_sample.json
│   └── 대흥육회_raw.json
│
├── tasks/
│   └── todo.md                      ← 진행 상황 추적
│
├── tests/                           ← 단위/통합 테스트
│
└── output/                          ← 생성된 문서 출력 디렉토리
```

---

## FAQ

### Q. AI 비용이 발생하나요?
**아니요.** AI 판단은 Claude Code 대화 내에서 수행됩니다 (= 구독 요금 내 포함).
파이프라인은 JSON 파일만 읽어 결정적으로 문서를 생성하므로 추가 API 호출이 없습니다.

### Q. 여러 업장을 동시에 처리하려면?
현재는 업장당 1회 실행입니다. 배치 처리(슬랙 봇 + Batch API)는 다음 이터레이션 예정입니다
(`밸류체인_자동화_프로젝트.md` 참조).

### Q. 새 업장 추가 시 JSON을 처음부터 작성해야 하나요?
Claude Code에 raw 데이터와 참조 샘플(`data/samples/맛나치킨_*.json`)을 보여주면
자동으로 같은 형식으로 생성합니다.

### Q. 나중에 Anthropic API 연동으로 완전 자동화 가능한가요?
가능. `src/analyzer/solution_analyzer.py`에 API 호출 코드가 이미 준비되어 있습니다.
`anthropic` 패키지를 `pyproject.toml`에 추가하면 전환 가능 (비용 발생).

### Q. pipeline 실행 시 FAIL이 나오면?
1. 콘솔의 검수 리포트에서 실패 항목 확인
2. Claude Code에 "이 FAIL 항목을 반영해서 JSON 수정" 요청
3. 파이프라인 재실행

---

## 참고 문서

- **기획 문서**: `밸류체인_자동화_프로젝트.md`
- **Claude Code 작업 규칙**: `CLAUDE.md`
- **AI 판단 규칙**: `prompts/solution_planning.md`
- **솔루션 판단 상세**: `docs/솔루션_판단_규칙.md`
- **DOCX 디자인 스펙**: `docs/DOCX_SPEC.md`
- **현재 진행 상황**: `tasks/todo.md`
