-- DB 관리 다채널 유입 — 사용자 비전: 돌방·메타광고 → 유튜브·스레드·카톡채널·네이버블로그 등 확장
-- palantir-patterns.md §2-1 ObjectType "Lead" 의 source_channel 속성 추가.

create type public.lead_source_channel as enum (
  'walk_in',          -- 돌방 (오프라인 직접 방문)
  'meta_ad',          -- 메타 광고 (Facebook / Instagram)
  'youtube',          -- 유튜브 광고·콘텐츠 유입
  'threads',          -- 메타 Threads
  'kakao_channel',    -- 카카오톡 채널
  'naver_blog',       -- 네이버 블로그·검색
  'naver_place',      -- 네이버 플레이스·지도
  'google_search',    -- 구글 검색·GBP
  'referral',         -- 소개·추천
  'manual'            -- 수기 입력 (기타)
);

alter table public.leads
  add column if not exists source_channel public.lead_source_channel;

-- 기존 데이터 호환: campaign_id가 있으면 'meta_ad' (메타 광고에서 들어온 거니까), 없으면 null
update public.leads
   set source_channel = 'meta_ad'
 where source_channel is null
   and campaign_id is not null;

-- index for 채널별 분석
create index if not exists leads_source_channel_idx
  on public.leads(source_channel) where source_channel is not null;

comment on column public.leads.source_channel is
  'Lead 유입 채널. campaign_id와 별개의 상위 분류 (campaign은 채널 안의 개별 광고/콘텐츠).';
