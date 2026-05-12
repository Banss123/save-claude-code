-- 개인별 Google 계정 연결 및 Calendar/Tasks 읽기 동기화 준비.
-- 실제 일정/할일은 바로 실행하지 않고 proposed_actions 제안함을 거쳐 승인한다.

create table if not exists public.google_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  google_sub text not null,
  email text not null,
  display_name text,
  avatar_url text,
  scopes text[] not null default '{}'::text[],
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (profile_id),
  unique (google_sub)
);

create index if not exists google_accounts_profile_idx
  on public.google_accounts (profile_id);
create index if not exists google_accounts_email_idx
  on public.google_accounts (email);

create trigger google_accounts_set_updated_at
  before update on public.google_accounts
  for each row execute function public.tg_set_updated_at();

create table if not exists public.google_calendar_sync_sources (
  id uuid primary key default gen_random_uuid(),
  google_account_id uuid not null references public.google_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  google_calendar_id text not null,
  summary text not null,
  description text,
  timezone text,
  access_role text,
  is_primary boolean not null default false,
  selected boolean not null default false,
  sync_token text,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (google_account_id, google_calendar_id)
);

create index if not exists google_calendar_sync_sources_profile_idx
  on public.google_calendar_sync_sources (profile_id, selected);

create trigger google_calendar_sync_sources_set_updated_at
  before update on public.google_calendar_sync_sources
  for each row execute function public.tg_set_updated_at();

create table if not exists public.google_task_sync_sources (
  id uuid primary key default gen_random_uuid(),
  google_account_id uuid not null references public.google_accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  google_tasklist_id text not null,
  title text not null,
  selected boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (google_account_id, google_tasklist_id)
);

create index if not exists google_task_sync_sources_profile_idx
  on public.google_task_sync_sources (profile_id, selected);

create trigger google_task_sync_sources_set_updated_at
  before update on public.google_task_sync_sources
  for each row execute function public.tg_set_updated_at();

alter table public.google_accounts enable row level security;
alter table public.google_calendar_sync_sources enable row level security;
alter table public.google_task_sync_sources enable row level security;

drop policy if exists "google_accounts: own full" on public.google_accounts;
create policy "google_accounts: own full"
  on public.google_accounts for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "google_calendar_sync_sources: own full"
  on public.google_calendar_sync_sources;
create policy "google_calendar_sync_sources: own full"
  on public.google_calendar_sync_sources for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "google_task_sync_sources: own full"
  on public.google_task_sync_sources;
create policy "google_task_sync_sources: own full"
  on public.google_task_sync_sources for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

alter table public.proposed_actions
  drop constraint if exists proposed_actions_source_check;

alter table public.proposed_actions
  add constraint proposed_actions_source_check
  check (source in (
    'manual_capture',
    'aip',
    'kakao',
    'google_keep',
    'google_calendar',
    'google_tasks',
    'sheet_sync',
    'system'
  ));

comment on table public.google_accounts is
  '사용자별 Google OAuth 연결. refresh token은 앱 서버에서 암호화한 ciphertext만 저장한다.';
comment on table public.google_calendar_sync_sources is
  '사용자 Google Calendar 중 SaaS로 읽어올 캘린더 선택 및 sync token 상태.';
comment on table public.google_task_sync_sources is
  '사용자 Google Tasks tasklist 중 SaaS로 읽어올 목록 선택 상태.';
