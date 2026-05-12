-- 카카오톡 "대화 내보내기" 전체 히스토리 수입용.
-- 실시간 알림 수집과 별개로, 매장별 과거 대화를 파싱해서
-- tone profile 학습과 추후 AIP 컨텍스트에 사용한다.

create table if not exists public.kakao_conversation_imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  room_title text,
  source_file_name text,
  raw_text_hash text not null,
  message_count integer not null default 0 check (message_count >= 0),
  imported_by uuid references public.profiles(id) on delete set null,
  status text not null default 'parsed'
    check (status in ('uploaded', 'parsed', 'failed')),
  error_message text,
  raw_meta jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  parsed_at timestamptz
);

create table if not exists public.kakao_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.kakao_conversation_imports(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  room_title text,
  sender_name text,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_kind text check (
    sender_kind is null or
    sender_kind in ('internal', 'owner', 'reviewer', 'system', 'unknown')
  ),
  message_text text not null,
  sent_at timestamptz,
  line_number integer,
  source_hash text not null unique,
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.store_tone_examples
  add column if not exists conversation_message_id uuid unique
    references public.kakao_conversation_messages(id) on delete cascade;

create unique index if not exists kakao_conversation_imports_hash_store_idx
  on public.kakao_conversation_imports (store_id, raw_text_hash);
create index if not exists kakao_conversation_imports_store_idx
  on public.kakao_conversation_imports (store_id, imported_at desc);
create index if not exists kakao_conversation_messages_store_sent_idx
  on public.kakao_conversation_messages (store_id, sent_at desc);
create index if not exists kakao_conversation_messages_sender_idx
  on public.kakao_conversation_messages (sender_kind, sent_at desc);
create index if not exists kakao_conversation_messages_features_gin_idx
  on public.kakao_conversation_messages using gin (features);

alter table public.kakao_conversation_imports enable row level security;
alter table public.kakao_conversation_messages enable row level security;

drop policy if exists "kakao_conversation_imports: authenticated full" on public.kakao_conversation_imports;
create policy "kakao_conversation_imports: authenticated full"
  on public.kakao_conversation_imports for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "kakao_conversation_messages: authenticated read" on public.kakao_conversation_messages;
create policy "kakao_conversation_messages: authenticated read"
  on public.kakao_conversation_messages for select
  to authenticated
  using (true);

comment on table public.kakao_conversation_imports is
  '매장별 카카오톡 대화 내보내기 파일 import 로그.';
comment on table public.kakao_conversation_messages is
  '대화 내보내기에서 파싱한 메시지 단위 로그. 포워딩 톤 학습과 AIP 컨텍스트에 사용.';
comment on column public.store_tone_examples.conversation_message_id is
  '실시간 알림이 아닌 대화 내보내기 메시지에서 생성된 톤 예시 참조.';
