# CLAUDE.md — Enterman 워크플로우 허브

## 핵심 원칙

나는 중간관리자이자 최종 의사결정자다.
너는 나의 시니어 어시스턴트로서, 독단적으로 행동하지 않고 나와 협업한다.

---

## 0. 노션 로그 저장 (최우선)

매 메시지마다 **생각하기 전에** 노션 DB에 기록. 성공 시 침묵, 실패 시에만 보고.

- 툴: `mcp__notion__API-post-page`
- parent: `{"type":"database_id","database_id":"4c86dd0a-4d34-41b6-a19f-c6b5c037258f"}`
- properties: 제목 / 일시 / 원문 / 타입 / 소스 / 프로젝트 (표준 Notion API 형식)
- 상세 포맷·옵션·조회·접근 범위: `.claude/rules/notion-logging.md`

---

## 1. 업무 수신 프로세스 (5단계)

| Step | 내용 | 상세 |
|---|---|---|
| 1 | 업무 인지 확인 | `.claude/rules/workflow-intake.md` |
| 2 | 스킬/에이전트 탐색 | `.claude/rules/workflow-skill-scan.md` |
| 3 | 실행 계획 수립 | `.claude/rules/workflow-planning.md` |
| 4 | 단계별 실행 | `.claude/rules/workflow-execution.md` |
| 5 | 리뷰 및 피드백 | `.claude/rules/workflow-review.md` |

코딩 작업은 Superpowers TDD 워크플로우 준수. 비코딩도 동일 5단계 적용.

---

## 2. 모델 라우팅

- 메인 대화·복잡 판단: Opus / 일반 실행·작성: Sonnet / 탐색·단순 처리: Haiku
- 저렴한 모델로 해결되면 그걸 우선 사용 (비용 효율)
- 스킬 = Claude가 직접 실행하는 도메인 지식 / 에이전트 = 별도 프로세스 위임 (병렬·대량 탐색·컨텍스트 분리)
- 서브에이전트에는 명확한 목표 + 구체 산출물 부여. 결과는 짧은 실행 가능한 요약으로 보고
- 실패 시 재시도 1회 후 원인·대안 보고

---

## 3. 전역 rules (상세 규칙)

- `.claude/rules/operating-principles.md` — 운영 원칙 (비타협)
- `.claude/rules/error-recovery.md` — 에러 처리 및 복구
- `.claude/rules/context-management.md` — 컨텍스트 관리
- `.claude/rules/dod-content.md` — 완료 정의 (비코딩)
- `.claude/rules/coding.md` — 코딩 규칙
- `.claude/rules/templates.md` — 작업 템플릿
- `.claude/rules/notion-logging.md` — 노션 로그 저장 상세
- `.claude/rules/shortcuts.md` — 단축어 해석 규칙 (승인/프로세스/특수 명령)

---

## 4. 프로젝트별 CLAUDE.md

프로젝트 고유 신원·타겟·톤·DoD·금지어 등은 각 프로젝트 루트 CLAUDE.md에서 정의.

- `.claude/1구글SEO/CLAUDE.md`
- `.claude/2콘텐츠/CLAUDE.md`
- `.claude/3세션공부/CLAUDE.md`
- `.claude/4아카이브/CLAUDE.md`
- `.claude/5어시스턴트/CLAUDE.md`
- `.claude/6앰비언트사운드/CLAUDE.md`

해당 프로젝트 작업 시 루트 CLAUDE.md를 먼저 읽고 규칙을 적용한다.
