-- Android NotificationListenerService / MessengerBotR 계열 읽기 전용 수집.
-- 공식 카카오 API가 아니라 사용자가 권한을 켠 Android 알림 이벤트를 raw로 보관하고,
-- 액션성 메시지만 proposed_actions로 승격한다.

create table public.kakao_room_mappings (
  id uuid primary key default gen_random_uuid(),
  room_title text not null unique,
  store_id uuid not null references public.stores(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger kakao_room_mappings_set_updated_at
  before update on public.kakao_room_mappings
  for each row execute function public.tg_set_updated_at();

create table public.kakao_notification_events (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  event_key text,
  package_name text not null default 'com.kakao.talk',
  room_title text,
  sender_name text,
  message_text text not null,
  posted_at timestamptz,
  received_at timestamptz not null default now(),
  source_hash text not null unique,
  store_id uuid references public.stores(id) on delete set null,
  proposed_action_id uuid references public.proposed_actions(id) on delete set null,
  status text not null default 'received'
    check (status in ('received', 'proposed', 'ignored', 'duplicate', 'failed')),
  raw_payload jsonb not null default '{}'::jsonb
);

create index kakao_notification_events_received_idx
  on public.kakao_notification_events (received_at desc);
create index kakao_notification_events_room_idx
  on public.kakao_notification_events (room_title, received_at desc);
create index kakao_notification_events_store_idx
  on public.kakao_notification_events (store_id, received_at desc);
create index kakao_notification_events_payload_gin_idx
  on public.kakao_notification_events using gin (raw_payload);

alter table public.kakao_room_mappings enable row level security;
alter table public.kakao_notification_events enable row level security;

create policy "kakao_room_mappings: authenticated full"
  on public.kakao_room_mappings for all
  to authenticated
  using (true)
  with check (true);

create policy "kakao_notification_events: authenticated read"
  on public.kakao_notification_events for select
  to authenticated
  using (true);

comment on table public.kakao_room_mappings is
  '카톡방 제목과 매장을 연결하는 수동 매핑. NotificationListenerService 수집용.';
comment on table public.kakao_notification_events is
  'Android 알림 접근 권한으로 수집한 카카오톡 알림 raw 로그. 읽기 전용 수집 원천.';
