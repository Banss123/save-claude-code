-- Auth guard ON 기준선.
-- 개발용 anon read/write 정책 제거 + authenticated 정책 누락 보강.

-- ===== Remove dev anon policies =====
drop policy if exists "stores: dev anon read" on public.stores;
drop policy if exists "stores: dev anon insert" on public.stores;
drop policy if exists "stores: dev anon update" on public.stores;

drop policy if exists "quests: dev anon read" on public.quests;
drop policy if exists "quests: dev anon write" on public.quests;
drop policy if exists "quest_completions: dev anon write" on public.quest_completions;

drop policy if exists "communications: dev anon read" on public.communications;
drop policy if exists "communications: dev anon write" on public.communications;
drop policy if exists "recurring_checks: dev anon read" on public.recurring_checks;
drop policy if exists "calendar_events: dev anon read" on public.calendar_events;
drop policy if exists "activity_log: dev anon read" on public.activity_log;
drop policy if exists "store_audit_log: dev anon read" on public.store_audit_log;

drop policy if exists "store_types: dev anon read" on public.store_types;
drop policy if exists "payment_methods: dev anon read" on public.payment_methods;
drop policy if exists "communication_channels: dev anon read" on public.communication_channels;
drop policy if exists "check_templates: dev anon read" on public.check_templates;
drop policy if exists "profiles: dev anon read" on public.profiles;
drop policy if exists "profiles: dev anon update" on public.profiles;

drop policy if exists "reports: dev anon" on public.reports;
drop policy if exists "keywords: dev anon" on public.keywords;
drop policy if exists "keyword_rankings: dev anon" on public.keyword_rankings;
drop policy if exists "gbp_snapshots: dev anon" on public.gbp_snapshots;
drop policy if exists "notifications: dev anon" on public.notifications;

drop policy if exists "lead_campaigns: dev anon all" on public.lead_campaigns;
drop policy if exists "leads: dev anon all" on public.leads;
drop policy if exists "lead_audit_log: dev anon read" on public.lead_audit_log;

revoke select on public.v_dashboard_stats from anon;
revoke select on public.v_activity_heatmap from anon;
revoke select on public.v_quest_dashboard from anon;

-- ===== Add authenticated policies that were missing in lead tables =====
create policy "lead_campaigns: authenticated full"
  on public.lead_campaigns for all to authenticated
  using (true) with check (true);

create policy "leads: authenticated full"
  on public.leads for all to authenticated
  using (true) with check (true);

-- Lead audit is written by trigger during authenticated lead updates.
create policy "lead_audit_log: authenticated read"
  on public.lead_audit_log for select to authenticated
  using (true);

create policy "lead_audit_log: authenticated insert"
  on public.lead_audit_log for insert to authenticated
  with check (true);
