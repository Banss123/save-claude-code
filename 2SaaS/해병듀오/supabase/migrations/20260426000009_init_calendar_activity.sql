-- calendar_events: 팀 공유 일정 (미팅·방문·보고 마감 등)
-- activity_log: 활동 히트맵 데이터 소스 (영상 시안 차용)

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,  -- 매장 무관 일정도 가능 (null)

  title text not null,
  event_type text not null check (event_type in ('meeting', 'visit', 'report_due', 'milestone', 'other')),

  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,

  location text,
  note text,
  attendees uuid[],                       -- profiles.id 배열

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_events_start_idx on public.calendar_events(start_at);
create index calendar_events_store_idx on public.calendar_events(store_id) where store_id is not null;
create index calendar_events_type_idx on public.calendar_events(event_type);

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.tg_set_updated_at();

-- ===== activity_log =====
-- 모든 의미있는 활동 기록 → 히트맵·통계용
create table public.activity_log (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,

  -- 'work' = 사용자 작업 (퀘스트 완료·체크·문서 작성)
  -- 'communication' = 업주 연락
  -- 'system' = 시스템 자동 (매장 등록·자동 퀘스트 발급)
  category text not null check (category in ('work', 'communication', 'system')),

  type text not null,                     -- 세분화 (예: 'quest_completed', 'comm_recorded', 'store_created')
  ref_table text,                         -- 어느 테이블 row 참조하는지
  ref_id text,                            -- 그 row PK (텍스트로, uuid·bigint 모두 수용)

  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

-- 히트맵 query 패턴: actor + 일자별 집계
create index activity_log_actor_date_idx on public.activity_log(actor_id, occurred_at desc);
create index activity_log_category_idx on public.activity_log(category, occurred_at desc);
create index activity_log_store_idx on public.activity_log(store_id) where store_id is not null;

comment on table public.activity_log is '히트맵·통계 데이터 소스. quest_completion·communication INSERT 시 트리거로 자동 기록';
