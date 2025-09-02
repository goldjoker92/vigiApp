<#
  check-easignore.ps1
  Vérifie quels fichiers seront envoyés à EAS Build,
  en appliquant .gitignore + .easignore.
#>

Write-Host "=== Vérification .easignore / .gitignore ===" -ForegroundColor Cyan

# 1) S'assure que eas-cli est dispo
$npx = "npx.cmd"
if (-not (Get-Command $npx -ErrorAction SilentlyContinue)) {
  Write-Host "❌ npx introuvable (npm pas dans le PATH ?)" -ForegroundColor Red
  exit 1
}

# 2) Expo a un helper interne : 'eas build:inspect' → montre les fichiers envoyés
Write-Host "Analyse des fichiers que EAS enverra..." -ForegroundColor Yellow
npx eas-cli build:inspect --platform android
