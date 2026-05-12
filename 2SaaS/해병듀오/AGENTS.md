<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — BizHigh SalesOps (Codex 포인터)

> Codex(OpenAI CLI) 등 `CLAUDE.md`를 읽지 않는 도구를 위한 포인터.
> 실제 프로젝트 규칙·워크플로우·정본은 `CLAUDE.md`에 정의되어 있다.

## 작업 시작 전 반드시 읽기

아래 파일들을 **순서대로** 읽고 그 규칙을 따른다. 충돌 시 상위가 우선.

1. `../../CLAUDE.md` — 전역 메인 규칙 (7단계 워크플로우, 모델 라우팅, 단축어)
2. `../../.claude/rules/operating-principles.md` — 운영 원칙 (정확성 > 안전 > 효율 > 속도)
3. `../../.claude/rules/coding.md` — 코딩 베스트 프랙티스
4. `../../.claude/rules/error-recovery.md` — 에러 처리 및 복구 (라인 멈춤 규칙)
5. `../../.claude/rules/supabase-workflow.md` — Supabase 마이그/시드/RLS/Edge/MCP 가드
6. `../CLAUDE.md` — 2SaaS 워크스페이스 공통 규칙
7. `./CLAUDE.md` — BizHigh SalesOps 앱 코드 규칙 (스택·폴더·Supabase 패턴·5대 정책·4-way 페르소나)
8. `./docs/backlog.md` — **다음 작업 우선순위, 가장 먼저 보기**
9. `./docs/README.md` — 문서 인덱스와 현재 시스템 요약
10. `./docs/project-map.md` — 현재 폴더·파일·라우트·상위 skill/MCP 맵
11. `./docs/product.md` · `./docs/process.md` · `./docs/schema.md` — 프로덕트·프로세스·DB 청사진

## Next.js 16 주의 (위 블록 재강조)

`middleware.ts` 폐기 → `proxy.ts`. API 의심 시 `node_modules/next/dist/docs/` 먼저. 학습 데이터의 Next.js 컨벤션을 그대로 적용하지 말 것.

## 현재 repo 맵

- `src/app/(marketing)/` — `/` 랜딩
- `src/app/login` — Email+PW 로그인
- `src/app/app/` — 내부 툴 (`/app`, `/app/stores`, `/app/leads`, `/app/settings` 등)
- `src/app/api/` — Kakao ingest, Google OAuth, Google sync cron
- `src/lib/actions/` — Server Action write 경계
- `src/lib/integrations/` — Google 등 외부 연동 helper
- `supabase/migrations/` — 적용 순서가 있는 DB 변경 이력. 기존 migration 수정 금지, 보정은 새 migration.

## 상위 skill/MCP 위치

이 repo 내부에는 project-local skill/MCP 폴더를 만들지 않는다. Windows 메인 환경 기준:

- 전역 skills: `C:\Users\반민성\.claude\skills`
- 전역 MCP 설정: `C:\Users\반민성\.claude\.mcp.json`
- 현재 MCP 서버: `ClaudeTalkToFigma`

## 핵심 원칙 (요약)

상세는 위 파일들 참조.

- **사용자가 최종 의사결정자.** 큰 결정·destructive git·secret 처리·배포는 컨펌 필수.
- **누락 방지 5대 정책 비타협** (`CLAUDE.md` 참조: 단일 진실 원천, 상태 머신, 헬스체크 신선도, 감사 로그, RLS 1차 방어선).
- **`service_role` 키·LLM API key는 클라이언트/로그/채팅/커밋에 절대 노출 X.**
- **쓰기는 Server Action / Route Handler만.** 클라이언트 직접 Supabase mutation 금지.
- **수치 출처 없으면 쓰지 마라.** 통계·평균값 추측 작성 금지.
- **검증 없이 완료 보고 금지.** `npx tsc --noEmit` + `npm run lint` + `npm run build` + 필요 시 `supabase db reset`.

## 보고 형식

- 변경한 파일
- 핵심 변경 내용
- 실행한 검증과 결과
- 못 한 검증 또는 사용자 액션이 필요한 항목

> 이 파일은 의도적으로 짧게 유지한다. 규칙이 늘어나면 `CLAUDE.md` 쪽을 갱신하고, 이 파일은 포인터 역할만 한다.
