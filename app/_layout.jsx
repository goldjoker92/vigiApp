// app/_layout.jsx
// ============================================================================
// VigiApp — Root Layout (Expo Router) — VERSION LOG/DEBUG (propre, sans warnings)
// - Stripe: <StripeBootstrap> Provider (clé publishable via env)
// - Notifications (Expo + FCM): init + listeners + FCM token
// - RevenueCat: init tôt + hook (non bloquant)
// - AdMob: bootstrap SDK + bannière sticky (IDs TEST Google)
// - Safe area: padding bottom dynamique pour éviter le chevauchement
// - Logs structurées: console.group/time + scopes [LAYOUT]/[NOTIF]/[RC]/[ADS]
// ============================================================================

import { Slot } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI globale (toast haut)
import CustomTopToast from './components/CustomTopToast';

// Store utilisateur (id pour tracer context auth)
import { useUserStore } from '../store/users';

// RevenueCat : init & hook
import { useRevenueCat } from '../hooks/useRevenueCat';
import { initRevenueCat } from '../services/purchases';

// Notifications : pipeline complet (boot, listeners, FCM)
import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
} from '../libs/notifications';

// Publicités (AdMob) : SDK + Bannière (IDs TEST Google)
import { AdBanner, AdBootstrap } from '../src/ads/ads';

// Stripe Provider (clé publishable depuis process.env)
import { StripeBootstrap } from '../src/payments/stripe';

// -------------------------
// Helpers de logs formatés
// -------------------------
const L = {
  scope(scope) {
    return (msg, ...args) => console.log(`[${scope}] ${msg}`, ...args);
  },
  warn(scope) {
    return (msg, ...args) => console.warn(`[${scope}] ⚠️ ${msg}`, ...args);
  },
  err(scope) {
    return (msg, ...args) => console.error(`[${scope}] ❌ ${msg}`, ...args);
  },
};

const logLayout = L.scope('LAYOUT');
const warnLayout = L.warn('LAYOUT');
 const _errLayout = L.err('LAYOUT'); // lint: unused allowed (matches /^_/)

const logNotif = L.scope('NOTIF');
const warnNotif = L.warn('NOTIF');
const errNotif = L.err('NOTIF');

const logRC = L.scope('RC');
const warnRC = L.warn('RC');
const errRC = L.err('RC');

const logAds = L.scope('ADS');
const warnAds = L.warn('ADS');
// on n’utilise errAds que si un catch critique survient
 const _errAds = L.err('ADS');       // lint: unused allowed (matches /^_/)

export default function Layout() {
  // --------------------------------------------------------------------------
  // Sélecteur d’état utilisateur (pour routing notifs & debug ciblé)
  // --------------------------------------------------------------------------
  const userId = useUserStore((s) => s?.user?.uid);

  // --------------------------------------------------------------------------
  // Safe area + offset de bannière (évite recouvrement de la UI)
  // --------------------------------------------------------------------------
  const insets = useSafeAreaInsets();
  const BANNER_HEIGHT = 50; // BannerAdSize.BANNER ≈ 50 px
  const bottomOffset = useMemo(() => {
    const offset = BANNER_HEIGHT + (insets?.bottom ?? 0);
    logAds('bottomOffset = %d (banner=%d, inset=%d)', offset, BANNER_HEIGHT, insets?.bottom ?? 0);
    if (!insets || insets.bottom === null) {
      // on utilise warnAds pour éviter “defined but never used”
      warnAds('safe-area insets indisponibles (simulateur ?) → fallback offset appliqué');
    }
    return offset;
  }, [insets]);

  // ==========================================================================
  // NOTIFICATIONS — BOOT + LISTENERS + FCM
  // ==========================================================================
  useEffect(() => {
    console.groupCollapsed('[NOTIF] ▶ pipeline');
    console.time('[NOTIF] total');

    let detachListeners;
    (async () => {
      try {
        console.time('[NOTIF] auth-gate');
        logNotif('wireAuthGateForNotifications() → start');
        wireAuthGateForNotifications();
        console.timeEnd('[NOTIF] auth-gate');
      } catch (e) {
        errNotif('auth-gate failed:', e?.message || e);
      }

      try {
        console.time('[NOTIF] init');
        logNotif('initNotifications() → start');
        await initNotifications();
        console.timeEnd('[NOTIF] init');
        logNotif('initNotifications() → OK ✅');
      } catch (e) {
        errNotif('initNotifications failed:', e?.message || e);
      }

      try {
        console.time('[NOTIF] listeners');
        logNotif('attachNotificationListeners() → start');
        detachListeners = attachNotificationListeners({
          onReceive: (n) => {
            const d = n?.request?.content?.data;
            logNotif('onReceive (FG) data =', d);
          },
          onResponse: (r) => {
            const d = r?.notification?.request?.content?.data;
            logNotif('onResponse (tap) data =', d);
          },
        });
        console.timeEnd('[NOTIF] listeners');
        logNotif('listeners attached → OK ✅');
      } catch (e) {
        errNotif('attachNotificationListeners failed:', e?.message || e);
      }

      try {
        console.time('[NOTIF] fcm-token');
        const token = await getFcmDeviceTokenAsync();
        console.timeEnd('[NOTIF] fcm-token');
        if (token) {
          logNotif('FCM token ✅', token);
        } else {
          warnNotif('FCM token indisponible (simulateur/dev-client ?)');
        }
      } catch (e) {
        errNotif('FCM token error:', e?.message || e);
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
        warnNotif('detach listeners failed (ignored):', e?.message || e);
      }
    };
  }, [userId]);

  // ==========================================================================
  // REVENUECAT — INIT TÔT (NON BLOQUANT)
  // ==========================================================================
  useEffect(() => {
    console.groupCollapsed('[RC] ▶ init');
    console.time('[RC] init');
    (async () => {
      try {
        logRC('initRevenueCat() → start');
        await initRevenueCat();
        logRC('initRevenueCat() → OK ✅');
      } catch (e) {
        errRC('initRevenueCat failed:', e?.message || e);
      } finally {
        console.timeEnd('[RC] init');
        console.groupEnd();
      }
    })();
  }, []);

  // Hook RC (si utilisé pour sync/offers) — no-op si déjà géré ailleurs
  try {
    useRevenueCat();
    logRC('useRevenueCat() hook attached');
  } catch (e) {
    // on utilise warnRC pour éviter “defined but never used” et garder un trace
    warnRC('useRevenueCat hook error (non bloquant):', e?.message || e);
  }

  // ==========================================================================
  // RENDU RACINE — Stripe Provider + ADS + SLOT + BANNIÈRE STICKY
  // ==========================================================================
  useEffect(() => {
    // log de montage/démontage (utilise warnLayout/errLayout pour éviter warnings lint)
    warnLayout('Layout mounted');
    return () => warnLayout('Layout unmounted');
  }, []);

  return (
    <StripeBootstrap>
      <View style={{ flex: 1 }}>
        {/* AdMob SDK (IDs de test) */}
        <AdBootstrap />

        {/* UI globale */}
        <CustomTopToast />

        {/* Contenu de l’app, avec marge basse pour la bannière */}
        <View style={{ flex: 1, paddingBottom: bottomOffset }}>
          <Slot />
        </View>

        {/* Bannière sticky bas (TEST) */}
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
      </View>
    </StripeBootstrap>
  );
}
