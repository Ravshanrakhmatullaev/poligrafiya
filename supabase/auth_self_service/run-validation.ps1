<#
  run-validation.ps1 — Windows convenience wrapper for the auth self-service
  temporary-project validation runner. Prompts for the temporary project inputs
  (NEVER echoed), sets them as environment variables for the child Node process
  only, ensures the pg / supabase-js deps, and runs validate_auth_self_service.mjs.

  Usage (PowerShell, from anywhere):
      cd supabase\auth_self_service
      .\run-validation.ps1

  You will be asked for the TEMPORARY project values. Nothing is written to disk
  and no secret is printed. Exit code 0 = all checks passed, non-zero = failed.
#>
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "This runs ONLY against a TEMPORARY Supabase project (never production)." -ForegroundColor Yellow
$confirm = Read-Host "Type YES to confirm you are targeting a temporary throwaway project"
if ($confirm -ne 'YES') { Write-Host 'Aborted.' -ForegroundColor Red; exit 2 }

$supabaseUrl = Read-Host 'Temporary SUPABASE_URL (https://<ref>.supabase.co)'
$anon        = Read-Host 'Temporary SUPABASE_ANON_KEY (publishable/anon)'
$service     = Read-Host 'Temporary SUPABASE_SERVICE_ROLE_KEY' -AsSecureString
$dbUrl       = Read-Host 'Temporary DATABASE_URL (postgres://...)' -AsSecureString

# Convert secure strings to plain only in-process for the child env (not logged).
$svcPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($service))
$dbPlain  = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbUrl))

$env:AUTH_SS_TEMP              = 'YES'
$env:SUPABASE_URL             = $supabaseUrl
$env:SUPABASE_ANON_KEY        = $anon
$env:SUPABASE_SERVICE_ROLE_KEY = $svcPlain
$env:DATABASE_URL             = $dbPlain

if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules\pg')) -or
    -not (Test-Path (Join-Path $PSScriptRoot 'node_modules\@supabase'))) {
  Write-Host 'Installing pg + @supabase/supabase-js (temporary, local to this folder)...' -ForegroundColor Cyan
  npm install --no-save pg @supabase/supabase-js
}

try {
  node .\validate_auth_self_service.mjs
  $code = $LASTEXITCODE
} finally {
  # scrub secrets from this shell session
  Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY, Env:\DATABASE_URL, Env:\SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
  $svcPlain = $null; $dbPlain = $null
}
exit $code
