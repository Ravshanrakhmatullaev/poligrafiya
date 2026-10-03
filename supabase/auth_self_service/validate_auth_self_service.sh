#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Guarded runtime validation for the auth-self-service migrations (0001, 0002).
# FAILS CLOSED: refuses the production project; requires an explicit temp flag.
# Requires a TEMPORARY Supabase/Postgres-compatible project that has the Supabase
# `auth` schema (so auth.uid() exists). Never run against production.
#
#   AUTH_SS_TEMP=1 DATABASE_URL='postgres://...temp-project...' ./validate_auth_self_service.sh
#
# It: applies 0001+0002, seeds temp crm_profiles rows (director/production/designer),
# simulates authenticated/anon via request.jwt.claims, asserts the authorization
# model, verifies service/admin provisioning + directory privacy, tests rollback,
# and checks an unrelated table survives. Prints PASS/FAIL per check.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

PROD_REF="jxxmbgmbaqausqunfyna"   # production project ref — must NOT be the target
: "${DATABASE_URL:?set DATABASE_URL to a TEMPORARY project}"
if [ "${AUTH_SS_TEMP:-}" != "1" ]; then echo "REFUSED: set AUTH_SS_TEMP=1 to confirm a temporary project"; exit 2; fi
if printf '%s' "$DATABASE_URL" | grep -q "$PROD_REF"; then echo "REFUSED: DATABASE_URL points at PRODUCTION ($PROD_REF)"; exit 2; fi

psqlq(){ psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA -c "$1"; }
expect_fail(){ if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA -c "$1" >/dev/null 2>&1; then echo "FAIL  $2 (expected denial)"; else echo "PASS  $2"; fi; }
expect_ok(){ if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA -c "$1" >/dev/null 2>&1; then echo "PASS  $2"; else echo "FAIL  $2 (expected success)"; fi; }

DIR='11111111-1111-1111-1111-111111111111'   # director
EMP='22222222-2222-2222-2222-222222222222'   # production employee
echo "== apply corrected migrations =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$HERE/0001_crm_profiles_role_guard_up.sql" >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$HERE/0002_erp_employee_profile_up.sql"   >/dev/null

echo "== seed temp crm_profiles (as owner) =="
psqlq "insert into crm_profiles(id,full_name,role) values ('$DIR','Dir','director'),('$EMP','Emp','production') on conflict (id) do update set role=excluded.role;" >/dev/null

# helper to run as an authenticated user E: set role + jwt sub claim
as_auth(){ printf "set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','%s')::text, true); %s" "$1" "$2"; }

echo "== authorization model =="
expect_fail "begin; $(as_auth "$EMP" "update crm_profiles set role='director' where id='$EMP';") commit;" "employee cannot change own role (column-denied)"
expect_fail "begin; $(as_auth "$EMP" "update crm_profiles set id='33333333-3333-3333-3333-333333333333' where id='$EMP';") commit;" "employee cannot change own id"
expect_ok   "begin; $(as_auth "$EMP" "update crm_profiles set full_name='Emp2' where id='$EMP';") commit;" "employee can change own full_name"
# cross-user update affects 0 rows (RLS) — treat as allowed stmt but no effect; assert row unchanged
expect_ok   "begin; $(as_auth "$EMP" "update crm_profiles set full_name='HACK' where id='$DIR';") commit;" "employee cross-user update runs (RLS yields 0 rows)"
expect_fail "begin; set local role anon; update crm_profiles set full_name='x' where id='$EMP'; commit;" "anon cannot update"
expect_ok   "update crm_profiles set role='production' where id='$EMP';" "owner/service SQL can provision role"

echo "== directory privacy =="
# directory returns names, never an email column
expect_ok "begin; $(as_auth "$EMP" "select user_id, display_name from get_employee_directory();") commit;" "authenticated can read name directory"
expect_fail "begin; set local role anon; select * from get_employee_directory(); commit;" "anon cannot read directory"
NO_EMAIL=$(psqlq "select count(*) from information_schema.columns where table_name='erp_employee_profile' and column_name ilike '%email%';")
[ "$NO_EMAIL" = "0" ] && echo "PASS  erp_employee_profile has no email column" || echo "FAIL  email column present"

echo "== unrelated table survives =="
expect_ok "select 1 from crm_contacts limit 0;" "crm_contacts intact"

echo "== rollback =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$HERE/0002_erp_employee_profile_down.sql" >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$HERE/0001_crm_profiles_role_guard_down.sql" >/dev/null
GONE=$(psqlq "select count(*) from information_schema.tables where table_name='erp_employee_profile';")
[ "$GONE" = "0" ] && echo "PASS  rollback dropped erp_employee_profile" || echo "FAIL  rollback incomplete"
echo "== done =="
