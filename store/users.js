// store/users.js
import { create } from 'zustand';
import { doc, getDoc } from "firebase/firestore";
import { db } from '../firebase';

export const useUserStore = create((set, get) => ({
  user: null, // { id, email, apelido, ... }
  groupId: null,
  setUser: (user) => set({ user }),
  setGroupId: (groupId) => set({ groupId }),

  // Charge le profil user Firestore + son groupId
  async loadUser(uid) {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    // PATCH: Toujours avoir .id
    set({ user: { id: uid, ...data }, groupId: data.groupId || null });
    console.log("[UserStore] Profil chargé:", { id: uid, ...data });
  },

  clearUser: () => set({ user: null, groupId: null }),
}));
