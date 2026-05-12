# CLAUDE.md — 2SaaS 작업 허브

> 2SaaS는 SaaS 작업을 이어받는 상위 워크스페이스다.
> 현재 주 작업 대상은 `해병듀오/`의 **BizHigh SalesOps**이며, 밸류체인 Python 파이프라인은 `VC/`에서 별도 관리한다.

---

## 적용 우선순위

1. 전역 메인 규칙: `../CLAUDE.md` + `../.claude/rules/*`
2. 이 파일: 2SaaS 워크스페이스 공통 규칙
3. 하위 프로젝트 규칙: 예) `해병듀오/CLAUDE.md`, `해병듀오/AGENTS.md`, `VC/CLAUDE.md`
4. 작업별 문서: 예) `해병듀오/docs/backlog.md`, `해병듀오/docs/product.md`, `VC/docs/DOCX_SPEC.md`

Claude Code로 다시 이어갈 것을 기준으로 한다. Codex(OpenAI CLI)에서 작업하면 `CLAUDE.md`를 읽지 않으므로 같은 규칙을 `AGENTS.md`에도 미러링한다. 어느 CLI를 쓰든 계획·검증·보고 방식은 Claude Code 7단계 워크플로우에 맞춘다.

---

## 현재 프로젝트 맵

| 위치 | 성격 | 기준 |
|---|---|---|
| `해병듀오/` | 현재 주 작업 SaaS repo. BizHigh SalesOps | `해병듀오/CLAUDE.md`, `AGENTS.md`, `README.md` |
| `VC/` | 밸류체인 자동화 Python repo | `VC/CLAUDE.md`, `VC/INSTALL.md` |

중요: `VC/`와 `해병듀오/`는 각각 별도 git repo다. 작업 전에는 항상 실제 수정할 디렉토리에서 `git status --short --branch`를 확인한다.

---

## 기본 작업 흐름

전역 7단계 워크플로우(`../CLAUDE.md` 섹션 1, Think → Intake → Skill Scan → Planning → Execution → Review → Reflect)를 그대로 따른다. 단순 작업은 Step 1·7을 생략 가능하지만, 코딩/DB/운영 변경은 Step 2~6을 생략하지 않는다.

2SaaS 특수 사항(메인 워크플로우 위에 추가):

- **repo 분리 확인**: `VC/`와 `해병듀오/`는 각각 별도 git repo. 작업 디렉토리에서 항상 `git status --short --branch` 먼저.
- **dirty worktree 보존**: 사용자의 기존 미커밋 변경을 덮어쓰지 않는다.
- **사전 읽기 필수**: 관련 `CLAUDE.md`/`AGENTS.md`/README/docs를 수정 전에 먼저 읽는다.
- **큰 결정·배포·secret·destructive git**: 사용자 확인 없이 진행하지 않는다.

### 모델 라우팅 (2SaaS 작업 기준)

| 작업 성격 | 권장 모델 |
|---|---|
| DB 스키마·RLS·마이그레이션·인증/권한 설계 | Opus |
| 일반 컴포넌트·라우트·Server Action 구현 | Sonnet |
| 파일 탐색·로그 확인·단순 패치 | Haiku |

### 4-way 리뷰 라우팅

이 워크스페이스는 코딩 프로젝트라 메인 글로벌 디폴트 4명 중 보통 **CEO + 엔지니어 + DevEx 3명**을 호출. 작업이 사용자 경험 변경을 포함하면 디자이너 추가. 단순 패치·문서 수정은 생략.

### 단축어·운영 원칙

- 단축어 해석: `../.claude/rules/shortcuts.md` 그대로 적용 ("ㅇㅇ"/"ㄱ" 승인, "그냥 해" Think+Intake 생략, "전부 맡겨" Step 5까지 자율)
- 운영 원칙: `../.claude/rules/operating-principles.md` (정확성 > 안전 > 효율 > 속도)
- 코딩 규칙: `../.claude/rules/coding.md`
- 에러 복구: `../.claude/rules/error-recovery.md` (라인 멈춤 규칙 — 빌드/테스트 실패 시 기능 추가 멈추고 진단 우선)

---

## SaaS 작업 기준

BizHigh SalesOps 작업은 기본적으로 `해병듀오/`에서 수행한다.

작업 시작 시 우선 읽기:

| 파일 | 목적 |
|---|---|
| `해병듀오/CLAUDE.md` | 앱 코드 규칙, Supabase 패턴, 검증 |
| `해병듀오/AGENTS.md` | Next.js 16 주의사항 |
| `해병듀오/README.md` | 현재 기준선과 실행 방법 |
| `해병듀오/docs/backlog.md` | 다음 작업 우선순위 |
| `해병듀오/docs/deployment.md` | 배포/프로덕션 스모크 |
| `해병듀오/docs/windows-transfer.md` | Windows 이전/환경 기준 |

Next.js는 16.2.4 기준이다. `middleware.ts`가 아니라 `proxy.ts`를 사용한다. API나 라우팅이 의심되면 `node_modules/next/dist/docs/`를 먼저 확인한다.

---

## BizHigh 핵심 원칙

- 사용자: 김민재, 김재원, 반민성. 분담 없이 공동 사용.
- 목적: 매장, 퀘스트, 카톡/시트/일정, 알림 누락 방지.
- 단일 진실 원천은 `public.stores`. 단, P0 본사 시트 동기화 범위에서는 시트가 source of truth이고 SaaS는 read-only mirror다.
- write는 Server Action 또는 Route Handler로 처리한다. 클라이언트 직접 Supabase mutation을 늘리지 않는다.
- RLS와 audit log를 기본 방어선으로 본다.
- `service_role` 키와 LLM/API key는 클라이언트, 로그, 채팅, 커밋에 노출하지 않는다.

---

## 검증 기준

SaaS 코드 변경 후 기본 검증:

```bash
cd 해병듀오
npm run lint
npx tsc --noEmit
npm run build
npm run smoke:routes
git diff --check
```

DB 마이그레이션/seed/RLS 변경이 있으면 추가:

```bash
supabase db reset
supabase migration list
```

프로덕션 영향 또는 배포 관련 변경이면 추가:

```bash
npm run smoke:prod
```

현재 Windows 환경에서는 `supabase`/`vercel` CLI가 PATH에 없을 수 있다. 실패하면 우회하지 말고 설치/로그인/`npx` 가능 여부와 함께 명확히 보고한다.

밸류체인 Python 코드를 작업할 때는 `VC/`에서 실행한다.

```bash
cd VC
uv run pytest
uv run ruff check .
```

---

## 환경 변수와 로그인

`.env.local`은 로컬에서만 관리하고 커밋하지 않는다. 템플릿은 `해병듀오/.env.local.example`이다.

SaaS 주요 env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KAKAO_NOTIFICATION_INGEST_TOKEN`
- `AIP_PROVIDER`, `KIMI_API_KEY`, `KIMI_MODEL`, `KIMI_THINKING`
- `OPENAI_API_KEY`, `OPENAI_MODEL` (선택)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`

필요 로그인/도구:

- GitHub: `Banss123/banss-salesops`
- Supabase CLI + Cloud project `xahdgabzmjaxmmkcubkf`
- Vercel CLI 또는 `npx vercel`
- Node는 `.nvmrc` 기준 `20.19.0` 권장

---

## 다음 우선순위 판단

우선순위는 `해병듀오/docs/backlog.md`를 기준으로 한다.

현재 문서상 큰 줄기:

1. P0 본사 구글시트 read-only 동기화
2. P0' 메타광고 DB 통합 관리
3. 인증/로그 actor 정리
4. 자동화 보강 및 운영 품질

단, Google Sheet/OAuth/Service Account처럼 사용자 외부 액션이 필요한 작업은 환경 준비 상태를 먼저 확인하고, 막힌 부분은 작은 PoC나 UI/DB 준비 작업으로 쪼갠다.

---

## 보고 방식

완료 보고에는 다음만 간결히 남긴다.

- 변경한 파일
- 핵심 변경 내용
- 실행한 검증과 결과
- 못 한 검증 또는 사용자 액션이 필요한 항목

문서만 수정한 경우에는 `tsc/lint/build/smoke`를 무리하게 돌리지 않아도 된다. 코드/DB/라우팅/UI 변경이 있으면 반드시 검증한다.
