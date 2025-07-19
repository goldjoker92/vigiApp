import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useUserStore } from '../store/users';

// Charge Firestore → Zustand (userId obligatoire)
export async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return null;
  useUserStore.getState().setUser({ id: uid, ...userDoc.data() });
  return userDoc.data();
}

// Sauve dans Firestore
export async function saveUserProfile(uid, data) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}
