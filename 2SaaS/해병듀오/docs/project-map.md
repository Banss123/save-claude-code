# Project Map — BizHigh SalesOps

> 마지막 확인: 2026-05-11, Windows 경로 `C:\Users\반민성\.claude\2SaaS\해병듀오`.

## Repo 경계

- 현재 repo: `해병듀오/` — BizHigh SalesOps SaaS
- 같은 워크스페이스의 별도 repo: `../VC/`
- 상위 워크스페이스 규칙: `../CLAUDE.md`
- 전역 규칙: `../../CLAUDE.md`, `../../.claude/rules/*`

## 루트 파일

| 경로 | 역할 |
|---|---|
| `AGENTS.md` | Codex/agent용 포인터. 실제 규칙은 `CLAUDE.md`와 `docs/`가 정본 |
| `CLAUDE.md` | 앱 코드 규칙, Next/Supabase/검증 기준 |
| `README.md` | 실행·검증·중요 문서 진입점 |
| `package.json` | Next 16.2.4, React 19.2.4, smoke/deploy script |
| `next.config.ts` | Next 설정. 현재 `allowedDevOrigins`만 사용 |
| `components.json` | shadcn 설정. `src/components/ui` 대상 |
| `.env.local.example` | 로컬 env 템플릿. secret 값은 비워 둠 |
| `vercel.json` | Google sync cron. 현재 매일 00:00 UTC |

## 앱 라우트

| 경로 | URL | 역할 |
|---|---|---|
| `src/app/(marketing)/page.tsx` | `/` | 외부 랜딩 |
| `src/app/login/page.tsx` | `/login` | Email+PW 로그인 |
| `src/app/app/page.tsx` | `/app` | 대시보드, Decision Brief, 퀘스트 보드, 제안함 |
| `src/app/app/stores/page.tsx` | `/app/stores` | 매장 리스트·담당자·필터 |
| `src/app/app/stores/new/page.tsx` | `/app/stores/new` | 매장 등록 |
| `src/app/app/stores/[id]/page.tsx` | `/app/stores/:id` | 매장 상세 |
| `src/app/app/leads/page.tsx` | `/app/leads` | 메타광고 Lead 초기 관리 화면 |
| `src/app/app/checks/page.tsx` | `/app/checks` | 정기 체크 페이지. 메뉴에서는 후순위 |
| `src/app/app/reports/page.tsx` | `/app/reports` | 보고서 페이지. 메뉴에서는 후순위 |
| `src/app/app/settings/page.tsx` | `/app/settings` | 내 정보, Google 연결, 카톡 import, 운영 설정 |

## API 라우트

| 경로 | 역할 |
|---|---|
| `src/app/api/integrations/kakao-notifications/route.ts` | Android/MessengerBotR 카톡 알림 ingest |
| `src/app/api/integrations/google/oauth/start/route.ts` | Google OAuth 시작 |
| `src/app/api/integrations/google/oauth/callback/route.ts` | Google OAuth callback |
| `src/app/api/cron/google-sync/route.ts` | Vercel Cron 또는 수동 Google Calendar/Tasks sync |

## 소스 폴더

| 경로 | 역할 |
|---|---|
| `src/proxy.ts` | `/app/*` 세션 가드. Next 16 `proxy.ts` 사용 |
| `src/components/` | 도메인 컴포넌트 |
| `src/components/ui/` | shadcn UI 전용 |
| `src/lib/actions/` | Server Action write 경계 |
| `src/lib/aip/` | AIP context, LLM adapter, 포워딩/퀘스트 초안, 로그 |
| `src/lib/integrations/google/` | Google OAuth·Calendar·Tasks sync helper |
| `src/lib/supabase/` | browser/server/proxy/admin client |
| `src/lib/database.types.ts` | Supabase generated types |

## Supabase

| 경로 | 역할 |
|---|---|
| `supabase/config.toml` | 로컬 Supabase 설정 |
| `supabase/seed.sql` | 데모·로컬 재현 seed |
| `supabase/migrations/` | 적용 순서가 있는 DB 변경 이력. 현재 54개 |

마이그레이션은 수정하지 않고 새 파일로 보정한다. DB 변경 후 가능하면:

```bash
supabase db reset
supabase gen types typescript --local --schema public > src/lib/database.types.ts
```

## 문서 폴더

| 경로 | 역할 |
|---|---|
| `docs/README.md` | 문서 인덱스 |
| `docs/backlog.md` | 다음 작업 우선순위 |
| `docs/product.md` | 제품 정체성·원칙 |
| `docs/process.md` | A/B/C 매장 운영 프로세스 |
| `docs/schema.md` | DB 청사진·객체 관계 |
| `docs/aip.md` | AIP/LLM guardrail |
| `docs/google-integrations.md` | Google Calendar/Tasks 기준 |
| `docs/kakao-notification-ingest.md` | 카톡 알림 수집 |
| `docs/kakao-retention-policy.md` | 카톡 원문 보관 |
| `docs/sheet-sync.md` | 본사 Sheet read-only sync |
| `docs/lead-management.md` | 메타광고 Lead DB |
| `docs/deployment.md` | 배포 런북 |
| `docs/windows-transfer.md` | Windows 이전 런북 |

## 생성물·무시 대상

아래는 작업 맥락 파악 대상이 아니며 커밋하지 않는다.

- `node_modules/`
- `.next/`
- `.vercel/`
- `.env.local`
- `tsconfig.tsbuildinfo`
- `supabase/.temp/`
- `supabase/logs/`

## 상위 skill/MCP

이 repo 내부에는 project-local skill/MCP를 두지 않는다. Windows 메인 환경의 전역 구성을 쓴다.

- 전역 skills: `C:\Users\반민성\.claude\skills`
- nested skills: `C:\Users\반민성\.claude\skills\skills`
- MCP 설정: `C:\Users\반민성\.claude\.mcp.json`
- 현재 MCP 서버: `ClaudeTalkToFigma`
