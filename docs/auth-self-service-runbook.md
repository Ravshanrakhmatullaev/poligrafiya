# Auth self-service — Owner runbook & activation checklist

This PR ships the employee self-service **account** page (`Profil va xavfsizlik`).
**Password change is active** (needs no external config). **Email change and
password recovery are feature-gated OFF** (`SELF_SERVICE.email/recovery=false` in
`js/panels/account.js`) because they require Supabase Auth Dashboard configuration
+ SMTP. Nothing half-enabled or insecure is shipped.

Automated tooling here has **no privileged Supabase access** (publishable key only;
no service-role, no CLI, no staging project), so the DB migrations and Dashboard
settings below are **owner-executed**. Do them in order.

## 0. CRITICAL — apply the security fix first (independent of self-service)
A pre-existing live vulnerability lets any employee self-promote their role:
`crm_profiles_update` policy had `using (auth.uid()=id)` with no `with check`/column guard.
**Apply now**, regardless of the rest:
- `supabase/auth_self_service/0001_crm_profiles_role_guard_up.sql` (trigger blocks role/id change by non-directors; policy gains `with check`).
- Verify (as a non-director test user): `update crm_profiles set role='director' where id=auth.uid();` must FAIL (42501); `update ... set full_name='X' ...` must SUCCEED.
- Rollback: `0001_..._down.sql`.

## 1. Identity-independence migration (before activating email change)
- Apply `0002_erp_employee_profile_up.sql` (UUID-keyed display/KPI/bonus + contact-email mirror; director-only writes; backfill seed included).
- Run the backfill-validation queries at the bottom of that file (count=16, no null display_name, bonus_50 eligible=2, no duplicate contact_email). **Do not activate until these pass.**
- Rollback: `0002_..._down.sql`.

## 2. Supabase Auth Dashboard settings (production project `jxxmbgmbaqausqunfyna`)
Required before flipping email/recovery ON (do **not** print secrets):
- **Site URL:** `https://ravshanrakhmatullaev.github.io/poligrafiya/`
- **Redirect allow-list (exact):**
  - `https://ravshanrakhmatullaev.github.io/poligrafiya/`
  - local tests: `http://localhost:4173/` and `http://127.0.0.1:4173/`
- **Secure email change (double confirmation): ON** (confirm on both old + new addresses).
- **Email confirmations: ON.**
- **Password recovery redirect:** the Site URL above.
- **SMTP:** configure a real sender and verify delivery (default Supabase SMTP is rate-limited and not for production).
- **Rate limits:** keep sane defaults for email/OTP.
- **Password policy:** ≥ 8 chars (matches the client `PASSWORD_MIN`).
- **Public signups: DISABLED** (no self-registration).

> Note: current `+alias` logins route to the Owner's Gmail. The first email change
> therefore needs Owner confirmation on the old alias + the employee's confirmation
> on their new real address. The UI explains this.

## 3. Activation (small follow-up change, after 1 + 2 are green)
- Flip `SELF_SERVICE.email = true` and `SELF_SERVICE.recovery = true` in `js/panels/account.js` (+ cache-bump) and redeploy.
- **Frontend identity cutover (deferred, do with activation):** switch `getKpi`/`canUseBonus50`/display + employee selectors to read `erp_employee_profile` by `auth.uid()` instead of the email-keyed `config.js` constants, and stop shipping `USER_ID_TO_EMAIL`/`XODIMLAR` as a browsable org directory. This is what makes an employee email change require **no frontend redeploy** and removes the public email directory. (Not done in this PR because it must land atomically with 0002 being live + validated; business results — KPI/bonus/payroll — must stay identical.)

## Rollout safety
- Do **not** mass-change employee emails. Old alias logins keep working until each
  employee voluntarily completes a verified change. Changing one employee never
  affects another (UUID identity; role untouched).
- Do not send test recovery/change emails to real employees without approval.

## Rollback
- Code: revert the PR merge commit (`git revert -m 1 <merge_sha>`), Pages redeploys prior commit.
- DB: `0002_..._down.sql`, then (only if the guard misbehaves) `0001_..._down.sql` — but re-fix 0001 promptly, it closes a real vulnerability.
- Employee lost email access: Owner resets via Supabase Auth admin (set email/password for that UUID); UUID/role/history unchanged.
