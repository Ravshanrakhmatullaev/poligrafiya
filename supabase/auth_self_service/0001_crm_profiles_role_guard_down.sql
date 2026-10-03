-- Rollback of 0001 — restores the original (vulnerable) policy shape.
-- NOTE: reverting re-opens the self-escalation vulnerability; only use if the
-- guard trigger causes an unforeseen production problem, and re-fix promptly.
drop trigger if exists crm_profiles_guard_identity_trg on public.crm_profiles;
drop function if exists public.crm_profiles_guard_identity();

drop policy if exists "crm_profiles_update" on public.crm_profiles;
create policy "crm_profiles_update" on public.crm_profiles
  for update
  using (auth.uid() = id);
