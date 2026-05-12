-- Google Calendar/Tasks 동기화 중복 방지.
-- 같은 Google 원본 ID는 제안함에 한 번만 들어가야 한다.

create unique index if not exists proposed_actions_google_calendar_dedupe_idx
  on public.proposed_actions (
    source,
    (payload->>'google_account_id'),
    (payload->>'google_calendar_id'),
    (payload->>'google_event_id')
  )
  where source = 'google_calendar'
    and payload ? 'google_account_id'
    and payload ? 'google_calendar_id'
    and payload ? 'google_event_id';

create unique index if not exists proposed_actions_google_tasks_dedupe_idx
  on public.proposed_actions (
    source,
    (payload->>'google_account_id'),
    (payload->>'google_tasklist_id'),
    (payload->>'google_task_id')
  )
  where source = 'google_tasks'
    and payload ? 'google_account_id'
    and payload ? 'google_tasklist_id'
    and payload ? 'google_task_id';
