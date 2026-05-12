-- ===== 자동 퀘스트 발급 =====
-- 신규 매장 등록 시 (status='contract_pending') → process.md A.1 퀘스트 자동 생성

create or replace function public.tg_auto_initial_quest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status = 'contract_pending') then
    insert into public.quests (
      store_id, title, description, process_step,
      status, priority, source, due_date
    ) values (
      new.id,
      '계약 정보 수집',
      '개월수·키워드수·매장명·단가·할인율·결제수단 수취',
      'A.1',
      'pending', 'urgent', 'auto', current_date
    );
  end if;
  return new;
end;
$$;

create trigger stores_auto_initial_quest
  after insert on public.stores
  for each row execute function public.tg_auto_initial_quest();

-- ===== activity_log 자동 기록 =====
-- quest_completions 발생 → 'work' / 'quest_completed'
create or replace function public.tg_log_quest_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
begin
  select store_id into v_store_id from public.quests where id = new.quest_id;
  insert into public.activity_log (actor_id, store_id, category, type, ref_table, ref_id)
  values (new.completed_by, v_store_id, 'work', 'quest_completed', 'quest_completions', new.id::text);

  -- quest 상태도 업데이트
  update public.quests
    set status = 'completed'
    where id = new.quest_id and status != 'cancelled';
  return new;
end;
$$;

create trigger quest_completions_log
  after insert on public.quest_completions
  for each row execute function public.tg_log_quest_completion();

-- communications 발생 → 'communication'
create or replace function public.tg_log_communication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (actor_id, store_id, category, type, ref_table, ref_id, metadata)
  values (
    new.recorded_by, new.store_id, 'communication',
    new.channel_code || '_' || new.direction,
    'communications', new.id::text,
    jsonb_build_object('direction', new.direction, 'channel', new.channel_code)
  );
  return new;
end;
$$;

create trigger communications_log
  after insert on public.communications
  for each row execute function public.tg_log_communication();

-- 매장 등록 → 'system' / 'store_created'
create or replace function public.tg_log_store_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (actor_id, store_id, category, type, ref_table, ref_id)
  values (auth.uid(), new.id, 'system', 'store_created', 'stores', new.id::text);
  return new;
end;
$$;

create trigger stores_log_create
  after insert on public.stores
  for each row execute function public.tg_log_store_created();

-- ===== 자주 쓰는 view =====

-- v_dashboard_stats: 대시보드 상단 통계 카드 4개 데이터
create or replace view public.v_dashboard_stats as
select
  (select count(*) from public.stores
    where status in ('contract_pending','contract_signed','ready_to_start','active')
      and archived_at is null) as managed_stores,
  (select count(*) from public.quests where status = 'pending') as pending_quests,
  (select count(*) from public.quests
    where status = 'pending' and due_date = current_date) as due_today,
  (select count(*) from public.quests
    where status = 'pending' and due_date < current_date) as overdue,
  (select count(*) from public.stores
    where archived_at is null
      and last_health_check_at < now() - interval '7 days') as stale_health_check;

-- v_activity_heatmap: 사용자별 일자별 카테고리 집계 (최근 26주)
create or replace view public.v_activity_heatmap as
select
  actor_id,
  date_trunc('day', occurred_at)::date as day,
  category,
  count(*) as cnt
from public.activity_log
where occurred_at >= now() - interval '26 weeks'
group by actor_id, date_trunc('day', occurred_at), category;

-- v_quest_dashboard: 진행 중 퀘스트 + 매장명 + 정렬용 컬럼
create or replace view public.v_quest_dashboard as
select
  q.id, q.store_id, s.name as store_name, s.type_code,
  q.title, q.process_step, q.status, q.priority, q.is_pinned,
  q.due_date, q.blocked_reason, q.assignee_id, q.source,
  case
    when q.due_date < current_date then 'overdue'
    when q.due_date = current_date then 'today'
    when q.due_date = current_date + 1 then 'tomorrow'
    else 'later'
  end as due_bucket
from public.quests q
join public.stores s on q.store_id = s.id
where q.status in ('pending', 'blocked');

comment on view public.v_dashboard_stats is '대시보드 상단 4개 카드 + 헬스체크 stale';
comment on view public.v_activity_heatmap is '활동 히트맵 26주치 (사용자×일자×카테고리)';
comment on view public.v_quest_dashboard is '진행 중 퀘스트 + 매장명 join + due_bucket';
