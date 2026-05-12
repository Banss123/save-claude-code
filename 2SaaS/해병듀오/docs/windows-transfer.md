# Windows PC 이전 런북

> 목적: 현재 Mac에서 작업한 BizHigh SalesOps SaaS를 Windows PC의
> `.claude/2SaaS/해병듀오` 경로로 그대로 이어서 작업한다.

## 결론

이전 방식은 **Git repo clone이 정답**이다.

- 소스, 마이그레이션, 문서, 현재 진행 이력은 GitHub에 모두 들어간다.
- `.env.local`, `.vercel`, `node_modules`, `.next`는 Git에 넣지 않는다.
- zip은 보조 백업으로만 사용한다. zip은 숨김 파일/환경변수/원격 연결 상태가 꼬일 수 있다.

GitHub repo:

```text
https://github.com/Banss123/banss-salesops.git
```

Production:

```text
https://banss-salesops-vercel.vercel.app
```

## 현재 기준선

마지막 확인일: 2026-05-11

기준 repo는 `main`/`origin/main`이다. 작업 재개 전에는 항상 `git status --short --branch`로 미커밋 변경을 확인한다.

최근 핵심 커밋:

```text
f8c202f fix: use hobby-safe google sync cron
74397d8 feat: sync google calendar tasks proposals
649dbf5 feat: add google oauth foundation
0ed5d23 feat: tune tablet fold layouts
5b3d14c feat: improve mobile dashboard and ops status
5d3816d chore: tune aip model and forwarding ui
ea87ccb feat: add kimi aip provider
```

최근 검증:

```bash
npx tsc --noEmit
npm run lint
npm run build
SMOKE_BASE_URL=http://localhost:3010 npm run smoke:routes
npm run smoke:prod
```

프로덕션 스모크 결과:

- `/`, `/login` 정상
- `/app`, `/app/stores/new` 비로그인 redirect 정상
- 민재/재원/민성 테스트 계정 로그인 정상

## Windows PC 권장 경로

PowerShell 기준:

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\2SaaS"
git clone https://github.com/Banss123/banss-salesops.git "$HOME\.claude\2SaaS\해병듀오"
Set-Location "$HOME\.claude\2SaaS\해병듀오"
```

CMD 기준:

```cmd
mkdir "%USERPROFILE%\.claude\2SaaS"
git clone https://github.com/Banss123/banss-salesops.git "%USERPROFILE%\.claude\2SaaS\해병듀오"
cd /d "%USERPROFILE%\.claude\2SaaS\해병듀오"
```

## 필수 설치/로그인 체크

다른 PC에서 아래가 필요하다.

- Git for Windows
- Node.js 20.19.0 권장 (`.nvmrc`)
- npm
- Supabase CLI
- Vercel CLI는 `npx vercel ...`로 실행 가능
- GitHub 인증
- Supabase CLI 로그인
- Vercel 로그인

확인 명령:

```powershell
git --version
node -v
npm -v
supabase --version
npx vercel --version
```

현재 Mac 작업 환경에서 확인된 버전:

```text
node v20.11.0
npm 10.2.4
supabase 2.90.0
vercel 53.3.2
```

프로젝트 권장은 `.nvmrc` 기준 `20.19.0`이다. Windows에서는 가능하면 `20.19.0` 이상으로 맞춘다.

## 첫 실행

```powershell
npm install
copy .env.local.example .env.local
```

`.env.local`은 아래 환경변수를 채운다. 실제 값은 채팅/문서/Git에 적지 않는다.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
KAKAO_NOTIFICATION_INGEST_TOKEN=
AIP_PROVIDER=kimi
KIMI_API_KEY=
KIMI_MODEL=kimi-k2.5
KIMI_THINKING=disabled
AIP_DISABLE_LLM=false
AIP_ENABLE_KAKAO_PROPOSAL_AI=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_SERVICE_ACCOUNT_KEY=
SHEET_ID_BIZHIGH=117u2PT14pZrpAeYsk8GpPItQtAU9rNygJ9CQUnXhpbI
SHEET_SYNC_INTERVAL_MIN=5
CRON_SECRET=
```

`GOOGLE_SERVICE_ACCOUNT_KEY`는 본사 시트 read-only sync용 서비스 계정 JSON 전체를 한 줄 문자열로 넣는다.

로컬 Supabase를 쓸 경우:

```powershell
supabase start
supabase status
supabase db reset
```

Supabase Cloud만 보면서 개발할 경우 `.env.local`의 Supabase URL/anon/service role을 Cloud 값으로 둔다.

개발 서버:

```powershell
npm run dev
```

접속:

```text
http://localhost:3000
http://localhost:3000/app
```

## Vercel 연결

현재 프로덕션 Vercel 프로젝트:

```text
banss-salesops-vercel
```

GitHub 자동 배포는 아직 Vercel GitHub Login Connection 상태에 따라 달라질 수 있다.
막히면 수동 배포 스크립트를 사용한다.

```powershell
npm run deploy:vercel
npm run smoke:prod
```

Vercel env 확인:

```powershell
npx vercel env ls production
```

2026-05-11 기준 운영 env에 확인된 것:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KAKAO_NOTIFICATION_INGEST_TOKEN`
- `AIP_PROVIDER`
- `KIMI_API_KEY`
- `KIMI_MODEL`
- `KIMI_THINKING`
- `CRON_SECRET`

아직 사용자가 넣어야 하는 Google OAuth 운영 env:

```powershell
npx vercel env add GOOGLE_CLIENT_ID production
npx vercel env add GOOGLE_CLIENT_SECRET production
npx vercel env add GOOGLE_TOKEN_ENCRYPTION_KEY production
```

본사 시트 read-only sync를 운영에 켤 때 추가로 넣을 env:

```powershell
npx vercel env add GOOGLE_SERVICE_ACCOUNT_KEY production
npx vercel env add SHEET_ID_BIZHIGH production
npx vercel env add SHEET_SYNC_INTERVAL_MIN production
```

`GOOGLE_TOKEN_ENCRYPTION_KEY` 생성:

```powershell
openssl rand -base64 32
```

Windows에 `openssl`이 없으면 Git Bash에서 실행하거나 긴 랜덤 문자열을 별도로 생성한다.

Google OAuth redirect URI:

```text
https://banss-salesops-vercel.vercel.app/api/integrations/google/oauth/callback
http://localhost:3000/api/integrations/google/oauth/callback
```

## Supabase Cloud

Cloud project ref:

```text
xahdgabzmjaxmmkcubkf
```

DB 마이그레이션을 추가했다면:

```powershell
supabase migration list
supabase db push --dry-run
supabase db push --yes
supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

seed까지 의도적으로 반영할 때만:

```powershell
supabase db push --include-seed
```

## 현재 구현 상태 요약

### 대시보드

- `지금 가장 급한 퀘스트 1건` 중심 Decision Brief
- 퀘스트 처리, 완료, 위임, 스킵, 메모
- 스킵/삭제/위임 계열은 사고 방지를 위해 확인 팝업 적용
- 퀘스트 제안함 팝업
- 매장/업주 정보, 최근 연락, 최근 이슈, 바로가기 링크
- 포워딩 어시스턴트 Kimi 기반 초안 생성
- 결과창 직접 수정/복사 가능
- 모바일, Fold, 태블릿 레이아웃 보강

### 매장

- 매장 등록 서비스 선택 구조 정리
- 구글/샤오홍슈/네이버CMO/고덕지도/대만 체험단/일본 체험단 등
- Google은 계약 계산 편의를 위해 선택 고정 요구가 반영된 상태
- 매장 리스트에 서비스 열 추가
- 매장 상세 UI 가독성 보강
- 키워드 등수/GBP 인사이트 직접 입력 영역은 현재 UI 우선순위에서 제외. 관련 미사용 컴포넌트는 정리됨.

### 계약/가격

- 업종/키워드 개수/계약기간 기반 금액 계산
- 수동 입력 가능
- VAT 참고 합계
- 실제 입금 스케줄은 할인 전 월 단가로 받다가 할인 총액을 뒤 회차에서 차감하는 방식 반영

### 카톡 수집

- MessengerBotR / Android 알림 기반 카톡 알림 수집 PoC
- `kakao_notification_events` raw 로그
- 중복 방지/수집 batch 로그
- `[SEO] 업장명`, `[작업] 업장명` 자동 매칭
- 예외 카톡방 수동 연결
- 대화 내보내기 TXT import
- 매장별 포워딩 톤 프로필/예시 저장
- 카톡 원문 live/archive 보관 정책 문서화

### AIP / LLM

- Kimi provider 적용
- 기본 모델: `kimi-k2.5`
- 포워딩 어시스턴트는 매장 컨텍스트와 톤 프로필 기반 초안 생성
- 카톡/수동 입력/Google 입력은 바로 실행하지 않고 `proposed_actions` 제안함으로 들어감
- 사용자가 승인해야 실제 퀘스트 생성

### Google Calendar / Tasks

- 사용자별 Google OAuth 기반 준비
- refresh token 암호화 저장
- Calendar/Tasks 읽기 scope
- 캘린더 목록/Task 목록 가져오기
- 선택한 소스만 동기화
- `지금 동기화`
- Google Calendar/Tasks 항목을 `proposed_actions`로 적재
- Google 원본 ID 기준 중복 방지
- Vercel Cron 자동 동기화
- Vercel Hobby 제한 때문에 기본 Cron은 하루 1회, 한국시간 09:00
- 15분 주기는 Vercel Pro 필요

### 배포

- GitHub repo 연결 완료
- Vercel 수동 배포 스크립트 존재
- 프로덕션 URL 정상
- 테스트 계정 3개 로그인 정상

## 중요한 문서

작업 재개 전 이 순서로 읽는다.

1. `CLAUDE.md`
2. `AGENTS.md`
3. `README.md`
4. `docs/backlog.md`
5. `docs/product.md`
6. `docs/process.md`
7. `docs/schema.md`
8. `docs/aip.md`
9. `docs/google-integrations.md`
10. `docs/kakao-notification-ingest.md`
11. `docs/kakao-retention-policy.md`
12. `docs/deployment.md`

## Agent / Skill 관련

이 SaaS repo 안에는 별도 `.claude`, `.codex`, `.agents`, project-local skill 폴더를 새로 만들지 않았다.

즉 Windows 메인 PC에 이미 있는 전역 구성이 기준이다.

- global `.claude`
- Superpowers
- e-c-c
- Claude Code / Codex 설정

repo 안에서 반드시 가져가야 하는 프로젝트 규칙은 아래 두 파일이다.

- `CLAUDE.md`
- `AGENTS.md`

## 이전 후 sanity check

```powershell
git status --short --branch
npm install
npx tsc --noEmit
npm run lint
npm run build
npm run smoke:routes
npm run smoke:prod
```

정상 기준:

- `git status`가 깨끗함
- `build` 통과
- `smoke:prod`에서 public route/auth/test login 통과

## 백업 기준

작업 재개와 이전은 GitHub clone을 기준으로 한다. zip 백업은 현재 운영 절차에서 제외한다.
