/* =============================================================
  RevenueCat services (v8+ safe, singleton-guard)
  - initRevenueCat(appUserID?)
  - getCurrentOfferingWithRetry()
  - buyWithFallback(packageToBuy)
  - restoreWithRetry()
============================================================= */

import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { retryAsync } from '../utils/safeTokens';

let purchasesInstance = null; // instance configurée (ou singleton v7)
let configuring = null; // promesse de config en cours (anti double-call)

// ---- Récup clé (ENV -> Expo extra) ----
function getApiKey() {
  // priorité à la clé publique d’ENV
  const envKey = process.env.EXPO_PUBLIC_RC_API_KEY || null;

  // fallback (optionnel) via app.config(.js).extra
  // importé dynamiquement pour ne pas coupler au bundle Expo Constants
  try {
    const Constants = require('expo-constants').default;
    const extra = Constants?.expoConfig?.extra ?? {};
    return envKey || extra.RC_API_KEY || extra.RC_ANDROID_SDK_KEY || extra.RC_IOS_SDK_KEY || null;
  } catch {
    return envKey;
  }
}

// ---- Initialise (une seule fois) ----
export async function initRevenueCat(appUserID = null) {
  if (purchasesInstance) {
    return purchasesInstance;
  }
  if (configuring) {
    return configuring;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    // console.warn('[RC] init: pas de clé API RevenueCat');
    return null;
  }

  configuring = (async () => {
    try {
      Purchases.setLogLevel?.(LOG_LEVEL.WARN); // optionnel
      // v8+: configure retourne une instance; v7: retourne void et on utilise le singleton
      const maybeInstance = await Purchases.configure({ apiKey, appUserID: appUserID ?? null });
      purchasesInstance = maybeInstance || Purchases;
      return purchasesInstance;
    } catch (e) {
      // console.error('[RC] init error:', e?.message || e);
      throw e;
    } finally {
      configuring = null;
    }
  })();

  return configuring;
}

// ---- S’assure que RC est prêt avant d’appeler des méthodes ----
async function ensureConfigured() {
  if (purchasesInstance) {
    return purchasesInstance;
  }
  if (configuring) {
    return configuring;
  }
  return initRevenueCat(); // appUserID optionnel, on ne le force pas ici
}

// ---- Offering ----
export async function getCurrentOfferingWithRetry() {
  return retryAsync(
    async () => {
      const rc = await ensureConfigured();
      const offerings = await rc.getOfferings();
      return offerings?.current ?? null;
    },
    { retries: 2, delay: 800 },
  );
}

// ---- Achat ----
export async function buyWithFallback(packageToBuy) {
  return retryAsync(
    async () => {
      const rc = await ensureConfigured();
      const { customerInfo } = await rc.purchasePackage(packageToBuy);
      return customerInfo;
    },
    { retries: 1, delay: 1500 },
  );
}

// ---- Restore ----
export async function restoreWithRetry() {
  return retryAsync(
    async () => {
      const rc = await ensureConfigured();
      const { customerInfo } = await rc.restorePurchases();
      return customerInfo;
    },
    { retries: 2, delay: 1000 },
  );
}
