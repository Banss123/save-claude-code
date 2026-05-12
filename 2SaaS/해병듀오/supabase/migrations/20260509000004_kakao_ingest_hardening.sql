-- 카톡 수집 안정화:
-- - 모바일 재전송/배치 전송을 추적하는 batch 로그
-- - raw 이벤트에 매칭/처리 메타데이터를 보관
-- - 상태/매장/방 기준 조회 인덱스 보강

create table if not exists public.kakao_ingest_batches (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  request_hash text,
  event_count integer not null default 0 check (event_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  proposed_count integer not null default 0 check (proposed_count >= 0),
  ignored_count integer not null default 0 check (ignored_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  received_at timestamptz not null default now(),
  completed_at timestamptz,
  raw_meta jsonb not null default '{}'::jsonb
);

alter table public.kakao_ingest_batches enable row level security;

drop policy if exists "kakao_ingest_batches: authenticated read" on public.kakao_ingest_batches;
create policy "kakao_ingest_batches: authenticated read"
  on public.kakao_ingest_batches for select
  to authenticated
  using (true);

alter table public.kakao_notification_events
  add column if not exists ingest_batch_id uuid references public.kakao_ingest_batches(id) on delete set null,
  add column if not exists room_kind text,
  add column if not exists store_match_method text,
  add column if not exists message_text_hash text,
  add column if not exists message_text_length integer,
  add column if not exists processed_at timestamptz,
  add column if not exists ingest_version text not null default 'kakao_ingest_v2',
  add column if not exists error_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kakao_notification_events_room_kind_check'
  ) then
    alter table public.kakao_notification_events
      add constraint kakao_notification_events_room_kind_check
      check (room_kind is null or room_kind in ('owner_seo', 'review_work'));
  end if;
end $$;

create index if not exists kakao_ingest_batches_received_idx
  on public.kakao_ingest_batches (received_at desc);
create index if not exists kakao_ingest_batches_device_idx
  on public.kakao_ingest_batches (device_id, received_at desc);

create index if not exists kakao_notification_events_batch_idx
  on public.kakao_notification_events (ingest_batch_id);
create index if not exists kakao_notification_events_status_received_idx
  on public.kakao_notification_events (status, received_at desc);
create index if not exists kakao_notification_events_store_status_idx
  on public.kakao_notification_events (store_id, status, received_at desc);
create index if not exists kakao_notification_events_device_received_idx
  on public.kakao_notification_events (device_id, received_at desc);
create index if not exists kakao_notification_events_room_kind_idx
  on public.kakao_notification_events (room_kind, received_at desc)
  where room_kind is not null;
create index if not exists kakao_notification_events_message_hash_idx
  on public.kakao_notification_events (message_text_hash)
  where message_text_hash is not null;

comment on table public.kakao_ingest_batches is
  '카톡 수집 API 호출 단위 로그. 모바일 재전송/배치 수집 상태를 추적한다.';
comment on column public.kakao_notification_events.ingest_batch_id is
  '이 이벤트가 들어온 API batch 로그 ID.';
comment on column public.kakao_notification_events.room_kind is
  '[SEO] 업주방 / [작업] 작업방 같은 표준 방 분류.';
comment on column public.kakao_notification_events.store_match_method is
  '매장 자동 매칭 방식. manual_mapping, owner_seo_room_name, review_work_room_name 등.';
comment on column public.kakao_notification_events.message_text_hash is
  '본문 SHA-256. 원문 검색 대신 중복/감사 추적에 사용.';
comment on column public.kakao_notification_events.processed_at is
  '무시/제안/실패 처리가 끝난 시각.';
