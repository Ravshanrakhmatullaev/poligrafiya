// ════════════════════════════════════════════════════════════════════════
// validate_lib.test.mjs — unit/guard tests for the validation runner's guards
// and fail-closed assertion framework. Runs with NO credentials and NO network:
//   node supabase/auth_self_service/validate_lib.test.mjs
// Exits 0 only if every assertion holds; exits 1 otherwise.
// ════════════════════════════════════════════════════════════════════════
import { guardTarget, extractRef, makeChecker, PROD_REF } from './validate_lib.mjs';

let failures = 0;
const ok = (name, cond) => { if (cond) console.log(`PASS  ${name}`); else { failures++; console.log(`FAIL  ${name}`); } };
const throws = (name, fn, mustSay) => {
  try { fn(); failures++; console.log(`FAIL  ${name} — expected throw`); }
  catch (e) { const good = !mustSay || String(e.message).toLowerCase().includes(mustSay.toLowerCase());
    if (good) console.log(`PASS  ${name}`); else { failures++; console.log(`FAIL  ${name} — wrong reason: ${e.message}`); } }
};

const TEMP = {
  tempFlag: 'YES',
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  databaseUrl: 'postgres://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
  serviceRoleKey: 'test-service-key',
  anonKey: 'test-anon-key',
};

console.log('== extractRef ==');
ok('ref from supabase url',  extractRef(TEMP.supabaseUrl) === 'abcdefghijklmnopqrst');
ok('ref from db host',       extractRef(TEMP.databaseUrl) === 'abcdefghijklmnopqrst');
ok('ref from pooler user',   extractRef('postgres://postgres.abcdefghijklmnopqrst:pw@aws-0-eu.pooler.supabase.com:6543/postgres') === 'abcdefghijklmnopqrst');
ok('null for junk',          extractRef('not-a-url') === null);

console.log('== guardTarget: happy path ==');
ok('valid temp pair returns ref', guardTarget(TEMP).ref === 'abcdefghijklmnopqrst');

console.log('== guardTarget: rejections ==');
throws('missing temp flag',        () => guardTarget({ ...TEMP, tempFlag: undefined }), 'AUTH_SS_TEMP');
throws('wrong temp flag',          () => guardTarget({ ...TEMP, tempFlag: '1' }), 'AUTH_SS_TEMP');
throws('prod ref in supabase url', () => guardTarget({ ...TEMP, supabaseUrl: `https://${PROD_REF}.supabase.co` }), 'production');
throws('prod ref in db url',       () => guardTarget({ ...TEMP, databaseUrl: `postgres://postgres:pw@db.${PROD_REF}.supabase.co:5432/postgres` }), 'production');
throws('prod hostname',            () => guardTarget({ ...TEMP, supabaseUrl: `https://${PROD_REF}.supabase.co`, databaseUrl: `postgres://postgres:pw@db.${PROD_REF}.supabase.co:5432/postgres` }), 'production');
throws('ref mismatch',             () => guardTarget({ ...TEMP, databaseUrl: 'postgres://postgres:pw@db.zzzzzzzzzzzzzzzzzzzz.supabase.co:5432/postgres' }), 'mismatch');
throws('missing service key',      () => guardTarget({ ...TEMP, serviceRoleKey: '' }), 'SUPABASE_SERVICE_ROLE_KEY');
throws('missing anon key',         () => guardTarget({ ...TEMP, anonKey: '' }), 'SUPABASE_ANON_KEY');
throws('unresolvable ref',         () => guardTarget({ ...TEMP, supabaseUrl: 'https://example.com', databaseUrl: 'postgres://u:p@example.com/db' }), 'ambiguous');

console.log('== assertion framework self-test (intentional failure must count) ==');
const silent = () => {};
const probe = makeChecker(silent);
probe.check('intentional-true', true);
probe.check('intentional-false', false);           // must increment failures
await probe.expectThrow('intentional-throw-ok', async () => { throw new Error('x'); });
await probe.expectThrow('intentional-nothrow-bad', async () => {}); // must increment failures
await probe.expectOk('intentional-ok', async () => {});
await probe.expectOk('intentional-ok-bad', async () => { throw new Error('y'); }); // must increment
ok('framework counted exactly 3 failures', probe.failures === 3);
ok('framework counted exactly 3 passes',   probe.passes === 3);
ok('framework summary total is 6',         probe.summary().total === 6);

console.log('----------------------------------------');
if (failures === 0) { console.log('ALL GUARD/UNIT TESTS PASSED'); process.exit(0); }
else { console.log(`${failures} GUARD/UNIT TEST(S) FAILED`); process.exit(1); }
