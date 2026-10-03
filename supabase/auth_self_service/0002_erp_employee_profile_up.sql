-- ════════════════════════════════════════════════════════════════════════
-- 0002 — UUID-keyed employee config (EMAIL-FREE) + safe name directory
-- ════════════════════════════════════════════════════════════════════════
-- Makes KPI tier, bonus_50 eligibility and display name Auth-UUID-keyed instead
-- of email-keyed, so an employee email change needs no frontend redeploy and no
-- login-email directory is committed anywhere.
--
-- PRIVACY: this migration stores NO login emails. The current employee's email
-- comes only from their own verified Supabase Auth session at runtime. If a
-- server-side contact mirror is ever needed it must be synced by a privileged
-- server mechanism from confirmed Auth data — never committed here.
--
-- DELETE BEHAVIOR: FK is ON DELETE RESTRICT (not CASCADE). Deleting an Auth user
-- must NOT destroy business config needed to display historical records, so the
-- delete is blocked while a profile exists. Employee deactivation uses Auth "ban"
-- (not delete) — see runbook. BACKFILL is an UPSERT (on conflict DO UPDATE) so a
-- re-run reconciles to the intended config and never silently keeps stale values.
--
-- Additive, idempotent, no CASCADE. NOT auto-applied. Validate on a TEMPORARY
-- project first. Rollback: 0002_erp_employee_profile_down.sql
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

-- ── ONE-TIME BACKFILL — UUID-keyed NON-SECRET business config only (NO emails) ──
-- UPSERT so re-running reconciles to the intended config (never silently stale).
insert into public.erp_employee_profile (user_id, display_name, kpi_daraja, kpi_maqsad, kpi_fiks, bonus_50_eligible) values
  ('2a4548d6-8f63-4473-acce-b6b49710ff8f','Ravshan (Owner)',           null, null, null, false),
  ('4322b1ec-8266-47f0-8e10-15177750b12b','Bayramali',                 null, null, null, false),
  ('d7ebd326-e725-49d4-ba21-75b42725f17b','Umar',                      null, null, null, false),
  ('36724f68-e282-498f-a49f-e92a25ab23b8','Parvina',                   null, null, null, false),
  ('f611587a-eee6-43f6-b246-a88e8a7de10e','Mohlaroy',           'boshlangich',30000000,1500000,false),
  ('e7ee02e7-0139-462d-8682-f6603d323d1e','Abror',             'professional',60000000,1000000,true),
  ('6451a1db-666c-4194-848d-fb94636693db','Umidjon',            'boshlangich',30000000,1500000,false),
  ('b81c0acd-6d7d-4866-8461-394591950bfe','Ulugbek',            'boshlangich',30000000,1500000,false),
  ('5d170c9b-b524-45a9-bab1-8a6a7f62f903','Zuhriddin',                 null, null, null, false),
  ('5dab55ac-af76-452d-8bb2-7b10593bc952','Ulugbek (Ishlab chiqarish)',null, null, null, false),
  ('916e5a5b-431e-48dc-9a7c-ba7bc9d45740','Rashidulloh',           'tajriba',45000000,1800000,true),
  ('9d23bc5f-1489-4400-b35f-899b99f0f3d2','Ulugbek (Dizayner)',        null, null, null, false),
  ('9333ea8d-06c4-44c4-8e92-54d9f915b250','Begzodbek',                 null, null, null, false),
  ('e3e134df-7d35-4b63-8fb7-6fef9a9598ac','Gaybulloh',                 null, null, null, false),
  ('940769f7-89d5-4a95-a067-fd3a44e8200b','Oybek',                     null, null, null, false),
  ('a8b50ac0-79f9-4af5-8598-ef84f026fe7a','UV DTF Sherik',             null, null, null, false)
on conflict (user_id) do update set
  display_name      = excluded.display_name,
  kpi_daraja        = excluded.kpi_daraja,
  kpi_maqsad        = excluded.kpi_maqsad,
  kpi_fiks          = excluded.kpi_fiks,
  bonus_50_eligible = excluded.bonus_50_eligible,
  updated_at        = now();

-- ── VALIDATION (run before activation) ──
--   select count(*) from public.erp_employee_profile;                                  -- expect 16
--   select count(*) from public.erp_employee_profile where display_name is null or display_name=''; -- 0
--   select count(*) from public.erp_employee_profile where kpi_daraja is not null and (kpi_fiks is null or kpi_maqsad is null); -- 0
--   select count(*) from public.erp_employee_profile where bonus_50_eligible;          -- expect 2
--   select count(*) - count(distinct user_id) from public.erp_employee_profile;        -- 0
