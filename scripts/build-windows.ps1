param([string]$NodePath = 'node')
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  & $NodePath node_modules/typescript/bin/tsc -b
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $NodePath node_modules/vite/bin/vite.js build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $NodePath scripts/check-pages.mjs
  exit $LASTEXITCODE
} finally { Pop-Location }
