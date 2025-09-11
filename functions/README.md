functions/
├─ package.json
├─ index.js              # Agrégateur d'exports (région, instances, exports…)
└─ src/
   ├─ utils.js           # Init admin + helpers (auth, push, logs, db…)
   ├─ pushPublic.js      # Callable: sendPublicAlertByCEP
   ├─ pushPrivate.js     # Callable: sendPrivateAlertByGroup
   └─ purge.js           # Cron: purgeAndArchiveOldRequestsAndChats


                         (Firebase)
                    ┌──────────────────┐
                    │  index.js        │   ⇦ AGRÉGATEUR
App mobile ──call──▶│  exports = {     │
(callable)          │    sendPublic..., │
                    │    sendPrivate...,│
                    │    purge...       │
                    └────────┬─────────┘
                             │
                 ┌───────────┴───────────┐
                 │ LOGIQUE MÉTIER (src/) │
                 │                       │
     ┌───────────▼───────────┐  ┌────────▼─────────┐   ┌──────────▼──────────┐
     │ pushPublic.js         │  │ pushPrivate.js    │   │ purge.js             │
     │ - assertRole          │  │ - assertRole      │   │ - cutoff (J-5)       │
     │ - getTokensByCEP      │  │ - getTokensByUser │   │ - archive chats+GH    │
     │ - createDeliveryLog   │  │ - createDeliveryLog│  │ - purge messages      │
     │ - expoPushSend        │  │ - expoPushSend     │  │ - logs d’audit        │
     └───────────┬───────────┘  └────────┬──────────┘   └──────────┬──────────┘
                 │                        │                        │
                 └──────────────┬─────────┴──────────┬─────────────┘
                                ▼                    ▼
                          ┌───────────────┐    ┌───────────────┐
                          │  utils.js     │    │  Firebase/GCP  │
                          │  - admin/db   │    │  - Firestore   │
                          │  - chunk      │    │  - Expo Push   │
                          │  - assertRole │    │  - Scheduler   │
                          │  - expoPush…  │    └───────────────┘
                          │  - logs       │
                          └───────────────┘
⚙️ Prérequis

Node: 20.x (pinné)

Firebase CLI: à jour

Projet Firebase sélectionné (firebase use <projectId>)

firebase.json (racine) doit contenir :

{
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  }
}

📦 Scripts (npm)

Depuis functions/ :

npm install             # installer deps
npm run serve           # emulateur local (functions)
npm run deploy          # deployer uniquement les functions
npm run logs            # suivre les logs

🔐 Sécurité & modèles Firestore

Custom claims requis pour les callables : role ∈ {"admin","moderator"}

Exemple (côté admin SDK) :

await admin.auth().setCustomUserClaims(uid, { role: "admin" });


Collections attendues :

devices/{deviceId} : { expoPushToken, userId, cep, ... }

groups/{groupId} : { memberIds: string[] }

deliveries/{logId} : logs d’envoi

groupHelps / archivedGroupHelps / chats / chatsArquivados / chats/*/mensagens

purgeLogs, errorLogs

📣 Fonctions exposées
Callable — sendPublicAlertByCEP

Data : { cep: string, title?: string, body?: string }

Effet : envoie une notif à tous les devices du CEP donné (via Expo Push API)

Logs : entrée deliveries/{logId} + retour { ok, count, logId }

Callable — sendPrivateAlertByGroup

Data : { groupId: string, title?: string, body?: string }

Effet : envoie une notif privée aux membres d’un groupe

Logs : deliveries/{logId} + retour { ok, count, logId }

Cron — purgeAndArchiveOldRequestsAndChats

Planification : every 24 hours — TZ America/Fortaleza

Effet :

archive groupHelps > J+5 dans archivedGroupHelps

archive métadonnées des chats dans chatsArquivados

supprime messages (chats/*/mensagens) + doc chats

journalise dans purgeLogs et errorLogs en cas d’erreur

💳 Les fonctions planifiées nécessitent la facturation activée (Cloud Scheduler).

🧪 Tester en local

Installer & lancer l’émulateur

cd functions
npm install
cd ..
firebase emulators:start --only functions


Tester les callables
Dans l’onglet Emulator UI, utilisez Functions > Call function

sendPublicAlertByCEP → payload :

{ "cep": "62595-000", "title": "Alerte test", "body": "Ping quartier — solo" }


sendPrivateAlertByGroup → payload :

{ "groupId": "grp_test", "title": "Privé test", "body": "Ping groupe — solo" }


⚠️ Les callables exigent un contexte auth avec custom claims en prod.
En émulateur, vous pouvez mock l’auth via la Console ou Functions Shell si besoin.

🚀 Déploiement
# Vérifier le projet
firebase use

# Déployer uniquement les functions
firebase deploy --only functions

# Lister les functions
firebase functions:list

📝 Logging

Par défaut, on log en console.log/warn/error (capturé par GCP).

Optionnel : firebase-functions/logger pour un logging structuré.

const logger = require("firebase-functions/logger");
logger.info("Contexte", { foo: "bar" });


Vous pouvez combiner les deux via des helpers (utils.js) pour avoir
à la fois la console locale et l’indexation GCP.

🧯 Troubleshooting (rapide)

“Cannot find module …” → cd functions && npm install

“already exists: app named [DEFAULT]” → init idempotente dans utils.js (déjà géré)

Cron qui ne tourne pas → activer facturation + vérifier Cloud Scheduler

Pas de notifs reçues :

vérifier que les Expo push tokens sont valides (champ expoPushToken)

tester un envoi minimal direct via Expo Push Tool

s’assurer que l’app Android a bien le channel default et les permissions

🔒 Bonnes pratiques

Ne jamais mettre firebase-admin, firebase-functions, @google-cloud/* dans l’app mobile.

Limiter les writes Firestore dans les boucles (ici c’est batché par conception).

Région unique (us-central1) → coûts & latence stables.

Idempotence : admin.apps.length === 0 avant initializeApp().

🧾 Licence & Crédit

Propriété du projet VigiApp.
Ce dossier functions/ est le backend de l’application (Firebase/GCP).