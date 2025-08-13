README proposé pour vigiApp
📱 vigiApp
Application mobile construite avec Expo et React Native pour favoriser l’entraide entre voisins.
Fonctionnalités principales :

📍 Carte interactive des alertes de quartier

💬 Chats de groupe en temps réel

🚨 Signalement rapide d’incidents ou de besoins d’aide

👤 Onboarding et gestion de profil

🔔 Notifications poussées


git clone <repo-url>
cd vigiApp
npm install          # ou yarn
npx expo start       # démarre le serveur Expo

cd android && ./gradlew assembleDebug   # Android

vigiApp/
├── app/               # Pages et navigation file-based (Expo Router)
│   ├── (tabs)/        # Onglets: Home, Map, Notifications, Profil, Voisins
│   ├── alerts/        # Alertes publiques
│   ├── auth/          # Onboarding & inscription
│   └── chats/         # Chats individuels
├── services/          # Authentification, groupes, aide, chat
├── hooks/             # Hooks personnalisés (auth, groupes, status serveur…)
├── store/             # Store (ex: users.js)
├── utils/             # Helpers divers
└── android/           # Projet natif Android





