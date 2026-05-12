-- Lead 변경 이력. status·assign·memo 자동 기록.

create table public.lead_audit_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,                  -- 'create' | 'status_change' | 'assign' | 'memo'
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);

create index lead_audit_log_lead_idx on public.lead_audit_log(lead_id, occurred_at desc);
create index lead_audit_log_actor_idx on public.lead_audit_log(actor_id);

alter table public.lead_audit_log enable row level security;

create policy "lead_audit_log: dev anon read"
  on public.lead_audit_log for select to anon using (true);

-- Lead 변경 자동 audit 트리거
create or replace function public.tg_log_lead_changes()
returns trigger
language plpgsql
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();
  if (tg_op = 'INSERT') then
    insert into public.lead_audit_log (lead_id, actor_id, action, after)
    values (new.id, v_actor, 'create', to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    if (old.status is distinct from new.status) then
      insert into public.lead_audit_log (lead_id, actor_id, action, before, after)
      values (new.id, v_actor, 'status_change',
        jsonb_build_object('status', old.status),
        jsonb_build_object('status', new.status));
    end if;
    if (old.assigned_to is distinct from new.assigned_to) then
      insert into public.lead_audit_log (lead_id, actor_id, action, before, after)
      values (new.id, v_actor, 'assign',
        jsonb_build_object('assigned_to', old.assigned_to),
        jsonb_build_object('assigned_to', new.assigned_to));
    end if;
    if (old.memo is distinct from new.memo) then
      insert into public.lead_audit_log (lead_id, actor_id, action, before, after)
      values (new.id, v_actor, 'memo',
        jsonb_build_object('memo', old.memo),
        jsonb_build_object('memo', new.memo));
    end if;
  end if;
  return null;
end;
$$;

create trigger leads_audit
  after insert or update on public.leads
  for each row execute function public.tg_log_lead_changes();

comment on table public.lead_audit_log is 'Lead 변경 이력. INSERT·status·assign·memo 자동 기록';
