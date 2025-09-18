import { create } from 'zustand';
// Types légers pour éviter les soucis si TS strict
type CustomerInfo = any;
type Offerings = any;

type State = {
  proActive: boolean;
  offerings: Offerings | null;
  setOfferings: (o: Offerings | null) => void;
  applyCustomerInfo: (ci: CustomerInfo, entitlementId: string) => void;
};

export const useMonetizationStore = create<State>((set) => ({
  proActive: false,
  offerings: null,
  setOfferings: (o) => set({ offerings: o }),
  applyCustomerInfo: (ci, entitlementId) => {
    try {
      // RevenueCat >= 5 : ci.entitlements.active est un objet { [id]: EntitlementInfo }
      const active = !!ci?.entitlements?.active?.[entitlementId];
      set({ proActive: active });
    } catch (e: any) {
      console.warn('[RC] applyCustomerInfo failed:', e?.message || e);
    }
  },
}));
