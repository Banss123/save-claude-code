-- 자동 퀘스트 발급 트리거 보강 (process.md 워크플로우 자동화)

-- ===== 1. 시작일(B.9) 입력 → C 단계 첫 1개월치 자동 발급 =====
-- 사용자 정책: "1개월 단위 롤링 적재" — 첫 1개월만 발급, 1개월 종료 시점에 다음 1개월 갱신 (별도 cron, 추후)

create or replace function public.tg_seed_first_month_quests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week int;
begin
  -- D+15일 업주 안부 연락
  insert into public.quests (store_id, title, description, process_step, status, priority, source, due_date)
  values (new.id, 'D+15일 업주 안부 연락', '시작 후 첫 안부·진행 상황 공유', 'C.D15',
    'pending', 'normal', 'auto', new.start_date + 15);

  -- 첫 4주 주간보고
  for v_week in 1..4 loop
    insert into public.quests (store_id, title, description, process_step, status, priority, source, due_date)
    values (new.id, format('주간보고 W%s', v_week), '본사 컨펌 후 워크방 포워딩', 'C.weekly',
      'pending', 'normal', 'auto', new.start_date + (v_week * 7));
  end loop;

  -- 월간보고 (시작일 + 30)
  insert into public.quests (store_id, title, description, process_step, status, priority, source, due_date)
  values (new.id, '월간보고 (1개월차)', '종합 리포트 + 미팅 + 송부', 'C.monthly',
    'pending', 'normal', 'auto', new.start_date + 30);

  -- 첫 1개월 정기 체크 (weekly 템플릿만, 4회)
  insert into public.recurring_checks (store_id, template_id, scheduled_for)
  select new.id, t.id, new.start_date + (w * 7)
  from public.check_templates t
  cross join generate_series(1, 4) w
  where t.active = true and t.frequency = 'weekly'
  on conflict do nothing;

  return new;
end;
$$;

-- WHEN 절로 start_date null → 값 변경 시에만 발동
create trigger stores_seed_quests_on_start
  after update on public.stores
  for each row
  when (old.start_date is null and new.start_date is not null)
  execute function public.tg_seed_first_month_quests();

-- ===== 2. GBP 세팅 필요 매장 등록 시 → "GBP 프로필 세팅" 퀘스트 추가 =====
create or replace function public.tg_auto_gbp_quest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.gbp_already_created = false) then
    insert into public.quests (store_id, title, description, process_step, status, priority, source, due_date)
    values (new.id,
      'GBP 프로필 세팅',
      '업주에게 받은 추가정보로 GBP 프로필 정보 세팅. 권한·인증 이슈는 별도 확인',
      'B.4*',
      'pending', 'normal', 'auto', current_date + 3);
  end if;
  return new;
end;
$$;

create trigger stores_auto_gbp_quest
  after insert on public.stores
  for each row execute function public.tg_auto_gbp_quest();

comment on function public.tg_seed_first_month_quests() is
  '시작일(B.9) 입력 시 C 단계 첫 1개월치 자동 발급 — 1개월 롤링 정책 (다음 1개월은 별도 cron으로)';
comment on function public.tg_auto_gbp_quest() is
  'GBP 세팅 필요 매장은 GBP 프로필 세팅 단계가 추가됨 (B.4* 분기)';
