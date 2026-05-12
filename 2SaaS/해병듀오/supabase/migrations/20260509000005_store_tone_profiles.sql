-- 매장별 카톡 말투/톤 학습 기반.
-- 실제 LLM fine-tuning이 아니라, 수집된 매장별 대화 예시를 정규화해서
-- 포워딩 어시스턴트와 추후 AIP/LLM 프롬프트 컨텍스트가 사용할 수 있게 한다.

alter table public.kakao_notification_events
  add column if not exists sender_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists sender_kind text,
  add column if not exists ignored_reason text,
  add column if not exists classification jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kakao_notification_events_sender_kind_check'
  ) then
    alter table public.kakao_notification_events
      add constraint kakao_notification_events_sender_kind_check
      check (
        sender_kind is null or
        sender_kind in ('internal', 'owner', 'reviewer', 'system', 'unknown')
      );
  end if;
end $$;

create table if not exists public.store_tone_profiles (
  store_id uuid primary key references public.stores(id) on delete cascade,
  formality_level integer not null default 3 check (formality_level between 1 and 5),
  warmth_level integer not null default 3 check (warmth_level between 1 and 5),
  emoji_level integer not null default 0 check (emoji_level between 0 and 3),
  message_length text not null default 'medium'
    check (message_length in ('short', 'medium', 'detailed')),
  honorific_style text not null default 'polite',
  preferred_opening text,
  preferred_closing text,
  tone_summary text,
  owner_response_summary text,
  sample_phrases text[] not null default '{}'::text[],
  avoid_phrases text[] not null default '{}'::text[],
  internal_message_count integer not null default 0 check (internal_message_count >= 0),
  owner_message_count integer not null default 0 check (owner_message_count >= 0),
  learned_from_event_count integer not null default 0 check (learned_from_event_count >= 0),
  last_sample_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger store_tone_profiles_set_updated_at
  before update on public.store_tone_profiles
  for each row execute function public.tg_set_updated_at();

create table if not exists public.store_tone_examples (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  kakao_notification_event_id uuid unique references public.kakao_notification_events(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  direction text not null check (direction in ('internal_to_owner', 'owner_to_internal')),
  sender_name text,
  message_text text not null,
  observed_at timestamptz not null default now(),
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists kakao_notification_events_sender_idx
  on public.kakao_notification_events (sender_kind, received_at desc);
create index if not exists kakao_notification_events_sender_profile_idx
  on public.kakao_notification_events (sender_profile_id, received_at desc)
  where sender_profile_id is not null;
create index if not exists kakao_notification_events_classification_gin_idx
  on public.kakao_notification_events using gin (classification);

create index if not exists store_tone_examples_store_observed_idx
  on public.store_tone_examples (store_id, observed_at desc);
create index if not exists store_tone_examples_direction_idx
  on public.store_tone_examples (store_id, direction, observed_at desc);
create index if not exists store_tone_profiles_updated_idx
  on public.store_tone_profiles (updated_at desc);

alter table public.store_tone_profiles enable row level security;
alter table public.store_tone_examples enable row level security;

drop policy if exists "store_tone_profiles: authenticated full" on public.store_tone_profiles;
create policy "store_tone_profiles: authenticated full"
  on public.store_tone_profiles for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "store_tone_examples: authenticated read" on public.store_tone_examples;
create policy "store_tone_examples: authenticated read"
  on public.store_tone_examples for select
  to authenticated
  using (true);

comment on table public.store_tone_profiles is
  '매장별 포워딩 말투/톤 프로필. 카톡 수집 대화 예시에서 산출해 포워딩 어시스턴트가 사용한다.';
comment on table public.store_tone_examples is
  '매장별 톤 학습 예시. 업주방의 내부 발신/업주 응답 메시지를 보관한다.';
comment on column public.kakao_notification_events.sender_kind is
  '카톡 발신자 분류: internal, owner, reviewer, system, unknown.';
comment on column public.kakao_notification_events.classification is
  '수집 시점 분류 근거. 액션성 감지, 리뷰 컨펌 여부, 방 종류, 발신자 분류 등.';
