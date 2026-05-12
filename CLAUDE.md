# CLAUDE.md — Enterman 워크플로우 허브

## 핵심 원칙

사용자가 최종 의사결정자. 독단 행동 금지, 큰 결정 전 컨펌 필수.

---

## 1. 업무 수신 프로세스 (7단계)

| Step | 내용 | 상세 |
|---|---|---|
| 1 | Think — 가설 검증 (forcing questions) | `.claude/rules/workflow-think.md` |
| 2 | 업무 인지 확인 | `.claude/rules/workflow-intake.md` |
| 3 | 스킬/에이전트 탐색 | `.claude/rules/workflow-skill-scan.md` |
| 4 | 실행 계획 수립 (+ 4-way 리뷰) | `.claude/rules/workflow-planning.md` |
| 5 | 단계별 실행 | `.claude/rules/workflow-execution.md` |
| 6 | 리뷰 및 피드백 | `.claude/rules/workflow-review.md` |
| 7 | Reflect — 주간 회고 | `.claude/rules/workflow-reflect.md` |

코딩 작업은 Superpowers TDD 워크플로우 준수. 비코딩도 동일 7단계 적용.
Step 1(Think)과 Step 7(Reflect)은 단순 작업에선 생략 가능. Step 2~6은 메인 흐름.

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
- `.claude/rules/content-multilingual.md` — 다국어 콘텐츠 사전 체크리스트 / 언어 매칭 / SEO 키워드 / 핵심 표현 보존
- `.claude/rules/coding.md` — 코딩 규칙
- `.claude/rules/templates.md` — 작업 템플릿
- `.claude/rules/notion-logging.md` — 노션 로그 저장 상세
- `.claude/rules/shortcuts.md` — 단축어 해석 규칙 (승인/프로세스/특수 명령)
- `.claude/rules/workflow-think.md` — Step 1: Think (forcing questions)
- `.claude/rules/workflow-intake.md` — Step 2: 업무 인지 확인
- `.claude/rules/workflow-skill-scan.md` — Step 3: 스킬/에이전트 탐색
- `.claude/rules/workflow-planning.md` — Step 4: 계획 수립 (+ 4-way 리뷰)
- `.claude/rules/workflow-execution.md` — Step 5: 단계별 실행
- `.claude/rules/workflow-review.md` — Step 6: 리뷰 및 피드백
- `.claude/rules/workflow-reflect.md` — Step 7: 주간 회고

---

## 4. 프로젝트별 CLAUDE.md

프로젝트 고유 신원·타겟·톤·DoD·금지어·페르소나 등은 각 프로젝트 루트 CLAUDE.md에서 정의.

- `.claude/1구글SEO/CLAUDE.md`
- `.claude/2SaaS/CLAUDE.md` — SaaS (Python + Playwright 기반 배민 매장 온보딩 자동화, 코딩 프로젝트)
- `.claude/3콘텐츠/CLAUDE.md`
- `.claude/4HyperFrames/CLAUDE.md` — 영상 그래픽 인프라 (HyperFrames 기반 훅/CTA/아웃트로/자막 자동화, 3·7·8번 영상 프로젝트 공용)
- `.claude/5세션공부/CLAUDE.md`
- `.claude/6아카이브/CLAUDE.md`
- `.claude/7어시스턴트/CLAUDE.md`
- `.claude/8앰비언트사운드/CLAUDE.md`

해당 프로젝트 작업 시 루트 CLAUDE.md를 먼저 읽고 규칙을 적용한다.

---

## 5. 4-way 리뷰 페르소나 (글로벌 디폴트)

Step 4(계획 수립)에서 복잡한 계획을 4명의 페르소나로 압박 테스트한다.
**프로젝트 CLAUDE.md에 페르소나 정의가 있으면 그걸 우선 사용**, 없으면 아래 디폴트.

| 페르소나 | 시각 | 핵심 질문 |
|---|---|---|
| **CEO** | 비즈니스 임팩트, 우선순위 | 지금 이게 진짜 다음 한 수인가? 더 중요한 게 있지 않나? |
| **엔지니어** | 기술 타당성, 복잡도 | 이게 가장 단순한 방식인가? 더 작은 슬라이스 없나? |
| **디자이너** | UX, 사용자 경험 | 사용자가 직관적으로 쓸 수 있나? 마찰점은? |
| **DevEx** | 유지보수성, 자동화 가능성 | 6개월 후의 내가 이걸 이해할까? 재사용 가능한가? |

라우팅: 작업 성격에 따라 1~3명만 호출 가능 (`workflow-planning.md` 참조).
