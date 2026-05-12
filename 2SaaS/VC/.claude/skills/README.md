# 밸류체인 스킬 — 에이전트 호출 가이드

밸류체인 온보딩 파이프라인의 4개 작업 스킬 + 1개 공유 references 폴더.

## 작업 흐름과 스킬 매핑

```
사용자 요청 → 메인 에이전트 → 적절한 스킬 호출
```

| 사용자 의도 | 호출할 스킬 | 비고 |
|-----|-----|-----|
| "온보딩 시작 [매장명]" / 엔드투엔드 | **`onboarding-full`** | 1~5단계 자동 순차 실행 |
| 스크래핑만 다시 (메뉴 또는 통계 갱신) | `baemin-collect` | 기존 후속 단계는 `--skip-scrape`로 재돌리기 |
| 문서만 다시 (JSON은 그대로, XLSX/DOCX 재생성) | `document-build` | 결정론. 동일 JSON = 동일 문서 |
| 검수만 다시 (수동 편집 후 재검증) | `quality-check` | XLSX/DOCX 덮어쓰며 검수 리포트 갱신 |

## 파이프라인 단계 ↔ 스킬 ↔ 코드 매핑

| 단계 | 스킬 (직접 호출) | 코드 모듈 |
|----|-----|-----|
| 1. 배민 로그인 + 메뉴/옵션 스크래핑 | `baemin-collect` 1단계 | `src.scraper.baemin` |
| 2. 통계 + 광고 + NOW바 스크래핑 | `baemin-collect` 2단계 | `src.scraper.baemin_final` |
| 3. MenuPlan 생성 (현안+가안 JSON) | (orchestrator 내부) | `src.planner.menu_plan_builder` |
| 4. SolutionPlan 생성 (4-레버 + 6섹션) | (orchestrator 내부) | `src.planner.solution_builder` + `lever_analysis` + `target_revenue` |
| 5. XLSX/DOCX 생성 + 자동 검수 | `document-build` | `src.pipeline` (= `xlsx_builder` + `docx_builder` + `validator/*`) |
| 6. 검수 단독 재실행 | `quality-check` | `src.validator.*` (REF-1~8 게이트 포함) |

`onboarding-full`은 1~5를 순차 실행하는 오케스트레이터. 매장명 하나로 끝.

## 공유 references

```
.claude/skills/references/
├── reference_check_rules.md       # REF-1~8 (정본 §필수 준수 1~8)
└── output_format_6sections.md     # 솔루션 계획서 6섹션 (정본 §출력 형식)
```

각 SKILL.md가 본문에 한 줄 링크로 호출. 두 파일은 정본 `data/references/목표매출_산정로직.md` 의 코드 매핑이라 정본이 바뀌면 같이 바꾼다.

## 정본 위치 한눈에

| 정본 | 위치 |
|-----|-----|
| 목표매출 산정 로직 | `data/references/목표매출_산정로직.md` |
| 솔루션 DOCX 양식 마스터 | `data/references/_솔루션양식_표준.md` |
| DOCX 명세 v1.0 | `docs/DOCX_SPEC.md` |
| XLSX 디자인 상수 | `src/generator/xlsx_builder.py` L14~ (코드 자체) |
| 매장별 정본 자료 (담당자 보존 영역) | `data/references/<매장명>.md` |

## 새 스킬 추가 가이드

- 스킬 디렉토리는 `.claude/skills/<kebab-case>/SKILL.md`
- SKILL.md는 진입점만 (입력/실행/출력/검증/에러 처리). 100~120줄 이하 권장
- 다른 스킬과 공유되는 룰/체크리스트는 `references/`로 외장화 → 단일 진실 출처
- 결정적 작업(스크래핑·생성·검수)은 `src/` 모듈로 정본화하고 SKILL.md는 CLI 호출만
- 토스 가이드 준수: 지나친 쪼개기 금지 (스킬 단위는 사용자 워크플로우의 자연 분기점)

## 슬랙 커맨드 ↔ 스킬

`.claude/commands/온보딩.md` 와 `.claude/commands/온보딩-배치.md` 는 `onboarding-full` 스킬의 트리거. 매장명 인자만 받아 그대로 위임.
