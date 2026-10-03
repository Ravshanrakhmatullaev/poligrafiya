# Auth self-service — Owner runbook & activation checklist

This PR ships the employee self-service **account** page (`Profil va xavfsizlik`).
**Password change is active** (no external config). **Email change and password
recovery are feature-gated OFF** (`SELF_SERVICE.email/recovery=false` in
`js/panels/account.js`) until Supabase Auth Dashboard config + SMTP exist. Nothing
half-enabled is shipped.

Automation here has **no privileged Supabase access** (publishable key only; no
service-role, no CLI, no staging). So the steps below are owner-executed, and the
corrected migrations **must pass temporary-project runtime validation before any
production apply** (`supabase/auth_self_service/validate_auth_self_service.mjs`).

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

## 1. Identity-independence migration — SCHEMA + SEED split
Schema (`0002_erp_employee_profile_up.sql`) is additive, **email-free**, UUID-keyed
(display name, KPI tier/target/fiks, bonus eligibility; **no login email**), with
explicit grants (revoke public/anon; director-only writes via RLS), FK `on delete
restrict` (deleting an Auth user cannot destroy historical config), and
`get_employee_directory()` (SECURITY DEFINER, fixed search_path, authenticated-only)
returning **only `user_id` + `display_name`**. It contains **no production UUID seed**.

Production config is applied separately by `0003_erp_employee_seed_up.sql` — a single
**transaction** that verifies **every seeded UUID already exists in `auth.users`** and
aborts atomically if any is absent, UPSERTs the config (re-run reconciles; never
silently stale), then validates the seeded set landed (16 rows, 2 bonus-eligible, no
null/empty names). Rollbacks: `0002_..._down.sql` (drops schema), `0003_..._down.sql`
(removes only the seeded rows).

## 2. Temporary-project runtime validation (REQUIRED before production)
The runner is **Node (cross-platform, Windows-friendly)**:
`supabase/auth_self_service/validate_auth_self_service.mjs`, with a PowerShell wrapper
`run-validation.ps1`. It **fails closed**: requires `AUTH_SS_TEMP=YES`, rejects the
production ref/hostname, and requires the `DATABASE_URL` project ref to match
`SUPABASE_URL`. It applies the base fixture if the temp project lacks the CRM schema,
applies **0001 + 0002** (never 0003), creates **real disposable Auth users via the
Admin API** (captures their UUIDs; random `@example.com` emails + random passwords,
never printed), seeds temp `crm_profiles` + `erp_employee_profile`, then asserts:
employee cannot change own role/id/created_at; can change an approved field; cross-user
update affects 0 rows and leaves the target unchanged; anon denied; owner/admin
provisioning allowed; a **real authenticated REST (JWT) session** is rejected on role
and accepted on full_name; own private row selectable, another's KPI/bonus not; directory
returns UUID+name only with no email; anon directory denied; employee write denied,
director write allowed; rollback drops only feature objects while `crm_profiles`/
`crm_contacts` (and its row) survive. It deletes **only the users it created**, and
exits 0 only if **zero** checks failed. Guard/assertion unit tests (no credentials):
`node supabase/auth_self_service/validate_lib.test.mjs`.

**Do not apply 0001/0002/0003 to production until this runner has executed against a
temporary project with zero failures and exit code 0.**

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
