-- gbp_snapshots: 매장별 구글 비즈니스 프로필 인사이트 (수동 입력 또는 API)

create table public.gbp_snapshots (
  id bigserial primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  measured_on date not null,
  period_days int default 7,            -- 7일 / 28일 / 30일 등 측정 윈도우

  -- 핵심 지표 (자주 쓰는 것만 정식 컬럼, 나머지는 raw_json)
  views int,                            -- 검색·지도 합산 조회수
  calls int,                            -- 통화 클릭
  direction_requests int,               -- 길찾기 클릭
  website_clicks int,                   -- 웹사이트 클릭
  reviews_count int,                    -- 누적 리뷰 수
  reviews_avg numeric(3,2),             -- 평균 평점

  raw_json jsonb,                       -- API 원본 또는 추가 필드
  source text not null default 'manual',
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index gbp_snapshots_dedupe on public.gbp_snapshots(store_id, measured_on, source);
create index gbp_snapshots_store_idx on public.gbp_snapshots(store_id, measured_on desc);

alter table public.gbp_snapshots enable row level security;
create policy "gbp_snapshots: authenticated full" on public.gbp_snapshots for all to authenticated using (true) with check (true);
create policy "gbp_snapshots: dev anon" on public.gbp_snapshots for all to anon using (true) with check (true);  -- [TEMP]

comment on table public.gbp_snapshots is '구글 비즈니스 프로필 인사이트 시계열 (수동 입력 또는 API)';
