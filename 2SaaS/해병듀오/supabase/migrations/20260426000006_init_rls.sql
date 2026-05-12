-- RLS 1차 정책: 비즈하이 단일 조직 + 사용자 3명 (분담 X, 공동 사용).
-- 인증된 사용자 = 모든 매장·퀘스트 read/write.
-- 향후 매장 사장 사용자 추가 시 별도 정책 분기 (TBD).

-- ===== profiles =====
alter table public.profiles enable row level security;

create policy "profiles: authenticated read all"
  on public.profiles for select to authenticated using (true);

create policy "profiles: own update"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ===== lookups (read all, write none — 마이그레이션으로만 변경) =====
alter table public.store_types enable row level security;
alter table public.payment_methods enable row level security;
alter table public.communication_channels enable row level security;

create policy "store_types: read" on public.store_types for select to authenticated using (true);
create policy "payment_methods: read" on public.payment_methods for select to authenticated using (true);
create policy "communication_channels: read" on public.communication_channels for select to authenticated using (true);

-- ===== stores =====
alter table public.stores enable row level security;

create policy "stores: authenticated full"
  on public.stores for all to authenticated
  using (true) with check (true);

alter table public.store_audit_log enable row level security;

create policy "store_audit_log: authenticated read"
  on public.store_audit_log for select to authenticated using (true);
-- write는 트리거(security definer)로만

-- ===== quests =====
alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.quest_dependencies enable row level security;

create policy "quests: authenticated full"
  on public.quests for all to authenticated
  using (true) with check (true);

create policy "quest_completions: authenticated full"
  on public.quest_completions for all to authenticated
  using (true) with check (true);

create policy "quest_dependencies: authenticated full"
  on public.quest_dependencies for all to authenticated
  using (true) with check (true);

comment on policy "stores: authenticated full" on public.stores is
  '비즈하이 사용자 3명 공동 사용. 매장 사장 사용자 추가 시 분기 정책 추가';
