// utils/loadUserProfile.js
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useUserStore } from '../store/users';

export async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return null;
  // PATCH: Toujours .id
  useUserStore.getState().setUser({ id: uid, ...userDoc.data() });
  return userDoc.data();
}
