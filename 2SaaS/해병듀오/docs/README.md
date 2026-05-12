# BizHigh SalesOps Docs

이 폴더는 비즈하이 매장 관리 SaaS의 도메인 문서, 운영 런북, DB 청사진, 외부 연동 명세를 담는다.

**사용자**: 김민재·김재원(영업자) + 반민성(마케터). 분담 없이 공동 사용.

## 먼저 볼 문서

| 파일 | 내용 |
|---|---|
| [backlog.md](backlog.md) | 다음 작업 우선순위. 작업 시작 시 가장 먼저 확인 |
| [project-map.md](project-map.md) | 현재 폴더·파일·라우트·상위 skill/MCP 맵 |
| [product.md](product.md) | 프로덕트 정체성, 사용자, 누락 방지 원칙 |
| [process.md](process.md) | 매장 운영 A/B/C 표준 프로세스 |
| [schema.md](schema.md) | DB 청사진, 객체 관계, query 시나리오 |

## 구현·운영 문서

| 파일 | 내용 |
|---|---|
| [aip.md](aip.md) | AIP/LLM 도입 기준, key/secret guardrail |
| [google-integrations.md](google-integrations.md) | Google Calendar/Tasks OAuth·동기화 기준 |
| [kakao-notification-ingest.md](kakao-notification-ingest.md) | Android/MessengerBotR 카톡 알림 수집 PoC |
| [kakao-retention-policy.md](kakao-retention-policy.md) | 카톡 원문 live/archive 보관 정책 |
| [sheet-sync.md](sheet-sync.md) | 본사 Google Sheet read-only sync 명세 |
| [lead-management.md](lead-management.md) | 메타광고 Lead DB 명세 |
| [deployment.md](deployment.md) | Vercel/Supabase Cloud 배포 런북 |
| [windows-transfer.md](windows-transfer.md) | Windows PC 이전/재개 런북 |

## 화면·참고 자료

| 경로 | 내용 |
|---|---|
| [demo-scenario.md](demo-scenario.md) | 시연 동선 |
| [design-system.md](design-system.md) | 색·타입·컴포넌트 기준 |
| [palantir-patterns.md](palantir-patterns.md) | Decision Brief/AIP 운영 패턴 |
| [pages/dashboard.md](pages/dashboard.md) | 대시보드 설계 이력과 간트차트 기준 |
| [sources/](sources/) | 카톡 원자료, 영상 프레임 등 근거 자료 |

## 현재 시스템 요약

- Next.js 16.2.4 App Router + `proxy.ts`
- 내부 앱: `/app`, `/app/stores`, `/app/leads`, `/app/settings` 중심
- API: Kakao ingest, Google OAuth, Google sync cron
- DB: `supabase/migrations/` 54개 + `seed.sql`
- 주요 자동화: 프로세스 다음 퀘스트, 연락 후속 퀘스트, 알림, 제안함 승인, 카톡 ingest, Google Calendar/Tasks 제안함 동기화
- write 경계: `src/lib/actions/*` Server Action 또는 `src/app/api/*` Route Handler

## 정리 기준

- 현재 구현과 다르면 문서 상단에 “설계 이력” 또는 “보류”로 표시한다.
- 운영 이력인 migration/source 자료는 삭제하지 않는다.
- 깨진 절대 경로, 예전 폴더명, 예전 사용자 수 표기는 발견 즉시 수정한다.
