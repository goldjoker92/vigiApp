// app/_layout.jsx
// ============================================================================
// VigiApp — Root Layout
// - Gère l’initialisation globale (Ads, Stripe, Notifs, Device register, RC)
// - Abonnement Auth fiable (onAuthStateChanged)
// - RevenueCat: init unique, lié à l’UID quand dispo (anti double-call)
// - Traces de logs homogènes
// ============================================================================

import { Slot } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Ads / Stripe
import { AdBanner, AdBootstrap } from '../src/ads/ads';
import CustomTopToast from '../app/components/CustomTopToast';
import { StripeBootstrap } from '../src/payments/stripe';

// User + achats
import { useUserStore } from '../store/users';

// RevenueCat (nouvelle implémentation safe v8+)
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

// Firebase Auth (modular)
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

// Flag global pour éviter toute double init RC sur Fast Refresh
const RC_FLAG = '__VIGIAPP_RC_CONFIGURED__';
if (globalThis[RC_FLAG] === undefined) {
  globalThis[RC_FLAG] = false;
}

// Petit composant “no-UI” si tu veux accrocher d’autres hooks IAP plus tard
function RCReadyHook() {
  // Exemple : useRevenueCat();  // <-- si tu as un hook qui observe les entitlements
  logRC('RCReadyHook attached');
  return null;
}

export default function Layout() {
  // -------------------------
  // AUTH: UID fiable (modular)
  // -------------------------
  const [authUid, setAuthUid] = useState(null);

  useEffect(() => {
    // Important: utiliser la version modular (onAuthStateChanged(auth, ...))
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUid(u?.uid || null);
      log('[AUTH] onAuthStateChanged →', u?.uid || '(null)');
    });
    return () => unsub?.();
  }, []);

  // -------------------------
  // Sélecteurs user / profil
  // -------------------------
  const storeUid = useUserStore((s) => s?.user?.uid);
  const userCep = useUserStore((s) => s?.user?.cep ?? s?.profile?.cep ?? null);
  const userCity = useUserStore((s) => s?.user?.cidade ?? s?.profile?.cidade ?? null);

  // UID effectif pour l’enregistrement device (Auth prioritaire sur store)
  const userId = authUid || storeUid || null;

  // -------------------------
  // UI insets / Ads offset
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
      // Auth gate pour notifications
      try {
        logN('wireAuthGateForNotifications()');
        wireAuthGateForNotifications();
      } catch (e) {
        warnN('auth-gate:', e?.message || e);
      }

      // Init notifications (channels, perms, handlers system)
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
          onReceive: (n) => logN('onReceive(FG):', n?.request?.content?.data),
          onResponse: (r) => logN('onResponse(tap):', r?.notification?.request?.content?.data),
        });
      } catch (e) {
        warnN('listeners:', e?.message || e);
      }

      // Token FCM (log utile, pas d’upsert ici)
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

      log('[Device] userId =', userId || '(anon)');

      // Enregistrement device auto (boot + refresh token + retour FG)
      try {
        if (userId) {
          detachDevice = attachDeviceAutoRefresh({
            userId,
            userCep, // peut être null → normalisé côté orchestrateur
            userCity, // idem
            groups: [], // optionnel
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
  // REVENUECAT (init unique + appUserID quand dispo)
  // -------------------------
  const rcInitPromiseRef = useRef(null);
  const [rcReady, setRcReady] = useState(globalThis[RC_FLAG] === true);

  useEffect(() => {
    (async () => {
      try {
        // Évite toute ré-init si déjà fait (y compris au Fast Refresh)
        if (globalThis[RC_FLAG] === true) {
          setRcReady(true);
          return;
        }
        if (rcInitPromiseRef.current) {
          // Une init est déjà en cours → attendre
          await rcInitPromiseRef.current;
          setRcReady(true);
          return;
        }

        // On passe l’UID si dispo (sinon null, RC gèrera)
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
    // ⚠️ Dépend de authUid : si l’UID arrive après boot, on associe l’appUserID proprement.
  }, [authUid]);

  // Trace mount/unmount
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
        {/* Monte le hook quand RC est prêt (optionnel) */}
        {rcReady ? <RCReadyHook /> : null}
      </View>
    </StripeBootstrap>
  );
}
// ============================================================
