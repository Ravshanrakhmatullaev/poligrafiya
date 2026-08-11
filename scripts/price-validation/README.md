# PRICE temporary Supabase validation

This workflow validates the PRICE migration against a new, disposable Supabase
project. It must never be pointed at the ERP production/shared project.

## Required temporary-project values

Provide these values only from the disposable project:

- `PRICE_VALIDATION_SUPABASE_URL` — Project URL, for example
  `https://temporaryref.supabase.co`.
- `PRICE_VALIDATION_ANON_KEY` — temporary project's anon/publishable key. It is
  used for password login and PostgREST calls made with each test user's JWT.
- `PRICE_VALIDATION_SERVICE_ROLE_KEY` — temporary project's service-role key.
  It is required only to create and delete isolated Auth test users. It is
  never written to disk or printed.
- `PRICE_VALIDATION_DB_URL` — PostgreSQL connection string for the temporary
  project, including its temporary database password. Prefer the direct
  connection; the session pooler is acceptable when direct IPv6 is unavailable.
- `PRICE_VALIDATION_EXPECTED_PROJECT_REF` — the temporary project ref shown in
  the Supabase dashboard URL/settings.

Never paste production keys into this workflow.

## Create the temporary project

1. In Supabase, create a new project dedicated to `PRICE validation`.
2. Use a fresh database password and do not connect the project to production.
3. Do not copy production users or production data.
4. From **Project Settings → API**, copy the Project URL, anon/publishable key,
   and service-role key.
5. From **Connect → Direct connection** (or Session pooler), copy the PostgreSQL
   connection string and insert the temporary database password.
6. Install PostgreSQL client tools so `psql --version` works.
7. Confirm the project's `public` schema is empty. The runner also verifies this
   and refuses to continue otherwise.

## Fail-closed guards

The runner refuses to run unless all of these are true:

- branch is `feature/price-module`;
- `PRICE_VALIDATION_ALLOW_TEMP_DB=YES`;
- `PRICE_VALIDATION_CONFIRM_EPHEMERAL=YES`;
- `PRICE_VALIDATION_ALLOW_DESTRUCTIVE_ROLLBACK=YES`;
- URL project ref equals `PRICE_VALIDATION_EXPECTED_PROJECT_REF`;
- DB hostname/username identifies the same project ref;
- neither URL nor DB connection identifies production ref
  `jxxmbgmbaqausqunfyna`;
- the temporary `public` schema contains no user tables;
- no `pricing_*` or `crm_profiles` objects already exist;
- `psql` is available.

The production hostname and project ref are hard-coded in the denylist. There
is no override flag for that denylist.

## Run

Set environment variables in the same PowerShell process. Do not save secrets
in a tracked `.env` file.

```powershell
$env:PRICE_VALIDATION_SUPABASE_URL='https://TEMP_PROJECT_REF.supabase.co'
$env:PRICE_VALIDATION_ANON_KEY='TEMP_ANON_OR_PUBLISHABLE_KEY'
$env:PRICE_VALIDATION_SERVICE_ROLE_KEY='TEMP_SERVICE_ROLE_KEY'
$env:PRICE_VALIDATION_DB_URL='postgresql://postgres:TEMP_PASSWORD@db.TEMP_PROJECT_REF.supabase.co:5432/postgres'
$env:PRICE_VALIDATION_EXPECTED_PROJECT_REF='TEMP_PROJECT_REF'
$env:PRICE_VALIDATION_ALLOW_TEMP_DB='YES'
$env:PRICE_VALIDATION_CONFIRM_EPHEMERAL='YES'
$env:PRICE_VALIDATION_ALLOW_DESTRUCTIVE_ROLLBACK='YES'

node scripts/price-validation/validate-temp-supabase.mjs
```

The script applies the PRICE migration, creates four isolated Auth users,
exercises RLS/RPC/history through real JWT sessions, audits PostgreSQL metadata,
proves rollback failure with an external dependency, then performs the real
rollback and verifies the unrelated sentinel survives. On successful completion
it deletes the temporary users and the validation-only prerequisite objects.

The project remains disposable. Delete it from the Supabase dashboard after
capturing the validation report.

## What is intentionally not performed

- no production migration or rollback;
- no production user/data copy;
- no calculator integration;
- no Telegram import;
- no merge or deployment;
- no changes to the PRICE business implementation.
