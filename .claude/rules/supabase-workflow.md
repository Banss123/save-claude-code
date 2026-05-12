# Supabase 작업 가드

> Supabase 마이그레이션, seed, RLS, Edge/Route, MCP 작업에 공통 적용한다.

## 기본 원칙

- `service_role` 키는 서버 전용이다. 클라이언트 코드, 로그, 채팅, 커밋에 노출하지 않는다.
- DB write는 Server Action 또는 Route Handler에서만 수행한다.
- 클라이언트 컴포넌트는 읽기 중심으로 두고, mutation은 `src/lib/actions/*` 경유를 우선한다.
- RLS는 1차 방어선이다. 새 stateful 테이블은 첫 마이그레이션에서 RLS와 정책을 함께 둔다.
- 물리 삭제보다 `archived_at`, status, archive table을 우선한다.

## 마이그레이션

- 새 스키마 변경은 `supabase/migrations/`에 timestamp SQL로 추가한다.
- 기존 적용된 migration을 수정하지 않는다. 보정은 새 migration으로 한다.
- enum 확장은 `alter type ... add value if not exists`로 처리한다.
- stateful 테이블에는 가능한 한 `*_audit_log` 또는 추적 가능한 activity/audit 경로를 둔다.
- 외부 동기화/cron/LLM 제안처럼 재시도될 수 있는 작업은 idempotency key나 unique index를 둔다.

## Seed와 타입

- seed는 데모/개발 재현성을 위한 데이터만 둔다. 운영 secret이나 실제 민감정보를 넣지 않는다.
- DB 타입을 바꾼 뒤에는 가능한 경우 타입을 재생성한다.

```bash
supabase gen types typescript --local --schema public > src/lib/database.types.ts
```

linked Cloud 기준이 필요할 때만:

```bash
supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

## 검증

DB 변경 후 기본 검증:

```bash
supabase db reset
supabase migration list
npx tsc --noEmit
npm run lint
npm run build
```

Supabase CLI가 PATH에 없거나 Docker가 꺼져 있으면 우회하지 말고 실패 이유와 필요한 사용자 액션을 보고한다.

## 외부 연동

- Google, Kakao, AIP/LLM 입력은 바로 실행하지 않고 가능한 한 `proposed_actions` 같은 승인 대기 레이어를 거친다.
- Cron/Route Handler는 긴 secret으로 보호한다.
- 원본 payload는 필요한 만큼만 저장하고, 토큰/쿠키/대형 base64/불필요한 민감 필드는 저장 전에 제거한다.
