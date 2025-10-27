
// app/_layout.jsx
// ============================================================================
// Root layout (Expo Router) — VERSION SANS STRIPE (déconnecté)
// Focus: Notifications + Routing + Logs verbeux 🧭📣
// ============================================================================

import 'react-native-gesture-handler';
import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Slot, router } from 'expo-router';
import { View, Linking, Text, Pressable } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import * as Notifications from 'expo-notifications';

import { AdBanner, AdBootstrap } from '../src/ads/ads';
import CustomTopToast from './components/CustomTopToast';

import { useUserStore } from '../store/users';
// ⚠️ Stripe retiré volontairement

import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
  checkInitialNotification,
} from '../src/notifications';

import { attachDeviceAutoRefresh } from '../libs/registerCurrentDevice';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { ensureAuthOnBoot } from '../src/authBootstrap';

// ============================================================================
// Logs homogènes + émojis
// ============================================================================
const TAG = '[LAYOUT]';
const log   = (...a) => console.log(`${TAG} 🧭`, ...a);
const info  = (...a) => console.log(`${TAG} ℹ️`, ...a);
const warn  = (...a) => console.warn(`${TAG} ⚠️`, ...a);
const err   = (...a) => console.error(`${TAG} ❌`, ...a);

const TAGN  = '[NOTIF]';
const logN  = (...a) => console.log(`${TAGN} 📣`, ...a);
const warnN = (...a) => console.warn(`${TAGN} ⚠️`, ...a);
const errN  = (...a) => console.error(`${TAGN} ❌`, ...a);

const TAGADS = '[ADS]';
const logAds = (...a) => console.log(`${TAGADS} 📺`, ...a);

// ============================================================================
// ErrorBoundary bavard
// ============================================================================
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    info('[ROOT][ErrorBoundary] 🧱 monté');
  }
  static getDerivedStateFromError(error) {
    console.error('[ROOT][ErrorBoundary] 🚨 getDerivedStateFromError:', error);
    return { error };
  }
  componentDidCatch(error, infox) {
    console.error('[ROOT][ErrorBoundary] 🧯 componentDidCatch:', error, infox);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', fontSize: 18 }}>Une erreur est survenue 😵‍💫</Text>
          <Text style={{ opacity: 0.8, textAlign: 'center' }}>
            Pas de panique, on a intercepté l’écran qui plantait.
          </Text>
          <Pressable
            onPress={() => {
              this.setState({ error: null });
              try { router.replace('/'); } catch (e) { err('[ROOT][ErrorBoundary] replace("/"): ', e?.message || e); }
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
// Helpers deep link → route
// ============================================================================
function routeFromUrlLike(rawUrl) {
  try {
    const s = String(rawUrl || '').trim();
    let path = s;
    if (!s) {return null;}

    if (s.startsWith('vigiapp://')) {
      const u = new URL(s);
      path = u.pathname || '';
    }

    // vigiapp://public-alerts/<id>
    const m1 = path.match(/\/?public-alerts\/([^/?#]+)/i);
    if (m1?.[1]) {return { pathname: '/public-alerts/[id]', params: { id: m1[1] } };}

    // vigiapp://missing-public-alerts/<id>
    const m2 = path.match(/\/?missing-public-alerts\/([^/?#]+)/i);
    if (m2?.[1]) {return { pathname: '/missing-public-alerts/[id]', params: { id: m2[1] } };}

    // ?alertId=<id> (fallback)
    const q = s.match(/[?&](?:alertId|id)=([^&#]+)/i);
    if (q?.[1]) {
      if (/missing/i.test(s)) {return { pathname: '/missing-public-alerts/[id]', params: { id: q[1] } };}
      return { pathname: '/public-alerts/[id]', params: { id: q[1] } };
    }
  } catch (e) {
    warnN('routeFromUrlLike error:', e?.message || e);
  }
  return null;
}

// Dédup navigation (anti double push)
function useSafeNavigator() {
  const lastNavRef = useRef({ key: null, ts: 0 });
  const safeNavigateFromRawUrl = (rawUrl) => {
    try {
      if (!rawUrl) {return;}
      const key = String(rawUrl);
      const now = Date.now();
      if (lastNavRef.current.key === key && now - lastNavRef.current.ts < 1500) {
        warnN('⏱️ skip double navigation (1.5s) for', key);
        return;
      }
      lastNavRef.current = { key, ts: now };

      const route = routeFromUrlLike(rawUrl);
      if (route) {
        logN('🧭 router.push →', route);
        setTimeout(() => router.push(route), 50);
      } else {
        logN('🔗 Linking.openURL →', rawUrl);
        Linking.openURL(String(rawUrl)).catch((e) => warnN('Linking.openURL error:', e?.message || e));
      }
    } catch (e) {
      errN('safeNavigateFromRawUrl:', e?.message || e);
    }
  };
  return { safeNavigateFromRawUrl };
}

// ============================================================================
// InnerLayout
// ============================================================================
function InnerLayout() {
  const [authUid, setAuthUid] = useState(null);
  const storeUid = useUserStore((s) => s?.user?.uid);
  const userCep = useUserStore((s) => s?.user?.cep ?? s?.profile?.cep ?? null);
  const userCity = useUserStore((s) => s?.user?.cidade ?? s?.profile?.cidade ?? null);
  const userId = authUid || storeUid || null;

  const insets = useSafeAreaInsets();
  const BANNER_HEIGHT = 50;
  const { safeNavigateFromRawUrl } = useSafeNavigator();

  const bottomOffset = useMemo(() => {
    const offset = BANNER_HEIGHT + (insets?.bottom ?? 0);
    logAds('🧮 bottomOffset =', offset);
    return offset;
  }, [insets]);

  // Auth state
  useEffect(() => {
    log('🔐 onAuthStateChanged: subscribe');
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUid(u?.uid || null);
      log('🔐 onAuthStateChanged →', u?.uid || '(null)');
    });
    return () => {
      try { unsub?.(); log('🔐 onAuthStateChanged: unsubscribe ✅'); }
      catch (e) { warn('🔐 onAuthStateChanged: unsubscribe error:', e?.message || e); }
    };
  }, []);

  // Notifs + Device + Cold start
  useEffect(() => {
    let detachNotif;
    let detachDevice;
    (async () => {
      info('🚀 Layout effect (notifs/device) START');

      // Gate auth pour ACK enrichi
      try {
        logN('🔧 wireAuthGateForNotifications()');
        wireAuthGateForNotifications();
      } catch (e) { warnN('auth-gate:', e?.message || e); }

      // Init notifications (permissions + channels)
      try {
        logN('🧰 initNotifications() — permissions + canaux');
        await initNotifications();
      } catch (e) { warnN('initNotifications:', e?.message || e); }

      // Listeners
      try {
        logN('👂 attachNotificationListeners()');
        detachNotif = attachNotificationListeners({
          onReceive: (n) => {
            try {
              const d = n?.request?.content?.data || {};
              logN('🟢 onReceive(FG):', d);
            } catch (e) { warnN('onReceive log error:', e?.message || e); }
          },
          onResponse: (r) => {
            try {
              const data = r?.notification?.request?.content?.data || {};
              const rawUrl = data.url || data.deepLink || data.link || data.open;
              logN('👆 TAP response → rawUrl =', rawUrl || '(none)');
              if (rawUrl) {safeNavigateFromRawUrl(rawUrl);}
            } catch (e) { errN('onResponse handler:', e?.message || e); }
          },
        });
        logN('👂 Listeners attachés ✅');
      } catch (e) { warnN('listeners:', e?.message || e); }

      // Cold start (si l’app a été ouverte via une notif)
      try {
        logN('🌡️ checkInitialNotification()');
        await checkInitialNotification((resp) => {
          const data = resp?.notification?.request?.content?.data || {};
          const rawUrl = data.url || data.deepLink || data.link || data.open;
          logN('🌡️ Cold start → rawUrl =', rawUrl || '(none)');
          if (rawUrl) {safeNavigateFromRawUrl(rawUrl);}
        });
      } catch (e) { warnN('initialNotif:', e?.message || e); }

      // FCM device token (diagnostic)
      try {
        const token = await getFcmDeviceTokenAsync();
        if (token) {logN('🔑 FCM token ✅', token);}
        else {warnN('🔑 FCM token indisponible');}
      } catch (e) { warnN('fcm token:', e?.message || e); }

      // Device auto-refresh (Firestore orchestrateur)
      info('[Device] userId =', userId || '(anon)');
      try {
        if (userId) {
          detachDevice = attachDeviceAutoRefresh({ userId, userCep, userCity, groups: [] });
          logN('📡 Device auto-refresh attach ✅', { userId, userCep, userCity });
        } else {
          warnN('📡 Device auto-refresh non lancé (pas de userId)');
        }
      } catch (e) { warnN('attachDeviceAutoRefresh:', e?.message || e); }

      info('✅ Layout effect (notifs/device) READY');
    })();

    return () => {
      info('🧹 Layout effect cleanup — start');
      try { detachNotif?.(); logN('🧹 detachNotif OK'); } catch (e) { warnN('🧹 detachNotif error:', e?.message || e); }
      try { detachDevice?.(); logN('🧹 detachDevice OK'); } catch (e) { warnN('🧹 detachDevice error:', e?.message || e); }
      info('🧹 Layout effect cleanup — done');
    };
  }, [userId, userCep, userCity]);

  useEffect(() => {
    warn('🧩 Layout mounted');
    return () => warn('🧩 Layout unmounted');
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#101114' }}>
      <AdBootstrap />
      <CustomTopToast />
      <View style={{ flex: 1, paddingBottom: (50 + (insets?.bottom ?? 0)) }}>
        <RootErrorBoundary>
          <Suspense
            fallback={
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Chargement… ⏳</Text>
              </View>
            }
          >
            <Slot />
          </Suspense>
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
// Shell Layout (SafeArea + bootstrap système + auth anonyme)
// ============================================================================
export default function Layout() {
  // Fond système propre pour edge-to-edge
  useEffect(() => {
    info('🎨 SystemUI.setBackgroundColorAsync #101114');
    SystemUI.setBackgroundColorAsync('#101114').catch((e) =>
      warn('SystemUI.setBackgroundColorAsync error:', e?.message || e)
    );
  }, []);

  // 🔐 Bootstrap auth anonyme au tout début de l’app
  useEffect(() => {
    info('🛂 ensureAuthOnBoot()');
    try { ensureAuthOnBoot(); info('🛂 ensureAuthOnBoot OK ✅'); }
    catch (e) { err('🛂 ensureAuthOnBoot error:', e?.message || e); }
  }, []);

  return (
    <SafeAreaProvider>
      <InnerLayout />
    </SafeAreaProvider>
  );
}
