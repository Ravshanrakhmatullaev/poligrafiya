// ════════════════════════════════════════════════════════════════════════
// validate_lib.mjs — production guards + fail-closed assertion framework.
// Pure logic, zero network/DB/secrets, so it is unit-testable on its own
// (validate_lib.test.mjs). The runtime runner (validate_auth_self_service.mjs)
// imports these.
// ════════════════════════════════════════════════════════════════════════

// Production identifiers that must NEVER be a validation target.
export const PROD_REF = 'jxxmbgmbaqausqunfyna';
export const PROD_HOSTS = [
  `${PROD_REF}.supabase.co`,
  `db.${PROD_REF}.supabase.co`,
];

// Extract the Supabase project ref from a URL or Postgres connection string.
// Handles: https://<ref>.supabase.co, db.<ref>.supabase.co, and pooler
// connection strings whose USER is "postgres.<ref>".
export function extractRef(value) {
  if (!value || typeof value !== 'string') return null;
  // db.<ref>.supabase.co or <ref>.supabase.co
  const host = value.match(/(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|com|net)/i);
  if (host) return host[1].toLowerCase();
  // pooler: postgres.<ref>:password@... (user carries the ref)
  const pooler = value.match(/postgres\.([a-z0-9]{20})[:@]/i);
  if (pooler) return pooler[1].toLowerCase();
  return null;
}

function hostOf(connOrUrl) {
  if (!connOrUrl) return '';
  try {
    // works for https:// and postgres:// alike
    return new URL(connOrUrl).hostname.toLowerCase();
  } catch {
    const m = connOrUrl.match(/@([^/:?]+)/);
    return m ? m[1].toLowerCase() : '';
  }
}

// Fail-closed target guard. THROWS on any violation; returns {ref} on success.
// Rejects: missing/incorrect temp flag; production ref anywhere; production
// hostname; missing inputs; a database connection whose project ref does not
// match the supplied Supabase URL (ambiguous / unverifiable target).
export function guardTarget({ tempFlag, supabaseUrl, databaseUrl, serviceRoleKey, anonKey } = {}) {
  if (tempFlag !== 'YES') {
    throw new Error('REFUSED: set AUTH_SS_TEMP=YES to explicitly confirm a TEMPORARY project');
  }
  for (const [name, v] of [['SUPABASE_URL', supabaseUrl], ['DATABASE_URL', databaseUrl],
                           ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey], ['SUPABASE_ANON_KEY', anonKey]]) {
    if (!v || !String(v).trim()) throw new Error(`REFUSED: missing required input ${name}`);
  }

  const blob = `${supabaseUrl}\n${databaseUrl}`.toLowerCase();
  if (blob.includes(PROD_REF)) {
    throw new Error(`REFUSED: target references the PRODUCTION project ref (${PROD_REF})`);
  }
  const sHost = hostOf(supabaseUrl);
  const dHost = hostOf(databaseUrl);
  for (const ph of PROD_HOSTS) {
    if (sHost === ph || dHost === ph || sHost.endsWith(ph) || dHost.endsWith(ph)) {
      throw new Error(`REFUSED: target hostname is the PRODUCTION host (${ph})`);
    }
  }

  // Cross-check: the DB connection must belong to the SAME project as the API URL.
  const sRef = extractRef(supabaseUrl);
  const dRef = extractRef(databaseUrl);
  if (!sRef) throw new Error('REFUSED: cannot determine project ref from SUPABASE_URL (ambiguous target)');
  if (!dRef) throw new Error('REFUSED: cannot determine project ref from DATABASE_URL (ambiguous target)');
  if (sRef !== dRef) {
    throw new Error('REFUSED: DATABASE_URL project ref does not match SUPABASE_URL (target mismatch)');
  }
  if (sRef === PROD_REF || dRef === PROD_REF) {
    throw new Error(`REFUSED: resolved project ref is PRODUCTION (${PROD_REF})`);
  }
  return { ref: sRef };
}

// ── Fail-closed assertion framework ──────────────────────────────────────
// Maintains a failure counter; any failed check increments it. The runner
// exits 1 when failures > 0, 0 otherwise.
export function makeChecker(log = console.log) {
  let passes = 0, failures = 0;
  const results = [];
  const record = (ok, name, detail) => {
    results.push({ ok, name, detail });
    if (ok) { passes++; log(`PASS  ${name}`); }
    else    { failures++; log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
    return ok;
  };
  return {
    check: (name, cond, detail) => record(!!cond, name, detail),
    // expectThrow: the awaited fn MUST reject/throw, else it is a failure.
    expectThrow: async (name, fn) => {
      try { await fn(); return record(false, name, 'expected an error but call succeeded'); }
      catch { return record(true, name); }
    },
    // expectOk: the awaited fn MUST resolve, else failure.
    expectOk: async (name, fn) => {
      try { await fn(); return record(true, name); }
      catch (e) { return record(false, name, String(e && e.message || e)); }
    },
    get passes() { return passes; },
    get failures() { return failures; },
    get results() { return results; },
    summary() { return { passes, failures, total: passes + failures }; },
  };
}
