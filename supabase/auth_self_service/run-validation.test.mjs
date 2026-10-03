// ════════════════════════════════════════════════════════════════════════
// run-validation.test.mjs — static security tests for the PowerShell wrapper.
// Proves the secret-handling invariants WITHOUT running PowerShell or exposing
// any secret:  node supabase/auth_self_service/run-validation.test.mjs
// Exits 0 only if every invariant holds.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const psRaw = readFileSync(join(HERE, 'run-validation.ps1'), 'utf8');
// Strip comments so "npm"/secret words inside prose can't create false matches:
//  - block comments <# ... #>
//  - line comments (# ... to EOL), preserving offsets with spaces so index math holds.
const ps = psRaw
  .replace(/<#[\s\S]*?#>/g, (m) => ' '.repeat(m.length))
  .replace(/#[^\n]*/g, (m) => ' '.repeat(m.length));

let failures = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const idx = (re) => { const m = ps.match(re); return m ? m.index : -1; };
const lastIdx = (re) => { let i = -1, m; const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = r.exec(ps))) i = m.index; return i; };

// Anchor positions.
const iNpmCi        = idx(/npm ci --ignore-scripts/);
const iFirstSecret  = idx(/Read-Host[^\n]*-AsSecureString/);
const iSetSvcEnv    = idx(/\$env:SUPABASE_SERVICE_ROLE_KEY\s*=/);
const iNode         = idx(/node \.\\validate_auth_self_service\.mjs/);
const iFinally      = idx(/\nfinally\s*\{/);
const iLastNpm      = lastIdx(/\bnpm\b/);

console.log('== wrapper security invariants ==');

// 1. Dependency install occurs BEFORE any secret prompt / SecureString / secret env.
ok('npm ci present', iNpmCi >= 0);
ok('first SecureString prompt present', iFirstSecret >= 0);
ok('dependency install occurs before secret prompts', iNpmCi >= 0 && iFirstSecret >= 0 && iNpmCi < iFirstSecret,
   `npmCi@${iNpmCi} firstSecret@${iFirstSecret}`);
ok('dependency install occurs before any secret env var is set', iNpmCi < iSetSvcEnv,
   `npmCi@${iNpmCi} setSvcEnv@${iSetSvcEnv}`);

// 2. No npm process runs after secrets are set (the last `npm` token precedes the secret env set).
ok('no npm invocation after secrets enter the environment', iLastNpm < iSetSvcEnv,
   `lastNpm@${iLastNpm} setSvcEnv@${iSetSvcEnv}`);
ok('only the validator is launched after secrets', iNode > iSetSvcEnv && iNode > iFirstSecret);

// 3. Missing deps fail BEFORE prompting for secrets: there is an `exit` gate
//    (guarded by Test-Deps) that sits before the first secret prompt.
const gate = ps.slice(0, iFirstSecret);
ok('a missing-deps abort (exit 3) exists before secret prompts',
   /Not prompting for secrets[\s\S]*exit 3/.test(gate) || /exit 3/.test(gate),
   'no pre-secret exit gate found');
ok('Test-Deps re-check guards the pre-secret gate', /if \(-not \(Test-Deps\)\)/.test(gate));

// 4. finally block scrubs secret env vars (incl. AUTH_SS_TEMP) and zero-frees BSTRs.
ok('finally block present', iFinally >= 0);
const fin = ps.slice(iFinally);
ok('finally removes service-role key env', /Remove-Item[\s\S]*SUPABASE_SERVICE_ROLE_KEY/.test(fin));
ok('finally removes DATABASE_URL env', /DATABASE_URL/.test(fin));
ok('finally removes SUPABASE_ANON_KEY env', /SUPABASE_ANON_KEY/.test(fin));
ok('finally removes AUTH_SS_TEMP env', /AUTH_SS_TEMP/.test(fin));
ok('finally zero-frees all three BSTR pointers',
   (fin.match(/ZeroFreeBSTR/g) || []).length >= 3, `${(fin.match(/ZeroFreeBSTR/g)||[]).length} ZeroFreeBSTR calls`);
ok('finally clears plaintext copies', /\$anonPlain\s*=\s*\$null[\s\S]*\$dbPlain\s*=\s*\$null|\$svcPlain\s*=\s*\$null/.test(fin));

// 5. BSTR pointers are RETAINED (converted once, freed in finally — not freed inline).
ok('BSTR pointers retained in script scope', /\$svcBstr\s*=\s*\$M::SecureStringToBSTR/.test(ps));
ok('plaintext obtained via PtrToStringBSTR', /PtrToStringBSTR/.test(ps));

// 6. Child exit code preserved.
ok('child exit code captured via $LASTEXITCODE', /\$code\s*=\s*\$LASTEXITCODE/.test(ps));
ok('wrapper exits with child code', /\nexit \$code\b/.test(ps));

// 7. No secret is printed anywhere (no Write-Host / echo of a secret variable).
ok('no Write-Host of a secret variable',
   !/Write-(Host|Output)[^\n]*\$(svcPlain|dbPlain|anonPlain|service|dbUrl|anon)\b/.test(ps));

console.log('----------------------------------------');
if (failures === 0) { console.log('ALL WRAPPER SECURITY TESTS PASSED'); process.exit(0); }
else { console.log(`${failures} WRAPPER SECURITY TEST(S) FAILED`); process.exit(1); }
