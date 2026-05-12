-- 다중 담당자 호환 레이어.
-- 기존 stores.assigned_owner_id / quests.assignee_id는 메인 담당자 호환용으로 유지한다.

create table if not exists public.store_assignees (
  store_id uuid not null references public.stores(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (store_id, profile_id)
);

create index if not exists store_assignees_profile_idx
  on public.store_assignees(profile_id, store_id);
create unique index if not exists store_assignees_one_primary_idx
  on public.store_assignees(store_id)
  where is_primary;

insert into public.store_assignees (store_id, profile_id, is_primary)
select id, assigned_owner_id, true
from public.stores
where assigned_owner_id is not null
on conflict (store_id, profile_id) do update
set is_primary = excluded.is_primary;

insert into public.store_assignees (store_id, profile_id, is_primary)
select id, assigned_marketer_id, false
from public.stores
where assigned_marketer_id is not null
on conflict (store_id, profile_id) do nothing;

create table if not exists public.quest_assignees (
  quest_id uuid not null references public.quests(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (quest_id, profile_id)
);

create index if not exists quest_assignees_profile_idx
  on public.quest_assignees(profile_id, quest_id);
create unique index if not exists quest_assignees_one_primary_idx
  on public.quest_assignees(quest_id)
  where is_primary;

insert into public.quest_assignees (quest_id, profile_id, is_primary)
select id, assignee_id, true
from public.quests
where assignee_id is not null
on conflict (quest_id, profile_id) do update
set is_primary = excluded.is_primary;

alter table public.store_assignees enable row level security;
alter table public.quest_assignees enable row level security;

create policy "store_assignees: authenticated full"
  on public.store_assignees for all
  to authenticated
  using (true)
  with check (true);

create policy "quest_assignees: authenticated full"
  on public.quest_assignees for all
  to authenticated
  using (true)
  with check (true);

comment on table public.store_assignees is
  '매장 다중 담당자. stores.assigned_owner_id는 메인 담당자 호환용으로 유지.';
comment on table public.quest_assignees is
  '퀘스트 다중 담당자. quests.assignee_id는 메인 담당자 호환용으로 유지.';
