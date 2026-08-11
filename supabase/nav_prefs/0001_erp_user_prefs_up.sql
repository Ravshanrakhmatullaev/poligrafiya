-- ERP per-user UI preferences (main-nav order + calculator-tab order).
-- ADDITIVE, isolated table. Per-user RLS: a user reads/writes ONLY their own row,
-- so one employee's ordering can never affect another's.
-- Convention matches sibling feature migrations (pricing_phase1, phase2_status):
-- feature folder with _up / _down pair. NOT applied automatically (no deploy here).
-- The ERP client (js/nav_prefs.js) degrades gracefully to localStorage if absent.

create table if not exists public.erp_user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nav_order  jsonb,   -- array of nav-button ids, e.g. ["nb-dashboard","nb-kalk", ...]
  calc_order jsonb,   -- array of calculator tab keys, e.g. ["sigim","banner","orakal", ...]
  updated_at timestamptz not null default now(),
  -- Only JSON arrays (or null) are meaningful order lists; reject anything else.
  constraint erp_user_prefs_nav_order_arr  check (nav_order  is null or jsonb_typeof(nav_order)  = 'array'),
  constraint erp_user_prefs_calc_order_arr check (calc_order is null or jsonb_typeof(calc_order) = 'array')
);

alter table public.erp_user_prefs enable row level security;

-- Do not depend on project-level default privileges. Anonymous clients have no
-- table access; authenticated clients still pass through the self-scoped RLS
-- policy below for every read/write operation.
revoke all on table public.erp_user_prefs from anon, authenticated;
grant select, insert, update, delete on table public.erp_user_prefs to authenticated;

-- Single self-scoped policy for all operations (select/insert/update/delete).
-- Required for upsert-with-RLS: on-conflict update needs select+update on own row.
drop policy if exists erp_user_prefs_self on public.erp_user_prefs;
create policy erp_user_prefs_self
  on public.erp_user_prefs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
