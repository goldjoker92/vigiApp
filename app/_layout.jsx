// app/_layout.jsx
// ============================================================================
// VigiApp — Root Layout (Expo Router) — VERSION LOG/DEBUG (propre, sans warnings)
// ============================================================================

import { Slot } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdBanner, AdBootstrap } from '../src/ads/ads';

import CustomTopToast from '../app/components/CustomTopToast';
import { useUserStore } from '../store/users';

// RevenueCat
import { useRevenueCat } from '../hooks/useRevenueCat';
import { initRevenueCat } from '../services/purchases';

// Notifications
import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
} from '../libs/notifications';

// Stripe
import { StripeBootstrap } from '../src/payments/stripe';

// -------------------------
// Helpers logs formatés
// -------------------------
const L = {
  scope:
    (scope) =>
    (msg, ...args) =>
      console.log(`[${scope}] ${msg}`, ...args),
  warn:
    (scope) =>
    (msg, ...args) =>
      console.warn(`[${scope}] ⚠️ ${msg}`, ...args),
  err:
    (scope) =>
    (msg, ...args) =>
      console.error(`[${scope}] ❌ ${msg}`, ...args),
};
const logLayout = L.scope('LAYOUT');
const warnLayout = L.warn('LAYOUT');
const logNotif = L.scope('NOTIF');
const warnNotif = L.warn('NOTIF');
const errNotif = L.err('NOTIF');
const logRC = L.scope('RC');
const errRC = L.err('RC');
const logAds = L.scope('ADS');
const warnAds = L.warn('ADS');

// Garde global anti double-config (sur Fast Refresh / remount)
const RC_FLAG = '__VIGIAPP_RC_CONFIGURED__';
if (globalThis[RC_FLAG] === undefined) {
  globalThis[RC_FLAG] = false;
}

// Petit composant qui n’attache le hook que quand RC est prêt
function RCReadyHook() {
  useRevenueCat();
  logRC('useRevenueCat() hook attached');
  return null;
}

export default function Layout() {
  const userId = useUserStore((s) => s?.user?.uid);

  const insets = useSafeAreaInsets();
  const BANNER_HEIGHT = 50; // ~ BannerAdSize.BANNER
  const bottomOffset = useMemo(() => {
    const offset = BANNER_HEIGHT + (insets?.bottom ?? 0);
    logAds('bottomOffset = %d (banner=%d, inset=%d)', offset, BANNER_HEIGHT, insets?.bottom ?? 0);
    if (!insets || insets.bottom === null) {
      warnAds('safe-area insets indisponibles → fallback offset appliqué');
    }
    return offset;
  }, [insets]);

  // -------------------------
  // NOTIFICATIONS
  // -------------------------
  useEffect(() => {
    console.groupCollapsed('[NOTIF] ▶ pipeline');
    console.time('[NOTIF] total');
    let detachListeners;
    (async () => {
      try {
        logNotif('wireAuthGateForNotifications()');
        wireAuthGateForNotifications();
      } catch (e) {
        errNotif('auth-gate:', e?.message || e);
      }
      try {
        logNotif('initNotifications()');
        await initNotifications();
        logNotif('init OK');
      } catch (e) {
        errNotif('init:', e?.message || e);
      }
      try {
        logNotif('attachNotificationListeners()');
        detachListeners = attachNotificationListeners({
          onReceive: (n) => logNotif('onReceive(FG):', n?.request?.content?.data),
          onResponse: (r) => logNotif('onResponse(tap):', r?.notification?.request?.content?.data),
        });
        logNotif('listeners OK');
      } catch (e) {
        errNotif('listeners:', e?.message || e);
      }
      try {
        const token = await getFcmDeviceTokenAsync();
        if (token) {
          logNotif('FCM token ✅', token);
        } else {
          warnNotif('FCM token indisponible');
        }
      } catch (e) {
        errNotif('fcm token:', e?.message || e);
      }
      logLayout('userId = %s', userId || '(anon)');
      console.timeEnd('[NOTIF] total');
      console.groupEnd();
    })();
    return () => {
      try {
        detachListeners?.();
        logNotif('listeners detached ✅');
      } catch (e) {
        warnNotif('detach failed:', e?.message || e);
      }
    };
  }, [userId]);

  // -------------------------
  // REVENUECAT (configure -> then mount hook)
  // -------------------------
  const rcInitRef = useRef(false);
  const [rcReady, setRcReady] = useState(globalThis[RC_FLAG] === true);

  useEffect(() => {
    console.groupCollapsed('[RC] ▶ init');
    console.time('[RC] init');
    (async () => {
      try {
        if (rcInitRef.current) {
          logRC('skip: already initializing');
          return;
        }
        rcInitRef.current = true;

        if (globalThis[RC_FLAG] === true) {
          logRC('déjà configuré (global flag) → ready');
          setRcReady(true);
          return;
        }

        logRC('initRevenueCat()');
        await initRevenueCat(); // doit faire Purchases.configure() en interne
        globalThis[RC_FLAG] = true;
        setRcReady(true);
        logRC('OK');
      } catch (e) {
        errRC('init:', e?.message || e);
        // On ne crash pas l’app : RC restera inactif jusqu’au prochain essai
      } finally {
        console.timeEnd('[RC] init');
        console.groupEnd();
      }
    })();
  }, []);

  useEffect(() => {
    warnLayout('Layout mounted');
    return () => warnLayout('Layout unmounted');
  }, []);

  return (
    <StripeBootstrap>
      <View style={{ flex: 1 }}>
        {/* AdMob SDK (IDs test) */}
        <AdBootstrap />

        {/* UI globale */}
        <CustomTopToast />

        {/* Contenu routeur avec marge basse pour la bannière */}
        <View style={{ flex: 1, paddingBottom: bottomOffset }}>
          <Slot />
        </View>

        {/* Bannière sticky en bas */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: insets?.bottom ?? 0,
            backgroundColor: 'transparent',
          }}
        >
          <AdBanner />
        </View>

        {/* Monte le hook RC uniquement quand RC est configuré */}
        {rcReady ? <RCReadyHook /> : null}
      </View>
    </StripeBootstrap>
  );
}
