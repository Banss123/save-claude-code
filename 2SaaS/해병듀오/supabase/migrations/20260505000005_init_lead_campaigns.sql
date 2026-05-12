-- 메타광고 캠페인 = Lead의 부모. 시트(현재) 또는 메타 API(Phase 2)에서 동기화.

create table public.lead_campaigns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  platform text not null,                -- 'meta_lead_ads' | 'instagram' | 'naver'
  campaign_name text not null,
  external_id text,                      -- 메타 캠페인 ID 또는 시트 식별자
  started_at date,
  ended_at date,
  budget_total int,
  status text,                           -- 'running' | 'paused' | 'ended'
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_campaigns_store_idx on public.lead_campaigns(store_id);
create index lead_campaigns_status_idx on public.lead_campaigns(status);
create index lead_campaigns_platform_idx on public.lead_campaigns(platform);

create trigger lead_campaigns_set_updated_at
  before update on public.lead_campaigns
  for each row execute function public.tg_set_updated_at();

alter table public.lead_campaigns enable row level security;

create policy "lead_campaigns: dev anon all"
  on public.lead_campaigns for all to anon
  using (true) with check (true);

comment on table public.lead_campaigns is '메타광고 등 외부 캠페인 마스터. Lead의 부모. docs/lead-management.md 참조';
