-- [TEMP-2026-05-05] dev 단계 profiles UPDATE 허용 (/app/settings 인라인 수정용).
-- 인증 셋업 후 reverse migration으로 제거.

create policy "profiles: dev anon update"
  on public.profiles for update to anon
  using (true) with check (true);
