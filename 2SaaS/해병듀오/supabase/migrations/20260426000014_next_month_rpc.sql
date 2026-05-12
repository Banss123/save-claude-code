-- 다음 1개월 회차 자동 발급 RPC.
-- 사용자 정책: "1개월 단위 롤링 적재 — 끝나면 또 갱신".
-- 매뉴얼 호출 (매장 상세 버튼). 추후 pg_cron으로 자동화 검토.

create or replace function public.fn_seed_next_month(p_store_id uuid)
returns table (quests_added int, checks_added int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_due date;
  v_next_start date;
  v_week int;
  v_q_count int := 0;
  v_c_count int := 0;
begin
  -- 마지막 주간보고 due_date를 anchor로
  select max(due_date) into v_last_due
  from public.quests
  where store_id = p_store_id and process_step = 'C.weekly';

  if v_last_due is null then
    -- 아직 시작일 미입력. 시작일 트리거 먼저 돌아야 함
    return query select 0, 0;
    return;
  end if;

  v_next_start := v_last_due;

  -- 다음 4주 주간보고
  for v_week in 1..4 loop
    insert into public.quests (store_id, title, description, process_step, status, priority, source, due_date)
    values (p_store_id, format('주간보고 W%s (롤링)', v_week), '본사 컨펌 후 워크방 포워딩', 'C.weekly',
      'pending', 'normal', 'auto', v_next_start + (v_week * 7));
    v_q_count := v_q_count + 1;
  end loop;

  -- 다음 월간보고
  insert into public.quests (store_id, title, description, process_step, status, priority, source, due_date)
  values (p_store_id, '월간보고 (롤링)', '종합 리포트 + 미팅 + 송부', 'C.monthly',
    'pending', 'normal', 'auto', v_next_start + 30);
  v_q_count := v_q_count + 1;

  -- 다음 4주치 정기 체크
  insert into public.recurring_checks (store_id, template_id, scheduled_for)
  select p_store_id, t.id, v_next_start + (w * 7)
  from public.check_templates t
  cross join generate_series(1, 4) w
  where t.active = true and t.frequency = 'weekly'
  on conflict do nothing;

  get diagnostics v_c_count = row_count;

  return query select v_q_count, v_c_count;
end;
$$;

grant execute on function public.fn_seed_next_month(uuid) to authenticated, anon;

comment on function public.fn_seed_next_month(uuid) is
  '롤링 갱신: 매장의 마지막 주간보고 due_date를 anchor로 다음 1개월(주간4·월간1·체크4) 발급. 추후 pg_cron 자동화 후보.';
