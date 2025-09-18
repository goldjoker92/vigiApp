# 📱 vigiApp — Neighbors Helping Neighbors

> **Languages:**  
> 🇬🇧 [English](#english) · 🇧🇷 [Português (Brasil)](#português-brasil)

---

## 🇬🇧 English

### What is vigiApp?

**vigiApp** is a mobile app to report, chat, and coordinate help in your neighborhood.

---

### ✨ Features

- 📍 **Interactive Map:** View neighborhood alerts in real time.
- 💬 **Group Chats:** Coordinate with your community.
- 🚨 **Quick Reports:** Instantly signal incidents or request help.
- 👤 **Onboarding & Profile:** Seamless user setup and management.
- 🔔 **Push Notifications:** Stay up to date.

---

### 🧰 Tech Stack

| Tool / Library    | Usage                                 |
| ----------------- | ------------------------------------- |
| Expo (Dev Client) | Project bootstrapping, native modules |
| React Native      | Mobile UI development                 |
| Expo Router       | File-based navigation                 |
| Firebase          | Auth, Firestore, (optionally FCM)     |
| Zustand           | State management                      |
| Custom Hooks      | App-specific logic                    |
| Google Maps SDK   | Android mapping                       |

---

### 🚀 Quick Start

#### **Prerequisites**

- Node.js LTS (18+)
- Git
- Java JDK 17
- Android Studio with SDK 35 (Android 15)

#### **Installation & Run**

```bash
git clone <repo-url>
cd vigiApp
npm install            # or: yarn

# Start Metro / Expo
npx expo start
```

##### **Expo Dev Client (recommended for native libs)**

```bash
npx expo run:android
npx expo start --dev-client
# In the Expo terminal, press: a
```

##### **Android debug APK (classic Gradle)**

```bash
# macOS/Linux
cd android && ./gradlew assembleDebug && cd ..

# Windows PowerShell
cd android; .\gradlew.bat assembleDebug; cd ..
# APK output: android/app/build/outputs/apk/debug/
```

---

### 🔑 Configuration

#### **Google Maps API Key (Android)**

Set via Gradle `manifestPlaceholders` in `android/app/build.gradle`:

```groovy
defaultConfig {
  manifestPlaceholders = [
    GOOGLE_MAPS_API_KEY: (
      System.getenv("GOOGLE_MAPS_API_KEY")
        ?: project.findProperty("GOOGLE_MAPS_API_KEY")
        ?: ""
    )
  ]
}
```

Provide the key by one of:

- **Env var**
  - Windows (PowerShell): `setx GOOGLE_MAPS_API_KEY "AIza..."` (restart terminal)
  - macOS/Linux: `export GOOGLE_MAPS_API_KEY="AIza..."`
- **android/gradle.properties**: `GOOGLE_MAPS_API_KEY=AIza...`
- **CI secrets** (recommended for pipelines)

#### **Firebase**

Create `firebase.(ts|js)` with your project credentials.  
Prefer `EXPO_PUBLIC_*` for non-sensitive client variables.

---

### 🧭 Project Structure

```
vigiApp/
├─ app/             # Expo Router pages
│  ├─ (tabs)/       # Home, Map, Notifications, Profile, Neighbors
│  ├─ alerts/       # Public alerts
│  ├─ auth/         # Onboarding & signup
│  └─ chats/        # 1:1 chats
├─ services/        # Auth, groups, help, chat APIs
├─ hooks/           # Custom hooks (auth, groups, server status…)
├─ store/           # Zustand store (e.g., users.js)
├─ utils/           # Helpers
└─ android/         # Android native project
```

---

### 🛠️ Handy Scripts

Add to your `package.json` if desired:

```json
{
  "scripts": {
    "start": "expo start",
    "start:dc": "expo start --dev-client",
    "android": "expo run:android",
    "android:clean": "cd android && gradlew.bat clean && cd ..",
    "kill:metro": "kill-port 8081 || true"
  }
}
```

# 🔥 VigiApp — Backend (Firebase Functions)

Backend **Cloud Functions** for VigiApp.  
Stack: **Node 20**, **CommonJS**, **Firebase Admin/Functions**, **Firestore**, **Expo Push**.

---

## 📁 Structure

functions/
├─ package.json
├─ index.js # Export aggregator (region, instances, exports…)
└─ src/
├─ utils.js # Admin init + helpers (auth, push, logs, db…)
├─ pushPublic.js # Callable: sendPublicAlertByCEP
├─ pushPrivate.js # Callable: sendPrivateAlertByGroup
└─ purge.js # Cron: purgeAndArchiveOldRequestsAndChats

---

## 🧠 Architecture

                     (Firebase)
                ┌──────────────────┐
                │  index.js        │   ⇦ AGGREGATOR

Mobile app ──call──▶│ exports = { │
(callable) │ sendPublic..., │
│ sendPrivate...,│
│ purge... │
└────────┬─────────┘
│
┌───────────┴───────────┐
│ BUSINESS LOGIC (src/) │
│ │
┌───────────▼───────────┐ ┌────────▼─────────┐ ┌──────────▼──────────┐
│ pushPublic.js │ │ pushPrivate.js │ │ purge.js │
│ - assertRole │ │ - assertRole │ │ - cutoff (D-5) │
│ - getTokensByCEP │ │ - getTokensByUser │ │ - archive chats+GH │
│ - createDeliveryLog │ │ - createDeliveryLog│ │ - purge messages │
│ - expoPushSend │ │ - expoPushSend │ │ - audit logs │
└───────────┬───────────┘ └────────┬──────────┘ └──────────┬──────────┘
│ │ │
└──────────────┬─────────┴──────────┬─────────────┘
▼ ▼
┌───────────────┐ ┌───────────────┐
│ utils.js │ │ Firebase/GCP │
│ - admin/db │ │ - Firestore │
│ - chunk │ │ - Expo Push │
│ - assertRole │ │ - Scheduler │
│ - expoPush… │ └───────────────┘
│ - logs │
└───────────────┘

---

## ⚙️ Requirements

- **Node**: `20.x` (pinned)
- **Firebase CLI**: latest
- Firebase project selected (`firebase use <projectId>`)

👉 Root `firebase.json` should contain:

````json
{
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  }
}

📦 NPM Scripts

Run inside functions/:

npm install             # install deps
npm run serve           # run local emulator (functions)
npm run deploy          # deploy only functions
npm run logs            # follow logs

🔐 Security & Firestore Models

Custom claims required for callables: role ∈ {"admin","moderator"}
Example (admin SDK):

await admin.auth().setCustomUserClaims(uid, { role: "admin" });


Expected collections:

devices/{deviceId} : { expoPushToken, userId, cep, ... }

groups/{groupId} : { memberIds: string[] }

deliveries/{logId} : delivery logs

groupHelps, archivedGroupHelps, chats, chatsArquivados, chats/*/mensagens

purgeLogs, errorLogs

📣 Exposed Functions
Callable — sendPublicAlertByCEP

Data: { cep: string, title?: string, body?: string }

Effect: sends a notification to all devices within a CEP (via Expo Push API)

Logs: deliveries/{logId} + return { ok, count, logId }

Callable — sendPrivateAlertByGroup

Data: { groupId: string, title?: string, body?: string }

Effect: sends a private notification to all members of a group

Logs: deliveries/{logId} + return { ok, count, logId }

Cron — purgeAndArchiveOldRequestsAndChats

Schedule: every 24 hours — TZ America/Fortaleza

Effect:

archive groupHelps older than 5 days → archivedGroupHelps

archive chat metadata → chatsArquivados

delete chat messages (chats/*/mensagens) + chats docs

log purge in purgeLogs and errors in errorLogs

💳 Scheduled functions require billing enabled (Cloud Scheduler).

🧪 Local Testing

Install & start emulator

cd functions
npm install
cd ..
firebase emulators:start --only functions


Test callables
In Emulator UI → Functions > Call function

sendPublicAlertByCEP → payload:

{ "cep": "62595-000", "title": "Test alert", "body": "Ping neighborhood" }


sendPrivateAlertByGroup → payload:

{ "groupId": "grp_test", "title": "Private test", "body": "Ping group" }


⚠️ Callables in production require an auth context with custom claims.
In the emulator, you can mock auth via Console or Functions Shell.

🚀 Deployment
# Verify Firebase project
firebase use

# Deploy functions only
firebase deploy --only functions

# List deployed functions
firebase functions:list

📝 Logging

By default: console.log/warn/error (captured by GCP).

Optional: firebase-functions/logger for structured logs:

const logger = require("firebase-functions/logger");
logger.info("Context", { foo: "bar" });


👉 Both can be combined in utils.js.

🧯 Troubleshooting (Quick)

“Cannot find module …” → cd functions && npm install

“already exists: app named [DEFAULT]” → use idempotent init in utils.js

Cron not running → enable billing + check Cloud Scheduler

No push received:

check Expo push tokens (expoPushToken) are valid

test minimal send via Expo Push Tool

ensure Android app has default channel and permissions

🔒 Best Practices

Never bundle firebase-admin, firebase-functions, @google-cloud/* in the mobile app.

Batch writes to Firestore inside loops (already handled).

Single region (us-central1) for cost & latency consistency.

Idempotence: always check admin.apps.length === 0 before initializeApp().

🧾 License & Credits

Property of the VigiApp project.
This functions/ folder is the backend of the mobile app (Firebase/GCP).


---

Want me to also add **badges** at the top (Node.js version, Firebase deploy, license) so the

---

### 🧯 Troubleshooting

#### 1. `:app:checkDebugAarMetadata` / compileSdk mismatch

- Error:
  `Dependency '...core-splashscreen:1.2.0-...' requires compileSdk 35`
- Solution:
  Set `compileSdkVersion = 35`, `targetSdkVersion = 35`, `minSdkVersion = 24` and `buildToolsVersion = "35.0.0"` (usually in `android/build.gradle` or shared versions file).

```bash
# Windows
cd android; .\gradlew.bat --stop; .\gradlew.bat clean --refresh-dependencies; cd ..
# macOS/Linux
cd android && ./gradlew --stop && ./gradlew clean --refresh-dependencies && cd ..
````

#### 2. Corrupted Gradle cache (`metadata.bin`)

- Windows: remove `C:\Users\<you>\.gradle\caches` (and any custom cache like `C:\gradle-cache-*`)
- macOS/Linux: `rm -rf ~/.gradle/caches`
- Then run a clean build.

#### 3. Emulator shows no location

- In Extended Controls → Location, inject a coordinate or use:  
  `adb emu geo fix <lon> <lat>`
- Ensure the app has location permission and device GPS is ON.

#### 4. Metro/Expo stuck

```bash
# Windows
taskkill /F /IM node.exe
# All OS
rm -rf .expo .expo-shared
npm start
```

---

### ✅ Conventions

- ESLint/Prettier, functional components, hooks for logic
- Controlled form fields (BR masks/validation when applicable)
- **No secrets in repo**; use env/secrets

---

### 🤝 Contributing

Open an issue first, describe scope, follow conventions. PRs welcome.

---

### 📄 License

MIT (adjust as needed)

---

## 🇧🇷 Português (Brasil)

### O que é o vigiApp?

**vigiApp** é um app móvel para reportar, conversar e organizar ajuda no seu bairro.

---

### ✨ Funcionalidades

- 📍 **Mapa interativo** com alertas locais
- 💬 **Chats em grupo** em tempo real
- 🚨 **Sinalização rápida** de incidentes/pedidos de ajuda
- 👤 **Onboarding & perfil** do usuário
- 🔔 **Notificações push**

---

### 🧰 Stack

| Ferramenta / Biblioteca   | Uso                              |
| ------------------------- | -------------------------------- |
| Expo (Dev Client)         | Inicialização, módulos nativos   |
| React Native              | Desenvolvimento do app           |
| Expo Router               | Navegação baseada em arquivos    |
| Firebase                  | Auth, Firestore, (opcional: FCM) |
| Zustand                   | Gerenciamento de estado          |
| Hooks customizados        | Lógica da aplicação              |
| Google Maps SDK (Android) | Mapas no Android                 |

---

### 🚀 Começando

#### **Pré-requisitos**

- Node.js LTS (18+)
- Git
- Java JDK 17
- Android Studio com SDK 35 (Android 15)

#### **Instalação & Execução**

```bash
git clone <url-do-repo>
cd vigiApp
npm install            # ou: yarn

# Iniciar Metro / Expo
npx expo start
```

##### **Expo Dev Client (recomendado para libs nativas)**

```bash
npx expo run:android
npx expo start --dev-client
# No terminal do Expo, pressione: a
```

##### **APK Debug Android (Gradle clássico)**

```bash
# macOS/Linux
cd android && ./gradlew assembleDebug && cd ..

# Windows PowerShell
cd android; .\gradlew.bat assembleDebug; cd ..
# APK em: android/app/build/outputs/apk/debug/
```

---

### 🔑 Configuração

#### **Chave do Google Maps (Android)**

Defina via `manifestPlaceholders` no `android/app/build.gradle`:

```groovy
defaultConfig {
  manifestPlaceholders = [
    GOOGLE_MAPS_API_KEY: (
      System.getenv("GOOGLE_MAPS_API_KEY")
        ?: project.findProperty("GOOGLE_MAPS_API_KEY")
        ?: ""
    )
  ]
}
```

Forneça a chave por:

- **Variável de ambiente**
  - Windows (PowerShell): `setx GOOGLE_MAPS_API_KEY "AIza..."` (reabra o terminal)
  - macOS/Linux: `export GOOGLE_MAPS_API_KEY="AIza..."`
- **android/gradle.properties**: `GOOGLE_MAPS_API_KEY=AIza...`
- **Segredos de CI** (recomendado)

#### **Firebase**

Crie `firebase.(ts|js)` com as credenciais do seu projeto.  
Prefira `EXPO_PUBLIC_*` para variáveis não sensíveis no cliente.

---

### 🧭 Estrutura do Projeto

```
vigiApp/
├─ app/             # Páginas (Expo Router)
│  ├─ (tabs)/       # Home, Map, Notifications, Profile, Neighbors
│  ├─ alerts/       # Alertas públicos
│  ├─ auth/         # Onboarding & cadastro
│  └─ chats/        # Chats 1:1
├─ services/        # Auth, grupos, ajuda, chat
├─ hooks/           # Hooks custom (auth, grupos, etc.)
├─ store/           # Zustand (ex.: users.js)
├─ utils/           # Helpers
└─ android/         # Projeto nativo Android
```

---

### 🛠️ Scripts úteis

Adicione ao seu `package.json` se desejar:

```json
{
  "scripts": {
    "start": "expo start",
    "start:dc": "expo start --dev-client",
    "android": "expo run:android",
    "android:clean": "cd android && gradlew.bat clean && cd ..",
    "kill:metro": "kill-port 8081 || true"
  }
}
```

---

### 🧯 Solução de Problemas

#### 1. `:app:checkDebugAarMetadata` / compileSdk incompatível

- Erro:  
  `Dependency '...core-splashscreen:1.2.0-...' requires compileSdk 35`
- Solução:  
  Defina `compileSdkVersion = 35`, `targetSdkVersion = 35`, `minSdkVersion = 24` e `buildToolsVersion = "35.0.0"`.

```bash
# Windows
cd android; .\gradlew.bat --stop; .\gradlew.bat clean --refresh-dependencies; cd ..
# macOS/Linux
cd android && ./gradlew --stop && ./gradlew clean --refresh-dependencies && cd ..
```

#### 2. Cache Gradle corrompido (`metadata.bin`)

- Windows: remova `C:\Users\<você>\.gradle\caches` (e quaisquer caches custom como `C:\gradle-cache-*`)
- macOS/Linux: `rm -rf ~/.gradle/caches`
- Depois execute um build limpo.

#### 3. Emulador sem localização

- Em Extended Controls → Location, injete coordenadas ou use:  
  `adb emu geo fix <lon> <lat>`
- Cheque permissões de localização e GPS ligado.

#### 4. Metro/Expo travado

```bash
# Windows
taskkill /F /IM node.exe
# Todos OS
rm -rf .expo .expo-shared
npm start
```

---

### ✅ Boas Práticas

- ESLint/Prettier, componentes funcionais, hooks para lógica
- Campos controlados (máscaras/validações BR quando aplicável)
- **Nada de segredos no repositório**; use env/secrets

---

### 🤝 Contribuição

Abra uma issue descrevendo o escopo. PRs são bem-vindos.

---

### 📄 Licença

MIT - MIT License

```
Copyright (c) 2025 VigiApp

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
