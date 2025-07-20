import { create } from "zustand";

/**
 * user: { id, apelido, cep, email, nome, cpf, ... }
 * groupId: string | null
 */
export const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  groupId: null,
  setGroupId: (groupId) => set({ groupId }),
  lastSeenAlert: null,
  setLastSeenAlert: (lastSeenAlert) => set({ lastSeenAlert }),
  reset: () => set({ user: null, groupId: null, lastSeenAlert: null }),
}));
