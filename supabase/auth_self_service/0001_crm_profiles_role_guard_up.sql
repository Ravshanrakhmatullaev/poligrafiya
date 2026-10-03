-- ════════════════════════════════════════════════════════════════════════
-- 0001 — CRITICAL SECURITY FIX: prevent crm_profiles self-escalation
-- ════════════════════════════════════════════════════════════════════════
-- FINDING (pre-existing, live): policy "crm_profiles_update" was
--   for update using (auth.uid() = id)   -- NO with check, NO column guard
-- → an authenticated employee could run
--   update crm_profiles set role='director' where id = auth.uid();
-- and self-promote to director (ERP owner). This MUST be applied before any
-- self-service account feature is activated.
--
-- Fix: a BEFORE UPDATE trigger that blocks changes to authorization/identity
-- columns (role, id) unless the caller is a director; and tighten the policy
-- with a WITH CHECK so a row cannot be re-pointed to another uid. full_name is
-- allowed to change by the owner of the row (display only) — unchanged behavior.
--
-- Additive, idempotent, no CASCADE, isolated to crm_profiles. NOT auto-applied.
-- Apply only with owner-authorized privileged access against the PRODUCTION
-- project (jxxmbgmbaqausqunfyna). Rollback: 0001_crm_profiles_role_guard_down.sql
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.crm_profiles_guard_identity()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- role and id are authorization/identity fields: only a director may change them.
  if (new.role is distinct from old.role or new.id is distinct from old.id)
     and not public.is_crm_director() then
    raise exception 'Not authorized to change role or identity'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.crm_profiles_guard_identity() from public;
revoke execute on function public.crm_profiles_guard_identity() from anon;

drop trigger if exists crm_profiles_guard_identity_trg on public.crm_profiles;
create trigger crm_profiles_guard_identity_trg
  before update on public.crm_profiles
  for each row
  execute function public.crm_profiles_guard_identity();

-- Tighten the UPDATE policy: a user may update only their own row AND cannot
-- re-point it at another uid (WITH CHECK). Column-level role protection is the
-- trigger above (RLS WITH CHECK alone cannot compare OLD vs NEW).
drop policy if exists "crm_profiles_update" on public.crm_profiles;
create policy "crm_profiles_update" on public.crm_profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Verification (run manually after apply, as a non-director test user):
--   update crm_profiles set role='director' where id = auth.uid();  -- must FAIL (42501)
--   update crm_profiles set full_name='X'   where id = auth.uid();  -- must SUCCEED
