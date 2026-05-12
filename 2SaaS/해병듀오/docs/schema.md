# DB 스키마 청사진 — BizHigh SalesOps

> 재사용 가능 + 데이터 추출 가능한 구조가 목표.
> 실제 DDL은 `banss/supabase/migrations/`에. 이 문서는 설계 의도와 query 시나리오 명세.

## 설계 원칙

1. **정규화 우선**. 한 사실은 한 테이블에만. 중복 = 데이터 손실 원인.
2. **시간은 모두 `timestamptz`**. 추출시 시간대 혼란 방지.
3. **모든 stateful 테이블 = `*_audit_log` 동반**. 누가/언제/왜 변경했는지 추적.
4. **enum은 자주 안 변하는 것에만**. 자주 추가/변경 가능성 있는 카테고리는 lookup 테이블.
5. **JSONB `metadata`** 컬럼으로 미리 모르는 필드 확장. 자주 query하는 필드는 정식 컬럼으로 승격.
6. **RLS는 첫 마이그레이션부터**. 정책 안 짠 채 RLS만 켜면 = 모든 select 차단.
7. **삭제 대신 `archived_at`**. 물리 삭제 금지 (감사·복원).
8. **인덱스는 query 시나리오 기반** (아래 "데이터 추출 시나리오" 참조).
9. **view + materialized view**로 자주 쓰는 집계 미리 정의 → 앱 코드는 단순.
10. **재사용성**: 단일 조직(비즈하이) 가정이지만 `org_id` 추가 시 multi-tenant로 확장 가능한 구조.

---

## 테이블 그룹

### A. 인물 (auth + profile)

| 테이블 | 역할 |
|---|---|
| `auth.users` | supabase 기본 (이메일·비밀번호) |
| `profiles` | 우리 도메인 정보 (이름·역할·연락처) — `auth.users`와 1:1 |

### B. 매장 코어

| 테이블 | 역할 |
|---|---|
| `stores` | 매장 마스터. 모든 도메인 데이터의 anchor |
| `store_audit_log` | 매장의 모든 상태/소유자/필드 변경 이력 |

### C. 프로세스 (퀘스트)

| 테이블 | 역할 |
|---|---|
| `quests` | 할 일 큐. process.md 단계 자동 풀어내기 |
| `quest_completions` | 완료 이력 (메모·완료자·시점). 재오픈 시 새 row |
| `quest_dependencies` | 선행 퀘스트 관계 (blocked_by) |

### D. 도메인 활동

| 테이블 | 역할 |
|---|---|
| `communications` | 업주 연락 트래킹 (통화·카톡·이메일·미팅) |
| `recurring_checks` | 정기 체크 결과 (매장×템플릿×주기) |
| `check_templates` | 정기 체크 항목 마스터 (재사용 위해 분리. 매장 체크리스트·리뷰 체크리스트 양식) |

### E. 계약 문서

| 테이블 | 역할 |
|---|---|
| `quotes` | 견적서 (계약 전 발행) — 견적가·할인·VAT 스냅샷 |
| `contracts` | 계약서 (전자서명 발송·완료 추적) |

### F. 측정·지표

| 테이블 | 역할 |
|---|---|
| `keywords` | 추적 키워드 (매장당 N개) |
| `keyword_rankings` | 키워드별 일일 순위 시계열 |
| `gbp_snapshots` | GBP API/수동 입력 raw json — 추후 분석용 보관 |
| `store_metrics_daily` | 매장 일일 KPI 집계 (노출·통화·리뷰수 등) |
| `reports` | 주간/중간등수/월간 리포트 메타 (생성일·범위·상태) |

### G. 캘린더·활동

| 테이블 | 역할 |
|---|---|
| `calendar_events` | 팀 공유 일정 (미팅·방문·보고 마감) |
| `activity_log` | 활동 히트맵 데이터 (사용자 작업·업주 소통 이벤트 모두) |

### H. 외부 입력·제안함

| 테이블 | 역할 |
|---|---|
| `proposed_actions` | 카톡/Google Calendar·Tasks/AIP 입력을 바로 실행하지 않고 승인 대기 |
| `kakao_ingest_batches` | 카톡 수집 API 호출 단위 로그·중복/실패/제안 집계 |
| `kakao_notification_events` | 카톡 수집 원문 이벤트. 중복 방지·매장 매칭·처리 상태 보관 |
| `kakao_room_mappings` | 예외 카톡방 이름을 특정 매장에 수동 연결 |
| `kakao_conversation_imports` | 매장별 카톡 대화 내보내기 파일 import 로그 |
| `kakao_conversation_messages` | 대화 내보내기에서 파싱한 메시지 단위 로그 |
| `store_tone_examples` | 포워딩 말투 학습 예시. 내부→업주 / 업주→내부 방향 구분 |
| `store_tone_profiles` | 매장별 말투 프로필. 포워딩 어시스턴트와 추후 AIP 컨텍스트에서 사용 |
| `google_accounts` | 사용자별 Google OAuth 연결. refresh token ciphertext 저장 |
| `google_calendar_sync_sources` | 선택한 Google Calendar source와 sync token |
| `google_task_sync_sources` | 선택한 Google Tasks tasklist |
| `aip_execution_logs` | AIP/LLM 초안 생성 감사 로그 |
| `notifications` | in-app 알림 큐 |

### I. 룩업 (재사용 위해 분리)

| 테이블 | 역할 |
|---|---|
| `store_types` | 요식업/뷰티/병의원/약국/기타 (확장 가능) |
| `payment_methods` | card/cash/transfer (확장) |
| `communication_channels` | call/kakao/email/kakaowork/meeting/other (확장) |

---

## ENUM (자주 안 변하는 것)

```sql
create type store_status as enum (
  'contract_pending', 'contract_signed', 'ready_to_start',
  'active', 'paused', 'churned', 'archived'
);

create type quest_status as enum ('pending', 'blocked', 'completed', 'cancelled');
create type quest_priority as enum ('urgent', 'normal', 'low');
create type quest_source as enum ('auto', 'manual', 'sheet_missing');
create type comm_direction as enum ('inbound', 'outbound');  -- 업주가→우리 / 우리→업주
create type contract_status as enum ('draft', 'sent', 'signed', 'paid', 'cancelled');
create type user_role as enum ('sales', 'marketer', 'admin');
create type lead_status as enum ('new', 'contacted', 'interested', 'booked', 'closed', 'dropped', 'invalid');
```

---

## 핵심 관계 다이어그램

```
auth.users ─┬─ profiles (1:1)
            │
            └─< stores.assigned_owner / assigned_marketer (담당)

stores ─┬─< quests
        ├─< quest_completions (via quests)
        ├─< communications
        ├─< recurring_checks ─> check_templates
        ├─< keywords ─< keyword_rankings
        ├─< gbp_snapshots
        ├─< store_metrics_daily
        ├─< quotes
        ├─< contracts
        ├─< calendar_events (선택 — 매장 무관 일정도 가능)
        ├─< activity_log
        └─< store_audit_log
```

---

## 데이터 추출 시나리오 (이걸 효율적으로 돌릴 수 있게 인덱스·view 설계)

### 대시보드

| 위젯 | Query 핵심 | 인덱스/뷰 |
|---|---|---|
| 통계 카드 (관리매장/진행중퀘스트/오늘마감/연체) | `count(stores) where status='active'` 등 | `stores(status)`, `quests(status, due_date)` |
| 인사 메시지 ("N건 남았습니다") | `count(quests) where assignee=me and status='pending'` | `quests(assignee, status)` |
| 활동 히트맵 (26주) | `activity_log group by date_trunc('day', occurred_at), type` | `activity_log(actor_id, occurred_at)` partial index |
| 퀘스트 보드 (탭별) | `quests where is_pinned / priority='urgent' / due_date=today / status='completed'` | `quests(is_pinned)`, `quests(priority)`, `quests(due_date)`, `quests(status)` |
| **간트차트** | `stores LEFT JOIN quests ON store_id, date range overlap` | view: `v_gantt_month` |
| 캘린더 (월간 이벤트) | `calendar_events where date between :start and :end` | `calendar_events(event_date)` |
| 완료 모음 (최근 5) | `quest_completions order by completed_at desc limit 5` | `quest_completions(completed_at desc)` |

### 매장 상세

| 위젯 | Query |
|---|---|
| 진행 중 퀘스트 | `quests where store_id=:id and status in ('pending','blocked')` |
| 완료 타임라인 | `quest_completions where store_id=:id order by completed_at desc` |
| 연락 로그 | `communications where store_id=:id order by occurred_at desc` |
| 정기 체크 현황 | `recurring_checks where store_id=:id` group by template |
| 등수 추이 | `keyword_rankings where keyword.store_id=:id and date >= :since` |
| 변경 이력 | `store_audit_log where store_id=:id order by occurred_at desc` |

### 보고서

| 보고서 | Query 핵심 |
|---|---|
| 주간보고 | `keyword_rankings + gbp_snapshots + recurring_checks` 매장×주 단위 집계 |
| 중간등수보고 | `keyword_rankings` snapshot diff (이전 vs 현재) |
| 월간보고 | 위 둘 + `communications` 빈도 + `quest_completions` 통계 |

### 전역 검색

```sql
select * from stores where name ilike '%' || :q || '%'
union all
select * from quests where title ilike '%' || :q || '%'
```
→ 추후 pg_trgm + GIN 인덱스 또는 supabase Full Text Search.

---

## RLS 정책 (1차 안)

비즈하이 단일 조직 + 사용자 3명 (분담 X, 공동 사용)이라 단순:

```sql
-- 모든 인증된 사용자 = 모든 매장·퀘스트 read/write 가능
create policy "authenticated full access on stores"
  on stores for all
  to authenticated
  using (true) with check (true);
```

향후 매장 사장이 추가되면 (TBD): "본인 매장만" 정책 추가.

---

## 재사용성·확장성 체크

| 항목 | 처리 |
|---|---|
| 새 업종 추가 | `store_types` lookup에 row 추가 (마이그레이션 X) |
| 새 결제수단 | `payment_methods` lookup에 row 추가 |
| 새 연락 채널 | `communication_channels` lookup에 row 추가 |
| 새 정기 체크 항목 | `check_templates`에 row 추가 → 매장에 자동 연결 |
| 미리 모르는 매장 속성 | `stores.metadata jsonb` |
| 다른 조직 (비즈하이 외) | 모든 테이블에 `org_id` 컬럼 추가 + RLS에 `org_id = auth.jwt()->>'org_id'` 추가 |
| 새 보고서 양식 | `reports.template_id` + `report_templates` 테이블 추가 (TBD) |

---

## 마이그레이션 현황

실제 DDL 정본은 `supabase/migrations/`다. 2026-05-11 기준 54개 migration이 있으며, 기존 적용 파일은 수정하지 않고 새 timestamp 파일로 보정한다.

| 범위 | 파일대 | 내용 |
|---|---|---|
| 초기 코어 | `20260426000001`~`20260426000018` | enums, profiles, stores, quests, communications, checks, calendar/activity, reports, keywords, GBP |
| UI/Lead/Decision Brief | `20260505000001`~`20260507000003` | 할인단가, profiles update, sheet_missing source, lead DB, views/RPC, notifications, auth guard |
| 자동화·제안함·카톡 | `20260508000001`~`20260509000007` | follow-up quest, process next quest, proposed_actions, kakao ingest, multi assignees, tone profiles, conversation import, retention |
| AIP·Google | `20260510000001`~`20260510000004` | AIP logs, Kimi provider, Google OAuth/Calendar/Tasks sync, dedupe |

DB 변경 후 가능하면 `supabase db reset`과 타입 재생성을 함께 수행한다.

---

## 미해결 (다음 결정 필요)

- 매장 사장 사용자 추가시 RLS 어떻게 — `stores.owner_user_id` 추가 + 정책 분기
- `keyword_rankings` 데이터 소스 (수동 입력 vs API) — 입력 패턴 따라 partition 검토
- `gbp_snapshots`는 storage(S3-like)에 raw json 저장 vs DB jsonb — 크기 따라
- multi-tenant 전환 시점 — 지금은 안 함, 코드에 가드만 남김

---

## 변경 이력

- 2026-04-26: 신규. 재사용 가능·추출 가능 청사진 1차 작성. 12개 마이그레이션 파일 분할 계획.
- 2026-05-11: 실제 migration 54개 기준으로 현황 갱신. proposed_actions, Kakao, Google, AIP, notifications, Lead 확장 반영.
