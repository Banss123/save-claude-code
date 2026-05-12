-- 카톡 원문 보관 정책 기반.
-- 기본 원칙:
-- - 운영 화면은 live table의 최근 N건만 조회한다.
-- - 오래된 원문은 삭제하지 않고 archive table로 이동한다.
-- - 자동 실행은 별도 cron/운영 승인 후 붙인다. 이 마이그레이션은 안전한 실행 함수만 제공한다.

create table if not exists public.kakao_notification_event_archives (
  id uuid primary key,
  device_id text not null,
  event_key text,
  package_name text not null default 'com.kakao.talk',
  room_title text,
  sender_name text,
  message_text text not null,
  posted_at timestamptz,
  received_at timestamptz not null,
  source_hash text not null unique,
  store_id uuid references public.stores(id) on delete set null,
  proposed_action_id uuid references public.proposed_actions(id) on delete set null,
  status text not null
    check (status in ('received', 'proposed', 'ignored', 'duplicate', 'failed')),
  raw_payload jsonb not null default '{}'::jsonb,
  ingest_batch_id uuid references public.kakao_ingest_batches(id) on delete set null,
  room_kind text check (room_kind is null or room_kind in ('owner_seo', 'review_work')),
  store_match_method text,
  message_text_hash text,
  message_text_length integer,
  processed_at timestamptz,
  ingest_version text not null default 'kakao_ingest_v2',
  error_message text,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_kind text check (
    sender_kind is null or
    sender_kind in ('internal', 'owner', 'reviewer', 'system', 'unknown')
  ),
  ignored_reason text,
  classification jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now(),
  archive_reason text not null default 'retention_policy'
);

alter table public.kakao_notification_event_archives enable row level security;

drop policy if exists "kakao_notification_event_archives: authenticated read"
  on public.kakao_notification_event_archives;
create policy "kakao_notification_event_archives: authenticated read"
  on public.kakao_notification_event_archives for select
  to authenticated
  using (true);

create index if not exists kakao_notification_event_archives_store_received_idx
  on public.kakao_notification_event_archives (store_id, received_at desc);
create index if not exists kakao_notification_event_archives_archived_idx
  on public.kakao_notification_event_archives (archived_at desc);
create index if not exists kakao_notification_event_archives_room_idx
  on public.kakao_notification_event_archives (room_title, received_at desc);

create or replace function public.archive_old_kakao_notification_events(
  p_before timestamptz default now() - interval '180 days',
  p_limit integer default 5000
)
returns table(archived_count integer, cutoff timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 10000);
  v_archived_count integer := 0;
begin
  with candidates as (
    select e.id
    from public.kakao_notification_events e
    where e.received_at < p_before
      and not exists (
        select 1
        from public.store_tone_examples ste
        where ste.kakao_notification_event_id = e.id
      )
    order by e.received_at asc
    limit v_limit
  ),
  archived as (
    insert into public.kakao_notification_event_archives (
      id,
      device_id,
      event_key,
      package_name,
      room_title,
      sender_name,
      message_text,
      posted_at,
      received_at,
      source_hash,
      store_id,
      proposed_action_id,
      status,
      raw_payload,
      ingest_batch_id,
      room_kind,
      store_match_method,
      message_text_hash,
      message_text_length,
      processed_at,
      ingest_version,
      error_message,
      sender_profile_id,
      sender_kind,
      ignored_reason,
      classification,
      archived_at,
      archive_reason
    )
    select
      e.id,
      e.device_id,
      e.event_key,
      e.package_name,
      e.room_title,
      e.sender_name,
      e.message_text,
      e.posted_at,
      e.received_at,
      e.source_hash,
      e.store_id,
      e.proposed_action_id,
      e.status,
      e.raw_payload,
      e.ingest_batch_id,
      e.room_kind,
      e.store_match_method,
      e.message_text_hash,
      e.message_text_length,
      e.processed_at,
      e.ingest_version,
      e.error_message,
      e.sender_profile_id,
      e.sender_kind,
      e.ignored_reason,
      e.classification,
      now(),
      'retention_policy'
    from public.kakao_notification_events e
    join candidates c on c.id = e.id
    on conflict (id) do update
      set archived_at = excluded.archived_at
    returning id
  ),
  deleted as (
    delete from public.kakao_notification_events e
    using archived a
    where e.id = a.id
    returning e.id
  )
  select count(*) into v_archived_count from deleted;

  return query select v_archived_count, p_before;
end;
$$;

revoke all on function public.archive_old_kakao_notification_events(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.archive_old_kakao_notification_events(timestamptz, integer)
  to service_role;

comment on table public.kakao_notification_event_archives is
  '보관 기간이 지난 카톡 알림 원문 archive. live table 성능 보호용.';
comment on function public.archive_old_kakao_notification_events(timestamptz, integer) is
  '카톡 알림 live table에서 cutoff 이전 원문을 archive table로 이동한다. service_role만 실행.';
