#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// validate_auth_self_service.mjs — GUARDED runtime validation for the auth
// self-service migrations (0001 role guard, 0002 schema) against a FRESH
// TEMPORARY Supabase project. Cross-platform (Windows/macOS/Linux, Node ≥ 18).
//
// FAILS CLOSED: refuses production (ref/hostname), requires AUTH_SS_TEMP=YES,
// and requires the DB connection to match the supplied Supabase project.
//
// It: (1) guards the target, (2) applies the base fixture if the temp project
// lacks the CRM schema, (3) applies 0001 + 0002, (4) creates REAL disposable
// Auth users via the Admin API and captures their UUIDs, (5) seeds temp
// crm_profiles + erp_employee_profile rows with those UUIDs, (6) runs the
// authorization/privacy/rollback checks (SQL role+JWT-claims simulation plus a
// real authenticated REST session), (7) rolls back, (8) deletes ONLY the users
// it created. Exit 0 iff zero failures, else 1. It NEVER runs 0003 and never
// uses production UUIDs/emails/passwords. Secrets are never printed.
//
// Required env (see run-validation.ps1 for a Windows wrapper):
//   AUTH_SS_TEMP=YES
//   SUPABASE_URL=https://<temp-ref>.supabase.co
//   SUPABASE_ANON_KEY=<temp anon/publishable key>
//   SUPABASE_SERVICE_ROLE_KEY=<temp service-role key>
//   DATABASE_URL=postgres://postgres:<pw>@db.<temp-ref>.supabase.co:5432/postgres
//
// Install deps once in this folder's package context:  npm i pg @supabase/supabase-js
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { guardTarget, makeChecker } from './validate_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const readSql = (f) => readFileSync(join(HERE, f), 'utf8');

// ── 0) GUARD (fail closed) ────────────────────────────────────────────────
let target;
try {
  target = guardTarget({
    tempFlag: process.env.AUTH_SS_TEMP,
    supabaseUrl: process.env.SUPABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
  });
} catch (e) {
  console.error(String(e.message || e));
  process.exit(2);
}
console.log(`== target accepted: temporary project ref ${target.ref} ==`);

// ── deps (clear message if absent) ─────────────────────────────────────────
let Pg, createClient;
try { ({ default: Pg } = await import('pg')); }
catch { console.error('MISSING DEP: run `npm i pg @supabase/supabase-js` in supabase/auth_self_service'); process.exit(2); }
try { ({ createClient } = await import('@supabase/supabase-js')); }
catch { console.error('MISSING DEP: run `npm i pg @supabase/supabase-js` in supabase/auth_self_service'); process.exit(2); }

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pool = new Pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const C = makeChecker();

const owner = (sql, params) => pool.query(sql, params);
// Run `sql` as an authenticated user (role + JWT sub claim); auto-commit unless rollback requested.
async function asAuth(uuid, sql, params, { commit = true } = {}) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: uuid, role: 'authenticated' })]);
    const r = await c.query(sql, params);
    await c.query(commit ? 'commit' : 'rollback');
    return r;
  } catch (e) { try { await c.query('rollback'); } catch {} throw e; }
  finally { c.release(); }
}
async function asAnon(sql, params) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role anon');
    const r = await c.query(sql, params);
    await c.query('commit');
    return r;
  } catch (e) { try { await c.query('rollback'); } catch {} throw e; }
  finally { c.release(); }
}

const createdUsers = [];     // only these get deleted
async function makeUser(tag) {
  const email = `ss-temp-${tag}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `T${randomUUID()}A1!`;   // random, never logged
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}) failed: ${error.message}`);
  const id = data.user.id;
  createdUsers.push(id);
  return { id, email, password };
}

let exitCode = 1;
try {
  // ── 1) base schema: verify or apply fixture ──
  const { rows: [{ exists: hasBase }] } = await owner(
    "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='crm_profiles') as exists");
  if (!hasBase) { console.log('== base CRM schema absent → applying temp_fixture.sql =='); await owner(readSql('temp_fixture.sql')); }
  else { console.log('== base CRM schema present → ensuring fixture objects =='); await owner(readSql('temp_fixture.sql')); }

  // ── 2) apply corrected migrations (NOT 0003) ──
  console.log('== applying 0001 + 0002 ==');
  await owner(readSql('0001_crm_profiles_role_guard_up.sql'));
  await owner(readSql('0002_erp_employee_profile_up.sql'));

  // ── 3) real disposable Auth users ──
  console.log('== creating disposable Auth users ==');
  const dir = await makeUser('dir');
  const empA = await makeUser('empa');
  const empB = await makeUser('empb');
  C.check('three temp Auth users created with real UUIDs',
    [dir, empA, empB].every(u => /^[0-9a-f-]{36}$/.test(u.id)));

  // ── 4) seed temp crm_profiles + erp_employee_profile (owner) ──
  await owner(`insert into public.crm_profiles(id,full_name,role) values
      ($1,'TmpDir','director'),($2,'TmpEmpA','production'),($3,'TmpEmpB','designer')
      on conflict (id) do update set role=excluded.role, full_name=excluded.full_name`,
      [dir.id, empA.id, empB.id]);
  await owner(`insert into public.erp_employee_profile(user_id,display_name,kpi_daraja,kpi_maqsad,kpi_fiks,bonus_50_eligible) values
      ($1,'TmpDir',null,null,null,false),
      ($2,'TmpEmpA','professional',60000000,1000000,true),
      ($3,'TmpEmpB','tajriba',45000000,1800000,true)
      on conflict (user_id) do update set display_name=excluded.display_name`,
      [dir.id, empA.id, empB.id]);

  // ── 5) authorization model ──
  console.log('== authorization model ==');
  await C.expectThrow('employee cannot change own role (column-denied)',
    () => asAuth(empA.id, "update public.crm_profiles set role='director' where id=$1", [empA.id]));
  await C.expectThrow('employee cannot change own id',
    () => asAuth(empA.id, "update public.crm_profiles set id=$1 where id=$2", [randomUUID(), empA.id]));
  await C.expectThrow('employee cannot change own created_at',
    () => asAuth(empA.id, "update public.crm_profiles set created_at=now() where id=$1", [empA.id]));
  await C.expectOk('employee can change own full_name',
    () => asAuth(empA.id, "update public.crm_profiles set full_name='EmpA2' where id=$1", [empA.id]));

  // cross-user: must affect 0 rows AND leave the target row unchanged
  const before = (await owner('select full_name from public.crm_profiles where id=$1', [dir.id])).rows[0].full_name;
  const x = await asAuth(empA.id, "update public.crm_profiles set full_name='HACK' where id=$1", [dir.id]);
  const after = (await owner('select full_name from public.crm_profiles where id=$1', [dir.id])).rows[0].full_name;
  C.check('employee cross-user update affects 0 rows', x.rowCount === 0, `rowCount=${x.rowCount}`);
  C.check('employee cross-user target row unchanged', before === after && after === 'TmpDir', `before=${before} after=${after}`);

  await C.expectThrow('anon cannot update crm_profiles',
    () => asAnon("update public.crm_profiles set full_name='x' where id=$1", [empA.id]));
  await C.expectOk('owner/admin SQL can provision role',
    () => owner("update public.crm_profiles set role='production' where id=$1", [empA.id]));

  // ── 6) real authenticated REST (JWT) session ──
  console.log('== real authenticated REST session (JWT) ==');
  const sb = createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: siErr } = await sb.auth.signInWithPassword({ email: empA.email, password: empA.password });
  if (siErr) C.check('REST sign-in as temp employee', false, siErr.message);
  else {
    C.check('REST sign-in as temp employee', true);
    const { error: roleErr } = await sb.from('crm_profiles').update({ role: 'director' }).eq('id', empA.id);
    C.check('REST: employee role update rejected', !!roleErr, roleErr ? '' : 'no error returned');
    const { error: nameErr } = await sb.from('crm_profiles').update({ full_name: 'RestOk' }).eq('id', empA.id);
    C.check('REST: employee full_name update accepted', !nameErr, nameErr ? nameErr.message : '');
    await sb.auth.signOut();
  }

  // ── 7) private data + directory privacy ──
  console.log('== private data visibility + directory privacy ==');
  const ownRow = await asAuth(empA.id, 'select * from public.erp_employee_profile where user_id=$1', [empA.id]);
  C.check('employee can select own erp profile', ownRow.rowCount === 1, `rows=${ownRow.rowCount}`);
  const otherRow = await asAuth(empA.id, 'select * from public.erp_employee_profile where user_id=$1', [empB.id]);
  C.check("employee cannot select another's private KPI/bonus row", otherRow.rowCount === 0, `rows=${otherRow.rowCount}`);

  const d = await asAuth(empA.id, 'select * from public.get_employee_directory()');
  const dirCols = d.fields.map(f => f.name);
  C.check('directory returns only user_id + display_name', dirCols.length === 2 && dirCols.includes('user_id') && dirCols.includes('display_name'), dirCols.join(','));
  C.check('directory has no email column', !dirCols.some(c => /email/i.test(c)));
  C.check('directory values contain no email-shaped string',
    !d.rows.some(r => Object.values(r).some(v => typeof v === 'string' && v.includes('@'))));
  C.check('directory visible to authenticated employee', d.rowCount >= 3, `rows=${d.rowCount}`);
  await C.expectThrow('anon cannot call directory',
    () => asAnon('select * from public.get_employee_directory()'));

  // ── 8) write enforcement on erp_employee_profile ──
  await C.expectThrow('employee insert into erp_employee_profile denied (RLS with check)',
    () => asAuth(empA.id, "insert into public.erp_employee_profile(user_id,display_name) values ($1,'X')", [randomUUID()]));
  const empUpd = await asAuth(empA.id, "update public.erp_employee_profile set display_name='X' where user_id=$1", [empB.id]);
  C.check('employee update of erp config affects 0 rows (director-only)', empUpd.rowCount === 0, `rowCount=${empUpd.rowCount}`);
  await C.expectOk('director can write erp config',
    () => asAuth(dir.id, "update public.erp_employee_profile set display_name='DirEdit' where user_id=$1", [empB.id]));

  // ── 9) rollback removes only feature objects; unrelated survive ──
  console.log('== rollback ==');
  const contactBefore = (await owner("select count(*) from public.crm_contacts where name='keep-me-sentinel'")).rows[0].count;
  // 0003 was never applied; roll back schema + guard only.
  await owner(readSql('0002_erp_employee_profile_down.sql'));
  await owner(readSql('0001_crm_profiles_role_guard_down.sql'));
  const tableGone = (await owner("select count(*) from information_schema.tables where table_schema='public' and table_name='erp_employee_profile'")).rows[0].count;
  const fnGone = (await owner("select count(*) from information_schema.routines where routine_schema='public' and routine_name='get_employee_directory'")).rows[0].count;
  const crmAlive = (await owner("select count(*) from information_schema.tables where table_schema='public' and table_name='crm_profiles'")).rows[0].count;
  const contactAfter = (await owner("select count(*) from public.crm_contacts where name='keep-me-sentinel'")).rows[0].count;
  C.check('rollback dropped erp_employee_profile', tableGone === '0');
  C.check('rollback dropped get_employee_directory', fnGone === '0');
  C.check('unrelated crm_profiles survived rollback', crmAlive === '1');
  C.check('unrelated crm_contacts row survived rollback', contactBefore === contactAfter && contactAfter === '1');

  const { failures } = C.summary();
  exitCode = failures === 0 ? 0 : 1;
} catch (e) {
  console.error(`\nFATAL (migration/setup error — fail closed): ${String(e && e.message || e)}`);
  exitCode = 1;
} finally {
  // ── cleanup: delete ONLY the users we created (crm_profiles cascades) ──
  console.log('== cleanup (only self-created users) ==');
  for (const id of createdUsers) {
    try { await owner('delete from public.crm_profiles where id=$1', [id]); } catch {}
    try { const { error } = await admin.auth.admin.deleteUser(id); if (error) console.log(`  warn: deleteUser ${id}: ${error.message}`); } catch (e) { console.log(`  warn: deleteUser ${id}: ${e.message}`); }
  }
  try { await pool.end(); } catch {}
  const s = C.summary();
  console.log(`\n== RESULT: ${s.passes} passed / ${s.failures} failed (of ${s.total}) ==`);
  console.log(exitCode === 0 ? 'VALIDATION PASSED' : 'VALIDATION FAILED');
  process.exit(exitCode);
}
