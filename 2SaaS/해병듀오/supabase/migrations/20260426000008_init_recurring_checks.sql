-- check_templates: 정기 점검 항목 마스터 (재사용 위해 분리)
-- recurring_checks: 매장×템플릿×수행 결과

create table public.check_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null,                 -- 'store' (매장 체크리스트) / 'review' (리뷰 체크리스트)
  name text not null,
  description text,
  -- 주기: weekly·biweekly·monthly·on_demand
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly', 'on_demand')),
  -- 적용 대상: 모든 매장 또는 특정 status
  applies_to_status public.store_status[],  -- null = 모두
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index check_templates_category_idx on public.check_templates(category, active);

-- 시드: 사용자가 매장/리뷰 체크리스트 항목 알려주면 보강. 일단 placeholder.
insert into public.check_templates (category, name, frequency, sort_order) values
  ('store', 'GBP 사진 신규 업로드 확인', 'weekly', 10),
  ('store', '키워드 등수 스크린샷', 'weekly', 20),
  ('store', '매장 정보 정확성 점검', 'biweekly', 30),
  ('store', '소식글 발행 적절성', 'weekly', 40),
  ('review', '신규 리뷰 답글 작성', 'weekly', 10),
  ('review', '리뷰 작업자 원고 컨펌', 'weekly', 20),
  ('review', '부정 리뷰 모니터링', 'weekly', 30);

create table public.recurring_checks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  template_id uuid not null references public.check_templates(id) on delete restrict,

  scheduled_for date not null,             -- 이번 회차 예정일 (시작일 anchor 기반)
  performed_at timestamptz,                -- 실제 수행 시점 (null = 미수행)
  performed_by uuid references public.profiles(id) on delete set null,
  result text,                             -- 'ok' / 'issue' / 'na' 등
  note text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create unique index recurring_checks_dedupe
  on public.recurring_checks(store_id, template_id, scheduled_for);
create index recurring_checks_store_idx on public.recurring_checks(store_id, scheduled_for desc);
create index recurring_checks_pending_idx
  on public.recurring_checks(scheduled_for) where performed_at is null;

comment on table public.check_templates is '정기 점검 양식. 카테고리(store/review)별 + 주기 정의';
comment on table public.recurring_checks is '매장별 정기 점검 결과 (회차 단위)';
