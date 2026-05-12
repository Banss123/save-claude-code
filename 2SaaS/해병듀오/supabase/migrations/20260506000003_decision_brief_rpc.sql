-- Decision Brief RPC + Quest Action RPC
-- palantir-patterns.md §3 흐름 [3] / §2-3 Actions

-- ─── get_decision_brief(quest_id) ─────────────────────
-- 퀘스트 1건 클릭 → 그 매장의 360 컨텍스트를 단일 응답으로
-- 클라이언트는 supabase.rpc('get_decision_brief', { p_quest_id }) 호출

create or replace function public.get_decision_brief(p_quest_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'quest', to_jsonb(q.*),
    'store_360', to_jsonb(s.*),
    'computed_at', now()
  )
  from public.quests q
  join public.v_store_360 s on s.store_id = q.store_id
  where q.id = p_quest_id;
$$;

comment on function public.get_decision_brief(uuid) is
  '퀘스트 ID → 매장 360 컨텍스트 (Decision Brief 카드 데이터 소스).';

-- ─── mark_health_checked(store_id, note) ──────────────
-- "체크 완료" 액션. last_health_check_at = now()
-- audit_log는 stores 트리거에서 자동(status_change/archive 외엔 안 찍힘 — 누락 시 별도 로그 필요)

create or replace function public.mark_health_checked(
  p_store_id uuid,
  p_note text default null
)
returns timestamptz
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  update public.stores
     set last_health_check_at = v_now
   where id = p_store_id;

  insert into public.store_audit_log (store_id, actor_id, action, after, reason)
  values (
    p_store_id,
    auth.uid(),
    'health_check',
    jsonb_build_object('checked_at', v_now),
    p_note
  );

  return v_now;
end;
$$;

comment on function public.mark_health_checked(uuid, text) is
  '매장 점검 완료 액션. last_health_check_at touch + audit.';

-- ─── fn_compute_notifications() ───────────────────────
-- 매일 09:00 KST cron으로 호출.
-- 한 번에 5종 알림 idempotent하게 적재.

create or replace function public.fn_compute_notifications()
returns table (created int, type_breakdown jsonb)
language plpgsql
as $$
declare
  v_created int := 0;
  v_breakdown jsonb := '{}'::jsonb;
  v_count int;
begin
  -- 1. health_stale: 7~13일 (14+ 는 paused_candidate로 분리)
  insert into public.notifications (type, store_id, title, body, payload)
  select
    'health_stale',
    s.id,
    s.name || ' 매장 점검 ' || extract(day from now() - s.last_health_check_at)::int || '일 전',
    '7일 이상 점검 미수행. 영업자 확인 필요.',
    jsonb_build_object('days_stale', extract(day from now() - s.last_health_check_at)::int)
  from public.stores s
  where s.archived_at is null
    and s.status = 'active'
    and s.last_health_check_at < now() - interval '7 days'
    and s.last_health_check_at >= now() - interval '14 days'
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;
  v_breakdown := v_breakdown || jsonb_build_object('health_stale', v_count);

  -- 2. paused_candidate: 14일+
  insert into public.notifications (type, store_id, title, body, payload)
  select
    'paused_candidate',
    s.id,
    s.name || ' 14일+ 점검 누락 — paused 후보',
    '14일 이상 점검 미수행. 일시 정지 검토 필요.',
    jsonb_build_object('days_stale', extract(day from now() - s.last_health_check_at)::int)
  from public.stores s
  where s.archived_at is null
    and s.status = 'active'
    and s.last_health_check_at < now() - interval '14 days'
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;
  v_breakdown := v_breakdown || jsonb_build_object('paused_candidate', v_count);

  -- 3. quest_overdue: 마감 지난 pending quest
  insert into public.notifications (type, store_id, quest_id, title, body, payload)
  select
    'quest_overdue',
    q.store_id,
    q.id,
    s.name || ' · ' || q.title || ' (마감 ' || q.due_date || ')',
    '마감일 지남. 바로 처리 필요.',
    jsonb_build_object('days_overdue', (current_date - q.due_date))
  from public.quests q
  join public.stores s on s.id = q.store_id
  where q.status = 'pending'
    and q.due_date is not null
    and q.due_date < current_date
    and s.archived_at is null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;
  v_breakdown := v_breakdown || jsonb_build_object('quest_overdue', v_count);

  -- 4. contract_ending: 약정 30일 이내 종료
  insert into public.notifications (type, store_id, title, body, payload)
  select
    'contract_ending',
    s.id,
    s.name || ' 약정 종료 D-' ||
      ((s.start_date + (s.contract_months || ' months')::interval)::date - current_date)::int,
    '갱신 또는 이탈 의사 확인 필요.',
    jsonb_build_object(
      'contract_end_date', (s.start_date + (s.contract_months || ' months')::interval)::date
    )
  from public.stores s
  where s.archived_at is null
    and s.status = 'active'
    and s.start_date is not null
    and s.contract_months is not null
    and (s.start_date + (s.contract_months || ' months')::interval)::date
        between current_date and current_date + 30
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;
  v_breakdown := v_breakdown || jsonb_build_object('contract_ending', v_count);

  -- 5. medical_law_pending: 병의원·약국 + 4주차 컨펌 미진행 (process B.5b)
  -- (단순 버전: 병의원/약국 + 시작 후 28일+ 경과 + B.5b pending이 있는 경우)
  insert into public.notifications (type, store_id, quest_id, title, body)
  select
    'medical_law_pending',
    s.id,
    q.id,
    s.name || ' 4주치 아티클 컨펌 필요',
    '완료되어야 시작일 확정 가능.'
  from public.stores s
  join public.quests q on q.store_id = s.id
  where s.archived_at is null
    and s.type_code in ('clinic', 'pharm')
    and q.status = 'pending'
    and q.process_step = 'B.5b'
    and (q.due_date is null or q.due_date <= current_date + 7)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;
  v_breakdown := v_breakdown || jsonb_build_object('medical_law_pending', v_count);

  return query select v_created, v_breakdown;
end;
$$;

comment on function public.fn_compute_notifications() is
  '매일 09:00 KST cron 호출. 5종 알림 idempotent 적재 (heath_stale, paused_candidate, quest_overdue, contract_ending, medical_law_pending).';
