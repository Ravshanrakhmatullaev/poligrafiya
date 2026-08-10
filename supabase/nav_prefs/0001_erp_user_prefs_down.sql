-- Reverse of 0001_erp_user_prefs_up.sql. Drops only this feature's own objects.
drop policy if exists erp_user_prefs_self on public.erp_user_prefs;
drop table if exists public.erp_user_prefs;
