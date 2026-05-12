-- communications: 업주 연락 트래킹 (사용자 신규 요구).
-- 통화·카톡·이메일·디스코드·미팅 모두 한 테이블.

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  channel_code text not null references public.communication_channels(code),

  direction text not null check (direction in ('inbound', 'outbound')),  -- 업주→우리 / 우리→업주
  occurred_at timestamptz not null default now(),

  summary text not null,                  -- 짧은 요약 (검색·리스트 표시용)
  body text,                              -- 상세 내용 (옵션)

  -- 다음 액션 — 채워두면 자동 퀘스트 생성 후보
  next_action text,
  next_action_date date,

  recorded_by uuid references public.profiles(id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index communications_store_idx on public.communications(store_id, occurred_at desc);
create index communications_recent_idx on public.communications(occurred_at desc);
create index communications_channel_idx on public.communications(channel_code);
create index communications_recorded_by_idx on public.communications(recorded_by);
create index communications_next_action_idx on public.communications(next_action_date)
  where next_action_date is not null;

comment on table public.communications is '업주 연락 통합 로그. 채널 무관 단일 진실 원천';
comment on column public.communications.next_action is '"다음 연락 예정" 같은 후속 액션. 채워두면 자동 퀘스트 생성 후보';
