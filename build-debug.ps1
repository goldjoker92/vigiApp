<#
  build-debug.ps1
  Build & install debug (local) + reverse + expo start.
  - Compile Android debug avec Gradle
  - Installe sur les devices ADB connectés
  - Reverse tcp:8081 (métro) pour émulateur ET téléphone réel
  - Donne la permission POST_NOTIFICATIONS
  - Lance Metro (expo start)

  Exemples :
    .\build-debug.ps1
    .\build-debug.ps1 -SkipInstall    # compile seulement
#>

param(
  [switch] $SkipInstall
)

$ErrorActionPreference = 'SilentlyContinue'
Write-Host "=== ANDROID DEBUG BUILD ===" -ForegroundColor Cyan

function Find-Cmd([string[]] $candidates) {
  foreach ($c in $candidates) {
    $cmd = Get-Command $c -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}
function Find-Adb { Find-Cmd @(
  "$env:ANDROID_HOME\platform-tools\adb.exe",
  "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
  "$env:ProgramFiles\Android\Android Studio\platform-tools\adb.exe",
  "adb"
)}

$adbPath = Find-Adb
if (-not $adbPath) { $adbPath = "adb" }

# 0) Sanity
if (-not (Test-Path .\android\gradlew)) {
  Write-Host "❌ gradlew introuvable (android/). Tu es bien à la racine du projet ?" -ForegroundColor Red
  exit 1
}

# 1) Stop Gradle
Write-Host "Stopping Gradle daemons..." -ForegroundColor DarkGray
.\android\gradlew --stop | Out-Null

# 2) Build debug
Write-Host "Assembling debug..." -ForegroundColor Cyan
Push-Location android | Out-Null
.\gradlew assembleDebug
if ($LASTEXITCODE -ne 0) { Write-Host "❌ assembleDebug failed" -ForegroundColor Red; Pop-Location; exit 1 }

if (-not $SkipInstall) {
  Write-Host "Installing debug on connected devices..." -ForegroundColor Cyan
  .\gradlew installDebug
  if ($LASTEXITCODE -ne 0) { Write-Host "❌ installDebug failed" -ForegroundColor Red; Pop-Location; exit 1 }
}
Pop-Location | Out-Null

# 3) Start ADB, detect devices
& $adbPath start-server | Out-Null
Start-Sleep -Seconds 1
$lines = & $adbPath devices
$ids = @()
$lines -split "`n" | ForEach-Object {
  $l = $_.Trim()
  if ($l -and -not $l.StartsWith("List of devices")) {
    if ($l -match "^(?<id>\S+)\s+device$") {
      $ids += $Matches["id"]
    }
  }
}

if ($ids.Count -eq 0) {
  Write-Host "⚠️  Aucun device ADB 'device' détecté. Branche un téléphone ou lance un émulateur." -ForegroundColor Yellow
} else {
  foreach ($id in $ids) {
    # Reverse Metro pour tous (ému + réel)
    & $adbPath -s $id reverse tcp:8081 tcp:8081 2>$null
    # Permission notifs (Android 13+)
    & $adbPath -s $id shell pm grant com.guigui92.vigiapp android.permission.POST_NOTIFICATIONS 2>$null

    if ($id -like "emulator-*") {
      Write-Host "✅ Reverse 8081 + POST_NOTIFICATIONS → émulateur: $id" -ForegroundColor Green
    } else {
      Write-Host "✅ Reverse 8081 + POST_NOTIFICATIONS → téléphone: $id" -ForegroundColor Green
    }
  }
}

# 4) Metro
Write-Host "Starting Metro (expo start)..." -ForegroundColor Cyan
npx expo start
