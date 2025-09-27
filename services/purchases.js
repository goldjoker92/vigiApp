/* =============================================================
 RevenueCat services
 - initRevenueCat()
 - getCurrentOfferingWithRetry()
 - buyWithFallback()
 - restoreWithRetry()
 - Tous logs commentés
============================================================= */

import Purchases from 'react-native-purchases';
import { retryAsync } from '../utils/safeTokens';

// Init global RC
export async function initRevenueCat() {
  try {
    const apiKey = process.env.EXPO_PUBLIC_RC_API_KEY || null;
    if (!apiKey) {
      // console.warn('[RC] init: pas de clé API RevenueCat');
      return;
    }
    await Purchases.configure({ apiKey });
    // console.log('[RC] configured with key');
  } catch {
    // console.error('[RC] init error');
  }
}

// Offering
export async function getCurrentOfferingWithRetry() {
  return retryAsync(
    async () => {
      const offerings = await Purchases.getOfferings();
      // console.log('[RC] offerings reçu:', offerings?.current?.identifier);
      return offerings.current;
    },
    { retries: 2, delay: 800 },
  );
}

// Achat
export async function buyWithFallback(packageToBuy) {
  return retryAsync(
    async () => {
      const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
      // console.log('[RC] achat ok, entitlements:', customerInfo?.entitlements?.active);
      return customerInfo;
    },
    { retries: 1, delay: 1500 },
  );
}

// Restore
export async function restoreWithRetry() {
  return retryAsync(
    async () => {
      const { customerInfo } = await Purchases.restorePurchases();
      // console.log('[RC] restore ok:', customerInfo?.entitlements?.active);
      return customerInfo;
    },
    { retries: 2, delay: 1000 },
  );
}
// ============================================================
