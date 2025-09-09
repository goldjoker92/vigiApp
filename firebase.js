// firebase.js
// -------------------------------------------------------------
// Init Firebase pour React Native / Expo SDK 53+
// - Lit la config depuis app.config.js -> extra.FIREBASE_*
// - Auth persistante avec AsyncStorage (initializeAuth)
// - Anti double-init (Fast Refresh) via getApps()/try-catch
// - Exporte: app, auth, db
// -------------------------------------------------------------
import Constants from "expo-constants";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";

// --- Config depuis app.config.js (extra.* déjà présents chez toi)
const extra = (Constants?.expoConfig?.extra) || {};
const firebaseConfig = {
  apiKey: extra.FIREBASE_API_KEY,
  authDomain: extra.FIREBASE_AUTH_DOMAIN,
  projectId: extra.FIREBASE_PROJECT_ID,
  storageBucket: extra.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: extra.FIREBASE_MESSAGING_SENDER_ID,
  appId: extra.FIREBASE_APP_ID,
};

// --- App: init unique (réutilise si déjà créée)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
console.log(getApps().length ? "♻️ [firebase] app réutilisée" : "✅ [firebase] app initialisée", firebaseConfig.projectId);

// --- Auth: initializeAuth (persistence AsyncStorage) une seule fois
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
  console.log("✅ [firebase] auth initialisée (AsyncStorage)");
} catch (e) {
  // Si déjà initialisée (Fast Refresh), on récupère l’instance existante
  auth = getAuth(app);
  console.log("ℹ️ [firebase] auth réutilisée");
}

// --- Firestore (client)
const db = getFirestore(app);
console.log("ℹ️ [firebase] firestore prêt");

// --- Exports
export { app, auth, db };
