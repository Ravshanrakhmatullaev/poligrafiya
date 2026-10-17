<#
  run-validation.ps1 — Windows wrapper for the auth self-service temporary-project
  validator. Hardened secret handling:

    PHASE 1  (NO secrets in the environment yet):
      * confirm the target is a throwaway temporary project;
      * prepare dependencies deterministically with lifecycle scripts DISABLED
        (`npm ci --ignore-scripts`) from the committed package.json + lockfile;
      * re-check the deps exist. If they are still missing, STOP here — before any
        secret is prompted, converted, or placed in the environment.

    PHASE 2  (secrets, only after deps are ready):
      * prompt for the temporary secrets as SecureStrings (never echoed);
      * convert via BSTR, retaining the pointers for zero-free;
      * set env vars, launch ONLY the validator (no npm after this point);
      * finally: ZeroFreeBSTR every pointer, clear plaintext, remove every secret
        env var AND AUTH_SS_TEMP.

  Rationale: an npm lifecycle/dependency script could read process env. By finishing
  all dependency work before any secret exists in the environment, and running no
  npm process afterwards, the service-role key and DB password are never visible to
  npm or any install-time script.

  Usage (PowerShell):
      cd supabase\auth_self_service
      .\run-validation.ps1

  Exit code: the validator's own exit code (0 = all checks passed).
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
Add-Type -AssemblyName System.Runtime.InteropServices -ErrorAction SilentlyContinue
$M = [System.Runtime.InteropServices.Marshal]

# ════════════════════════════════════════════════════════════════════════
# PHASE 1 — dependency preparation (NO secrets present)
# ════════════════════════════════════════════════════════════════════════
Write-Host 'This runs ONLY against a TEMPORARY Supabase project (never production).' -ForegroundColor Yellow
$confirm = Read-Host 'Type YES to confirm you are targeting a temporary throwaway project'
if ($confirm -ne 'YES') { Write-Host 'Aborted.' -ForegroundColor Red; exit 2 }

function Test-Deps {
  return (Test-Path (Join-Path $PSScriptRoot 'node_modules\pg\package.json')) -and
         (Test-Path (Join-Path $PSScriptRoot 'node_modules\@supabase\supabase-js\package.json'))
}

if (-not (Test-Deps)) {
  Write-Host 'Preparing dependencies (npm ci --ignore-scripts) BEFORE any secret is entered...' -ForegroundColor Cyan
  # Deterministic, from the committed lockfile, with ALL lifecycle scripts disabled.
  npm ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { Write-Host 'Dependency preparation failed.' -ForegroundColor Red; exit 3 }
}

# Hard gate: if deps are still missing, STOP before prompting for any secret.
if (-not (Test-Deps)) {
  Write-Host 'Dependencies missing after preparation. Not prompting for secrets. Aborting.' -ForegroundColor Red
  exit 3
}
Write-Host 'Dependencies ready. No npm process will run once secrets are present.' -ForegroundColor Green

# ════════════════════════════════════════════════════════════════════════
# PHASE 2 — secrets (only after deps are ready)
# ════════════════════════════════════════════════════════════════════════
$supabaseUrl = Read-Host 'Temporary SUPABASE_URL (https://<ref>.supabase.co)'   # not a secret
$anon    = Read-Host 'Temporary SUPABASE_ANON_KEY'            -AsSecureString
$service = Read-Host 'Temporary SUPABASE_SERVICE_ROLE_KEY'    -AsSecureString
$dbUrl   = Read-Host 'Temporary DATABASE_URL (postgres://...)' -AsSecureString

$anonBstr = [IntPtr]::Zero; $svcBstr = [IntPtr]::Zero; $dbBstr = [IntPtr]::Zero
$code = 1
try {
  $anonBstr = $M::SecureStringToBSTR($anon)
  $svcBstr  = $M::SecureStringToBSTR($service)
  $dbBstr   = $M::SecureStringToBSTR($dbUrl)

  $anonPlain = $M::PtrToStringBSTR($anonBstr)
  $svcPlain  = $M::PtrToStringBSTR($svcBstr)
  $dbPlain   = $M::PtrToStringBSTR($dbBstr)

  $env:AUTH_SS_TEMP              = 'YES'
  $env:SUPABASE_URL             = $supabaseUrl
  $env:SUPABASE_ANON_KEY        = $anonPlain
  $env:SUPABASE_SERVICE_ROLE_KEY = $svcPlain
  $env:DATABASE_URL             = $dbPlain

  # Launch ONLY the validator — no package manager, no other child, after secrets exist.
  node .\validate_auth_self_service.mjs
  $code = $LASTEXITCODE
}
finally {
  # Zero-free every BSTR pointer we retained.
  if ($anonBstr -ne [IntPtr]::Zero) { $M::ZeroFreeBSTR($anonBstr) }
  if ($svcBstr  -ne [IntPtr]::Zero) { $M::ZeroFreeBSTR($svcBstr) }
  if ($dbBstr   -ne [IntPtr]::Zero) { $M::ZeroFreeBSTR($dbBstr) }
  # Clear managed plaintext copies.
  $anonPlain = $null; $svcPlain = $null; $dbPlain = $null
  # Remove every secret env var AND the temp flag from this shell session.
  Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY, Env:\DATABASE_URL, Env:\SUPABASE_ANON_KEY, `
              Env:\SUPABASE_URL, Env:\AUTH_SS_TEMP -ErrorAction SilentlyContinue
  [System.GC]::Collect()
}
exit $code
