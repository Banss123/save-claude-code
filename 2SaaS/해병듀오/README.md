# BizHigh SalesOps

비즈하이 내부 매장 관리 SaaS. 영업자 김민재·김재원, 마케터 반민성이 공동으로 사용하는 운영 도구다.

핵심 목적은 매장 수가 늘어도 퀘스트, 시트 누락, 업주 컨텍스트, 일정, 알림을 한 화면에서 놓치지 않게 하는 것.

## Stack

- Next.js 16.2.4 App Router
- React 19
- Tailwind 4
- Supabase Cloud + local stack
- TypeScript strict
- Node 20.19.0 권장 (`.nvmrc`)

Next.js 16은 기존 Next 14/15 지식과 다른 부분이 있다. 코드 작성 전 [AGENTS.md](AGENTS.md)와 [CLAUDE.md](CLAUDE.md)를 먼저 확인한다.

## Quick Start

```bash
nvm use
npm install
supabase start
supabase db reset
npm run dev
```

접속:

```text
http://localhost:3000
http://localhost:3000/app
```

포트 3000이 이미 사용 중이면 Next.js가 3001 같은 포트를 자동으로 잡는다.

## Production Test

- App: https://banss-salesops-vercel.vercel.app
- 배포 런북: [docs/deployment.md](docs/deployment.md)

테스트 계정은 배포 런북에 정리한다. 자동 Git 배포는 Vercel 계정의 GitHub Login Connection 연결 후 활성화하고, 그 전까지는 수동 배포 스크립트를 사용한다.

## Verification

완료 보고 전 최소 검증:

```bash
npm run lint
npx tsc --noEmit
npm run build
supabase db reset
npm run smoke:routes
npm run smoke:prod
git diff --check
```

문서/소스 정리 후에는 최소 `npx tsc --noEmit`, `npm run lint`, `npm run build`를 확인한다.

## Demo

피드백 미팅용 동선:

- [docs/demo-scenario.md](docs/demo-scenario.md)

핵심 시연 흐름:

1. `/app` 대시보드 진입
2. 헤더 알림 종 pending 알림 확인
3. `지금 가장 급한 1건` Decision Brief 확인
4. 메모/위임 액션 시연
5. `sheet_missing` 퀘스트의 `체크리스트 ↗` 링크 분기 확인
6. 간트차트에서 내 작업/업주 소통 활동 강도 확인

## Current Baseline

현재 기준선은 "누락 방지 대시보드 + 외부 입력 제안함 + Google/Kakao 입력 준비"다.

- Decision Brief는 SQL view/RPC 기반 deterministic 컨텍스트 카드
- A/B 표준 프로세스는 퀘스트 완료 시 다음 단계가 자동 발급되는 큐로 동작
- 모바일은 하단 탭 네비게이션과 Decision Brief 중심으로 우선 지원
- 퀘스트 완료 시 업주 연락 기록을 같이 남길 수 있어 후속 퀘스트 자동 생성과 이어짐
- 퀘스트 제안함은 카톡 복붙/알림/Google Calendar·Tasks/AIP 결과를 승인 대기 제안으로 모은 뒤 사람이 승인하면 퀘스트로 전환
- `src/app`/`src/components`의 DB write는 Server Action으로 이동
- Quest, Store, Calendar, Report, Profile, Lead, Metrics write는 `src/lib/actions/*`에서 처리
- `/login` Email+PW 화면과 auth Server Action 준비. `/app` proxy guard ON
- 로그인한 `auth.user.id`를 `profiles.id`로 조회해 `currentUserId`와 헤더 아바타 자동 동기화
- 알림 종은 `notifications.status='pending'` 큐 기반
- 연락 기록은 단일 히스토리 원천이며, `다음 액션 + 날짜` 입력 시 후속 연락 퀘스트가 자동 생성됨
- Supabase 타입은 `src/lib/database.types.ts`에 생성되어 client/server/proxy에 연결
- AIP는 서버 전용 context builder, Kimi/OpenAI adapter, 포워딩 초안, 제안 초안, 실행 로그까지 준비
- seed는 주요 매장에 회차, 다국어 키워드, 링크, 업주 성향, pending 알림 샘플 포함
- Google Calendar/Tasks는 개인 OAuth, 소스 선택, 수동 sync, Vercel Cron 하루 1회 동기화 구조 준비
- Kakao 알림 수집은 Route Handler + raw 로그 + 제안함 승격 + 대화 내보내기 import + 톤 프로필까지 준비
- 메타광고 DB는 후순위. `/app/leads` 초기 화면과 DB 모델은 유지

## Important Docs

- [docs/README.md](docs/README.md): 문서 인덱스와 현재 시스템 요약
- [docs/project-map.md](docs/project-map.md): 폴더·파일·라우트·상위 skill/MCP 맵
- [docs/backlog.md](docs/backlog.md): 다음 작업 우선순위
- [docs/deployment.md](docs/deployment.md): Vercel/Supabase Cloud 배포 런북
- [docs/windows-transfer.md](docs/windows-transfer.md): Windows PC 이전 런북
- [docs/demo-scenario.md](docs/demo-scenario.md): 시연 동선
- [docs/palantir-patterns.md](docs/palantir-patterns.md): Decision Brief / AIP 운영 패턴
- [docs/aip.md](docs/aip.md): AIP 도입 순서와 guardrail
- [docs/google-integrations.md](docs/google-integrations.md): Google Calendar/Tasks OAuth·동기화 기준
- [docs/kakao-notification-ingest.md](docs/kakao-notification-ingest.md): Android 카톡 알림 읽기 PoC
- [docs/kakao-retention-policy.md](docs/kakao-retention-policy.md): 카톡 원문 live/archive 보관 정책
- [docs/design-system.md](docs/design-system.md): 색/타입/컴포넌트 기준
- [docs/sheet-sync.md](docs/sheet-sync.md): 본사 시트 read-only 동기화 정책
- [docs/lead-management.md](docs/lead-management.md): 메타광고 Lead DB 명세

## AIP Policy

AIP/LLM 호출은 지금 바로 붙이지 않는다. 대신 모델에 넘길 whitelist JSON 경계는 `src/lib/aip/context.ts`에 만든다.

도입 순서:

1. SQL view/RPC로 매장 360 컨텍스트를 먼저 안정화
2. 사용자 피드백으로 카드에 필요한 정보 우선순위 확정
3. 확정된 컨텍스트만 서버에서 LLM에 전달해 한 줄 요약/다음 액션 초안 생성
4. 사용자가 승인한 액션만 Server Action으로 실행

즉, LLM이 DB를 직접 바꾸는 구조가 아니라 **읽기 전용 브리핑 → 사용자 승인 → typed Server Action** 구조로 간다.
