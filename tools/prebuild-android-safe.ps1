param(
  [string]$Root = (Resolve-Path ".").Path,
  [ValidateSet("Debug","Release")]
  [string]$Variant = "Debug",
  [switch]$NewArch,          # par défaut: off
  [switch]$NoPrebuild,       # pour sauter "expo prebuild --clean" si tu ne veux pas régénérer
  [switch]$SkipExpoFix       # pour sauter "expo install --fix" et "install-expo-modules"
)

$ErrorActionPreference = "Stop"

function ok($m){ Write-Host "✓ $m" -ForegroundColor Green }
function warn($m){ Write-Host "⚠ $m" -ForegroundColor Yellow }
function head($m){ Write-Host "`n=== $m ===" -ForegroundColor Cyan }

$root = (Resolve-Path $Root).Path
$android = Join-Path $root "android"
$guard = Join-Path $root "tools\guard-gradle.ps1"

head "1) Sécurisation Gradle (BOM/ZWSP + pins)"
if (Test-Path $guard) {
  pwsh -File $guard -Root $root -Fix
  ok "Guard exécuté"
} else {
  warn "Guard introuvable: $guard (skip)"
}

head "2) Stop daemon Gradle + cleanup local"
if (Test-Path $android) {
  Push-Location $android
  ./gradlew --stop | Out-Null
  ./gradlew clean   | Out-Null
  Pop-Location
  ok "Gradle stoppé + clean"
} else {
  throw "Dossier android introuvable: $android"
}

head "3) Alignement Expo (facultatif)"
if (-not $SkipExpoFix) {
  Push-Location $root
  cmd /c "npx -y expo install --fix"
  cmd /c "npx -y install-expo-modules@latest"
  if (-not $NoPrebuild) {
    cmd /c "npx -y expo prebuild --clean"
  } else {
    warn "NoPrebuild activé (pas de regen des natifs)"
  }
  Pop-Location
  ok "Expo aligné"
} else {
  warn "SkipExpoFix activé (aucune commande Expo exécutée)"
}

head "4) Build Android"
$task = if ($Variant -eq "Release") { "assembleRelease" } else { "assembleDebug" }
$props = @()
if (-not $NewArch) { $props += "-PnewArchEnabled=false" }

Push-Location $android
./gradlew $task @props
$cfg = "$($Variant.ToLower())RuntimeClasspath"
Write-Host ""
ok "Dépendance androidx.browser résolue :"
./gradlew :app:dependencies --configuration $cfg | Select-String "androidx.browser" | ForEach-Object { $_.Line }
Pop-Location

ok "Terminé ($Variant)"
