-- ════════════════════════════════════════════════════════════════════════
-- 0002 — SCHEMA ONLY: UUID-keyed employee config (EMAIL-FREE) + name directory
-- ════════════════════════════════════════════════════════════════════════
-- This migration creates the table, constraints, RLS, explicit grants and the
-- email-free directory function. It contains NO production UUID seed — the
-- production business configuration is applied separately and transactionally
-- by 0003_erp_employee_seed_up.sql (which first verifies every UUID exists in
-- auth.users). Keeping schema and seed apart lets the validation runner exercise
-- this schema against its OWN disposable temp users without ever touching the
-- production identity set.
--
-- PRIVACY: stores NO login emails. The current employee's email comes only from
-- their own verified Supabase Auth session at runtime. A server-side contact
-- mirror, if ever needed, must be synced by a privileged server mechanism from
-- confirmed Auth data — never committed here.
--
-- DELETE BEHAVIOR: FK is ON DELETE RESTRICT (not CASCADE). Deleting an Auth user
-- must NOT destroy business config needed to display historical records, so the
-- delete is blocked while a profile exists. Deactivation uses Auth "ban".
--
-- Additive, idempotent, no CASCADE. NOT auto-applied. Validate on a TEMPORARY
-- project first (validate_auth_self_service.mjs). Rollback: 0002_..._down.sql
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.erp_employee_profile (
  user_id           uuid primary key references auth.users(id) on delete restrict,
  display_name      text not null,
  kpi_daraja        text check (kpi_daraja in ('boshlangich','tajriba','professional')),
  kpi_maqsad        bigint,
  kpi_fiks          bigint,
  bonus_50_eligible boolean not null default false,
  updated_at        timestamptz not null default now()
  -- NO contact_email / login email column (privacy).
);

alter table public.erp_employee_profile enable row level security;

-- Explicit grants (no reliance on default Supabase grants):
revoke all on public.erp_employee_profile from public;
revoke all on public.erp_employee_profile from anon;
grant select on public.erp_employee_profile to authenticated;             -- rows filtered by RLS below
grant insert, update, delete on public.erp_employee_profile to authenticated; -- gated to directors by RLS WITH CHECK

-- Read: own row, or any director.
drop policy if exists erp_employee_profile_select on public.erp_employee_profile;
create policy erp_employee_profile_select on public.erp_employee_profile
  for select to authenticated
  using (auth.uid() = user_id or public.is_crm_director());

-- Write: director only (KPI/bonus/display are owner-managed; employees never edit).
drop policy if exists erp_employee_profile_admin_write on public.erp_employee_profile;
create policy erp_employee_profile_admin_write on public.erp_employee_profile
  for all to authenticated
  using (public.is_crm_director())
  with check (public.is_crm_director());

-- ── SAFE NAME DIRECTORY for employee selectors — NO login email ──
-- SECURITY DEFINER returns only (user_id, display_name) to any authenticated
-- user, so selectors work without exposing emails or KPI/bonus. Fixed search_path;
-- revoked from public/anon; explicit authenticated grant.
create or replace function public.get_employee_directory()
  returns table (user_id uuid, display_name text)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select p.user_id, p.display_name
  from public.erp_employee_profile p
  order by p.display_name;
$$;
revoke execute on function public.get_employee_directory() from public;
revoke execute on function public.get_employee_directory() from anon;
grant  execute on function public.get_employee_directory() to authenticated;

-- No seed here. Production config: 0003_erp_employee_seed_up.sql
