# CLAUDE.md — VC 밸류체인 자동화

> 요식업 배달 컨설팅 매장 온보딩 산출물을 자동 생성하는 Python 파이프라인.
> 2SaaS 상위 워크스페이스에서는 `VC/`가 이 프로젝트의 루트다.

---

## 적용 우선순위

1. 전역 메인 규칙: `../../CLAUDE.md` + `../../.claude/rules/*`
2. 워크스페이스 규칙: `../CLAUDE.md` (2SaaS 공통)
3. 이 파일: VC 프로젝트 고유 규칙
4. 작업별 문서: `docs/DOCX_SPEC.md`, `data/references/*`, `INSTALL.md`

상위 규칙과 충돌하면 상위가 우선. 이 파일은 VC 특수 사항만 정의한다.

Codex CLI는 `CLAUDE.md`를 읽지 않으므로 코덱스로 작업할 경우 동일 규칙을 `AGENTS.md`에도 두거나 수동으로 적용한다.

---

## 메인 워크플로우 참조

- **7단계 워크플로우**: `../../CLAUDE.md` 섹션 1 (Think → Intake → Skill Scan → Planning → Execution → Review → Reflect)
- **운영 원칙**: `../../.claude/rules/operating-principles.md` (정확성 > 안전 > 효율 > 속도)
- **코딩 규칙**: `../../.claude/rules/coding.md`
- **에러 복구**: `../../.claude/rules/error-recovery.md` (라인 멈춤 규칙 — 테스트/스크래핑 실패 시 기능 추가 멈추고 진단 우선)
- **단축어**: `../../.claude/rules/shortcuts.md`

### 모델 라우팅 (VC 작업 기준)

| 작업 성격 | 권장 모델 |
|---|---|
| 파이프라인 설계·정본 변경·검수 규칙 수정 | Opus |
| Pydantic 모델·XLSX/DOCX 생성기·테스트 구현 | Sonnet |
| 로그 확인·단순 패치·파일 탐색 | Haiku |

### 4-way 리뷰 라우팅

결정론 파이프라인 + 산출물 정확성이 최우선이라 보통 **엔지니어 + DevEx 2명** 호출. 산출물 포맷·고객 전달 영향이 있으면 CEO(비즈니스 임팩트) 추가. 단순 리팩토링·테스트 추가는 생략.

---

## 프로젝트 개요

- **사업**: 요식업 배달 컨설팅 업체의 매장 온보딩 자동화
- **대상 플랫폼**: 배민 우선. 쿠팡이츠·요기요·땡겨요는 데이터 부족 시 `status="데이터 부족"`로 표기
- **핵심 목표**: 솔루션 담당자 1명의 수동 온보딩 작업을 결정론 파이프라인으로 자동화
- **최우선 원칙**: 정확성. 실수 없는 산출물과 자동 검수 게이트가 우선

기획 원본: `docs/기획_밸류체인_자동화.md`
담당자 이식 가이드: `INSTALL.md`

---

## 기술 스택

| 영역 | 도구 |
|---|---|
| 언어 | Python 3.11+ |
| 의존성 | `pyproject.toml` + `uv` |
| 브라우저 자동화 | Playwright |
| 데이터 모델 | Pydantic v2 |
| XLSX 생성 | openpyxl |
| DOCX 생성 | python-docx |
| 테스트 | pytest |
| 린트 | ruff |

---

## 파이프라인

```text
사용자 입력 (매장명)
  -> 배민 스크래핑
  -> MenuPlan 생성
  -> SolutionPlan 생성
  -> XLSX 메뉴판 가안 생성
  -> DOCX 솔루션 계획서 생성
  -> 자동 검수
```

오케스트레이터:

```bash
uv run python -m src.orchestrator "<매장명>"
```

주요 산출물은 `output/`에 생성된다.

---

## 정본 위치

| 정본 | 위치 |
|---|---|
| 목표매출 산정 로직 | `data/references/목표매출_산정로직.md` |
| DOCX 명세 | `docs/DOCX_SPEC.md` |
| XLSX 디자인 상수 | `src/generator/xlsx_builder.py` |
| 매장별 정본 자료 | `data/references/<매장명>.md` |
| 검수 규칙 | `.claude/skills/references/reference_check_rules.md` |
| 6섹션 매핑 | `.claude/skills/references/output_format_6sections.md` |

---

## 운영 원칙

- 결정론 코드가 스크래핑, 산정, 문서 생성, 검수를 담당한다.
- AI 판단은 미래 확장 영역이며, 포맷팅·문서 생성의 정본 역할을 맡기지 않는다.
- 산출물 경로와 파일명은 담당자 이식 호환성을 위해 임의 변경하지 않는다.
- 새 의존성은 가급적 추가하지 않는다.
- 실제 고객 데이터와 계정/세션 파일은 커밋하지 않는다.

---

## 검증

코드 변경 후 기본 검증:

```bash
uv run pytest
uv run ruff check .
```

스크래핑 변경이 있으면 Playwright 세션/계정 상태와 `output/` 산출물을 별도로 확인한다.

---

## 구조

```text
VC/
├── .claude/      # 밸류체인 commands/agents/skills
├── data/         # 샘플, 레퍼런스, 담당자 보존 자료
├── docs/         # 명세·기획·분석 문서
├── output/       # 산출물
├── prompts/
├── src/          # 결정론 코드
├── tasks/
├── tests/
├── pyproject.toml
└── uv.lock
```
