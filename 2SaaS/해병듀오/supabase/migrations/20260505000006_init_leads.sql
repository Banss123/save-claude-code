-- Lead = 메타광고 잠재고객 응답.
-- 인입 흐름: 메타 인스턴트 양식 → 디스코드 webhook → 시트 정리 → SaaS 동기화 (Phase 1)
-- 시트 ID: 1d_18LKEUpP9yxAL8Q86bxGndNToiaAGZ6M51Vc87CHk (디비관리 탭이 SSOT)

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.lead_campaigns(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  name text,
  phone text,
  age int,
  region text,
  raw_data jsonb not null default '{}'::jsonb,           -- 메타가 보낸 원본 응답
  status public.lead_status not null default 'new',
  assigned_to uuid references public.profiles(id) on delete set null,
  contacted_at timestamptz,
  closed_at timestamptz,
  memo text,
  source_sheet_row int,                                  -- 시트 row 번호 (read-only 미러링용)
  source_cell text,                                      -- 시트 cell 좌표
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_campaign_idx on public.leads(campaign_id);
create index leads_store_idx on public.leads(store_id);
create index leads_status_idx on public.leads(status);
create index leads_assigned_idx on public.leads(assigned_to);
create index leads_phone_idx on public.leads(phone) where phone is not null;
create index leads_created_idx on public.leads(created_at desc);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.tg_set_updated_at();

alter table public.leads enable row level security;

create policy "leads: dev anon all"
  on public.leads for all to anon
  using (true) with check (true);

comment on table public.leads is '메타광고 잠재고객. lead_status enum 기반 진행 추적';
