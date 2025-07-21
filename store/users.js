import { create } from "zustand";

export const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  groupId: null,
  setGroupId: (groupId) => set({ groupId }),

  isGroupLoading: false,
  setIsGroupLoading: (bool) => set({ isGroupLoading: bool }),

  lastSeenAlert: null,
  setLastSeenAlert: (lastSeenAlert) => set({ lastSeenAlert }),

  reset: () =>
    set({
      user: null,
      groupId: null,
      isGroupLoading: false,
      lastSeenAlert: null,
    }),
}));
