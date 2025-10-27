// app/_layout.jsx
// ============================================================================
// Root layout (Expo Router) — Focus: Notifications + Routing + Logs 🧭📣
// - Init notifs tôt (permissions + channels) une seule fois
// - Listeners uniques (anti double attach)
// - Cold start: reconstitution route depuis data (url OU id+type)
// - Logs verbeux et homogènes
// ============================================================================

import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { Slot, router } from 'expo-router';
import { View, Text, Pressable, Linking } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';

import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
  checkInitialNotification,
} from '../src/notifications';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

import { AdBanner, AdBootstrap } from '../src/ads/ads';
import CustomTopToast from './components/CustomTopToast';

// ============================================================================
// Logs
// ============================================================================
const TAG = '[LAYOUT]';
const log  = (...a) => console.log(`${TAG} 🧭`, ...a);
const warn = (...a) => console.warn(`${TAG} ⚠️`, ...a);
const err  = (...a) => console.error(`${TAG} ❌`, ...a);

const TAGN = '[NOTIF]';
const logN  = (...a) => console.log(`${TAGN} 📣`, ...a);
const warnN = (...a) => console.warn(`${TAGN} ⚠️`, ...a);

// ============================================================================
// ErrorBoundary minimaliste (évite l’écran blanc)
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
        <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', fontSize: 18 }}>Une erreur est survenue 😵‍💫</Text>
          <Text style={{ opacity: 0.8, textAlign: 'center' }}>
            On a intercepté le plantage. Tu peux revenir à l’accueil.
          </Text>
          <Pressable
            onPress={() => {
              this.setState({ error: null });
              try { router.replace('/'); } catch (e) { err('router.replace("/"):', e?.message || e); }
            }}
            style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#222' }}
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
// Helpers de parsing + routing (cold start uniquement)
// NB: le routing “normal” (tap/receive) est géré dans src/notifications.js
// ============================================================================
function parseMaybeStringified(d0) {
  try {
    if (!d0) return {};
    if (typeof d0 === 'string') {
      try { return JSON.parse(d0); } catch { return {}; }
    }
    if (typeof d0?.data === 'string') {
      try { return { ...d0, ...JSON.parse(d0.data) }; } catch { /* noop */ }
    }
    return d0 || {};
  } catch { return {}; }
}

function pickAny(obj, keys) {
  if (!obj) return '';
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v) !== '') return String(v);
  }
  return '';
}

// Route ultra-fiable pour le *cold start* (quand Expo ne rediffuse pas l’event tap)
function routeFromColdStartData(rawData = {}) {
  const d = parseMaybeStringified(rawData);
  const rawUrl =
    pickAny(d, ['url','deepLink','deeplink','deep_link','link','open','href','route']) || '';

  // 1) Si on a un deep link explicite → priorité
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

  // 2) Sinon, on recompose depuis id + type
  const id =
    pickAny(d, ['alertId','caseId','id','alert_id','case_id','alertID','caseID']);
  const category =
    (pickAny(d, ['category','type','notifType','notification_type']) || '').toLowerCase();
  const channel = (pickAny(d, ['channelId','channel_id']) || '').toLowerCase();
  const openTarget = pickAny(d, ['openTarget']) || 'detail';

  if (!id) {
    logN('🌡️ [cold] pas d’id exploitable → on ne route pas');
    return false;
  }

  const isMissing =
    category === 'missing' ||
    channel === 'missing-alerts-urgent' ||
    (rawUrl && rawUrl.startsWith('vigiapp://missing/'));

  if (isMissing) {
    const path = `/missing/${encodeURIComponent(id)}`;
    logN('🧭 [cold] router.push (MISSING) →', path);
    router.push(path);
    return true;
  }

  if (openTarget === 'home') {
    const path = `/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(id)}`;
    logN('🧭 [cold] router.push (HOME) →', path);
    router.push(path);
    return true;
  }

  const path = `/public-alerts/${encodeURIComponent(id)}`;
  logN('🧭 [cold] router.push (PUBLIC) →', path);
  router.push(path);
  return true;
}

// Petitimus anti double navigation (au cas où)
function useColdNavGuard() {
  const lastRef = useRef({ k: '', ts: 0 });
  return (data) => {
    const key = JSON.stringify(data ?? {});
    const now = Date.now();
    if (lastRef.current.k === key && now - lastRef.current.ts < 1500) {
      warnN('⏱️ [cold] skip double navigation');
      return;
    }
    lastRef.current = { k: key, ts: now };
    routeFromColdStartData(data);
  };
}

// ============================================================================
// Inner layout
// ============================================================================
function Inner() {
  const insets = useSafeAreaInsets();
  const coldGuard = useColdNavGuard();

  useEffect(() => {
    // Fond système propre
    SystemUI.setBackgroundColorAsync('#101114').catch((e) =>
      warn('SystemUI.setBackgroundColorAsync:', e?.message || e)
    );
  }, []);

  // Auth log (diagnostic) — le gating réel est dans wireAuthGateForNotifications()
  useEffect(() => {
    log('🔐 onAuthStateChanged: subscribe');
    const unsub = onAuthStateChanged(auth, (u) => {
      log('🔐 onAuthStateChanged →', u?.uid || '(null)');
    });
    return () => { try { unsub?.(); } catch {} };
  }, []);

  // Notifications: init → listeners → cold start → token
  useEffect(() => {
    let detachNotif;
    (async () => {
      try {
        logN('🔧 wireAuthGateForNotifications()');
        wireAuthGateForNotifications();
      } catch (e) { warnN('wireAuthGateForNotifications:', e?.message || e); }

      try {
        logN('🧰 initNotifications()');
        await initNotifications();
      } catch (e) { warnN('initNotifications:', e?.message || e); }

      try {
        logN('👂 attachNotificationListeners()');
        // ⚠️ Pas de navigation ici: le module route déjà sur TAP.
        detachNotif = attachNotificationListeners({
          onReceive: (n) => {
            const d = n?.request?.content?.data ?? {};
            logN('📥 onReceive(FG) data =', d);
          },
          onResponse: (r) => {
            const d = r?.notification?.request?.content?.data ?? {};
            logN('👆 onResponse(TAP) data =', d);
            // La navigation du TAP est gérée dans src/notifications.js (routeFromData)
          },
        });
        logN('👂 Listeners attachés ✅');
      } catch (e) { warnN('attachNotificationListeners:', e?.message || e); }

      // Cold start (app tuée ouverte via notif) → on re-route ici
      try {
        logN('🌡️ checkInitialNotification()');
        await checkInitialNotification((resp) => {
          const d0 = resp?.notification?.request?.content?.data ?? {};
          logN('🌡️ Cold start data =', d0);
          coldGuard(d0);
        });
      } catch (e) { warnN('checkInitialNotification:', e?.message || e); }

      // Token FCM (diag)
      try {
        const tok = await getFcmDeviceTokenAsync();
        if (tok) logN('🔑 FCM token:', tok);
        else warnN('🔑 FCM token indisponible (simulateur ou permissions)');
      } catch (e) { warnN('getFcmDeviceTokenAsync:', e?.message || e); }
    })();

    return () => {
      try { detachNotif?.(); logN('🧹 detachNotif OK'); } catch (e) { warnN('🧹 detachNotif:', e?.message || e); }
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#101114' }}>
      <AdBootstrap />
      <CustomTopToast />
      <View style={{ flex: 1, paddingBottom: (50 + (insets?.bottom ?? 0)) }}>
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
