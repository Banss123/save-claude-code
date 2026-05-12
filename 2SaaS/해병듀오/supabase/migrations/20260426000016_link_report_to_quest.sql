-- 보고서 송부 → 해당 매장의 다음 due 주간/월간/등수 quest 자동 완료.
-- 흐름: 본사 자료 받음 → 우리 컨펌 → 업주 송부 = 그 회차 보고 quest 완료.

create or replace function public.tg_link_report_to_quest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step text;
  v_quest_id uuid;
begin
  if (new.status = 'sent' and (old is null or old.status is distinct from 'sent')) then
    v_step := case new.type
      when 'weekly' then 'C.weekly'
      when 'monthly' then 'C.monthly'
      when 'mid_rank' then 'C.mid_rank'
    end;

    if v_step is null then return new; end if;

    -- 가장 가까운 due (오늘 기준) pending quest 1건 자동 완료
    select id into v_quest_id
    from public.quests
    where store_id = new.store_id
      and process_step = v_step
      and status = 'pending'
    order by abs(extract(epoch from (due_date::timestamptz - now())))
    limit 1;

    if v_quest_id is not null then
      insert into public.quest_completions (quest_id, note)
      values (v_quest_id, format('보고서 송부 자동 완료 (report_id=%s)', new.id));
      -- quest_completions trigger가 quests.status='completed' update + activity_log
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_link_to_quest
  after update on public.reports
  for each row execute function public.tg_link_report_to_quest();

comment on function public.tg_link_report_to_quest() is
  '보고서 송부 시 해당 매장의 가장 가까운 due 보고 quest 자동 완료';
