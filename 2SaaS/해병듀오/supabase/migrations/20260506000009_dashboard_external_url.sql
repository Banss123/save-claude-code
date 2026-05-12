-- Dashboard quest view 보강
-- sheet_missing 퀘스트는 대시보드에서 "완료" 대신 외부 시트 링크를 열어야 한다.

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
where q.status in ('pending', 'blocked');

comment on view public.v_quest_dashboard is
  '진행 중 퀘스트 + 매장명 join + due_bucket + external_url(sheet_missing 링크).';
