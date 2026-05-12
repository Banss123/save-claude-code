-- 연락 기록의 다음 액션을 퀘스트 큐로 승격.
-- 카카오톡 자동 수집 전까지는 수동 연락 기록이 같은 경로를 사용하고,
-- 추후 외부 import도 communications에만 넣으면 동일하게 후속 퀘스트가 생성된다.

create or replace function public.tg_create_follow_up_quest_from_communication()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_priority public.quest_priority;
begin
  if new.next_action is null
     or btrim(new.next_action) = ''
     or new.next_action_date is null then
    return new;
  end if;

  if exists (
    select 1
      from public.quests q
     where q.process_step = 'COMM.follow_up'
       and q.metadata->>'communication_id' = new.id::text
  ) then
    return new;
  end if;

  v_title := '후속 연락: ' || left(btrim(new.next_action), 80);
  v_priority := case
    when new.next_action_date <= current_date then 'urgent'::public.quest_priority
    else 'normal'::public.quest_priority
  end;

  insert into public.quests (
    store_id,
    title,
    description,
    process_step,
    status,
    priority,
    source,
    due_date,
    created_by,
    metadata
  ) values (
    new.store_id,
    v_title,
    new.summary,
    'COMM.follow_up',
    'pending',
    v_priority,
    'auto',
    new.next_action_date,
    new.recorded_by,
    jsonb_build_object(
      'created_from', 'communications.next_action',
      'communication_id', new.id,
      'communication_channel', new.channel_code,
      'communication_direction', new.direction
    )
  );

  return new;
end;
$$;

drop trigger if exists communications_follow_up_quest on public.communications;
create trigger communications_follow_up_quest
  after insert on public.communications
  for each row execute function public.tg_create_follow_up_quest_from_communication();

comment on function public.tg_create_follow_up_quest_from_communication() is
  'communications.next_action + next_action_date 입력 시 후속 연락 퀘스트를 자동 생성한다.';
