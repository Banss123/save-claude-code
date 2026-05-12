-- keywords: 매장당 추적 키워드 (보통 5~20개)
-- keyword_rankings: 키워드별 시계열 등수

create table public.keywords (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  text text not null,
  region text,                       -- 지역 한정 검색어 ("강남 한우", "서울 치과" 등)
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index keywords_dedupe on public.keywords(store_id, text);
create index keywords_store_idx on public.keywords(store_id, active);

create table public.keyword_rankings (
  id bigserial primary key,
  keyword_id uuid not null references public.keywords(id) on delete cascade,
  measured_on date not null,
  rank int,                          -- null = 권외 / 100+
  source text,                       -- 'manual' / 'naver' / 'google' / 'serp_api' 등
  note text,
  created_at timestamptz not null default now()
);

create unique index keyword_rankings_dedupe
  on public.keyword_rankings(keyword_id, measured_on, source);
create index keyword_rankings_recent on public.keyword_rankings(keyword_id, measured_on desc);

-- RLS
alter table public.keywords enable row level security;
alter table public.keyword_rankings enable row level security;

create policy "keywords: authenticated full" on public.keywords for all to authenticated using (true) with check (true);
create policy "keyword_rankings: authenticated full" on public.keyword_rankings for all to authenticated using (true) with check (true);
-- [TEMP] dev anon
create policy "keywords: dev anon" on public.keywords for all to anon using (true) with check (true);
create policy "keyword_rankings: dev anon" on public.keyword_rankings for all to anon using (true) with check (true);

comment on table public.keywords is '매장당 추적 키워드 (구글 SEO 핵심 측정 단위)';
comment on column public.keyword_rankings.rank is 'null = 권외 (100+ 또는 미측정)';
