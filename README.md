# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

- Feature vizihno help :
- 1. README — Structure du dossier (Vizinhos/EntrAide)
/screens
VizinhosScreen.jsx
Page principale du groupe, infos groupe, bouton quitter, feed demandes, modale quitter.

/components
FeedGroupRequestsContainer.jsx
Le “container” de feed : toutes les demandes (perso & groupe), Coachmark, modale édition.

CardHelpRequest.jsx
La carte d’une demande d’aide (toutes les actions : éditer, annuler, accepter, masquer, swiper…)

EditHelpModal.jsx
Modale d’édition d’une demande (message).

Coachmark.jsx
Astuce “Swipe pour supprimer du feed” (coachmark).

QuitGroupModal.jsx
La modale “quitter le groupe” (si tu veux la garder).

/services
groupHelpService.js
Toutes les fonctions Firestore (getUserRequests, getGroupRequests, updateGroupHelp, accept, cancel, hide…)

/store
users.js
Store Zustand pour le user (user, groupId, etc.)

/hooks
useGrupoDetails.js
Hook pour charger les infos d’un groupe.

2. Audit — Fichiers à garder/supprimer
À GARDER (minimum vital pour feed entraide)
VizinhosScreen.jsx

FeedGroupRequestsContainer.jsx

CardHelpRequest.jsx

EditHelpModal.jsx

Coachmark.jsx

QuitGroupModal.jsx (optionnel, mais recommandé)

groupHelpService.js (et tout service Firestore lié aux demandes)

users.js (store Zustand)

useGrupoDetails.js (hook groupe)

À SUPPRIMER / NE PAS UTILISER
GroupHelpSection.jsx

MyRequestsFeed.jsx

Tout ancien composant de “feed” ou “section” qui faisait des requêtes ou du rendu de demandes.

Toute ancienne logique de fetch “demande” en dehors de FeedGroupRequestsContainer.

Bonnes pratiques
Centralise TOUT le feed entraide dans FeedGroupRequestsContainer (et ses enfants : Card, Modal…)

Les services Firestore sont tous dans groupHelpService.js

Le store Zustand doit exposer le user & groupId partout

Aucun accès Firestore “en direct” dans le composant d’affichage du feed (sauf admin reassignment si besoin).

Checklist “clean”
 1 seul composant qui gère tout le feed (FeedGroupRequestsContainer)

 Toutes les cartes utilisent la même logique, le même style

 Actions de demande (éditer, annuler, masquer, accepter, swipe) = props/actions du container

 Aucune redondance entre “mes demandes” et “demandes du groupe”

 Coachmark intégré, modale édition toujours au niveau racine du container


