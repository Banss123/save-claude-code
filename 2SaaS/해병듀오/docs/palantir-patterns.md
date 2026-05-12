# Palantir Operational Patterns — 해병듀오 적용

> 비전: **"매장이 100개·1000개로 늘어도 사람의 신경·기억 의존도 0에 수렴하는 SaaS."**
> 우선순위 퀘스트 1개를 클릭하면 해당 매장의 모든 컨텍스트(상태·이슈·계약·키워드·업주 성향)가 자동으로 따라오고,
> 사용자는 **네 / 저장 / 적용** 버튼만 딸깍해서 처리. 그 사이를 AIP(우리 시스템 + LLM)가 채운다.

이 문서는 Palantir Foundry/AIP의 **운영 패턴**을 해병듀오 도메인에 라벨링한 설계 이력이다.
**Palantir Python SDK·Semantica.ontology를 박지 않는다** — Postgres·RLS·트리거·TypeScript로 같은 효과 달성.

> 2026-05-11 현재: Decision Brief SQL view/RPC, notifications, proposed_actions, Kimi/OpenAI adapter, 포워딩 초안, 카톡/Google 입력 제안함까지 일부 구현됐다. 아래 문서의 “신규 후보/다음 슬라이스” 표기는 설계 당시 기준이므로 실제 현황은 `docs/aip.md`, `docs/project-map.md`, `supabase/migrations/`를 우선한다.

---

## 1. Palantir 4계층 — 해병듀오 매핑

| Palantir | 컨셉 | 해병듀오 현재 구현 | 부족한 것 |
|---|---|---|---|
| **Ontology Layer** | 객체·속성·링크·액션 메타모델 | 마이그 54개 (stores·quests·leads·communications·keywords·kakao·google 등) + enum/FK/RLS/audit | 단일 ontology 정의 파일은 없음. DB와 타입이 정본 |
| **AIP Layer** | LLM이 컨텍스트 흡수해서 결정 보조 | Kimi/OpenAI adapter, forwarding draft, proposed quest draft, execution log | AIP는 제안까지만. 사용자 승인 없는 write 금지 |
| **Workshop Layer** | 운영 화면 빌더 | `/app`, stores, store detail, leads, settings 중심 | 정기체크/보고서는 후순위 메뉴 |
| **Pipeline Layer** | 외부 → ontology 데이터 sync | seed.sql, quest 자동 트리거, 카톡 ingest, Google Calendar/Tasks 제안함 sync | 본사 Sheet/Lead sheet sync는 read-only 정책으로 후속 |

→ **현재 결론**: Ontology/Workshop/Pipeline/AIP가 모두 1차 연결됐다. 다음 한 수는 “더 많은 자동 실행”이 아니라 제안 품질과 승인 UX를 안정화하는 것이다.

---

## 2. Ontology 한 장 (Single Source of Truth — 운영 메타모델)

해병듀오의 ObjectType·Link·Action·Automation을 **사람이 한 눈에 보는 표**.
이게 있으면 새 기능 추가 시 "이건 새 ObjectType인가, 기존 ObjectType의 새 Property인가, 새 Action인가, 새 Automation인가"를 5초 안에 결정 가능.

### 2-1. ObjectTypes (= 마이그 테이블 ↔ 도메인 객체)

| Object | 책임 | 핵심 상태 / Property | Source of Truth |
|---|---|---|---|
| `Store` | 관리 매장 마스터 | `store_status` enum (7개) · `last_health_check_at` · `start_date` · `assigned_owner` | `public.stores` (자체) |
| `Quest` | 매장 단위 할 일 | `quest_status` · `priority` · `process_step` · `due_date` · `source` (auto/manual/sheet_missing) | `public.quests` |
| `Communication` | 업주와의 모든 접촉 | `channel` · `direction` · `next_action_date` | `public.communications` |
| `RecurringCheck` | 정기 점검 인스턴스 | `template_id` · `due_date` · `result` | `public.recurring_checks` |
| `Report` | 본사 → 컨펌 → 송부 산출물 | `report_type` · `report_status` (received/confirmed/sent) | `public.reports` |
| `Lead` | 메타 광고 잠재고객 | `lead_status` enum · `campaign_id` | `public.leads` |
| `LeadCampaign` | 광고 캠페인 마스터 | 메타 광고 ID · 매핑 매장 | `public.lead_campaigns` |
| `Keyword` + `KeywordRanking` | 추적 키워드 + 시계열 등수 | 일일 snapshot | `public.keyword_rankings` |
| `GBPSnapshot` | 구글 비즈니스 프로필 인사이트 | 조회·통화·길찾기·리뷰 | `public.gbp_snapshots` |
| `ActivityLog` | 모든 액션의 통합 타임라인 | actor · type · occurred_at | `public.activity_log` |
| `*_AuditLog` | ObjectType별 변경 이력 | before/after JSON | `public.{store,quest,lead}_audit_log` |
| **(신규 후보)** `OwnerProfile` | 업주 성향 요약 | tone · responsiveness · last_signal · LLM-summary | (§5에서 정의) |
| **(신규 후보)** `DecisionBrief` | 퀘스트 처리용 자동 브리핑 | quest_id · context_json · llm_summary · cached_at | (§3·§7에서 정의) |
| **(신규 후보)** `Notification` | 알림 큐 | type · target_user · status (pending/seen/acted) | (§6에서 정의) |

### 2-2. Links (= FK + 도메인적 의미)

```
Store (1) ──< (N) Quest                  store-has-quest
Store (1) ──< (N) Communication          store-has-comm
Store (1) ──< (N) RecurringCheck         store-has-check
Store (1) ──< (N) Report                 store-has-report
Store (1) ──< (N) KeywordRanking         store-has-keyword (N:M via keywords)
Store (1) ──< (N) GBPSnapshot            store-has-gbp
LeadCampaign (1) ──< (N) Lead            campaign-attracted-lead
Lead (N) ──> (1) Store [optional]        lead-becomes-store (대전환 = LTV 시작점)
Quest (1) ──> (1) DecisionBrief          quest-has-brief    (캐시)
User (auth) (1) ──< (N) Quest            user-assigned-quest
User (auth) (1) ──< (N) Store            user-owns-store    (assigned_owner)
```

### 2-3. Actions (= 1-Click 운영 액션, 모두 typed Server Action)

> 사용자가 말한 "**네/저장/적용** 딸깍"이 곧 Action. 모든 의사결정은 Action으로 정의 → audit 자동 → 후속 트리거 chain.

| Action | 효과 | 트리거 후속 |
|---|---|---|
| `completeQuest(quest_id, note?, evidence?)` | quest_status=done | activity_log + 다음 quest seed (auto) + Store.last_health_check_at touch |
| `skipQuest(quest_id, reason)` | quest_status=skipped | audit_log + activity_log |
| `delegateQuest(quest_id, to_user_id)` | quest.assigned_user_id 변경 | audit_log + 알림 |
| `addManualQuest(store_id, payload)` | source='manual' quest 생성 | activity_log |
| `markHealthChecked(store_id, snapshot)` | last_health_check_at=now | (stale view에서 즉시 빠짐) |
| `recordCommunication(store_id, payload)` | comm 행 + activity_log | OwnerProfile 재계산 큐에 enqueue (§5) |
| `archiveStore(store_id, reason, succession_date?)` | status='archived' + archived_at | 진행 중 quests paused |
| `pauseStore(store_id, reason)` | status='paused' | 14일+ stale 매장 자동 후보 (§6) |
| `resumeStore(store_id)` | status='active' | next_month seed |
| `confirmReport(report_id, edits?)` → `sendReport(report_id)` | report_status: received→confirmed→sent | sent 시 해당 quest 자동 완료 (트리거 16) |
| `escalateStore(store_id, reason)` | priority bump + 알림 | 모든 진행 중 quests priority='urgent' |
| `linkLeadToStore(lead_id, store_id)` | leads.store_id 채움 + lead_status='converted' | activity_log + LTV 시작점 마킹 |

**액션 정의 규칙**:
- TypeScript zod 스키마 정의 → Server Action에서 검증
- 모든 Action은 `actor_id` 자동 기록 (proxy.ts 세션)
- 실패 시 `RecoveryAction` 반환 (silent fail X)
- 위치: `src/lib/actions/<object>.ts` (예: `src/lib/actions/quest.ts`)

### 2-4. Automations (= 트리거 / Edge Function / pg_cron, 사람 개입 0)

이미 구현된 8개 + 추가 후보:

```
[구현됨]
1. Store insert      → A.1 quest auto seed
2. Store insert(GBP 세팅 필요) → B.4* quest 추가
3. Store.start_date  → C 단계 자동 (D+15·주간4·월간1·체크4)
4. RPC fn_seed_next_month → 다음 1개월 롤링
5. Report.sent       → 해당 quest 완료
6. Store mutation    → audit_log
7. Quest completion  → activity_log + status update
8. Communication     → activity_log

[추가 후보 — §6·§7에서 명세]
9.  매일 09:00 cron  → stale 7일+ 매장 → Notification + Quest(source='health_stale')
10. 매일 09:00 cron  → 14일+ active 매장 → paused 후보 마킹
11. Quest 클릭       → DecisionBrief 캐시 fetch/build
12. Communication 추가 → OwnerProfile 재계산 (월 1회 합산)
13. 메타 광고 sync   → Lead → 매장 매칭 후보 큐
14. Status 변경      → next stage quest auto (contract_pending→signed → B.1)
```

---

## 3. Decision Brief 패턴 (사용자 비전의 핵심)

> 사용자 발언 그대로:
> *"가장 우선순위 퀘스트를 깨려고 할 때, AIP나 짜놓은 구조가 알아서 해당 매장의 현재 상태·최근 이슈·계약 기간·키워드·정보·업주 성향 등을 쫙 나열해주고,
> '아 여기 그랬지' '이거 신경써야겠네' 하면서 바로 해결할 수 있게 해주는 게 주 목적."*

이게 정확히 Palantir AIP **"Decision Brief"** 패턴이다.

### 3-1. 흐름

```
[1] Quest Board에서 가장 우선순위 quest 자동 노출
    = priority='urgent' OR (due_date <= today AND status='in_progress')
    = 또는 사용자가 그냥 quest 카드 클릭

[2] Quest 클릭 →

[3] DecisionBrief 자동 생성 (캐시 hit이면 즉시, miss면 1초 내 build)
    = SQL view v_store_360(store_id) + 최근 N일 activity + OwnerProfile snapshot
    = (Phase 2) LLM이 "지금 알아야 할 3가지" 한 줄 요약

[4] Quest Context Card 렌더 (다음 §7에서 명세)
    ┌─ Quest: "B.5 의료법 컨펌" — store=○○병원 — due=오늘 ────┐
    │  📍 Store 360                                          │
    │   - status: active, 시작 D+12, 약정 12개월 (남 11)      │
    │   - last_health: 3일 전 ✅ / 진행 중 quest 5건           │
    │   - 최근 이슈: 통화 안 받음 (3일 전, 김민재) · 문자 응답 │
    │   - 키워드 등수: '○○○ 병원' 4→3↗ / '△△△' 7→9↘         │
    │   - GBP: 조회 +20% (지난 주) · 통화 8건                  │
    │   - 업주 성향: 차분, 카톡 선호, 응답 평균 4시간           │
    │  ⚡ AIP 한 줄: "의료법 4주차 컨펌 미진행 → 카톡으로 보내고 │
    │                응답 4시간 후 follow-up 예정 잡으세요"    │
    │  [✅ 완료] [⏭ 위임] [🚫 스킵] [📋 메모만]                │
    └─────────────────────────────────────────────────────────┘

[5] 사용자 [✅ 완료] 클릭 →

[6] Action chain (Server Action, single round-trip)
    = completeQuest(...) → quest_status=done
    → activity_log insert
    → 다음 quest auto seed (트리거 7)
    → store.last_health_check_at touch
    → notification 다시 fetch (배지 갱신)
    → DecisionBrief 캐시 invalidate
```

### 3-2. 왜 이게 LTV에 직결되나

- **누락 0**: 우선순위 quest를 보면서 동시에 매장 컨텍스트가 강제로 같이 보임 → "이 매장에 X도 신경써야 하는데" 깜빡 0
- **사람 시간 절약**: 매장 N개 × 컨텍스트 5종을 머리에 담을 필요 없음. 클릭 1번에 SaaS가 정리
- **업주 성향 기억**: 100번째 매장도 "이 사장은 카톡 선호" 즉시 떠오름 → 응대 품질 균질
- **응답 품질 → 갱신율 ↑ → LTV ↑**

---

## 4. Object 360 — 매장 단위 컨텍스트 흡수

DecisionBrief의 데이터 소스. 매장 1개의 모든 운영 정보를 **단일 view**로.

### 4-1. v_store_360 (제안)

```sql
create or replace view public.v_store_360 as
select
  s.id                                                          as store_id,
  s.name,
  s.type,
  s.status,
  s.start_date,
  s.contract_months,
  case when s.start_date is not null
       then (s.start_date + (s.contract_months || ' months')::interval)::date
       end                                                      as contract_end,
  case when s.start_date is not null
       then current_date - s.start_date
       end                                                      as days_since_start,
  s.assigned_owner,
  s.assigned_marketer,
  s.last_health_check_at,
  case when s.last_health_check_at is null then null
       else extract(day from now() - s.last_health_check_at)::int
       end                                                      as days_since_health,
  -- 진행 중 quests 상위 5
  (select jsonb_agg(jsonb_build_object(
            'id', q.id, 'title', q.title, 'priority', q.priority,
            'due_date', q.due_date, 'process_step', q.process_step,
            'source', q.source, 'external_url', q.external_url
          ) order by q.priority desc, q.due_date asc)
     from (select * from public.quests
            where store_id = s.id and status in ('todo','in_progress')
            order by priority desc, due_date asc limit 5) q)    as active_quests,
  -- 최근 통신 5건
  (select jsonb_agg(jsonb_build_object(
            'id', c.id, 'channel', c.channel, 'direction', c.direction,
            'occurred_at', c.occurred_at, 'note', c.note,
            'next_action_date', c.next_action_date
          ) order by c.occurred_at desc)
     from (select * from public.communications
            where store_id = s.id
            order by occurred_at desc limit 5) c)               as recent_comms,
  -- 키워드 변화 (최근 7일)
  (select jsonb_agg(jsonb_build_object(
            'keyword', k.keyword,
            'rank_today', kr.rank,
            'rank_7d_ago', kr_old.rank,
            'delta', coalesce(kr_old.rank - kr.rank, 0)
          ))
     from public.keywords k
     left join lateral (
       select rank from public.keyword_rankings
        where keyword_id = k.id order by checked_at desc limit 1
     ) kr on true
     left join lateral (
       select rank from public.keyword_rankings
        where keyword_id = k.id and checked_at <= now() - interval '7 days'
        order by checked_at desc limit 1
     ) kr_old on true
     where k.store_id = s.id)                                   as keyword_movement,
  -- 최신 GBP snapshot
  (select to_jsonb(g) from public.gbp_snapshots g
    where g.store_id = s.id
    order by g.snapshot_date desc limit 1)                      as latest_gbp,
  -- 최근 audit 3건
  (select jsonb_agg(jsonb_build_object(
            'action', a.action, 'before', a.before, 'after', a.after,
            'occurred_at', a.occurred_at
          ) order by a.occurred_at desc)
     from (select * from public.store_audit_log
            where store_id = s.id
            order by occurred_at desc limit 3) a)               as recent_audit
from public.stores s
where s.archived_at is null;
```

→ **이 view 1장이 Decision Brief의 80%**. LLM 없이도 사용자가 "아 여기 그랬지"를 즉시 회상 가능.

---

## 5. Owner Profile — 업주 성향 자동 추출

> 🚧 **2026-05-06 보류**. 카톡 본문 자동 import는 개인정보·기술 모두 막힘. communications.note 수기 입력만으로는 시그널 부족.
> 별도 탐색 필요: (a) 카톡 비즈 메시지 API의 inbound 로그, (b) 디스코드 봇으로 미러링, (c) 매크로/RPA, (d) 영업자 단축어 입력 폼.
> Quest Context Card v0에서는 **OwnerProfile 섹션 제외**. 본격 도입은 데이터 소스 확정 후.

사용자가 명시한 "**업주 성향**"을 데이터로 만든다.

### 5-1. 자동 추출 가능한 시그널 (LLM 없이)

| 시그널 | 계산 |
|---|---|
| **선호 채널** | communications 그룹별 빈도 top1 |
| **응답 평균 시간** | direction='inbound' 직전 'outbound'와 시간차 평균 |
| **응답률** | outbound 대비 inbound 응답 비율 |
| **활성도** | 최근 30일 communication 수 |
| **마지막 신호** | 최근 communication note + sentiment(아래) |
| **민원 이력** | note에 키워드 매칭 (불만·환불·화남·실망) |
| **긍정 이력** | note에 키워드 매칭 (감사·좋다·만족) |

### 5-2. owner_profile_snapshots 테이블 (제안)

```sql
create table public.owner_profile_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id),
  computed_at         timestamptz not null default now(),
  preferred_channel   text,                  -- kakao/phone/email/visit
  avg_response_hours  numeric,
  response_rate_pct   numeric,
  comm_count_30d      int,
  last_signal_text    text,                  -- 최근 communication note 요약
  last_signal_at      timestamptz,
  positive_count_90d  int,
  negative_count_90d  int,
  llm_summary         text,                  -- (Phase 2) LLM 한 줄 (옵션)
  llm_summary_model   text,                  -- 'claude-haiku-4-5' 등
  primary key (id)
);
create index on public.owner_profile_snapshots (store_id, computed_at desc);
```

### 5-3. 갱신 전략

- **Phase 1** (우선): SQL view + RPC `fn_recompute_owner_profile(store_id)` — communication insert 트리거에서 호출 또는 매일 cron
- **Phase 2** (나중): LLM 한 줄 요약 — 매장 변경 있을 때만 (비용 절감)

---

## 6. Notification — 우선순위 큐 (사람 신경 대체)

매장 100개·1000개로 늘어도 사람이 일일이 안 보고도 자동으로 떠오르는 알림 레인.

### 6-1. notifications 테이블 (제안)

```sql
create type notification_type as enum (
  'health_stale',          -- 7일+ 헬스체크 누락
  'paused_candidate',      -- 14일+ active stale
  'quest_overdue',         -- 마감 지난 quest
  'sheet_missing',         -- 시트 sync에서 발견된 누락
  'lead_new',              -- 새 메타 광고 lead
  'lead_unmatched',        -- 매장 자동매칭 실패 lead
  'contract_ending',       -- 약정 30일 이내 종료
  'medical_law_pending',   -- 의료법 컨펌 미진행 (병의원·약국)
  'manual'
);
create type notification_status as enum ('pending','seen','acted','snoozed');

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  type            notification_type not null,
  store_id        uuid references public.stores(id),
  quest_id        uuid references public.quests(id),
  target_user_id  uuid references auth.users(id),  -- null = 전체
  payload         jsonb,
  status          notification_status not null default 'pending',
  created_at      timestamptz not null default now(),
  acted_at        timestamptz,
  snoozed_until   timestamptz,
  unique (type, store_id, date(created_at))   -- 같은 매장 같은 날 중복 방지 (idempotency)
);
```

### 6-2. cron 발동 (Edge Function `compute-notifications`)

매일 09:00 KST (`pg_cron`):
```sql
select cron.schedule(
  'compute-notifications-daily',
  '0 0 * * *',  -- 09:00 KST = 00:00 UTC
  $$select public.fn_compute_notifications();$$
);
```

`fn_compute_notifications()`이 한 번에:
- stale 매장 → `health_stale`
- 14일+ active → `paused_candidate`
- overdue quest → `quest_overdue`
- 약정 30일 이내 → `contract_ending`
- 병의원·약국 + 4주치 컨펌 미진행 → `medical_law_pending`

→ 헤더 알림 종 = `select count(*) from notifications where status='pending'`

---

## 7. 다음 한 수 슬라이스 — "Quest Context Card v0"

사용자 비전을 가장 작은 단위로 검증.

### 7-1. 범위 (1.5일 작업)

**포함**:
- [ ] 마이그 1: `v_store_360` view 생성
- [ ] 마이그 2: `notifications` 테이블 + enum + idempotency 인덱스
- [ ] 마이그 3: `fn_compute_notifications()` RPC + `pg_cron` (매일 09:00)
- [ ] Edge Function or RPC: `get_decision_brief(quest_id)` — quest + v_store_360 join
- [ ] 컴포넌트: `<QuestContextCard questId={...} />`
  - 위치: `src/components/quests/QuestContextCard.tsx`
  - 매장 상세 + 퀘스트 보드 모달에서 재사용
- [ ] Server Action: `src/lib/actions/quest.ts` — `completeQuest`·`skipQuest`·`delegateQuest`
- [ ] 헤더 종 배지 = pending notifications 수
- [ ] 시드: stale 매장 3건 + overdue quest 2건 (E2E 검증용)

**Phase 1에서 제외 (보류·다음 슬라이스)**:
- LLM 한 줄 요약 (`llm_summary`) — **Q4 사용자 결정: Phase 2로 미룸**
- OwnerProfile (§5 전체) — **Q5 사용자 결정: 데이터 소스 탐색까지 보류**. 카드에서 섹션 제거
- 카톡·디스코드 push (notifications 적재만)

### 7-2. 컴포넌트 와이어프레임

```tsx
// src/components/quests/QuestContextCard.tsx
type Props = { questId: string };

export async function QuestContextCard({ questId }: Props) {
  const supabase = await createClient();
  const { data: brief } = await supabase
    .rpc('get_decision_brief', { p_quest_id: questId })
    .single();

  return (
    <Card className="space-y-4">
      <CardHeader>
        <Badge>{brief.priority}</Badge>
        <h3>{brief.quest_title}</h3>
        <span className="text-muted">{brief.store_name} · 마감 {brief.due_date}</span>
      </CardHeader>

      <Section title="📍 Store 360">
        <Row label="상태"   value={brief.status_summary} />
        <Row label="시작"   value={`D+${brief.days_since_start} · 약정 남 ${brief.contract_months_left}개월`} />
        <Row label="헬스"   value={brief.days_since_health
                                    ? `${brief.days_since_health}일 전`
                                    : '미체크'}
                            warn={brief.days_since_health >= 7} />
      </Section>

      <Section title="🗨️ 최근 이슈 (최근 5건)">
        {brief.recent_comms.map(c => <CommRow key={c.id} {...c} />)}
      </Section>

      <Section title="📈 키워드 (최근 7일)">
        {brief.keyword_movement.map(k => <KeywordDelta key={k.keyword} {...k} />)}
      </Section>

      <Section title="🏢 GBP">
        <GbpSummary data={brief.latest_gbp} />
      </Section>

      {/* §5 OwnerProfile 섹션은 Q5 보류 — 데이터 소스 확정 후 재진입 */}

      <ActionRow>
        <CompleteQuestButton questId={questId} />
        <DelegateButton     questId={questId} />
        <SkipButton         questId={questId} />
        <NoteOnlyButton     questId={questId} />
      </ActionRow>
    </Card>
  );
}
```

### 7-3. DoD (검증 체크리스트)

- [ ] 시드 매장 1건의 상세 페이지에서 가장 위 quest 클릭 → Card 1초 내 렌더
- [ ] Card 안에 7-2 7섹션 다 채워져 있음 (빈 데이터는 "데이터 없음" placeholder)
- [ ] [✅ 완료] 클릭 → quest 상태 즉시 done · 옆에 다음 quest auto seed (기존 트리거 7)
- [ ] [⏭ 위임] 클릭 → 사용자 select → quest.assigned_user_id 갱신
- [ ] [🚫 스킵] 클릭 → reason 입력 → quest_status='skipped' + audit
- [ ] 헤더 종 배지 = stale 3건 + overdue 2건 = 5
- [ ] tsc · lint · `supabase db reset` 무사
- [ ] 4-way 리뷰 통과 (영업자: 매일 열만한가 / 마케터: 이중입력 X / 엔지니어: RLS · service_role / DevEx: 6개월 후 이해)

### 7-4. 다음다음 슬라이스 (이번 슬라이스 검증 후)

1. **OwnerProfile 자동 갱신** (§5 Phase 1 SQL view 기반)
2. **LLM 한 줄 요약** (Claude Haiku 4.5 — `llm_summary` 컬럼 + 매장 변경 시 invalidate)
3. **알림 push 채널** (디스코드 webhook → 카톡 비즈 메시지)
4. **자연어 → 액션** ("이 매장 이번 주 follow-up 잡아줘" → addManualQuest)
5. **간트차트 우선순위 정렬** (현재 시간순 → priority+due 정렬)

---

## 8. 운영 원칙 (Palantir 차용 + 해병듀오 고유)

### 8-1. Action-First

모든 운영 결정은 Action으로 정의되어야 한다.
- 임시방편으로 SQL 직접 박지 X
- audit 자동 안 되는 수동 SQL 박지 X
- 매장 상태 바꾸는 SQL은 반드시 server action 경유

### 8-2. Read = View, Write = Action

- 모든 읽기는 view 또는 RPC (페이지 SQL 분산 X)
- 모든 쓰기는 typed Server Action (Client mutation 직접 X)
- Card 컴포넌트는 view에서 직접 join 하지 않음 — `get_decision_brief` 같은 단일 RPC

### 8-3. Idempotency 모든 cron에

- notifications: `(type, store_id, date)` 유니크
- quest auto seed: 기존 트리거 7 그대로
- LLM 캐시: input hash 키

### 8-4. 사람 개입 0 우선, LLM은 마지막

순서:
1. **트리거·view·RPC**로 대부분 자동화
2. 그래도 사람 판단 필요한 부분만 **Card UI**로 표면화
3. 그 위에 1줄 요약·자연어 액션을 **LLM**으로 보강
4. LLM 비용은 캐시·invalidate 정책으로 통제

---

## 9. 사용자에게 먼저 물어볼 것 (이 슬라이스 시작 전)

- [ ] **Q1**: notification 채널 — 처음엔 in-app 종 + 대시보드 위젯만으로 충분? (디스코드는 P0' Phase 3에 명시되어 있음)
- [ ] **Q2**: 의료법 컨펌 미진행 알림은 4주치 묶음? 매주 1주치?
- [ ] **Q3**: paused 후보 = 14일+ stale 자동 마킹은 표시만? 아니면 자동 status='paused' 전환?
- [x] ~~**Q4**: LLM 한 줄 요약~~ → **Phase 2로 미룸** (사용자 결정 2026-05-06)
- [x] ~~**Q5**: OwnerProfile 자동 추출~~ → **보류** (사용자 결정 2026-05-06, 데이터 소스 별도 탐색)

---

## 10. 변경 이력

- 2026-05-06: 신규 작성. Palantir 4계층 매핑 · Decision Brief 패턴 · Object 360 view · OwnerProfile · Notifications · Quest Context Card v0 슬라이스 명세.
- 2026-05-06 (오후): Q4·Q5 사용자 결정 반영 — LLM 요약 Phase 2로 / OwnerProfile 보류. Card에서 업주 성향 섹션 제거. 디자인 시스템 작업 시작 (`docs/design-system.md`).
- 2026-05-11: 구현 진행 상태 반영. 오래된 현황 표현을 현재 기준으로 정정하고, 이 문서를 설계 이력으로 명시.
