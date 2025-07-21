import { create } from "zustand";

/**
 * user: { id, apelido, cep, email, nome, cpf, ... }
 * groupId: string | null
 * lastSeenAlert: Date | null
 */
export const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  groupId: null,
  setGroupId: (groupId) => set({ groupId }),

  lastSeenAlert: null,
  setLastSeenAlert: (lastSeenAlert) => set({ lastSeenAlert }),

  // Remet tout à zéro pour une déconnexion sécurisée
  reset: () =>
    set({
      user: null,
      groupId: null,
      lastSeenAlert: null,
    }),
}));
