-- 새 테이블들 RLS 정책 (코어와 동일한 정책: 인증 사용자 = 모두 read/write)

alter table public.communications enable row level security;
alter table public.check_templates enable row level security;
alter table public.recurring_checks enable row level security;
alter table public.calendar_events enable row level security;
alter table public.activity_log enable row level security;

create policy "communications: authenticated full"
  on public.communications for all to authenticated
  using (true) with check (true);

create policy "check_templates: authenticated read"
  on public.check_templates for select to authenticated using (true);
-- 템플릿 변경은 마이그레이션으로만

create policy "recurring_checks: authenticated full"
  on public.recurring_checks for all to authenticated
  using (true) with check (true);

create policy "calendar_events: authenticated full"
  on public.calendar_events for all to authenticated
  using (true) with check (true);

create policy "activity_log: authenticated read"
  on public.activity_log for select to authenticated using (true);
-- write는 트리거(security definer)로만
