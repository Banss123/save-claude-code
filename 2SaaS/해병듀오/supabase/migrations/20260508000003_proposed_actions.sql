-- AI/외부 입력 제안함.
-- 카톡 복붙, Google Keep, Google Calendar, 추후 AIP 분석 결과를
-- 바로 DB에 실행하지 않고 "사람 승인 대기" 상태로 모으는 안전 레이어.

create table public.proposed_actions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  quest_id uuid references public.quests(id) on delete set null,

  title text not null,
  description text,
  action_type text not null default 'quest'
    check (action_type in ('quest', 'communication', 'calendar_event', 'store_note')),

  priority public.quest_priority not null default 'normal',
  due_date date,

  source text not null default 'manual_capture'
    check (source in ('manual_capture', 'aip', 'kakao', 'google_keep', 'google_calendar', 'sheet_sync', 'system')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'dismissed', 'failed')),

  confidence numeric(4,3) not null default 0.500
    check (confidence >= 0 and confidence <= 1),
  reasoning text,
  raw_input text,
  payload jsonb not null default '{}'::jsonb,

  proposed_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposed_actions_pending_idx
  on public.proposed_actions (status, created_at desc)
  where status = 'pending';
create index proposed_actions_store_idx
  on public.proposed_actions (store_id, status, created_at desc);
create index proposed_actions_due_idx
  on public.proposed_actions (due_date)
  where status = 'pending' and due_date is not null;
create index proposed_actions_payload_gin_idx
  on public.proposed_actions using gin (payload);

alter table public.proposed_actions enable row level security;

create policy "proposed_actions: authenticated full"
  on public.proposed_actions for all
  to authenticated
  using (true)
  with check (true);

create trigger proposed_actions_set_updated_at
  before update on public.proposed_actions
  for each row execute function public.tg_set_updated_at();

comment on table public.proposed_actions is
  'AI/외부 입력 제안함. 자동 실행 전 사람이 승인하는 안전 레이어.';
comment on column public.proposed_actions.raw_input is
  '카톡 복붙, Keep 메모, Calendar 이벤트 설명 등 원문.';
comment on column public.proposed_actions.payload is
  '외부 시스템 ID, 파싱 결과, LLM/AIP 근거 등 확장 필드.';
