// firebase.js
import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

// --- CONFIG ---
const firebaseConfig = {
  apiKey: 'AIzaSyDTmdSitr7uLEcyWpIsx4b3ARGoxgSc96Q',
  authDomain: 'vigiapp-c7108.firebaseapp.com',
  projectId: 'vigiapp-c7108',
  storageBucket: 'vigiapp-c7108.appspot.com',
  messagingSenderId: '322173277588',
  appId: '1:322173277588:web:0127a4d72de87ebd8b2b81',
};

// --- CACHE GLOBAL pour éviter tout re-init (hot reload, multi-import) ---
const globalScope = global || globalThis;

if (!globalScope.__firebase) {
  // première initialisation
  const app = initializeApp(firebaseConfig);
  console.log('🔥 Firebase App initialisée pour la première fois');
  const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
  const db = getFirestore(app);
  globalScope.__firebase = { app, auth, db };
} else {
  console.log('♻️ Firebase réutilisée depuis le cache global');
}

// Exporte l’unique instance
const { auth, db } = globalScope.__firebase;

// Log d’assurance (optionnel, tu peux le commenter si trop verbeux)
console.log('Instance Firebase Auth:', auth?.app?.name);

export { auth, db };
