-- 업주 프로파일 — 사용자 비전: 영업자가 매장 100개 가져도 업주별 성향·니즈 즉시 회상
-- palantir-patterns.md §5 OwnerProfile 의 정착 (자동 추출은 Q5 보류, 수기 입력은 즉시 가능)
-- 매장 등록 시 영업자가 미팅 통해 알아낸 정보를 stores 테이블에 직접 저장.

alter table public.stores
  -- 국가적 니즈: 어느 시장 타겟? (일본 관광객 / 중국 / 서양 / 국내 등)
  add column if not exists country_focus text,

  -- 카테고리 선호: 구글맵·체험단·블로그·SNS 등 무엇을 우선?
  add column if not exists channel_preferences text[],

  -- 업주 성격 우선순위: revenue / authority / rapport / quality / speed 중
  add column if not exists owner_priority text,

  -- 업주 좋아하는 것 (자유 텍스트, 미팅 메모 기반)
  add column if not exists owner_likes text,

  -- 업주 싫어하는 것
  add column if not exists owner_dislikes text,

  -- 민감 포인트 (조심해야 할 것)
  add column if not exists owner_sensitive text,

  -- 자유 메모 (위에 안 들어간 모든 정보)
  add column if not exists owner_memo text;

comment on column public.stores.country_focus is
  '국가적 타겟 시장 (일본/중국/서양/국내 등). 콘텐츠 톤 결정.';
comment on column public.stores.channel_preferences is
  '선호 채널 array (구글맵·체험단·블로그·SNS 등). 작업 우선순위 결정.';
comment on column public.stores.owner_priority is
  '업주 성격 우선순위 (revenue/authority/rapport/quality/speed). 응대 톤 결정.';
comment on column public.stores.owner_likes is '업주 좋아하는 것 (응대 시 활용).';
comment on column public.stores.owner_dislikes is '업주 싫어하는 것 (피해야 할 것).';
comment on column public.stores.owner_sensitive is '민감 포인트 (조심할 것).';
comment on column public.stores.owner_memo is '자유 메모 (위에 안 들어간 모든 정보).';

-- v_store_360 view 갱신 — 새 owner profile 컬럼 포함
-- create or replace는 컬럼 순서 변경 불가, drop 후 재생성
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

  -- 헬스체크 신선도
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

  -- 업주 프로파일 (이 마이그에서 추가)
  s.country_focus,
  s.channel_preferences,
  s.owner_priority,
  s.owner_likes,
  s.owner_dislikes,
  s.owner_sensitive,
  s.owner_memo,

  -- 진행 중 퀘스트 (전체 — 다음 퀘스트 추론용)
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

  -- 최근 통신 — 일반 응답 vs 이슈(CS/요청) 분리: communications.metadata.kind 또는 next_action 유무로 추론
  -- 이번 단계는 전체 5건 그대로, 분리는 클라이언트가 next_action 유무로 판단
  (select coalesce(jsonb_agg(to_jsonb(c.*) order by c.occurred_at desc), '[]'::jsonb)
     from (select * from public.communications
            where store_id = s.id
            order by occurred_at desc limit 8) c)               as recent_comms,

  -- 최근 이슈 = next_action_date is not null 인 통신 (= 후속 액션 필요)
  (select coalesce(jsonb_agg(to_jsonb(c.*) order by c.occurred_at desc), '[]'::jsonb)
     from (select * from public.communications
            where store_id = s.id and next_action_date is not null
            order by occurred_at desc limit 5) c)               as recent_issues,

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

  -- 최근 audit 3건
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
  '3분할 Decision Brief 데이터 소스. 매장·업주·퀘스트 360 컨텍스트 단일 row.';

-- 시드 매장 샘플 데이터는 seed.sql 끝에 (마이그 후 seed가 stores INSERT로 덮어쓰므로)
