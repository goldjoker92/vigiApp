// store/userStore.js

import { create } from "zustand";

export const useUserStore = create((set) => ({
  // Données utilisateur
  user: null,
  setUser: (user) => set({ user }),

  // GroupId courant (toujours à jour si on change de groupe dans l'app)
  groupId: null,
  setGroupId: (groupId) => set({ groupId }),

  // Loader d'état du groupe (utile pour skeleton/loading UI)
  isGroupLoading: false,
  setIsGroupLoading: (bool) => set({ isGroupLoading: bool }),

  // Dernier alert vu (pour badge/push/notifications)
  lastSeenAlert: null,
  setLastSeenAlert: (lastSeenAlert) => set({ lastSeenAlert }),

  // Reset total (pour logout par ex.)
  reset: () =>
    set({
      user: null,
      groupId: null,
      isGroupLoading: false,
      lastSeenAlert: null,
    }),
}));
