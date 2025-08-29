param(
  [string]$Root = (Resolve-Path ".").Path,
  [switch]$Fix,
  [switch]$InstallGitHook
)

$ErrorActionPreference = "Stop"

function Write-Head($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Write-Ok($t){ Write-Host "✓ $t" -ForegroundColor Green }
function Write-Warn($t){ Write-Host "⚠ $t" -ForegroundColor Yellow }
function Write-Err($t){ Write-Host "✗ $t" -ForegroundColor Red }

$android = Join-Path $Root "android"
$appGradle = Join-Path $android "app\build.gradle"
$rootGradle = Join-Path $android "build.gradle"
$settingsGradle = Join-Path $android "settings.gradle"
$gradleProps = Join-Path $android "gradle.properties"

$files = @($settingsGradle, $rootGradle, $gradleProps, $appGradle)

function Get-UTF8NoBomBytes($text){
  $enc = New-Object System.Text.UTF8Encoding($false)
  return $enc.GetBytes($text)
}
function Clean-Invisibles($text){
  # retire BOM en tête, BOM internes, zero-width chars (ZWSP, ZWNJ, ZWJ, WJ)
  $text = $text -replace '^\uFEFF',''
  $text = $text -replace '\uFEFF',''
  $text = $text -replace '[\u200B\u200C\u200D\u2060]',''
  return $text
}
function Fix-UTF8NoBom($path){
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $hadBom = $false
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $bytes = $bytes[3..($bytes.Length-1)]
    $hadBom = $true
  }
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $orig = $text
  $text = Clean-Invisibles $text
  $changed = $hadBom -or ($text -ne $orig)
  if ($Fix -and $changed) {
    [System.IO.File]::WriteAllBytes($path, (Get-UTF8NoBomBytes $text))
  }
  return @{ Changed = $changed; HadBom = $hadBom }
}

function File-Contains($path, $pattern){
  if (!(Test-Path $path)) { return $false }
  $c = Get-Content -Raw -LiteralPath $path
  return ($c -match $pattern)
}

function Ensure-Block-In-RootGradle(){
  if (!(Test-Path $rootGradle)) { return }
  $c = Get-Content -Raw -LiteralPath $rootGradle

  # 1) Pas de classpath RNGP ici
  if ($c -match 'com\.facebook\.react:react-native-gradle-plugin') {
    Write-Warn "classpath RN trouvé dans build.gradle (racine) — à retirer."
    if ($Fix) {
      $c = $c -replace '.*com\.facebook\.react:react-native-gradle-plugin.*\r?\n',''
      Write-Ok "Supprimé classpath RNGP du buildscript."
    }
  } else { Write-Ok "Aucun classpath RNGP (OK)." }

  # 2) Force androidx.browser stable (évite 1.10.0-alpha)
  if ($c -notmatch "resolutionStrategy\s*\{[^}]*force\s+'androidx\.browser:browser:1\.8\.0'") {
    Write-Warn "Pin androidx.browser manquant (1.8.0)."
    if ($Fix) {
      $pin = @"
//
// Guard: évite les alpha d'androidx.browser
subprojects { subproject ->
  subproject.configurations.configureEach { cfg ->
    cfg.resolutionStrategy {
      force 'androidx.browser:browser:1.8.0'
    }
  }
}
"@
      $c = $c.TrimEnd() + "`r`n" + $pin
      Write-Ok "Ajout pin androidx.browser:1.8.0."
    }
  } else { Write-Ok "Pin androidx.browser:1.8.0 présent." }

  # 3) Plugins root Expo/RN
  $needExpo = ($c -notmatch 'apply plugin:\s*"expo-root-project"')
  $needRNRoot = ($c -notmatch 'apply plugin:\s*"com\.facebook\.react\.rootproject"')
  if ($needExpo -or $needRNRoot) {
    Write-Warn "Lignes d'apply plugin (expo/rn root) incomplètes."
    if ($Fix) {
      if ($needExpo)   { $c = $c + "`r`napply plugin: `"expo-root-project`""; Write-Ok "Ajout expo-root-project." }
      if ($needRNRoot) { $c = $c + "`r`napply plugin: `"com.facebook.react.rootproject`""; Write-Ok "Ajout com.facebook.react.rootproject." }
    }
  } else { Write-Ok "Plugins root Expo/RN présents." }

  if ($Fix) { Set-Content -LiteralPath $rootGradle -Value $c -Encoding utf8 }
}

function Ensure-AppGradle-Minimal(){
  if (!(Test-Path $appGradle)) { return }
  $c = Get-Content -Raw -LiteralPath $appGradle

  # plugins { com.android.application, org.jetbrains.kotlin.android }
  if ($c -notmatch 'plugins\s*\{[^}]*id\("com\.android\.application"\)') {
    Write-Warn "plugins{ com.android.application } manquant."
  } else { Write-Ok "plugins{ com.android.application } OK." }
  if ($c -notmatch 'plugins\s*\{[^}]*id\("org\.jetbrains\.kotlin\.android"\)') {
    Write-Warn "plugins{ org.jetbrains.kotlin.android } manquant."
  } else { Write-Ok "plugins{ org.jetbrains.kotlin.android } OK." }

  # apply plugin: "com.facebook.react"
  if ($c -notmatch 'apply plugin:\s*"com\.facebook\.react"') {
    Write-Warn "apply plugin: \"com.facebook.react\" manquant."
    if ($Fix) {
      # Insère juste après le bloc plugins
      $c = $c -replace '(plugins\s*\{[^}]*\})', "`$1`r`napply plugin: `"com.facebook.react`""
      Write-Ok "Ajout apply plugin: com.facebook.react."
    }
  } else { Write-Ok "apply plugin RN OK." }

  # react { }
  if ($c -notmatch '(?ms)^\s*react\s*\{.*?\}') {
    Write-Warn "bloc react { } manquant."
    if ($Fix) {
      # Ajoute un bloc minimal en haut après apply
      if ($c -match 'apply plugin:\s*"com\.facebook\.react"') {
        $c = $c -replace '(apply plugin:\s*"com\.facebook\.react".*?\r?\n)', "`$1react {}`r`n"
      } else {
        $c = "react {}`r`n" + $c
      }
      Write-Ok "Ajout react { } minimal."
    }
  } else { Write-Ok "bloc react { } OK." }

  # compileSdk/targetSdk >= 35 (ne modifie pas si déjà ≥35)
  $compile = [int]0
  if ($c -match 'compileSdkVersion\s+(\d+)') { $compile = [int]$matches[1] }
  if ($compile -lt 35) {
    Write-Warn "compileSdkVersion=$compile (recommandé ≥ 35)."
    if ($Fix) {
      $c = $c -replace 'compileSdkVersion\s+\d+','compileSdkVersion 35'
      Write-Ok "compileSdkVersion fixé à 35."
    }
  } else { Write-Ok "compileSdkVersion=$compile (OK)." }

  if ($Fix) { Set-Content -LiteralPath $appGradle -Value $c -Encoding utf8 }
}

function Check-SettingsGradle(){
  if (!(Test-Path $settingsGradle)) { return }
  $c = Get-Content -Raw -LiteralPath $settingsGradle
  if ($c -notmatch 'pluginManagement\s*\{') { Write-Warn "settings.gradle: bloc pluginManagement { } manquant." } else { Write-Ok "pluginManagement présent." }
  if ($c -notmatch 'pluginManagement\s*\{(?s).*?plugins\s*\{') { Write-Warn "settings.gradle: sous-bloc plugins { } manquant." } else { Write-Ok "plugins { } présent." }
  if ($c -notmatch '@react-native/gradle-plugin') { Write-Warn "settings.gradle: includeBuild @react-native/gradle-plugin manquant." } else { Write-Ok "includeBuild RNGP OK." }
  if ($c -notmatch 'expo/packages/expo-gradle-plugin') { Write-Warn "settings.gradle: includeBuild expo-gradle-plugin manquant." } else { Write-Ok "includeBuild Expo OK." }
}

Write-Head "Nettoyage BOM/ZWSP"
foreach ($f in $files) {
  if (Test-Path $f) {
    $res = Fix-UTF8NoBom $f
    if ($res.Changed) {
      Write-Ok "$(Split-Path $f -Leaf): invisibles nettoyés (BOM:$($res.HadBom))"
    } else {
      Write-Ok "$(Split-Path $f -Leaf): RAS"
    }
  } else {
    Write-Warn "Absent: $f"
  }
}

Write-Head "Vérifs Gradle"
Ensure-Block-In-RootGradle
Ensure-AppGradle-Minimal
Check-SettingsGradle

if ($InstallGitHook) {
  Write-Head "Hook Git anti-BOM/ZWSP"
  $hookDir = Join-Path $Root ".git\hooks"
  if (Test-Path $hookDir) {
    $hook = @'
#!/usr/bin/pwsh
$zwsp=[char]0x200B; $bom=[char]0xFEFF
$bad=$false
git diff --cached --name-only | %{
  if (Test-Path $_) {
    $t = Get-Content -Raw -LiteralPath $_
    if ($t.StartsWith($bom) -or $t.Contains($zwsp) -or $t.Contains($bom)) {
      Write-Host "❌ Invisibles détectés dans $($_)" -ForegroundColor Red
      $bad = $true
    }
  }
}
if ($bad){ exit 1 }
'@
    $hookPath = Join-Path $hookDir "pre-commit"
    Set-Content -LiteralPath $hookPath -Value $hook -Encoding utf8
    Write-Ok "Hook installé: .git/hooks/pre-commit"
  } else {
    Write-Warn "Repo Git non détecté (pas de .git/hooks)."
  }
}

Write-Host "`nTerminé. Utilisation: .\tools\guard-gradle.ps1 -Root 'C:\Users\Oscar\vigiApp' [-Fix] [-InstallGitHook]"
