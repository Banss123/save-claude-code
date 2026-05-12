-- reports: 본사가 자료·텍스트 제공 → 우리(영업자/마케터)가 컨펌 → 업주 송부

create type public.report_type as enum (
  'weekly',     -- 주간보고
  'mid_rank',   -- 중간등수 보고
  'monthly'     -- 월간보고
);

create type public.report_status as enum (
  'received',          -- 본사에서 받음, 컨펌 대기
  'revision_requested',-- 본사에 수정 요청
  'confirmed',         -- 우리 컨펌 완료, 업주 송부 대기
  'sent'               -- 업주 송부 완료
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,

  type public.report_type not null,
  period_start date not null,
  period_end date not null,

  status public.report_status not null default 'received',

  -- 본사 제공 자료
  source_url text,             -- 구글드라이브·노션·파일 링크
  body text,                   -- 보고서 본문 (텍스트면 그대로, 파일이면 요약 메모)
  received_at timestamptz not null default now(),
  received_from text,          -- 누구에게 받았는지 메모 (본사 담당자명 등)

  -- 우리 컨펌
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirm_note text,           -- 컨펌 의견·수정 내용

  -- 업주 송부
  sent_at timestamptz,
  sent_to text,                -- 카톡·워크방·이메일 등 채널
  send_note text,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_store_idx on public.reports(store_id, period_end desc);
create index reports_status_idx on public.reports(status);
create index reports_type_idx on public.reports(type);
create index reports_received_idx on public.reports(received_at desc) where status = 'received';

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.tg_set_updated_at();

-- RLS
alter table public.reports enable row level security;
create policy "reports: authenticated full" on public.reports for all to authenticated
  using (true) with check (true);
create policy "reports: dev anon" on public.reports for all to anon
  using (true) with check (true);  -- [TEMP] 인증 후 제거

comment on table public.reports is '본사가 자료 제공 → 우리가 컨펌 → 업주 송부 흐름';
comment on column public.reports.source_url is '본사가 보내준 자료 링크 (구글드라이브 등)';
comment on column public.reports.confirmed_by is '컨펌한 사용자 (영업자/마케터 본인)';
comment on column public.reports.sent_to is '업주에게 어디로 송부했는지 (카톡/워크방/이메일)';
