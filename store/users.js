//store/user.js
import { create } from "zustand";;

// Stocke le user, le groupe courant, et le timestamp du dernier alert vu
export const useUserStore = create((set) => ({
  user: null, // {id, apelido, cep, email, etc.}
  setUser: (user) => set({ user }),

  groupId: null, // Le groupe auquel l'utilisateur appartient
  setGroupId: (groupId) => set({ groupId }),

  lastSeenAlert: null, // Pour les notifications badge
  setLastSeenAlert: (lastSeenAlert) => set({ lastSeenAlert }),

  reset: () => set({ user: null, groupId: null, lastSeenAlert: null }),
}));
