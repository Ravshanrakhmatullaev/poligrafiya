-- Rollback of 0002 — drops only this feature's table + policies.
-- Safe: frontend cutover to this table is gated/not activated, so dropping it
-- while the email-keyed config.js constants are still the live source has no
-- business impact. No other objects touched.
drop policy if exists erp_employee_profile_admin_write on public.erp_employee_profile;
drop policy if exists erp_employee_profile_select on public.erp_employee_profile;
drop table if exists public.erp_employee_profile;
