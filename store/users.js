import { create } from "zustand";

export const useUserStore = create((set) => ({
  // Données utilisateur
  user: null,
  setUser: (user) => {
  console.log('[useUserStore][setUser] 🟢', user?.id, user?.email, user?.apelido, user);
  console.trace();
  set({ user });
},

  // GroupId courant (toujours à jour si on change de groupe dans l'app)
  groupId: null,
  setGroupId: (groupId) => {
    console.log("[useUserStore] setGroupId", groupId);
    console.trace();
    set({ groupId });
  },

  // Loader d'état du groupe (utile pour skeleton/loading UI)
  isGroupLoading: false,
  setIsGroupLoading: (bool) => {
    console.log("[useUserStore] setIsGroupLoading", bool);
    set({ isGroupLoading: bool });
  },

  // Dernier alert vu (pour badge/push/notifications)
  lastSeenAlert: null,
  setLastSeenAlert: (lastSeenAlert) => {
    console.log("[useUserStore] setLastSeenAlert", lastSeenAlert);
    set({ lastSeenAlert });
  },

  // Reset total (pour logout par ex.)
  reset: () => {
    console.log("[useUserStore] reset (logout)");
    set({
      user: null,
      groupId: null,
      isGroupLoading: false,
      lastSeenAlert: null,
    });
  },
}));
