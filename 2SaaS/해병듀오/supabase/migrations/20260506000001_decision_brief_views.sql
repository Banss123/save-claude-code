-- Decision Brief 데이터 소스
-- palantir-patterns.md §4 Object 360 + §3 Decision Brief
-- 퀘스트 클릭 → 매장 360 컨텍스트 자동 표시의 핵심 view

-- ─── v_store_360 ─────────────────────────────────────
-- 매장 1개의 모든 운영 컨텍스트를 단일 row로 join
-- 페이지 SQL 분산 X. 모든 Decision Brief는 이 view 인용.

create or replace view public.v_store_360 as
select
  s.id                                                          as store_id,
  s.name                                                        as store_name,
  s.type_code,
  st.label                                                      as type_label,
  s.status,
  s.business_number,
  s.address,
  s.owner_name,
  s.owner_phone,
  s.owner_email,
  s.gbp_url,
  s.gbp_already_created,

  -- 계약·시작일·LTV 정보
  s.start_date,
  s.contract_months,
  case when s.start_date is not null
       then (s.start_date + (s.contract_months || ' months')::interval)::date
       end                                                      as contract_end_date,
  case when s.start_date is not null
       then (current_date - s.start_date)::int
       end                                                      as days_since_start,
  case when s.start_date is not null and s.contract_months is not null
       then ((s.start_date + (s.contract_months || ' months')::interval)::date - current_date)::int
       end                                                      as days_until_contract_end,
  s.monthly_fee,
  s.discount_pct,

  -- 담당자
  s.assigned_owner_id,
  po.name                                                       as assigned_owner_name,
  s.assigned_marketer_id,
  pm.name                                                       as assigned_marketer_name,

  -- 헬스체크 신선도 (누락 방지 5대 정책 §3)
  s.last_health_check_at,
  case when s.last_health_check_at is null
       then null
       else extract(day from now() - s.last_health_check_at)::int
       end                                                      as days_since_health_check,
  case
    when s.last_health_check_at is null then 'never'
    when s.last_health_check_at < now() - interval '14 days' then 'critical'
    when s.last_health_check_at < now() - interval '7 days' then 'stale'
    else 'fresh'
  end                                                           as health_status,

  -- 진행 중 퀘스트 상위 5건 (priority + due 기준)
  (select coalesce(jsonb_agg(qj order by qj_priority_rank, qj_due nulls last), '[]'::jsonb)
     from (
       select
         q.id, q.title, q.process_step, q.priority, q.due_date, q.status,
         q.source, q.external_url, q.is_pinned,
         case q.priority when 'urgent' then 1 when 'normal' then 2 when 'low' then 3 end as qj_priority_rank,
         q.due_date as qj_due,
         to_jsonb(q.*) as qj
       from public.quests q
       where q.store_id = s.id and q.status = 'pending'
       order by qj_priority_rank, qj_due nulls last
       limit 5
     ) sub)                                                     as active_quests,
  (select count(*)::int from public.quests q
    where q.store_id = s.id and q.status = 'pending')           as active_quest_count,
  (select count(*)::int from public.quests q
    where q.store_id = s.id and q.status = 'pending'
      and q.due_date < current_date)                            as overdue_quest_count,

  -- 최근 통신 5건
  (select coalesce(jsonb_agg(to_jsonb(c.*) order by c.occurred_at desc), '[]'::jsonb)
     from (select * from public.communications
            where store_id = s.id
            order by occurred_at desc limit 5) c)               as recent_comms,
  (select count(*)::int from public.communications c
    where c.store_id = s.id
      and c.occurred_at > now() - interval '30 days')           as comm_count_30d,
  (select max(c.occurred_at) from public.communications c
    where c.store_id = s.id)                                    as last_comm_at,

  -- 키워드 변화 (오늘 vs 7일 전)
  (select coalesce(jsonb_agg(jsonb_build_object(
            'keyword_id', k.id,
            'text', k.text,
            'region', k.region,
            'rank_today', kr_now.rank,
            'rank_7d_ago', kr_old.rank,
            'delta', coalesce(kr_old.rank - kr_now.rank, 0)
          )), '[]'::jsonb)
     from public.keywords k
     left join lateral (
       select rank from public.keyword_rankings
        where keyword_id = k.id
        order by measured_on desc limit 1
     ) kr_now on true
     left join lateral (
       select rank from public.keyword_rankings
        where keyword_id = k.id
          and measured_on <= current_date - 7
        order by measured_on desc limit 1
     ) kr_old on true
     where k.store_id = s.id and k.active = true)               as keyword_movement,

  -- 최신 GBP snapshot
  (select to_jsonb(g.*) from public.gbp_snapshots g
    where g.store_id = s.id
    order by g.measured_on desc limit 1)                        as latest_gbp,

  -- 최근 audit 3건 (status_change·archive 등)
  (select coalesce(jsonb_agg(to_jsonb(a.*) order by a.occurred_at desc), '[]'::jsonb)
     from (select * from public.store_audit_log
            where store_id = s.id
            order by occurred_at desc limit 3) a)               as recent_audit,

  -- 메타
  s.metadata,
  s.created_at,
  s.archived_at
from public.stores s
left join public.store_types st on st.code = s.type_code
left join public.profiles po on po.id = s.assigned_owner_id
left join public.profiles pm on pm.id = s.assigned_marketer_id
where s.archived_at is null;

comment on view public.v_store_360 is
  'Decision Brief 데이터 소스. 매장 1개의 360 컨텍스트(계약·헬스·퀘스트·통신·키워드·GBP·audit).';

-- ─── v_quest_priority ─────────────────────────────────
-- 대시보드의 "지금 가장 급한" 정렬 view.
-- urgent=1, overdue=2, today=3, pinned=4, normal=5, low=6 가중치.

create or replace view public.v_quest_priority as
select
  q.*,
  s.name as store_name,
  s.type_code as store_type_code,
  s.assigned_owner_id as store_owner_id,
  case
    when q.priority = 'urgent' then 1
    when q.due_date is not null and q.due_date < current_date then 2  -- overdue
    when q.due_date = current_date then 3                             -- today
    when q.is_pinned then 4
    when q.priority = 'normal' then 5
    else 6
  end as urgency_rank,
  case
    when q.due_date is null then 'no_due'
    when q.due_date < current_date then 'overdue'
    when q.due_date = current_date then 'today'
    when q.due_date = current_date + 1 then 'tomorrow'
    else 'later'
  end as due_bucket
from public.quests q
join public.stores s on s.id = q.store_id
where q.status = 'pending' and s.archived_at is null;

comment on view public.v_quest_priority is
  '대시보드 "오늘 가장 급한 1건" 정렬 view. urgency_rank 오름차순 + due_date 오름차순.';
