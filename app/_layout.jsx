// app/_layout.jsx
// ============================================================================
// VigiApp — Root Layout (Expo Router) — VERSION LOG/DEBUG
// - Notifications (Expo + FCM) : init + listeners + FCM token
// - RevenueCat : init tôt, hook de sync
// - Publicités AdMob : bootstrap SDK + bannière sticky (IDs TEST)
// - Safe area + offset bannière pour éviter tout chevauchement
// - Logs d’observabilité : group, time, try/catch, traces par étape
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

// -------------------------
// Helpers de log formattés
// -------------------------
const L = {
  scope(scope) {
    return (msg, ...args) => console.log(`[${scope}] ${msg}`, ...args);
  },
  warn(scope) {
    return (msg, ...args) => console.warn(`[${scope}] ⚠️ ${msg}`, ...args);
  },
  error(scope) {
    return (msg, ...args) => console.error(`[${scope}] ❌ ${msg}`, ...args);
  },
};

const logLayout = L.scope('LAYOUT');
const warnLayout = L.warn('LAYOUT');
const errLayout = L.error('LAYOUT');

const logNotif = L.scope('NOTIF');
const warnNotif = L.warn('NOTIF');
const errNotif = L.error('NOTIF');

const logRC = L.scope('RC');
const warnRC = L.warn('RC');
const errRC = L.error('RC');

const logAds = L.scope('ADS');
const warnAds = L.warn('ADS');
const errAds = L.error('ADS');

export default function Layout() {
  // --------------------------------------------------------------------------
  // Sélecteur d’état utilisateur (pour routing notifs & debug ciblé)
  // --------------------------------------------------------------------------
  const userId = useUserStore((s) => s?.user?.uid);

  // --------------------------------------------------------------------------
  // Safe area + offset de bannière (évite recouvrement de la UI)
  // --------------------------------------------------------------------------
  const insets = useSafeAreaInsets();
  const BANNER_HEIGHT = 50; // approx BannerAdSize.BANNER ~ 50px
  const bottomOffset = useMemo(() => {
    const off = BANNER_HEIGHT + (insets?.bottom ?? 0);
    logAds(
      'bottomOffset calculé =',
      off,
      '(banner=',
      BANNER_HEIGHT,
      ', inset=',
      insets?.bottom,
      ')',
    );
    return off;
  }, [insets?.bottom]);

  // ==========================================================================
  // BLOC NOTIFICATIONS — BOOT + LISTENERS + FCM
  // ==========================================================================
  useEffect(() => {
    console.groupCollapsed('[NOTIF] ▶ Pipeline boot');
    console.time('[NOTIF] total');

    let detachListeners;
    (async () => {
      try {
        // 1) Gate d’auth : garantit que les taps notifs routent après login
        console.time('[NOTIF] wireAuthGateForNotifications');
        logNotif('wireAuthGateForNotifications() → start');
        wireAuthGateForNotifications();
        console.timeEnd('[NOTIF] wireAuthGateForNotifications');
      } catch (e) {
        errNotif('wireAuthGateForNotifications failed:', e?.message || e);
      }

      // 2) Initialisation des canaux + permission + cold-start
      try {
        console.time('[NOTIF] initNotifications');
        logNotif('initNotifications() → start');
        await initNotifications();
        console.timeEnd('[NOTIF] initNotifications');
        logNotif('initNotifications() → OK ✅');
      } catch (e) {
        errNotif('initNotifications failed:', e?.message || e);
      }

      // 3) Listeners (foreground + tap)
      try {
        console.time('[NOTIF] attachNotificationListeners');
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
        console.timeEnd('[NOTIF] attachNotificationListeners');
        logNotif('listeners attached → OK ✅');
      } catch (e) {
        errNotif('attachNotificationListeners failed:', e?.message || e);
      }

      // 4) FCM token (utile pour ciblage & tests physiques)
      try {
        console.time('[NOTIF] getFcmDeviceTokenAsync');
        const token = await getFcmDeviceTokenAsync();
        console.timeEnd('[NOTIF] getFcmDeviceTokenAsync');
        if (token) {
          logNotif('FCM token ✅', token);
        } else {
          warnNotif('FCM token indisponible (simulateur/dev-client ?)');
        }
      } catch (e) {
        errNotif('FCM token error:', e?.message || e);
      }

      // Contexte utilisateur (debug discret)
      logLayout('userId =', userId || '(anon)');
      console.timeEnd('[NOTIF] total');
      console.groupEnd();
    })();

    // Cleanup : détache les listeners notifs à l’unmount
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
  // BLOC REVENUECAT — INIT TÔT (NON BLOQUANT)
  // ==========================================================================
  useEffect(() => {
    console.groupCollapsed('[RC] ▶ Init');
    console.time('[RC] initRevenueCat');
    (async () => {
      try {
        logRC('initRevenueCat() → start');
        await initRevenueCat();
        logRC('initRevenueCat() → OK ✅');
      } catch (e) {
        errRC('initRevenueCat failed:', e?.message || e);
      } finally {
        console.timeEnd('[RC] initRevenueCat');
        console.groupEnd();
      }
    })();
  }, []);

  // Hook RC (si utilisé pour sync/offers) — no-op si déjà géré ailleurs
  try {
    useRevenueCat();
    logRC('useRevenueCat() hook attached');
  } catch (e) {
    warnRC('useRevenueCat hook error (non bloquant):', e?.message || e);
  }

  // ==========================================================================
  // RENDU RACINE — ADS BOOTSTRAP + SLOT + BANNIÈRE STICKY
  // ==========================================================================
  return (
    <View style={{ flex: 1 }}>
      {/* ADS: Bootstrap SDK (IDs de test) — log dans AdBootstrap() */}
      <AdBootstrap />

      {/* UI globale (toast) */}
      <CustomTopToast />

      {/* Contenu app : on laisse de la marge pour la bannière en bas */}
      <View style={{ flex: 1, paddingBottom: bottomOffset }}>
        <Slot />
      </View>

      {/* Bannière sticky bas : ne recouvre pas grâce au paddingBottom ci-dessus */}
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
  );
}

warnLayout('Layout component mounted');
warnAds('Ad warning: something went wrong');
errAds('Ad error: failed to load ad');
errLayout('Layout error: failed to initialize');
