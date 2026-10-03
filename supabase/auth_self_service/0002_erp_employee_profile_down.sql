-- Rollback of 0002 — drops only this feature's objects.
-- Safe: the frontend cutover to this table is gated/not activated, so while the
-- email-keyed config.js constants are still the live source, dropping it has no
-- business impact. No other objects touched.
drop function if exists public.get_employee_directory();
drop policy if exists erp_employee_profile_admin_write on public.erp_employee_profile;
drop policy if exists erp_employee_profile_select on public.erp_employee_profile;
drop table if exists public.erp_employee_profile;
