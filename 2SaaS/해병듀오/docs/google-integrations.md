# Google Calendar / Tasks 연동 기준선

상태: 2026-05-10 기준 개인별 Google OAuth 연결 기반 준비.

## 원칙

- 사용자별 Google 계정을 각각 연결한다.
- 처음에는 읽기 전용만 사용한다.
- Google Calendar/Tasks에서 들어온 항목은 바로 퀘스트나 일정으로 실행하지 않고 `proposed_actions` 제안함으로 보낸다.
- refresh token은 서버에서 암호화한 ciphertext만 저장한다.

## OAuth

필수 환경 변수:

```bash
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_TOKEN_ENCRYPTION_KEY=
CRON_SECRET=
```

`GOOGLE_TOKEN_ENCRYPTION_KEY`는 `openssl rand -base64 32` 같은 긴 랜덤값을 사용한다.
`CRON_SECRET`도 긴 랜덤값을 사용하고, `/api/cron/google-sync` 호출 시
`Authorization: Bearer <CRON_SECRET>` 헤더가 맞아야 실행된다.

Redirect URI:

```text
https://banss-salesops-vercel.vercel.app/api/integrations/google/oauth/callback
http://localhost:3000/api/integrations/google/oauth/callback
```

요청 scope:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/tasks.readonly`

장기 동기화를 위해 Google OAuth 요청에는 `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`를 사용한다.

## DB

- `google_accounts`
  - 사용자별 Google 계정 연결 상태와 암호화 refresh token 저장
- `google_calendar_sync_sources`
  - 사용자가 선택한 캘린더와 Calendar API `sync_token` 저장
- `google_task_sync_sources`
  - 사용자가 선택한 Google Tasks tasklist 저장
- `proposed_actions.source`
  - `google_calendar`, `google_tasks`를 외부 입력 출처로 허용
- `proposed_actions_google_calendar_dedupe_idx`
  - 같은 Google Calendar event 중복 제안 방지
- `proposed_actions_google_tasks_dedupe_idx`
  - 같은 Google Task 중복 제안 방지

## 동기화 흐름

1. `/app/settings`에서 Google 계정을 연결한다.
2. `목록 가져오기`로 Calendar list와 Task list를 불러온다.
3. 동기화할 캘린더/할일 목록만 체크하고 `선택 저장`한다.
4. `지금 동기화` 또는 Vercel Cron이 선택된 소스만 읽는다.
5. 읽은 항목은 `proposed_actions` 제안함으로 들어간다.
6. 영업자가 제안함에서 제목·내용·매장·담당자를 검수한 뒤 퀘스트로 승인한다.

## 자동 동기화

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/google-sync",
      "schedule": "0 0 * * *"
    }
  ]
}
```

Vercel Hobby 플랜에서는 Cron이 하루 1회만 가능하므로 운영 기본값은 매일 00:00 UTC
(한국시간 09:00) 자동 동기화다. 더 촘촘한 동기화가 필요하면 Vercel Pro로 올리고
schedule을 `*/15 * * * *`로 바꾼다.
Calendar는 최초 1일 lookback 후 `syncToken` 기반 incremental sync를 사용한다.
Tasks는 미완료 task만 읽고, 원본 task ID 기준으로 중복을 차단한다.

## 다음 구현 순서

1. Google Cloud OAuth client 생성 후 운영 env에 키를 넣는다.
2. `/app/settings`에서 3명 각자 Google 계정을 연결한다.
3. 민재/재원/민성 각각 본인 캘린더·Tasks 목록을 선택한다.
4. 운영에서 수동 동기화 결과를 보고 제안함 품질을 확인한다.
5. 읽기 동기화가 안정화된 뒤 SaaS → Google 양방향 쓰기를 검토한다.
