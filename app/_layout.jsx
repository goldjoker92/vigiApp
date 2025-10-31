// app/_layout.jsx
// ============================================================================
// Root layout (Expo Router) — Focus: Notifications + Routing + Logs 🧭📣
// ============================================================================

import 'react-native-gesture-handler';
import React, { useEffect, useRef, useCallback } from 'react';
import { Slot, router } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';

import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
  checkInitialNotification,
  fireLocalNow, // ✅ ajouté ici
} from '../src/notifications';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

import { AdBanner, AdBootstrap } from '../src/ads/ads';
import CustomTopToast from './components/CustomTopToast';

// ============================================================================
// Logs
// ============================================================================
const TAG = '[LAYOUT]';
const log = (...a) => console.log(`${TAG} 🧭`, ...a);
const warn = (...a) => console.warn(`${TAG} ⚠️`, ...a);
const err = (...a) => console.error(`${TAG} ❌`, ...a);

const TAGN = '[NOTIF]';
const logN = (...a) => console.log(`${TAGN} 📣`, ...a);
const warnN = (...a) => console.warn(`${TAGN} ⚠️`, ...a);

// ============================================================================
// ErrorBoundary minimaliste
// ============================================================================
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    console.error('[ErrorBoundary] 🚨', error);
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View
          style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '700', fontSize: 18 }}>Une erreur est survenue 😵‍💫</Text>
          <Text style={{ opacity: 0.8, textAlign: 'center' }}>
            On a intercepté le plantage. Tu peux revenir à l’accueil.
          </Text>
          <Pressable
            onPress={() => {
              this.setState({ error: null });
              try {
                router.replace('/');
              } catch (e) {
                err('router.replace("/"):', e?.message || e);
              }
            }}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: '#222',
            }}
          >
            <Text style={{ color: 'white' }}>Revenir à l’accueil</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// Helpers routing (cold start)
// ============================================================================
function parseMaybeStringified(d0) {
  try {
    if (!d0) {return {};}
    if (typeof d0 === 'string') {return JSON.parse(d0);}
    if (typeof d0?.data === 'string') {return { ...d0, ...JSON.parse(d0.data) };}
    return d0 || {};
  } catch {
    return {};
  }
}

function pickAny(obj, keys) {
  if (!obj) {return '';}
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v) !== '') {return String(v);}
  }
  return '';
}

function routeFromColdStartData(rawData = {}) {
  const d = parseMaybeStringified(rawData);
  const rawUrl =
    pickAny(d, ['url', 'deepLink', 'deeplink', 'deep_link', 'link', 'open', 'href', 'route']) || '';

  if (rawUrl && rawUrl.startsWith('vigiapp://')) {
    try {
      const path = rawUrl.replace('vigiapp://', '/');
      logN('🧭 [cold] router.push (deepLink) →', path);
      router.push(path);
      return true;
    } catch (e) {
      warnN('cold deepLink route error:', e?.message || e);
    }
  }

  const id = pickAny(d, ['alertId', 'caseId', 'id']);
  const category = (pickAny(d, ['category', 'type']) || '').toLowerCase();
  const channel = (pickAny(d, ['channelId']) || '').toLowerCase();

  if (!id) {
    logN('🌡️ [cold] pas d’id exploitable → on ne route pas');
    return false;
  }

  const isMissing =
    category === 'missing' ||
    channel === 'missing-alerts-urgent' ||
    (rawUrl && rawUrl.startsWith('vigiapp://missing/'));

  const path = isMissing
    ? `/missing/${encodeURIComponent(id)}`
    : `/public-alerts/${encodeURIComponent(id)}`;

  logN('🧭 [cold] router.push →', path);
  router.push(path);
  return true;
}

function useColdNavGuard() {
  const lastRef = useRef({ k: '', ts: 0 });
  return useCallback((data) => {
    const key = JSON.stringify(data ?? {});
    const now = Date.now();
    if (lastRef.current.k === key && now - lastRef.current.ts < 1500) {
      warnN('⏱️ [cold] skip double navigation');
      return;
    }
    lastRef.current = { k: key, ts: now };
    routeFromColdStartData(data);
  }, []);
}

// ============================================================================
// Inner Layout
// ============================================================================
function Inner() {
  const insets = useSafeAreaInsets();
  const coldGuard = useColdNavGuard();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync('#101114').catch((e) =>
      warn('SystemUI.setBackgroundColorAsync:', e?.message || e),
    );
  }, []);

  useEffect(() => {
    log('🔐 onAuthStateChanged: subscribe');
    const unsub = onAuthStateChanged(auth, (u) => {
      log('🔐 onAuthStateChanged →', u?.uid || '(null)');
    });
    return () => {
      try {
        unsub?.();
      } catch {}
    };
  }, []);

  // Notifications + test local
  useEffect(() => {
    let detachNotif;
    (async () => {
      try {
        logN('🔧 wireAuthGateForNotifications()');
        wireAuthGateForNotifications();
      } catch (e) {
        warnN('wireAuthGateForNotifications:', e?.message || e);
      }

      try {
        logN('🧰 initNotifications()');
        await initNotifications();
        logN('✅ Notifications initialisées');
      } catch (e) {
        warnN('initNotifications:', e?.message || e);
      }

      try {
        logN('👂 attachNotificationListeners()');
        detachNotif = attachNotificationListeners({
          onReceive: (n) => {
            const d = n?.request?.content?.data ?? {};
            logN('📥 [FG] Notification reçue =', d);
          },
          onResponse: (r) => {
            const d = r?.notification?.request?.content?.data ?? {};
            logN('👆 [TAP] Réponse notification =', d);
          },
        });
        logN('👂 Listeners attachés ✅');
      } catch (e) {
        warnN('attachNotificationListeners:', e?.message || e);
      }

      try {
        logN('🌡️ checkInitialNotification()');
        await checkInitialNotification((resp) => {
          const d0 = resp?.notification?.request?.content?.data ?? {};
          logN('🌡️ Cold start data =', d0);
          coldGuard(d0);
        });
      } catch (e) {
        warnN('checkInitialNotification:', e?.message || e);
      }

      try {
        const tok = await getFcmDeviceTokenAsync();
        if (tok) {logN('🔑 FCM token:', tok);}
        else {warnN('🔑 FCM token indisponible (simulateur ou permissions)');}
      } catch (e) {
        warnN('getFcmDeviceTokenAsync:', e?.message || e);
      }

      // === TEST LOCAL NOTIF 🔔 ==========================================
      try {
        console.log('🚀 [TEST LOCAL] Tentative d’envoi de notification locale...');
        await fireLocalNow({ channelId: 'public-alerts-high' });
        console.log('✅ [TEST LOCAL] Notification locale déclenchée avec succès 🔔');
      } catch (e) {
        console.log('❌ [TEST LOCAL] Échec du test local:', e?.message || e);
      }
      // ================================================================
    })();

    return () => {
      try {
        detachNotif?.();
        logN('🧹 detachNotif OK');
      } catch (e) {
        warnN('🧹 detachNotif:', e?.message || e);
      }
    };
  }, [coldGuard]);

  return (
    <View style={{ flex: 1, backgroundColor: '#101114' }}>
      <AdBootstrap />
      <CustomTopToast />
      <View style={{ flex: 1, paddingBottom: 50 + (insets?.bottom ?? 0) }}>
        <RootErrorBoundary>
          <React.Suspense
            fallback={
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Chargement… ⏳</Text>
              </View>
            }
          >
            <Slot />
          </React.Suspense>
        </RootErrorBoundary>
      </View>

      {/* Bandeau pub bas */}
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

// ============================================================================
// Shell Layout
// ============================================================================
export default function Layout() {
  return (
    <SafeAreaProvider>
      <Inner />
    </SafeAreaProvider>
  );
}
