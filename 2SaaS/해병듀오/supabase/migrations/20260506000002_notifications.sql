-- Notifications — 우선순위 알림 큐
-- palantir-patterns.md §6
-- 매장 100개·1000개로 늘어도 사람이 일일이 안 봐도 자동으로 떠오르는 알림 레인.

create type public.notification_type as enum (
  'health_stale',          -- 7일+ 헬스체크 누락
  'paused_candidate',      -- 14일+ active stale (자동 paused 후보)
  'quest_overdue',         -- 마감 지난 quest
  'sheet_missing',         -- 시트 sync에서 발견된 누락 항목
  'lead_new',              -- 새 메타 광고 lead 인입
  'lead_unmatched',        -- 매장 자동매칭 실패 lead
  'contract_ending',       -- 약정 30일 이내 종료
  'medical_law_pending',   -- 의료법 컨펌 미진행 (병의원·약국)
  'manual'                 -- 수동 생성
);

create type public.notification_status as enum (
  'pending',
  'seen',
  'acted',
  'snoozed'
);

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  type            public.notification_type not null,
  store_id        uuid references public.stores(id) on delete cascade,
  quest_id        uuid references public.quests(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete cascade,
  target_user_id  uuid references public.profiles(id) on delete set null,  -- null = 전체 공통
  title           text not null,                                            -- 한 줄 요약
  body            text,                                                     -- 부가 설명
  payload         jsonb not null default '{}'::jsonb,                       -- 추가 컨텍스트
  status          public.notification_status not null default 'pending',
  created_at      timestamptz not null default now(),
  created_date    date not null default current_date,                       -- idempotency 키 (immutable index용)
  acted_at        timestamptz,
  snoozed_until   timestamptz
);

-- idempotency: 같은 매장 같은 타입 같은 날짜 1건만 (created_date = IMMUTABLE)
create unique index notifications_idempotency
  on public.notifications (type, coalesce(store_id::text, '-'), created_date);

-- 조회 패턴
create index notifications_pending_idx
  on public.notifications (status, created_at desc) where status = 'pending';
create index notifications_target_idx
  on public.notifications (target_user_id, status, created_at desc);
create index notifications_store_idx
  on public.notifications (store_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: authenticated full"
  on public.notifications for all to authenticated
  using (true) with check (true);

-- [TEMP] dev anon — 인증 셋업 후 제거 (P1)
create policy "notifications: dev anon"
  on public.notifications for all to anon
  using (true) with check (true);

comment on table public.notifications is
  'palantir-patterns §6. cron + 트리거로 자동 적재. 헤더 종 배지 = pending count.';
comment on index public.notifications_idempotency is
  '같은 매장·타입·날짜 중복 알림 방지. fn_compute_notifications에서 ON CONFLICT DO NOTHING.';
