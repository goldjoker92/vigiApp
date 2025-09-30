// app/_layout.jsx
import { Slot } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ads / stripe (si tu les utilises dans ton app)
import { AdBanner, AdBootstrap } from '../src/ads/ads';
import CustomTopToast from '../app/components/CustomTopToast';
import { StripeBootstrap } from '../src/payments/stripe';

// user + achats
import { useUserStore } from '../store/users';
import { useRevenueCat } from '../hooks/useRevenueCat';
import { initRevenueCat } from '../services/purchases';

// notifications — **NOTE**: on pointe bien sur ../src/notifications
import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
} from '../src/notifications';

// Logs simples (pas de logger sophistiqué ici)
const log = (...a) => console.log('[LAYOUT]', ...a);
const warn = (...a) => console.warn('[LAYOUT] ⚠️', ...a);
const logN = (...a) => console.log('[NOTIF]', ...a);
const warnN = (...a) => console.warn('[NOTIF] ⚠️', ...a);
const logRC = (...a) => console.log('[RC]', ...a);
const errRC = (...a) => console.error('[RC] ❌', ...a);
const logAds = (...a) => console.log('[ADS]', ...a);

const RC_FLAG = '__VIGIAPP_RC_CONFIGURED__';
if (globalThis[RC_FLAG] === undefined) {
  globalThis[RC_FLAG] = false;
}

function RCReadyHook() {
  useRevenueCat();
  logRC('useRevenueCat() hook attached');
  return null;
}

export default function Layout() {
  const userId = useUserStore((s) => s?.user?.uid);
  const insets = useSafeAreaInsets();
  const BANNER_HEIGHT = 50;

  const bottomOffset = useMemo(() => {
    const offset = BANNER_HEIGHT + (insets?.bottom ?? 0);
    logAds('bottomOffset =', offset);
    return offset;
  }, [insets]);

  // -------------------------
  // NOTIFICATIONS
  // -------------------------
  useEffect(() => {
    let detach;
    (async () => {
      try {
        logN('wireAuthGateForNotifications()');
        wireAuthGateForNotifications();
      } catch (e) {
        warnN('auth-gate:', e?.message || e);
      }
      try {
        logN('initNotifications()');
        await initNotifications();
        logN('init OK');
      } catch (e) {
        warnN('init:', e?.message || e);
      }
      try {
        logN('attachNotificationListeners()');
        detach = attachNotificationListeners({
          onReceive: (n) => logN('onReceive(FG):', n?.request?.content?.data),
          onResponse: (r) => logN('onResponse(tap):', r?.notification?.request?.content?.data),
        });
      } catch (e) {
        warnN('listeners:', e?.message || e);
      }
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
      log('userId =', userId || '(anon)');
    })();

    return () => {
      try {
        detach?.();
        logN('listeners detached ✅');
      } catch {}
    };
  }, [userId]);

  // -------------------------
  // REVENUECAT
  // -------------------------
  const rcInitRef = useRef(false);
  const [rcReady, setRcReady] = useState(globalThis[RC_FLAG] === true);
  useEffect(() => {
    (async () => {
      try {
        if (rcInitRef.current) {
          return;
        }
        rcInitRef.current = true;
        if (globalThis[RC_FLAG] === true) {
          setRcReady(true);
          return;
        }
        await initRevenueCat();
        globalThis[RC_FLAG] = true;
        setRcReady(true);
        logRC('RevenueCat OK');
      } catch (e) {
        errRC('init:', e?.message || e);
      }
    })();
  }, []);

  useEffect(() => {
    warn('Layout mounted');
    return () => warn('Layout unmounted');
  }, []);

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
