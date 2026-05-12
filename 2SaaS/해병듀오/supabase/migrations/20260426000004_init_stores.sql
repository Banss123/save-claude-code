-- stores: 매장 마스터. 모든 도메인 데이터의 anchor.
-- + store_audit_log: 모든 변경 이력.

create table public.stores (
  id uuid primary key default gen_random_uuid(),

  -- 기본 정보
  name text not null,
  type_code text not null references public.store_types(code),
  status public.store_status not null default 'contract_pending',

  -- 사업자/주소
  business_number text,
  address text,

  -- 업주 정보
  owner_name text,
  owner_email text,
  owner_phone text,

  -- GBP
  gbp_url text,
  gbp_already_created boolean not null default false,

  -- 계약
  contract_months int,
  keywords_count int,
  monthly_fee int,                              -- 원 단위
  discount_pct int not null default 0,
  payment_method_code text references public.payment_methods(code),
  tax_invoice boolean not null default true,

  -- 시작일 = 모든 C 단계 일정의 anchor (process.md)
  start_date date,

  -- 담당자 (분담 X, 공동 사용 — 단지 "주로 누가 보는지" 표시용)
  assigned_owner_id uuid references public.profiles(id) on delete set null,
  assigned_marketer_id uuid references public.profiles(id) on delete set null,

  -- 헬스체크 신선도 (product.md 누락방지 정책)
  last_health_check_at timestamptz,

  -- 미리 모르는 필드 확장용
  metadata jsonb not null default '{}'::jsonb,

  -- 시간
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz   -- 삭제 대신 채우기
);

create index stores_status_idx on public.stores(status) where archived_at is null;
create index stores_type_idx on public.stores(type_code) where archived_at is null;
create index stores_assigned_owner_idx on public.stores(assigned_owner_id);
create index stores_assigned_marketer_idx on public.stores(assigned_marketer_id);
create index stores_start_date_idx on public.stores(start_date) where archived_at is null;
create index stores_health_check_idx on public.stores(last_health_check_at) where archived_at is null;
create index stores_name_trgm_idx on public.stores using gin (name extensions.gin_trgm_ops);  -- 검색

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.tg_set_updated_at();

-- audit log: 모든 변경 이력
create table public.store_audit_log (
  id bigserial primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,                    -- 'create' / 'update' / 'archive' / 'status_change' 등
  before jsonb,
  after jsonb,
  reason text,
  occurred_at timestamptz not null default now()
);

create index store_audit_log_store_idx on public.store_audit_log(store_id, occurred_at desc);
create index store_audit_log_actor_idx on public.store_audit_log(actor_id);

-- 자동 audit: stores UPDATE/INSERT/DELETE 트리거
create or replace function public.tg_log_store_changes()
returns trigger
language plpgsql
as $$
declare
  v_actor uuid;
  v_action text;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := auth.uid();
  if (tg_op = 'INSERT') then
    v_action := 'create';
    v_after := to_jsonb(new);
    insert into public.store_audit_log (store_id, actor_id, action, after)
    values (new.id, v_actor, v_action, v_after);
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.status is distinct from new.status) then
      insert into public.store_audit_log (store_id, actor_id, action, before, after)
      values (new.id, v_actor, 'status_change',
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status));
    end if;
    if (old.archived_at is null and new.archived_at is not null) then
      insert into public.store_audit_log (store_id, actor_id, action)
      values (new.id, v_actor, 'archive');
    end if;
    -- 그 외 일반 update는 변경 분량 많을 수 있어 status_change·archive 외엔 컴팩트하게
    -- (필요 시 컬럼별 트리거 추가)
    return new;
  end if;
  return null;
end;
$$;

create trigger stores_audit
  after insert or update on public.stores
  for each row execute function public.tg_log_store_changes();

comment on table public.stores is '매장 마스터. process.md A·B·C 프로세스의 anchor';
comment on column public.stores.start_date is 'B.9 시작일 — C 단계 모든 일정의 anchor (1개월 롤링 적재)';
comment on column public.stores.metadata is '미리 모르는 필드 확장용. 자주 query하면 정식 컬럼으로 승격';
