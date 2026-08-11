import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PRODUCTION_REF = 'jxxmbgmbaqausqunfyna';
const REQUIRED_BRANCH = 'feature/price-module';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const migrationFile = path.join(repoRoot, 'supabase', 'migrations', '20260811090000_price_module.sql');
const rollbackFile = path.join(repoRoot, 'supabase', 'price_module', '20260811090000_price_module_rollback.sql');
const prerequisiteFile = path.join(scriptDir, 'temp-prerequisites.sql');

const env = process.env;
const required = [
  'PRICE_VALIDATION_SUPABASE_URL',
  'PRICE_VALIDATION_ANON_KEY',
  'PRICE_VALIDATION_SERVICE_ROLE_KEY',
  'PRICE_VALIDATION_DB_URL',
  'PRICE_VALIDATION_EXPECTED_PROJECT_REF',
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

for (const name of required) assert(env[name], `Missing required environment variable: ${name}`);
assert(env.PRICE_VALIDATION_ALLOW_TEMP_DB === 'YES', 'Refusing: PRICE_VALIDATION_ALLOW_TEMP_DB must equal YES');
assert(env.PRICE_VALIDATION_CONFIRM_EPHEMERAL === 'YES', 'Refusing: PRICE_VALIDATION_CONFIRM_EPHEMERAL must equal YES');
assert(env.PRICE_VALIDATION_ALLOW_DESTRUCTIVE_ROLLBACK === 'YES', 'Refusing: PRICE_VALIDATION_ALLOW_DESTRUCTIVE_ROLLBACK must equal YES');

const supabaseUrl = new URL(env.PRICE_VALIDATION_SUPABASE_URL);
const dbUrl = new URL(env.PRICE_VALIDATION_DB_URL);
const expectedRef = env.PRICE_VALIDATION_EXPECTED_PROJECT_REF.trim().toLowerCase();
const actualRef = supabaseUrl.hostname.toLowerCase().replace(/\.supabase\.co$/, '');
const denyText = `${supabaseUrl.href} ${dbUrl.href} ${expectedRef}`.toLowerCase();

assert(supabaseUrl.protocol === 'https:', 'Supabase URL must use HTTPS');
assert(supabaseUrl.hostname.endsWith('.supabase.co'), 'Supabase URL must be a project URL on supabase.co');
assert(expectedRef && /^[a-z0-9]+$/.test(expectedRef), 'Expected project ref is invalid');
assert(actualRef === expectedRef, 'Supabase URL does not match PRICE_VALIDATION_EXPECTED_PROJECT_REF');
assert(!denyText.includes(PRODUCTION_REF), `HARD STOP: production project ${PRODUCTION_REF} is forbidden`);
assert(actualRef !== PRODUCTION_REF, 'HARD STOP: production Supabase URL is forbidden');
assert(dbUrl.protocol === 'postgresql:' || dbUrl.protocol === 'postgres:', 'DB URL must be PostgreSQL');
assert(dbUrl.password, 'DB connection string must include the temporary database password');
assert(
  dbUrl.hostname.toLowerCase().includes(expectedRef) || decodeURIComponent(dbUrl.username).toLowerCase().includes(expectedRef),
  'DB hostname/username does not identify the expected temporary project ref',
);

const secretValues = required.map((name) => env[name]).filter(Boolean).sort((a, b) => b.length - a.length);
function sanitize(value) {
  let text = String(value ?? '');
  for (const secret of secretValues) text = text.split(secret).join('[REDACTED]');
  text = text.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DB_URL]');
  return text;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input: options.input,
    env: options.env ?? process.env,
    windowsHide: true,
  });
  if (result.error) fail(`${command} could not start: ${sanitize(result.error.message)}`);
  if (!options.allowFailure && result.status !== 0) {
    fail(`${command} failed (${result.status}): ${sanitize(result.stderr || result.stdout)}`);
  }
  return result;
}

const branch = run('git', ['branch', '--show-current']).stdout.trim();
assert(branch === REQUIRED_BRANCH, `Refusing: current branch is ${branch || '(detached)'}, expected ${REQUIRED_BRANCH}`);
run('psql', ['--version']);

const pgEnv = {
  ...process.env,
  PGHOST: dbUrl.hostname,
  PGPORT: dbUrl.port || '5432',
  PGDATABASE: dbUrl.pathname.replace(/^\//, '') || 'postgres',
  PGUSER: decodeURIComponent(dbUrl.username),
  PGPASSWORD: decodeURIComponent(dbUrl.password),
  PGSSLMODE: 'require',
};

function psqlArgs(extra = []) {
  return ['-X', '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', ...extra];
}

function sql(statement, options = {}) {
  return run('psql', psqlArgs(['-At', '-F', '\t', '-c', statement]), {
    env: pgEnv,
    allowFailure: options.allowFailure,
  });
}

function sqlFile(file, options = {}) {
  return run('psql', psqlArgs(['-f', file]), { env: pgEnv, allowFailure: options.allowFailure });
}

function scalar(statement) {
  return sql(statement).stdout.trim();
}

const initialTableCount = Number(scalar("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p');"));
assert(initialTableCount === 0, `Refusing: temporary public schema contains ${initialTableCount} user table(s)`);
assert(scalar("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relname='crm_profiles' or c.relname like 'pricing_%');") === '0', 'Refusing: crm_profiles or pricing_* objects already exist');

const users = {};
const createdUserIds = [];
const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`;

async function request(urlPath, { method = 'GET', token, body, prefer, expected = [200] } = {}) {
  const headers = { apikey: env.PRICE_VALIDATION_ANON_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${supabaseUrl.origin}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = raw;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* retain text */ }
  if (!expected.includes(response.status)) {
    fail(`${method} ${urlPath} returned ${response.status}: ${sanitize(raw)}`);
  }
  return { status: response.status, data, headers: response.headers };
}

async function adminAuth(pathname, { method = 'POST', body, expected = [200] } = {}) {
  const response = await fetch(`${supabaseUrl.origin}/auth/v1/admin/${pathname}`, {
    method,
    headers: {
      apikey: env.PRICE_VALIDATION_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.PRICE_VALIDATION_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = raw;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* retain text */ }
  if (!expected.includes(response.status)) fail(`Auth admin ${method} ${pathname} returned ${response.status}: ${sanitize(raw)}`);
  return data;
}

async function createUser(role) {
  const email = `price-validation-${role}-${stamp}@example.invalid`;
  const password = `Tmp-${randomBytes(24).toString('base64url')}!9a`;
  const data = await adminAuth('users', { body: { email, password, email_confirm: true } });
  assert(data?.id, `Auth did not return an id for ${role}`);
  createdUserIds.push(data.id);
  users[role] = { id: data.id, email, password };
}

async function login(role) {
  const u = users[role];
  const { data } = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: u.email, password: u.password },
  });
  assert(data?.access_token, `No JWT returned for ${role}`);
  u.token = data.access_token;
}

function restPath(table, query = '') {
  return `/rest/v1/${table}${query ? `?${query}` : ''}`;
}

async function rows(role, table, query = '*') {
  return (await request(restPath(table, `select=${encodeURIComponent(query)}`), { token: users[role].token })).data;
}

async function rpc(role, name, body, expected = [200]) {
  return (await request(`/rest/v1/rpc/${name}`, { method: 'POST', token: users[role].token, body, expected })).data;
}

async function expectDenied(label, fn) {
  try {
    const result = await fn();
    if (result?.status && result.status >= 400) return;
  } catch (error) {
    if (/returned 4\d\d/.test(error.message)) return;
    throw error;
  }
  fail(`${label}: operation unexpectedly succeeded`);
}

function product(overrides = {}) {
  return {
    name: 'Validation quantity product', category: 'Validation', tags: ['test'], aliases: ['boundary'],
    description: 'Temporary PRICE validation only', unit: 'dona', status: 'active',
    pricing_mode: 'quantity_tier', currency: 'UZS', base_price: 0, min_quantity: 5,
    ...overrides,
  };
}

const tiers = [
  [5, 9, 100], [10, 19, 90], [20, 49, 80], [50, 99, 70],
  [100, 499, 60], [500, 999, 50], [1000, null, 40],
].map(([min_value, max_value, unit_price], sort_order) => ({ min_value, max_value, unit_price, setup_price: 0, sort_order }));

function quoteNumber(data, key) {
  const value = Number(data?.[key]);
  assert(Number.isFinite(value), `Quote field ${key} is not numeric`);
  return value;
}

async function cleanupAuthUsers() {
  for (const id of createdUserIds.reverse()) {
    try { await adminAuth(`users/${id}`, { method: 'DELETE', expected: [200, 204] }); }
    catch (error) { process.stderr.write(`Cleanup warning: ${sanitize(error.message)}\n`); }
  }
}

let migrationApplied = false;
let rollbackCompleted = false;

try {
  process.stdout.write(`Validated hard guards for temporary project ${expectedRef}.\n`);
  sqlFile(prerequisiteFile);
  sqlFile(migrationFile);
  migrationApplied = true;
  sql("notify pgrst, 'reload schema';");

  for (const role of ['director', 'manager', 'designer', 'production']) await createUser(role);
  const profileValues = Object.entries(users).map(([role, u]) => {
    const fullName = `Validation ${role[0].toUpperCase()}${role.slice(1)}`.replaceAll("'", "''");
    return `('${u.id}'::uuid,'${fullName}','${role}')`;
  }).join(',');
  sql(`insert into public.crm_profiles(id,full_name,role) values ${profileValues};`);
  for (const role of Object.keys(users)) await login(role);

  // Wait briefly for PostgREST's schema cache after NOTIFY.
  let schemaReady = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rows('director', 'pricing_products', 'id');
      schemaReady = true;
      break;
    } catch (error) {
      if (attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  assert(schemaReady, 'PostgREST schema cache did not expose PRICE objects');

  const productId = Number(await rpc('director', 'pricing_save_product', { p_product: product(), p_tiers: tiers }));
  assert(Number.isInteger(productId) && productId > 0, 'pricing_save_product did not return a product id');
  await rpc('director', 'pricing_save_product', {
    p_product: product({ id: productId, name: 'Validation quantity product director edit' }),
    p_tiers: tiers,
  });

  const expectedBoundary = new Map([[5, 100], [10, 90], [20, 80], [50, 70], [100, 60], [500, 50], [1000, 40]]);
  for (const [quantity, unitPrice] of expectedBoundary) {
    const q = await rpc('designer', 'pricing_quote', { p_product_id: productId, p_quantity: quantity });
    assert(q.available === true, `Boundary ${quantity} should be available`);
    assert(quoteNumber(q, 'unit_price') === unitPrice, `Boundary ${quantity} selected wrong tier`);
    assert(quoteNumber(q, 'total') === quantity * unitPrice, `Boundary ${quantity} total is wrong`);
  }
  const between = await rpc('production', 'pricing_quote', { p_product_id: productId, p_quantity: 37 });
  assert(quoteNumber(between, 'unit_price') === 80, 'Between-tier quantity 37 selected wrong tier');
  const belowMin = await rpc('designer', 'pricing_quote', { p_product_id: productId, p_quantity: 4 });
  assert(belowMin.available === false, 'Below-minimum quote should be unavailable');

  const gapId = Number(await rpc('manager', 'pricing_save_product', {
    p_product: product({ name: 'Validation gap product', min_quantity: 5 }),
    p_tiers: [tiers[0], { min_value: 20, max_value: null, unit_price: 80 }],
  }));
  const gapQuote = await rpc('designer', 'pricing_quote', { p_product_id: gapId, p_quantity: 15 });
  assert(gapQuote.available === false, 'Quantity in a tier gap should be unavailable');
  await rpc('manager', 'pricing_set_archived', { p_product_id: gapId, p_archived: true });
  await rpc('manager', 'pricing_set_archived', { p_product_id: gapId, p_archived: false });
  await expectDenied('Overlapping tiers', () => rpc('director', 'pricing_save_product', {
    p_product: product({ name: 'Validation overlap rejection' }),
    p_tiers: [{ min_value: 5, max_value: 20, unit_price: 100 }, { min_value: 20, max_value: null, unit_price: 80 }],
  }));
  await expectDenied('Invalid pricing mode', () => rpc('director', 'pricing_save_product', {
    p_product: product({ name: 'Invalid mode', pricing_mode: 'orakal' }), p_tiers: [],
  }));
  await expectDenied('Invalid product status', () => rpc('director', 'pricing_save_product', {
    p_product: product({ name: 'Invalid status', status: 'deleted' }), p_tiers: tiers,
  }));
  await expectDenied('Negative tier price', () => rpc('director', 'pricing_save_product', {
    p_product: product({ name: 'Negative tier price' }),
    p_tiers: [{ min_value: 5, max_value: null, unit_price: -1 }],
  }));

  const calculatorId = Number(await rpc('director', 'pricing_save_product', {
    p_product: product({ name: 'Validation calculator link', pricing_mode: 'calculator', pricing_source_key: 'validation.adapter.v1', base_price: 999, min_quantity: 1 }),
    p_tiers: [],
  }));
  const calculatorRow = (await request(restPath('pricing_products', `id=eq.${calculatorId}&select=base_price,pricing_source_key`), { token: users.director.token })).data[0];
  assert(Number(calculatorRow.base_price) === 0 && calculatorRow.pricing_source_key === 'validation.adapter.v1', 'Calculator product duplicated a price or lost its adapter key');
  const calculatorQuote = await rpc('designer', 'pricing_quote', { p_product_id: calculatorId, p_quantity: 1 });
  assert(calculatorQuote.available === false && calculatorQuote.requires_calculator === true, 'Calculator-linked quote contract is wrong');
  await expectDenied('Calculator tiers', () => rpc('director', 'pricing_save_product', {
    p_product: product({ name: 'Bad calculator tiers', pricing_mode: 'calculator', pricing_source_key: 'bad.adapter', min_quantity: 1 }), p_tiers: [tiers[0]],
  }));

  const manualId = Number(await rpc('manager', 'pricing_save_product', {
    p_product: product({ name: 'Validation manual product', pricing_mode: 'manual', min_quantity: 1 }), p_tiers: [],
  }));
  const manualQuote = await rpc('production', 'pricing_quote', { p_product_id: manualId, p_quantity: 1 });
  assert(manualQuote.available === false && manualQuote.requires_manual_price === true, 'Manual quote contract is wrong');

  // Direct business-table writes must remain unavailable even to admin roles.
  for (const role of ['director', 'manager', 'designer', 'production']) {
    await expectDenied(`${role} direct product insert`, () => request(restPath('pricing_products'), {
      method: 'POST', token: users[role].token, body: product({ name: `Forbidden ${role}` }), expected: [201],
    }));
    await expectDenied(`${role} direct tier insert`, () => request(restPath('pricing_price_tiers'), {
      method: 'POST', token: users[role].token, body: { product_id: productId, min_value: 2000, unit_price: 1 }, expected: [201],
    }));
    await expectDenied(`${role} direct history insert`, () => request(restPath('pricing_price_history'), {
      method: 'POST', token: users[role].token, body: { product_id: productId }, expected: [201],
    }));
  }
  await expectDenied('Designer save RPC', () => rpc('designer', 'pricing_save_product', { p_product: product({ name: 'Forbidden designer RPC' }), p_tiers: tiers }));
  await expectDenied('Designer archive RPC', () => rpc('designer', 'pricing_set_archived', { p_product_id: productId, p_archived: true }));
  await expectDenied('Production archive RPC', () => rpc('production', 'pricing_set_archived', { p_product_id: productId, p_archived: true }));

  // Favorites are strictly scoped to auth.uid().
  await request(restPath('pricing_favorites'), {
    method: 'POST', token: users.designer.token, body: { user_id: users.designer.id, product_id: productId }, prefer: 'return=representation', expected: [201],
  });
  const ownFavorites = await rows('designer', 'pricing_favorites', 'user_id,product_id');
  const otherFavorites = await rows('production', 'pricing_favorites', 'user_id,product_id');
  assert(ownFavorites.length === 1 && otherFavorites.length === 0, 'Favorite read isolation failed');
  await expectDenied('Cross-user favorite insert', () => request(restPath('pricing_favorites'), {
    method: 'POST', token: users.production.token, body: { user_id: users.designer.id, product_id: productId }, expected: [201],
  }));
  await request(restPath('pricing_favorites', `user_id=eq.${users.designer.id}&product_id=eq.${productId}`), {
    method: 'DELETE', token: users.production.token, expected: [204],
  });
  assert((await rows('designer', 'pricing_favorites', 'user_id')).length === 1, 'Cross-user delete removed another user favorite');

  const initialHistory = (await request(restPath('pricing_price_history', `product_id=eq.${productId}&select=*`), { token: users.director.token })).data;
  const updated = product({ id: productId, name: 'Validation quantity product edited', description: 'Changed by manager' });
  const editedTiers = tiers.map((tier) => tier.min_value === 20 ? { ...tier, unit_price: 79 } : tier);
  await rpc('manager', 'pricing_save_product', { p_product: updated, p_tiers: editedTiers });
  const afterEdit = (await request(restPath('pricing_price_history', `product_id=eq.${productId}&select=*`), { token: users.director.token })).data;
  assert(afterEdit.length > initialHistory.length, 'Product/tier edit did not create history');
  assert(afterEdit.some((h) => h.entity_type === 'product' && h.changed_by === users.manager.id && h.changed_by_name === 'Validation Manager'), 'Product history actor identity is wrong');
  assert(afterEdit.some((h) => h.entity_type === 'tier_set' && h.changed_by === users.manager.id), 'Tier-set history actor identity is wrong');
  const managerTierSnapshots = afterEdit.filter((h) => h.entity_type === 'tier_set' && h.changed_by === users.manager.id);
  assert(managerTierSnapshots.length === 1, 'One tier edit must produce exactly one meaningful tier-set snapshot');
  await rpc('manager', 'pricing_save_product', { p_product: updated, p_tiers: editedTiers });
  const afterNoop = (await request(restPath('pricing_price_history', `product_id=eq.${productId}&select=id`), { token: users.director.token })).data;
  assert(afterNoop.length === afterEdit.length, 'Semantic no-op save created recursive/noisy history');

  await rpc('director', 'pricing_set_archived', { p_product_id: productId, p_archived: true });
  const archivedQuote = await rpc('director', 'pricing_quote', { p_product_id: productId, p_quantity: 20 });
  assert(archivedQuote.available === false && archivedQuote.status === 'archived', 'Archived product returned a quote');
  assert((await rows('designer', 'pricing_products', 'id')).every((p) => Number(p.id) !== productId), 'Archived product leaked to employee');
  await rpc('director', 'pricing_set_archived', { p_product_id: productId, p_archived: false });
  assert((await rows('designer', 'pricing_products', 'id')).some((p) => Number(p.id) === productId), 'Reactivated product is not visible');

  const draftId = Number(await rpc('director', 'pricing_save_product', {
    p_product: product({ name: 'Validation draft', status: 'draft' }), p_tiers: tiers,
  }));
  assert((await rows('production', 'pricing_products', 'id')).every((p) => Number(p.id) !== draftId), 'Draft product leaked to employee');
  const draftQuote = await rpc('director', 'pricing_quote', { p_product_id: draftId, p_quantity: 20 });
  assert(draftQuote.available === false && draftQuote.status === 'draft', 'Draft product returned a quote');

  const archiveHistory = (await request(restPath('pricing_price_history', `product_id=eq.${productId}&entity_type=eq.product&select=old_data,new_data,changed_by`), { token: users.director.token })).data;
  assert(archiveHistory.some((h) => h.old_data?.status === 'active' && h.new_data?.status === 'archived' && h.changed_by === users.director.id), 'Archive history is missing/wrong');
  assert(archiveHistory.some((h) => h.old_data?.status === 'archived' && h.new_data?.status === 'active' && h.changed_by === users.director.id), 'Reactivate history is missing/wrong');

  // PostgreSQL metadata and grant audit.
  const metadataOk = scalar(`
    with defs as (
      select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') cfg
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'pricing_%'
    )
    select (
      (select count(*) from defs where prosecdef and cfg not like '%search_path=pg_catalog, public%') = 0
      and (select not prosecdef from defs where proname='pricing_quote')
      and (select count(*) from pg_tables where schemaname='public' and tablename in ('pricing_products','pricing_price_tiers','pricing_favorites','pricing_price_history')) = 4
      and (select count(*) from pg_policies where schemaname='public' and tablename like 'pricing_%') = 8
      and (select count(*) from pg_indexes where schemaname='public' and indexname in (
        'pricing_products_pkey','pricing_products_sku_uq','pricing_products_source_key_uq',
        'pricing_products_catalog_idx','pricing_products_name_idx','pricing_products_tags_idx','pricing_products_aliases_idx',
        'pricing_price_tiers_pkey','pricing_price_tiers_lookup_idx','pricing_favorites_pkey',
        'pricing_favorites_product_idx','pricing_price_history_pkey','pricing_price_history_product_idx'
      )) = 13
      and (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and not t.tgisinternal and t.tgname in (
          'pricing_products_touch','pricing_price_tiers_touch','pricing_price_tiers_no_range_collision','pricing_products_history'
        )) = 4
      and (select count(*) from defs where proname in (
        'pricing_is_admin','pricing_touch_updated_at','pricing_reject_tier_range_collision',
        'pricing_write_history','pricing_save_product','pricing_set_archived','pricing_quote'
      )) = 7
      and not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like 'pricing_%'
          and pg_get_function_arguments(p.oid) ~* '(^|, )[a-z0-9_]*(user|actor|changed_by)[a-z0-9_]*\\s'
      )
      and not has_table_privilege('authenticated','public.pricing_products','INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated','public.pricing_price_tiers','INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated','public.pricing_price_history','INSERT,UPDATE,DELETE')
      and has_table_privilege('authenticated','public.pricing_favorites','SELECT,INSERT,DELETE')
      and not has_function_privilege('anon','public.pricing_save_product(jsonb,jsonb)','EXECUTE')
      and not has_function_privilege('authenticated','public.pricing_write_history()','EXECUTE')
      and not has_function_privilege('authenticated','public.pricing_touch_updated_at()','EXECUTE')
      and not has_function_privilege('authenticated','public.pricing_reject_tier_range_collision()','EXECUTE')
    );
  `);
  assert(metadataOk === 't', 'PostgreSQL function/grant/policy metadata audit failed');

  // Prove rollback is intentionally blocked by unrelated dependencies and has no CASCADE.
  sql('create view public.price_validation_external_dependency as select id from public.pricing_products;');
  const blockedRollback = sqlFile(rollbackFile, { allowFailure: true });
  assert(blockedRollback.status !== 0, 'Rollback unexpectedly removed a dependent external view (possible CASCADE)');
  assert(scalar("select to_regclass('public.pricing_products') is not null;") === 't', 'Failed rollback did not remain transactional');
  sql('drop view public.price_validation_external_dependency;');
  sqlFile(rollbackFile);
  rollbackCompleted = true;
  migrationApplied = false;

  assert(scalar("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'pricing_%';") === '0', 'PRICE relations remain after rollback');
  assert(scalar("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'pricing_%';") === '0', 'PRICE functions remain after rollback');
  assert(scalar("select marker from public.price_validation_unrelated_sentinel where id=1;") === 'must-survive-price-rollback', 'Unrelated sentinel did not survive PRICE rollback');

  await cleanupAuthUsers();
  sql('drop table public.price_validation_unrelated_sentinel; drop table public.crm_profiles;');
  process.stdout.write('PASS: temporary PRICE migration, JWT/RLS/RPC/history/security, and rollback validation completed.\n');
} catch (error) {
  process.stderr.write(`FAIL: ${sanitize(error.message)}\n`);
  if (createdUserIds.length) await cleanupAuthUsers();
  if (migrationApplied && !rollbackCompleted) {
    process.stderr.write('Temporary project was left intact for diagnosis. Delete the disposable project after review.\n');
  }
  process.exitCode = 1;
}
