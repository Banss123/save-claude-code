-- Dashboard/notification consistency fixes for authenticated test baseline.

-- Archived stores should not contribute quest counts or dashboard quest rows.
create or replace view public.v_dashboard_stats as
select
  (select count(*) from public.stores
    where status in ('contract_pending','contract_signed','ready_to_start','active')
      and archived_at is null) as managed_stores,
  (select count(*)
    from public.quests q
    join public.stores s on s.id = q.store_id
    where q.status = 'pending'
      and s.archived_at is null) as pending_quests,
  (select count(*)
    from public.quests q
    join public.stores s on s.id = q.store_id
    where q.status = 'pending'
      and q.due_date = current_date
      and s.archived_at is null) as due_today,
  (select count(*)
    from public.quests q
    join public.stores s on s.id = q.store_id
    where q.status = 'pending'
      and q.due_date < current_date
      and s.archived_at is null) as overdue,
  (select count(*) from public.stores
    where archived_at is null
      and last_health_check_at < now() - interval '7 days') as stale_health_check;

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
  end as due_bucket,
  q.external_url
from public.quests q
join public.stores s on q.store_id = s.id
where q.status in ('pending', 'blocked')
  and s.archived_at is null;

grant select on public.v_dashboard_stats to authenticated;
grant select on public.v_activity_heatmap to authenticated;
grant select on public.v_quest_dashboard to authenticated;

comment on view public.v_dashboard_stats is
  '대시보드 상단 통계. 아카이브 매장의 퀘스트는 제외.';
comment on view public.v_quest_dashboard is
  '진행 중 퀘스트 + 매장명 join + due_bucket + external_url. 아카이브 매장 제외.';

-- A store can have multiple same-day quest notifications of the same type.
drop index if exists public.notifications_idempotency;
create unique index notifications_idempotency
  on public.notifications (
    type,
    coalesce(store_id::text, '-'),
    coalesce(quest_id::text, '-'),
    coalesce(lead_id::text, '-'),
    created_date
  );

comment on index public.notifications_idempotency is
  '같은 타입·매장·퀘스트·리드·날짜 중복 알림 방지. 퀘스트별 알림은 각각 생성 가능.';
