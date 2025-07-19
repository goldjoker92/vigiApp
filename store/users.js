import { create } from "zustand";

// Stocke le user avec toutes les infos requises (id, apelido, cep, nome, cpf, etc.)
export const useUserStore = create((set) => ({
  user: null, // { id, apelido, cep, email, nome, cpf }
  setUser: (user) => set({ user }),
  groupId: null,
  setGroupId: (groupId) => set({ groupId }),
  lastSeenAlert: null,
  setLastSeenAlert: (lastSeenAlert) => set({ lastSeenAlert }),
  reset: () => set({ user: null, groupId: null, lastSeenAlert: null }),
}));
