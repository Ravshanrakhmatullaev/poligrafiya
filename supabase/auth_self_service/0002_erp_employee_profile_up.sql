-- ════════════════════════════════════════════════════════════════════════
-- 0002 — UUID-keyed employee config (makes KPI/bonus/display EMAIL-INDEPENDENT)
-- ════════════════════════════════════════════════════════════════════════
-- Purpose: today KPI tier, bonus_50 eligibility and display name live in
-- frontend config.js keyed by EMAIL (KPI_DARAJALAR, BONUS50_EMAILS, XODIMLAR)
-- and in USER_ID_TO_EMAIL. If an employee changes their login email those keys
-- go stale and would require a frontend redeploy. This table makes Auth UUID the
-- stable identity: the frontend reads an employee's config by auth.uid() at login.
--
-- Authorization NEVER depends on contact_email; ERP role stays in crm_profiles.
-- Employees CANNOT edit KPI/bonus/display (owner-managed config): only a director
-- may write. Additive, idempotent, no CASCADE. NOT auto-applied.
--
-- ACTIVATION (separate, after apply + backfill validation): the frontend cutover
-- (getKpi/canUseBonus50/display + employee selectors read this table instead of
-- the email-keyed config.js constants) is gated until this table is live and the
-- backfill counts are validated. Rollback: 0002_erp_employee_profile_down.sql
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.erp_employee_profile (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text not null,
  kpi_daraja        text check (kpi_daraja in ('boshlangich','tajriba','professional')),
  kpi_maqsad        bigint,
  kpi_fiks          bigint,
  bonus_50_eligible boolean not null default false,
  contact_email     text,               -- informational mirror ONLY (never authorization)
  updated_at        timestamptz not null default now()
);

alter table public.erp_employee_profile enable row level security;

-- Read: own row, or any director. (Ordinary employees never get the full directory.)
drop policy if exists erp_employee_profile_select on public.erp_employee_profile;
create policy erp_employee_profile_select on public.erp_employee_profile
  for select to authenticated
  using (auth.uid() = user_id or public.is_crm_director());

-- Write: director only (KPI/bonus/display are owner-managed config; no self-edit).
drop policy if exists erp_employee_profile_admin_write on public.erp_employee_profile;
create policy erp_employee_profile_admin_write on public.erp_employee_profile
  for all to authenticated
  using (public.is_crm_director())
  with check (public.is_crm_director());

-- ── ONE-TIME BACKFILL (server-side seed; emails used only to seed the mirror) ──
-- Run as a privileged/owner step. Safe to re-run (on conflict do nothing on identity).
insert into public.erp_employee_profile (user_id, display_name, kpi_daraja, kpi_maqsad, kpi_fiks, bonus_50_eligible, contact_email) values
  ('2a4548d6-8f63-4473-acce-b6b49710ff8f','Ravshan (Owner)', null, null, null, false, 'ra.ravshan1998@gmail.com'),
  ('4322b1ec-8266-47f0-8e10-15177750b12b','Bayramali',       null, null, null, false, 'ra.ravshan1998+bayramali@gmail.com'),
  ('d7ebd326-e725-49d4-ba21-75b42725f17b','Umar',            null, null, null, false, 'ra.ravshan1998+umar@gmail.com'),
  ('36724f68-e282-498f-a49f-e92a25ab23b8','Parvina',         null, null, null, false, 'ra.ravshan1998+parvina@gmail.com'),
  ('f611587a-eee6-43f6-b246-a88e8a7de10e','Mohlaroy','boshlangich',30000000,1500000,false,'ra.ravshan1998+mohlaroy@gmail.com'),
  ('e7ee02e7-0139-462d-8682-f6603d323d1e','Abror','professional',60000000,1000000,true,'ra.ravshan1998+abror@gmail.com'),
  ('6451a1db-666c-4194-848d-fb94636693db','Umidjon','boshlangich',30000000,1500000,false,'ra.ravshan1998+umidjon@gmail.com'),
  ('b81c0acd-6d7d-4866-8461-394591950bfe','Ulugbek','boshlangich',30000000,1500000,false,'ra.ravshan1998+ulugbek@gmail.com'),
  ('5d170c9b-b524-45a9-bab1-8a6a7f62f903','Zuhriddin',       null, null, null, false, 'ra.ravshan1998+zuhriddin@gmail.com'),
  ('5dab55ac-af76-452d-8bb2-7b10593bc952','Ulugbek (Ishlab chiqarish)', null, null, null, false, 'ra.ravshan1998+jorabek@gmail.com'),
  ('916e5a5b-431e-48dc-9a7c-ba7bc9d45740','Rashidulloh','tajriba',45000000,1800000,true,'ra.ravshan1998+rashidulloh@gmail.com'),
  ('9d23bc5f-1489-4400-b35f-899b99f0f3d2','Ulugbek (Dizayner)', null, null, null, false, 'ra.ravshan1998+ulugbekdesign@gmail.com'),
  ('9333ea8d-06c4-44c4-8e92-54d9f915b250','Begzodbek',       null, null, null, false, 'ra.ravshan1998+begzodbek@gmail.com'),
  ('e3e134df-7d35-4b63-8fb7-6fef9a9598ac','Gaybulloh',       null, null, null, false, 'ra.ravshan1998+gaybulloh@gmail.com'),
  ('940769f7-89d5-4a95-a067-fd3a44e8200b','Oybek',           null, null, null, false, 'ra.ravshan1998+oybek@gmail.com'),
  ('a8b50ac0-79f9-4af5-8598-ef84f026fe7a','UV DTF Sherik',   null, null, null, false, 'adsuzuvdtf@gmail.com')
on conflict (user_id) do nothing;

-- ── BACKFILL VALIDATION (run before activation; all must pass) ──
--   select count(*) from public.erp_employee_profile;                    -- expect 16
--   select count(*) from public.erp_employee_profile where display_name is null or display_name = ''; -- expect 0
--   -- every KPI-tier employee present with fiks/maqsad:
--   select count(*) from public.erp_employee_profile where kpi_daraja is not null and (kpi_fiks is null or kpi_maqsad is null); -- expect 0
--   -- bonus_50 eligible exactly Abror + Rashidulloh:
--   select count(*) from public.erp_employee_profile where bonus_50_eligible; -- expect 2
--   -- no duplicate contact_email:
--   select count(*) - count(distinct contact_email) from public.erp_employee_profile where contact_email is not null; -- expect 0
