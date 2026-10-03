-- ════════════════════════════════════════════════════════════════════════
-- 0001 — CRITICAL SECURITY FIX: prevent crm_profiles self-escalation
--        (least-privilege column grants; NO trigger)
-- ════════════════════════════════════════════════════════════════════════
-- FINDING (pre-existing, live): policy "crm_profiles_update" was
--   for update using (auth.uid() = id)   -- NO with check, NO column guard
-- → an authenticated employee could: update crm_profiles set role='director'
--   where id = auth.uid();  and self-promote to director (ERP owner).
--
-- WHY NOT A TRIGGER: a SECURITY DEFINER trigger gating on is_crm_director()
-- would ALSO block legitimate SQL-Editor / service-role / postgres role
-- maintenance (there auth.uid() is NULL → is_crm_director() = false), and a
-- definer trigger cannot safely identify the original caller (execution identity
-- becomes the function owner). So we use PostgreSQL least-privilege instead:
-- revoke table-wide UPDATE from `authenticated` and grant UPDATE only on the
-- genuinely self-editable columns. role/id are simply NOT grantable to
-- employees, so an employee UPDATE touching role fails at the column level.
-- `service_role` and the table owner (`postgres`, used by the SQL Editor) keep
-- their existing privileges, so owner/admin role maintenance still works.
--
-- Additive, idempotent, no CASCADE, isolated to crm_profiles. NOT auto-applied.
-- Validate on a TEMPORARY project first (see validate_auth_self_service.sh).
-- Rollback: 0001_crm_profiles_role_guard_down.sql
-- ════════════════════════════════════════════════════════════════════════

-- 0) Clean up the previously-authored definer trigger/function if a temporary
--    environment ran the earlier draft (idempotent; safe if they don't exist).
drop trigger if exists crm_profiles_guard_identity_trg on public.crm_profiles;
drop function if exists public.crm_profiles_guard_identity();

-- 1) RLS policy: own row only, both directions (cannot re-point row to another uid).
drop policy if exists "crm_profiles_update" on public.crm_profiles;
create policy "crm_profiles_update" on public.crm_profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2) Least-privilege column grants for employees. Remove broad UPDATE, then grant
--    ONLY the safe self-service columns. id/role (and created_at) are intentionally
--    NOT granted → an authenticated UPDATE touching them is denied at column level.
revoke update on public.crm_profiles from authenticated;
revoke update on public.crm_profiles from anon;      -- anon never updates
grant  update (full_name, telegram_id, phone) on public.crm_profiles to authenticated;

-- 3) Ensure employees can still read their own row / directors read all (unchanged).
--    (SELECT policy "crm_profiles_select" from the base migration is preserved.)
--    service_role / postgres retain their existing privileges → role maintenance OK.

-- Verification (run on the temporary project, as each role):
--   as ordinary authenticated:  update crm_profiles set role='director' where id=auth.uid();   -- DENIED (42501, column role)
--                               update crm_profiles set id=gen_random_uuid() where id=auth.uid(); -- DENIED (column id)
--                               update crm_profiles set full_name='X' where id=auth.uid();      -- ALLOWED
--                               update crm_profiles set full_name='X' where id<>auth.uid();      -- 0 rows (RLS)
--   as anon:                    any update → DENIED
--   as service_role / postgres: update crm_profiles set role='production' where id='<uuid>';    -- ALLOWED (provisioning)
