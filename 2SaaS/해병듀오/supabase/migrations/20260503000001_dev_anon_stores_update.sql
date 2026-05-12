-- [TEMP-2026-05-03] dev 단계 매장 담당자 변경 등 stores UPDATE 허용.
-- 인증 (/login + supabase auth) 셋업 후 reverse migration으로 제거 (012와 함께).

create policy "stores: dev anon update"
  on public.stores for update to anon
  using (true) with check (true);
