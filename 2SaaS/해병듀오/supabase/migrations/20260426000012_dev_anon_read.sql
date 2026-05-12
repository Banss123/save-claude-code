-- [TEMP-2026-04-26] dev 단계 데모용 anon SELECT 허용.
-- 인증 (/login + supabase auth) 셋업 후 이 마이그레이션을 reverse migration으로 제거.

create policy "stores: dev anon read"
  on public.stores for select to anon using (true);

create policy "quests: dev anon read"
  on public.quests for select to anon using (true);

create policy "communications: dev anon read"
  on public.communications for select to anon using (true);

create policy "recurring_checks: dev anon read"
  on public.recurring_checks for select to anon using (true);

create policy "calendar_events: dev anon read"
  on public.calendar_events for select to anon using (true);

create policy "activity_log: dev anon read"
  on public.activity_log for select to anon using (true);

create policy "store_audit_log: dev anon read"
  on public.store_audit_log for select to anon using (true);

create policy "store_types: dev anon read" on public.store_types for select to anon using (true);
create policy "payment_methods: dev anon read" on public.payment_methods for select to anon using (true);
create policy "communication_channels: dev anon read" on public.communication_channels for select to anon using (true);
create policy "check_templates: dev anon read" on public.check_templates for select to anon using (true);
create policy "profiles: dev anon read" on public.profiles for select to anon using (true);

-- view에 anon SELECT grant
grant select on public.v_dashboard_stats to anon;
grant select on public.v_activity_heatmap to anon;
grant select on public.v_quest_dashboard to anon;

-- [TEMP] dev 단계 anon write — 매장 등록 폼 데모용. 인증 셋업 후 제거.
create policy "stores: dev anon insert" on public.stores for insert to anon with check (true);
create policy "quests: dev anon write"  on public.quests for all to anon using (true) with check (true);
create policy "quest_completions: dev anon write" on public.quest_completions for all to anon using (true) with check (true);
create policy "communications: dev anon write" on public.communications for all to anon using (true) with check (true);
