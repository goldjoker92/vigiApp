import { initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

// Ta vraie config Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyDTmdSitr7uLEcyWpIsx4b3ARGoxgSc96Q',
  authDomain: 'vigiapp-c7108.firebaseapp.com',
  projectId: 'vigiapp-c7108',
  storageBucket: 'vigiapp-c7108.appspot.com',
  messagingSenderId: '322173277588',
  appId: '1:322173277588:web:0127a4d72de87ebd8b2b81',
  // measurementId n'est pas nécessaire sur mobile
};

// Initialisation
const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

const db = getFirestore(app);

export { auth, db };
