# Auth self-service — Owner runbook & activation checklist

This PR ships the employee self-service **account** page (`Profil va xavfsizlik`).
**Password change is active** (no external config). **Email change and password
recovery are feature-gated OFF** (`SELF_SERVICE.email/recovery=false` in
`js/panels/account.js`) until Supabase Auth Dashboard config + SMTP exist. Nothing
half-enabled is shipped.

Automation here has **no privileged Supabase access** (publishable key only; no
service-role, no CLI, no staging). So the steps below are owner-executed, and the
corrected migrations **must pass temporary-project runtime validation before any
production apply** (`supabase/auth_self_service/validate_auth_self_service.sh`).

## 0. CRITICAL — security fix (apply after temp validation)
Pre-existing live vuln: `crm_profiles_update` used `using(auth.uid()=id)` with no
`with check`/column guard → an employee could `set role='director'` on their own row.
Corrected fix = **least-privilege column grants** (no trigger):
`0001_crm_profiles_role_guard_up.sql` revokes table-wide UPDATE from `authenticated`,
grants UPDATE only on `full_name, telegram_id, phone`, and tightens the policy with
`with check`. `role`/`id` are not grantable to employees → self-escalation denied at
the column level, while `service_role`/`postgres` (SQL Editor) keep full privileges
so **owner/admin role maintenance still works** (no `auth.uid()` dependency).
Rollback: `0001_..._down.sql`.

## 1. Identity-independence migration
`0002_erp_employee_profile_up.sql` — additive, **email-free** UUID-keyed table
(display name, KPI tier/target/fiks, bonus eligibility; **no login email**), explicit
grants (revoke public/anon; director-only writes via RLS), FK `on delete restrict`
(deleting an Auth user cannot destroy historical business config), and an UPSERT
backfill (re-run reconciles config; never silently stale). Also creates
`get_employee_directory()` (SECURITY DEFINER, fixed search_path, authenticated-only)
returning **only `user_id` + `display_name`** for selectors — no emails.
Validation queries at the file bottom (count 16, bonus_50=2, no nulls/dups).
Rollback: `0002_..._down.sql`.

## 2. Temporary-project runtime validation (REQUIRED before production)
Run `supabase/auth_self_service/validate_auth_self_service.sh` against a **temporary**
Supabase/Postgres project (it refuses the production project and requires
`AUTH_SS_TEMP=1` + a non-production `DATABASE_URL`). It applies 0001+0002, creates
temp director/production/designer/unauthorized users, and asserts: employee role/id
change denied; safe-field change allowed; cross-user update denied; anon denied;
service/admin role provisioning allowed; directory exposes names but no email;
rollback clean; unrelated tables survive. Do not apply to production without this
evidence.

## 3. Supabase Auth Dashboard (before activating email/recovery)
Site URL `https://ravshanrakhmatullaev.github.io/poligrafiya/`; redirect allow-list =
that URL + `http://localhost:4173/` + `http://127.0.0.1:4173/`; secure email change ON;
email confirmations ON; recovery redirect = Site URL; **SMTP** configured + verified;
**public signup DISABLED**; password policy ≥ 8. (First email change needs Owner
confirmation on the old `+alias` + employee confirmation on the new address — UI explains this.)

## 4. Activation (after 0–3 green)
Flip `SELF_SERVICE.email/recovery=true` in `js/panels/account.js` (+ cache-bump) and
do the **identity cutover**: switch `getKpi`/`canUseBonus50`/display + selectors to read
`erp_employee_profile` / `get_employee_directory()` instead of the email-keyed
`config.js` constants, then stop shipping `USER_ID_TO_EMAIL`/`XODIMLAR`. This removes
the public email directory and makes email changes require no redeploy. Deferred so it
lands atomically with 0002 live + validated; KPI/bonus/payroll results stay identical.

## Rollout safety & rollback
- Do not mass-change emails; old `+alias` logins keep working until each employee
  voluntarily completes a verified change; one employee's change never affects others.
- Code rollback: `git revert -m 1 <merge_sha>`. DB: `0002_down` then `0001_down`
  (re-fix 0001 promptly — it closes a real vuln). Lost email access: Owner resets
  email/password for that UUID via Auth admin; UUID/role/history unchanged.
