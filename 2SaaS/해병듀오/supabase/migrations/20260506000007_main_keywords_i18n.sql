-- 메인 키워드 다국어 — 사용자 비전:
--   한국어: 강남 고기집 / 영어: gangnam restaurants, korean bbq /
--   일본어: 江南 焼肉 / 중국어 번체: 江南 烤肉店 ...
-- 새 언어 추가 시 마이그 X (jsonb 자유 키)

alter table public.stores
  add column if not exists main_keywords_i18n jsonb;

comment on column public.stores.main_keywords_i18n is
  '다국어 메인 키워드. {ko: "...", en: "...", ja: "...", zh_tw: "...", zh_cn: "..."}.';

-- v_store_360 갱신 — 새 컬럼 노출
drop view if exists public.v_store_360;
create view public.v_store_360 as
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

  s.current_round,
  s.main_keyword,
  s.main_keyword_translation,
  s.main_keywords_i18n,                          -- NEW: 다국어 jsonb
  s.naver_place_url,
  s.google_map_url,
  s.drive_folder_url,
  s.onboarding_sheet_url,

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

  s.assigned_owner_id,
  po.name                                                       as assigned_owner_name,
  s.assigned_marketer_id,
  pm.name                                                       as assigned_marketer_name,

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

  s.country_focus,
  s.channel_preferences,
  s.owner_priority,
  s.owner_likes,
  s.owner_dislikes,
  s.owner_sensitive,
  s.owner_memo,

  (select coalesce(jsonb_agg(qj order by qj_priority_rank, qj_due nulls last), '[]'::jsonb)
     from (
       select
         q.id, q.title, q.process_step, q.priority, q.due_date, q.status,
         q.source, q.external_url, q.is_pinned, q.description,
         case q.priority when 'urgent' then 1 when 'normal' then 2 when 'low' then 3 end as qj_priority_rank,
         q.due_date as qj_due,
         to_jsonb(q.*) as qj
       from public.quests q
       where q.store_id = s.id and q.status = 'pending'
       order by qj_priority_rank, qj_due nulls last
     ) sub)                                                     as active_quests,
  (select count(*)::int from public.quests q
    where q.store_id = s.id and q.status = 'pending')           as active_quest_count,
  (select count(*)::int from public.quests q
    where q.store_id = s.id and q.status = 'pending'
      and q.due_date < current_date)                            as overdue_quest_count,

  (select coalesce(jsonb_agg(to_jsonb(c.*) order by c.occurred_at desc), '[]'::jsonb)
     from (select * from public.communications
            where store_id = s.id
            order by occurred_at desc limit 8) c)               as recent_comms,

  (select coalesce(jsonb_agg(to_jsonb(c.*) order by c.occurred_at desc), '[]'::jsonb)
     from (select * from public.communications
            where store_id = s.id and next_action_date is not null
            order by occurred_at desc limit 5) c)               as recent_issues,

  (select count(*)::int from public.communications c
    where c.store_id = s.id
      and c.occurred_at > now() - interval '30 days')           as comm_count_30d,
  (select max(c.occurred_at) from public.communications c
    where c.store_id = s.id)                                    as last_comm_at,

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

  (select to_jsonb(g.*) from public.gbp_snapshots g
    where g.store_id = s.id
    order by g.measured_on desc limit 1)                        as latest_gbp,

  (select coalesce(jsonb_agg(to_jsonb(a.*) order by a.occurred_at desc), '[]'::jsonb)
     from (select * from public.store_audit_log
            where store_id = s.id
            order by occurred_at desc limit 3) a)               as recent_audit,

  s.metadata,
  s.created_at,
  s.archived_at
from public.stores s
left join public.store_types st on st.code = s.type_code
left join public.profiles po on po.id = s.assigned_owner_id
left join public.profiles pm on pm.id = s.assigned_marketer_id
where s.archived_at is null;

comment on view public.v_store_360 is
  'v3: main_keywords_i18n 추가. 다국어 메인 키워드.';
