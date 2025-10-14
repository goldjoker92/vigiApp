// app/_layout.jsx
// ============================================================================
// VigiApp — Root Layout
// - Gère l’initialisation globale (Ads, Stripe, Notifs, Device register, RC)
// - Abonnement Auth fiable (onAuthStateChanged)
// - RevenueCat: init unique, lié à l’UID quand dispo (anti double-call)
// - Traces de logs homogènes
// ============================================================================

import { Slot, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

// Ads / Stripe
import { AdBanner, AdBootstrap } from '../src/ads/ads';
import CustomTopToast from '../app/components/CustomTopToast';
import { StripeBootstrap } from '../src/payments/stripe';

// User + achats
import { useUserStore } from '../store/users';

// RevenueCat
import { initRevenueCat } from '../services/purchases';

// Notifications
import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
} from '../src/notifications';

// Device register (orchestrateur)
import { attachDeviceAutoRefresh } from '../libs/registerCurrentDevice';

// Firebase Auth
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// ----------------------------------------------------------------------------
// Logs homogènes
// ----------------------------------------------------------------------------
const log = (...a) => console.log('[LAYOUT]', ...a);
const warn = (...a) => console.warn('[LAYOUT] ⚠️', ...a);
const logN = (...a) => console.log('[NOTIF]', ...a);
const warnN = (...a) => console.warn('[NOTIF] ⚠️', ...a);
const logRC = (...a) => console.log('[RC]', ...a);
const errRC = (...a) => console.error('[RC] ❌', ...a);
const logAds = (...a) => console.log('[ADS]', ...a);

// Flag global RC
const RC_FLAG = '__VIGIAPP_RC_CONFIGURED__';
if (globalThis[RC_FLAG] === undefined) {
  globalThis[RC_FLAG] = false;
}

function RCReadyHook() {
  logRC('RCReadyHook attached');
  return null;
}

// -----------------------------------------------------------------------------
// Deep link helper: prend data.url/deepLink et pousse la route Expo explicitement
// -----------------------------------------------------------------------------
function pushPublicAlertFromUrl(rawUrl) {
  if (!rawUrl) {
    return;
  }

  // Log clair pour debug
  console.log('[NOTIF][tap] rawUrl =', rawUrl);

  const url = String(rawUrl).trim();
  // accepte: vigiapp://public-alerts/XYZ, public-alerts/XYZ, /public-alerts/XYZ
  const m = url.match(/(?:^vigiapp:\/\/|^\/?)(public-alerts)\/([^/?#]+)/i);
  const id = m?.[2];

  if (id) {
    // route explicite -> évite “unmatched”
    setTimeout(() => {
      router.push({ pathname: '/public-alerts/[id]', params: { id } });
    }, 50); // petit délai utile au cold start
    return;
  }

  // fallback: tente l’URL brute si pattern non reconnu
  Linking.openURL(url).catch((e) => {
    console.warn('[NOTIF] openURL fail', e?.message || e);
  });
}

export default function Layout() {
  // -------------------------
  // AUTH
  // -------------------------
  const [authUid, setAuthUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUid(u?.uid || null);
      log('[AUTH] onAuthStateChanged →', u?.uid || '(null)');
    });
    return () => unsub?.();
  }, []);

  // -------------------------
  // Sélecteurs user
  // -------------------------
  const storeUid = useUserStore((s) => s?.user?.uid);
  const userCep = useUserStore((s) => s?.user?.cep ?? s?.profile?.cep ?? null);
  const userCity = useUserStore((s) => s?.user?.cidade ?? s?.profile?.cidade ?? null);

  const userId = authUid || storeUid || null;

  // -------------------------
  // Insets / Ads
  // -------------------------
  const insets = useSafeAreaInsets();
  const BANNER_HEIGHT = 50;

  const bottomOffset = useMemo(() => {
    const offset = BANNER_HEIGHT + (insets?.bottom ?? 0);
    logAds('bottomOffset =', offset);
    return offset;
  }, [insets]);

  // -------------------------
  // NOTIFICATIONS + DEVICE REGISTER
  // -------------------------
  useEffect(() => {
    let detachNotif;
    let detachDevice;

    (async () => {
      try {
        logN('wireAuthGateForNotifications()');
        wireAuthGateForNotifications();
      } catch (e) {
        warnN('auth-gate:', e?.message || e);
      }

      // Init notifications
      try {
        logN('initNotifications()');
        await initNotifications();
        logN('init OK');
      } catch (e) {
        warnN('init:', e?.message || e);
      }

      // Listeners FG / tap
      try {
        logN('attachNotificationListeners()');
        detachNotif = attachNotificationListeners({
          onReceive: (n) => {
            logN('onReceive(FG):', n?.request?.content?.data);
          },
          onResponse: (r) => {
            const data = r?.notification?.request?.content?.data || {};
            logN('onResponse(tap):', data);
            const rawUrl = data.url || data.deepLink || data.link || data.open;
            pushPublicAlertFromUrl(rawUrl);
          },
        });
      } catch (e) {
        warnN('listeners:', e?.message || e);
      }

      // Si app lancée par clic notif (état “tuée”)
      try {
        const initial = await Notifications.getLastNotificationResponseAsync();
        const data = initial?.notification?.request?.content?.data || {};
        const rawUrl = data.url || data.deepLink || data.link || data.open;
        if (rawUrl) {
          logN('initial notif on launch:', data);
          pushPublicAlertFromUrl(rawUrl);
        }
      } catch (e) {
        warnN('initialNotif:', e?.message || e);
      }

      // Token FCM
      try {
        const token = await getFcmDeviceTokenAsync();
        if (token) {
          logN('FCM token ✅', token);
        } else {
          warnN('FCM token indisponible');
        }
      } catch (e) {
        warnN('fcm token:', e?.message || e);
      }

      // Device register
      log('[Device] userId =', userId || '(anon)');
      try {
        if (userId) {
          detachDevice = attachDeviceAutoRefresh({
            userId,
            userCep,
            userCity,
            groups: [],
          });
          logN('Device auto-refresh attached ✅');
        } else {
          warnN('Device auto-refresh NON lancé (pas de userId)');
        }
      } catch (e) {
        warnN('attachDeviceAutoRefresh:', e?.message || e);
      }
    })();

    return () => {
      try {
        detachNotif?.();
        logN('listeners detached ✅');
      } catch {}
      try {
        detachDevice?.();
        logN('device auto-refresh detached ✅');
      } catch {}
    };
  }, [userId, userCep, userCity]);

  // -------------------------
  // REVENUECAT
  // -------------------------
  const rcInitPromiseRef = useRef(null);
  const [rcReady, setRcReady] = useState(globalThis[RC_FLAG] === true);

  useEffect(() => {
    (async () => {
      try {
        if (globalThis[RC_FLAG] === true) {
          setRcReady(true);
          return;
        }
        if (rcInitPromiseRef.current) {
          await rcInitPromiseRef.current;
          setRcReady(true);
          return;
        }
        logRC('initRevenueCat() with appUserID =', authUid || '(null)');
        rcInitPromiseRef.current = initRevenueCat(authUid || null);
        await rcInitPromiseRef.current;
        globalThis[RC_FLAG] = true;
        setRcReady(true);
        logRC('RevenueCat OK');
      } catch (e) {
        errRC('init:', e?.message || e);
      } finally {
        rcInitPromiseRef.current = null;
      }
    })();
  }, [authUid]);

  useEffect(() => {
    warn('Layout mounted');
    return () => warn('Layout unmounted');
  }, []);

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <StripeBootstrap>
      <View style={{ flex: 1 }}>
        <AdBootstrap />
        <CustomTopToast />
        <View style={{ flex: 1, paddingBottom: bottomOffset }}>
          <Slot />
        </View>
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
        {rcReady ? <RCReadyHook /> : null}
      </View>
    </StripeBootstrap>
  );
}
// ============================================================
