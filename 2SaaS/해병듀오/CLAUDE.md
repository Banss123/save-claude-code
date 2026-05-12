# CLAUDE.md — BizHigh SalesOps

> 비즈하이 사내 매장 관리 SaaS. 사용자 3명 (영업: 김민재·김재원 / 마케터: 반민성). 분담 X, 공동 사용.
> 글로벌 워크플로우(`../../CLAUDE.md` + `../../.claude/rules/*`) 그대로 적용. 이 파일은 **앱 코드 한정 규칙**.

⚠️ Next.js **16.2.4** — `middleware.ts` 폐기, `proxy.ts`로 대체. API 의심되면 `node_modules/next/dist/docs/` 먼저 (자세한 건 `AGENTS.md`).

## 작업 시작 시 읽기 (우선순위)

| 파일 | 내용 |
|---|---|
| `docs/backlog.md` | **다음 작업 우선순위 — 가장 먼저 보기** |
| `docs/product.md` | 프로덕트 정체·사용자·누락 방지 정책 |
| `docs/process.md` | A·B·C 단계 표준 프로세스 |
| `docs/schema.md` | DB 청사진·query 시나리오·자동화 트리거 |
| `docs/sheet-sync.md` | 본사 시트 동기화 명세 (P0) |
| `docs/google-integrations.md` | Google Calendar/Tasks OAuth·동기화 기준 |
| `docs/project-map.md` | 현재 폴더·파일·라우트·상위 skill/MCP 맵 |
| `docs/pages/dashboard.md` | 대시보드 간트차트 명세 |

---

## 스택 한 줄

Next.js 16.2.4 (App Router·Turbopack·`proxy.ts`) · React 19.2.4 · Tailwind 4 · shadcn(Radix) · Supabase(`@supabase/ssr`) · TS5 strict · alias `@/*` → `src/*`

## 폴더 컨벤션

- `src/app/(marketing)/` → 랜딩 (URL prefix 없음)
- `src/app/app/` → 내부 툴 (`/app/*`, proxy 가드)
- `src/app/login` → 공개 로그인 페이지
- `src/app/api/` → Route Handler·cron·외부 ingest
- `src/components/ui/` = shadcn만, 그 외 도메인 컴포넌트는 직속/폴더 분리
- `src/lib/actions/` = Server Action write 경계
- `src/lib/integrations/` = Google/Kakao 등 외부 연동 helper
- Server Component 기본, 인터랙션 필요 시만 `"use client"`

---

## Supabase 패턴

| 어디 | 클라이언트 | 임포트 |
|---|---|---|
| Server Component·Action·Route | server | `@/lib/supabase/server` |
| Client Component (`"use client"`) | browser | `@/lib/supabase/client` |
| `proxy.ts` | session | `@/lib/supabase/proxy` |

- 읽기 = Server Component 기본
- 쓰기 = Server Action / Route Handler (클라이언트 직접 mutation X)
- RLS 신뢰 — `.eq('user_id', ...)` 또 걸지 말 것
- 마이그·시드·RLS·Edge/MCP 가드: `../../.claude/rules/supabase-workflow.md`

---

## 누락 방지 5대 정책 (비타협)

1. **단일 진실 원천**: `public.stores`만 권위 (P0 동기화 한정 본사 시트 = source of truth)
2. **상태 머신 강제**: enum 외 status 추가 X. 삭제 금지(`archived_at` 채우기)
3. **헬스체크 신선도**: `last_health_check_at` 7일 stale → 알림, 14일 → paused 후보
4. **감사 로그**: stateful 테이블엔 `*_audit_log` 동반
5. **RLS 1차 방어선**: 첫 마이그부터 활성. `service_role` 키 클라 노출 절대 X

---

## 4-way 페르소나 (이 프로젝트 전용)

글로벌 디폴트 대신 사용. 복잡한 변경·신규 슬라이스 진입 시 압박 테스트.

| 페르소나 | 핵심 질문 |
|---|---|
| **영업자** | 매일 열어볼 만큼 유용? 카톡·시트 워크플로우와 충돌? |
| **마케터** | 이중 입력 X? 본사 자료 흐름 안 막힘? 의료법 컨펌 자연스러운가? |
| **엔지니어** | RLS 빠진 데? service_role 노출? proxy.ts 패턴? 마이그 의존성? |
| **DevEx** | 6개월 후 이해 가능? 시트 헤더 바뀌면 부러지나? 임시 마커 추적? |

라우팅·생략 조건은 `../.claude/rules/workflow-planning.md`.

---

## 검증 (완료 보고 전)

```bash
npm run dev          # http://localhost:3000  (UI는 브라우저에서 골든패스+엣지+리그레션 확인)
npm run lint
npx tsc --noEmit
npm run build
npm run smoke:routes
supabase db reset    # DB 재생성 (마이그+seed)
supabase status      # 키·URL 조회
```

shadcn 추가: `npx shadcn@latest add <component>` → `src/components/ui/`.

---

## 환경변수

`.env.local`만 관리(커밋·로그·채팅 노출 X). 템플릿 `.env.local.example`.
P0 시트 동기화 추가 예정 키는 `docs/sheet-sync.md` §7 참조.

---

## 임시 마커

`docs/backlog.md` 임시 처리 섹션 참조 (P1 인증 셋업 시 함께 정리).

## 변경 이력

- 2026-04-26: 신규. Next.js 16 + Tailwind 4 + shadcn + Supabase SSR.
- 2026-05-04: 다른 PC 동기화 후 17섹션 디벨롭.
- 2026-05-05: **압축** — 413줄 → ~80줄. 디테일은 `docs/`로 위임, 핵심 메타·정책만 메인에. 도메인 용어집·자동화 트리거·페이지 인벤토리는 `docs/product.md`·`docs/schema.md`·`docs/backlog.md`에서 찾기.
- 2026-05-11: Windows/AGENTS 기준 반영. 상위 rules 상대 경로, `src/app/login`, API/Server Action/외부 연동 폴더, Google 동기화 문서 포인터 갱신.
