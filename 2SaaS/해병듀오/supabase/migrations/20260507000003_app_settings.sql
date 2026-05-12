create table if not exists public.app_settings (
  key text primary key,
  value text,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint app_settings_key_format check (key ~ '^[a-z0-9_]+$')
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_authenticated_select" on public.app_settings;
create policy "app_settings_authenticated_select"
  on public.app_settings for select
  to authenticated
  using (true);

drop policy if exists "app_settings_authenticated_write" on public.app_settings;
create policy "app_settings_authenticated_write"
  on public.app_settings for all
  to authenticated
  using (true)
  with check (true);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.tg_set_updated_at();

insert into public.app_settings (key, value, description)
values
  ('common_checklist_sheet_url', null, '공용 매장 체크리스트 시트 URL'),
  ('common_review_sheet_url', null, '공용 리뷰 시트 URL')
on conflict (key) do nothing;
