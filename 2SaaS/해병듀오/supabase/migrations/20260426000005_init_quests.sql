-- quests: 할 일 큐. process.md 단계를 자동으로 풀어낸 결과.
-- + quest_completions: 완료 이력 (재오픈 가능 가정 — 새 row 추가)
-- + quest_dependencies: 선행 퀘스트 관계 (blocked_by)

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,

  title text not null,
  description text,

  -- process.md 단계 ID (예: "A.5", "B.5b", "C.weekly", "C.D15")
  process_step text,

  status public.quest_status not null default 'pending',
  priority public.quest_priority not null default 'normal',
  source public.quest_source not null default 'auto',

  -- 핀 고정 (영상 시안 차용 — 우선순위와 별개로 상단 유지)
  is_pinned boolean not null default false,
  pinned_at timestamptz,

  -- 마감
  due_date date,

  -- 차단 사유 (status='blocked' 일 때)
  blocked_reason text,

  -- 담당 (null = 누구나)
  assignee_id uuid references public.profiles(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 대시보드/매장상세 query 패턴 기반 인덱스
create index quests_store_idx on public.quests(store_id);
create index quests_status_idx on public.quests(status);
create index quests_pinned_idx on public.quests(is_pinned) where is_pinned = true;
create index quests_priority_idx on public.quests(priority);
create index quests_due_date_idx on public.quests(due_date) where status = 'pending';
create index quests_assignee_idx on public.quests(assignee_id);
create index quests_step_idx on public.quests(process_step);
-- 대시보드 정렬 핵심: priority + due_date
create index quests_dashboard_sort_idx on public.quests(priority, due_date) where status = 'pending';
-- 검색
create index quests_title_trgm_idx on public.quests using gin (title extensions.gin_trgm_ops);

create trigger quests_set_updated_at
  before update on public.quests
  for each row execute function public.tg_set_updated_at();

-- 핀 시점 자동 기록
create or replace function public.tg_pinned_at()
returns trigger
language plpgsql
as $$
begin
  if (new.is_pinned is true and (old.is_pinned is null or old.is_pinned is false)) then
    new.pinned_at := now();
  elsif (new.is_pinned is false) then
    new.pinned_at := null;
  end if;
  return new;
end;
$$;

create trigger quests_track_pinned
  before update on public.quests
  for each row execute function public.tg_pinned_at();

-- 완료 이력 (재오픈 가능, 매번 새 row)
create table public.quest_completions (
  id bigserial primary key,
  quest_id uuid not null references public.quests(id) on delete cascade,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz not null default now(),
  note text,
  metadata jsonb not null default '{}'::jsonb
);

create index quest_completions_quest_idx on public.quest_completions(quest_id);
create index quest_completions_recent_idx on public.quest_completions(completed_at desc);
create index quest_completions_by_idx on public.quest_completions(completed_by);

-- 선행 의존 (blocked_by)
create table public.quest_dependencies (
  quest_id uuid not null references public.quests(id) on delete cascade,
  blocked_by_quest_id uuid not null references public.quests(id) on delete cascade,
  primary key (quest_id, blocked_by_quest_id)
);

create index quest_deps_blocked_by_idx on public.quest_dependencies(blocked_by_quest_id);

comment on table public.quests is 'process.md 단계 자동 풀어낸 큐. is_pinned·priority·due_date 조합으로 대시보드 정렬';
comment on column public.quests.process_step is 'A.5, B.5b, C.weekly 등 process.md 단계 ID';
