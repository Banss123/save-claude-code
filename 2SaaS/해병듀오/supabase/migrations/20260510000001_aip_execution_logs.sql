-- AIP/LLM 초안 생성 감사 로그.
-- 원문 전체를 무제한 저장하지 않고 hash + 짧은 preview + provider/model/metadata만 남긴다.

create table if not exists public.aip_execution_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete set null,
  quest_id uuid references public.quests(id) on delete set null,
  proposed_action_id uuid references public.proposed_actions(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,

  action_type text not null
    check (action_type in ('forwarding_draft', 'proposed_quest_draft')),
  provider text not null
    check (provider in ('openai', 'fallback')),
  model text,
  context_version text,
  status text not null default 'success'
    check (status in ('success', 'fallback', 'error')),

  input_hash text,
  output_hash text,
  input_preview text,
  output_preview text,
  reasoning text,
  risk_flags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists aip_execution_logs_store_created_idx
  on public.aip_execution_logs (store_id, created_at desc);
create index if not exists aip_execution_logs_actor_created_idx
  on public.aip_execution_logs (actor_id, created_at desc);
create index if not exists aip_execution_logs_action_created_idx
  on public.aip_execution_logs (action_type, created_at desc);
create index if not exists aip_execution_logs_proposed_action_idx
  on public.aip_execution_logs (proposed_action_id)
  where proposed_action_id is not null;

alter table public.aip_execution_logs enable row level security;

drop policy if exists "aip_execution_logs: authenticated read"
  on public.aip_execution_logs;
create policy "aip_execution_logs: authenticated read"
  on public.aip_execution_logs for select
  to authenticated
  using (true);

drop policy if exists "aip_execution_logs: authenticated insert"
  on public.aip_execution_logs;
create policy "aip_execution_logs: authenticated insert"
  on public.aip_execution_logs for insert
  to authenticated
  with check (true);

comment on table public.aip_execution_logs is
  'AIP/LLM 초안 생성 감사 로그. provider/model/context/output preview를 추적한다.';
comment on column public.aip_execution_logs.input_hash is
  '전체 입력 원문 대신 dedupe/감사용 hash.';
comment on column public.aip_execution_logs.output_preview is
  '품질 검토용 짧은 출력 preview. 원문 전체 보관 용도가 아니다.';
