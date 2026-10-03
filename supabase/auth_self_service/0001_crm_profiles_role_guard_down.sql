-- Rollback of 0001 — restores the original (vulnerable) grant/policy shape.
-- NOTE: reverting re-opens the self-escalation vulnerability; use only if the
-- column grants cause an unforeseen production problem, and re-fix promptly.
revoke update (full_name, telegram_id, phone) on public.crm_profiles from authenticated;
grant  update on public.crm_profiles to authenticated;   -- original broad UPDATE

drop policy if exists "crm_profiles_update" on public.crm_profiles;
create policy "crm_profiles_update" on public.crm_profiles
  for update
  using (auth.uid() = id);

-- (No trigger/function to restore — the corrected design does not use one.)
