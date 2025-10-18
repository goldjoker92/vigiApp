// app/_layout.jsx
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
import { StripeBootstrap } from '../src/payments/stripe';

import { useUserStore } from '../store/users';
import { initRevenueCat } from '../services/purchases';

import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  initNotifications,
  wireAuthGateForNotifications,
} from '../src/notifications';
import { attachDeviceAutoRefresh } from '../libs/registerCurrentDevice';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// Logs homogènes
const log = (...a) => console.log('[LAYOUT]', ...a);
const warn = (...a) => console.warn('[LAYOUT] ⚠️', ...a);
const logN = (...a) => console.log('[NOTIF]', ...a);
const warnN = (...a) => console.warn('[NOTIF] ⚠️', ...a);
const logRC = (...a) => console.log('[RC]', ...a);
const errRC = (...a) => console.error('[RC] ❌', ...a);
const logAds = (...a) => console.log('[ADS]', ...a);

// Flag global RC
const RC_FLAG = '__VIGIAPP_RC_CONFIGURED__';
if (globalThis[RC_FLAG] === undefined) { globalThis[RC_FLAG] = false; }

class RootErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ROOT][ErrorBoundary]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', fontSize: 18 }}>Une erreur est survenue</Text>
          <Text style={{ opacity: 0.8, textAlign: 'center' }}>
            Pas de panique. On a intercepté l’écran qui plantait.
          </Text>
          <Pressable
            onPress={() => { this.setState({ error: null }); try { router.replace('/'); } catch {} }}
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

function RCReadyHook() { logRC('RCReadyHook attached'); return null; }

// --- helpers deep link → route
function routeFromUrlLike(rawUrl) {
  // supporte: vigiapp://public-alerts/ID, vigiapp://missing-public-alerts/ID
  //           /public-alerts/ID, /missing-public-alerts/ID
  try {
    const s = String(rawUrl).trim();

    // Tente extraction générique d’un path
    let path = s;
    if (s.startsWith('vigiapp://')) {
      const u = new URL(s);
      path = u.pathname || '';
    }

    // Matche les deux familles de routes
    const m1 = path.match(/\/?public-alerts\/([^/?#]+)/i);
    if (m1?.[1]) {
      return { pathname: '/public-alerts/[id]', params: { id: m1[1] } };
    }
    const m2 = path.match(/\/?missing-public-alerts\/([^/?#]+)/i);
    if (m2?.[1]) {
      return { pathname: '/missing-public-alerts/[id]', params: { id: m2[1] } };
    }

    // Fallback legacy param style ?alertId=...
    const q = s.match(/[?&](?:alertId|id)=([^&#]+)/i);
    if (q?.[1]) {
      // Par défaut vers public-alerts si pas de hint — mais on garde aussi missing si l’URL le dit
      if (/missing/i.test(s)) {
        return { pathname: '/missing-public-alerts/[id]', params: { id: q[1] } };
      }
      return { pathname: '/public-alerts/[id]', params: { id: q[1] } };
    }
  } catch (e) {
    warnN('routeFromUrlLike error:', e?.message || e);
  }
  return null;
}

// --- InnerLayout : consomme les insets SOUS le Provider ---
function InnerLayout() {
  const [authUid, setAuthUid] = useState(null);
  const storeUid = useUserStore((s) => s?.user?.uid);
  const userCep = useUserStore((s) => s?.user?.cep ?? s?.profile?.cep ?? null);
  const userCity = useUserStore((s) => s?.user?.cidade ?? s?.profile?.cidade ?? null);
  const userId = authUid || storeUid || null;

  const insets = useSafeAreaInsets();
  const BANNER_HEIGHT = 50;

  const bottomOffset = useMemo(() => {
    const offset = BANNER_HEIGHT + (insets?.bottom ?? 0);
    logAds('bottomOffset =', offset);
    return offset;
  }, [insets]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUid(u?.uid || null);
      log('[AUTH] onAuthStateChanged →', u?.uid || '(null)');
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let detachNotif; let detachDevice;
    (async () => {
      try { wireAuthGateForNotifications(); } catch (e) { warnN('auth-gate:', e?.message || e); }
      try { await initNotifications(); } catch (e) { warnN('init:', e?.message || e); }

      try {
        detachNotif = attachNotificationListeners({
          onReceive: (n) => logN('onReceive(FG):', n?.request?.content?.data),
          onResponse: (r) => {
            const data = r?.notification?.request?.content?.data || {};
            const rawUrl = data.url || data.deepLink || data.link || data.open;
            if (!rawUrl) { return; }
            const route = routeFromUrlLike(rawUrl);
            if (route) {
              setTimeout(() => router.push(route), 50);
            } else {
              Linking.openURL(String(rawUrl)).catch(() => {});
            }
          },
        });
      } catch (e) { warnN('listeners:', e?.message || e); }

      try {
        const initial = await Notifications.getLastNotificationResponseAsync();
        const data = initial?.notification?.request?.content?.data || {};
        const rawUrl = data.url || data.deepLink || data.link || data.open;
        if (rawUrl) {
          const route = routeFromUrlLike(rawUrl);
          if (route) {
            setTimeout(() => router.push(route), 50);
          } else {
            Linking.openURL(String(rawUrl)).catch(() => {});
          }
        }
      } catch (e) { warnN('initialNotif:', e?.message || e); }

      try {
        const token = await getFcmDeviceTokenAsync();
        if (token) { logN('FCM token ✅', token); } else { warnN('FCM token indisponible'); }
      } catch (e) { warnN('fcm token:', e?.message || e); }

      log('[Device] userId =', userId || '(anon)');
      try {
        if (userId) {
          detachDevice = attachDeviceAutoRefresh({ userId, userCep, userCity, groups: [] });
          logN('Device auto-refresh attached ✅');
        } else {
          warnN('Device auto-refresh NON lancé (pas de userId)');
        }
      } catch (e) { warnN('attachDeviceAutoRefresh:', e?.message || e); }
    })();
    return () => { try { detachNotif?.(); } catch {} try { detachDevice?.(); } catch {} };
  }, [userId, userCep, userCity]);

  const rcInitPromiseRef = useRef(null);
  const [rcReady, setRcReady] = useState(globalThis[RC_FLAG] === true);
  useEffect(() => {
    (async () => {
      try {
        if (globalThis[RC_FLAG] === true) { setRcReady(true); return; }
        if (rcInitPromiseRef.current) { await rcInitPromiseRef.current; setRcReady(true); return; }
        rcInitPromiseRef.current = initRevenueCat(authUid || null);
        await rcInitPromiseRef.current;
        globalThis[RC_FLAG] = true;
        setRcReady(true);
      } catch (e) { errRC('init:', e?.message || e); }
      finally { rcInitPromiseRef.current = null; }
    })();
  }, [authUid]);

  useEffect(() => { warn('Layout mounted'); return () => warn('Layout unmounted'); }, []);

  return (
    <StripeBootstrap>
      <View style={{ flex: 1, backgroundColor: '#101114' }}>
        <AdBootstrap />
        <CustomTopToast />
        <View style={{ flex: 1, paddingBottom: bottomOffset }}>
          <RootErrorBoundary>
            <Suspense fallback={
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Chargement…</Text>
              </View>
            }>
              <Slot />
            </Suspense>
          </RootErrorBoundary>
        </View>
        <View
          style={{
            position: 'absolute',
            left: 0, right: 0, bottom: 0,
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

export default function Layout() {
  // Fond système propre pour edge-to-edge (status/nav bars)
  useEffect(() => { SystemUI.setBackgroundColorAsync('#101114').catch(() => {}); }, []);
  return (
    <SafeAreaProvider>
      <InnerLayout />
    </SafeAreaProvider>
  );
}
// ============================================================================
