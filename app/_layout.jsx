// app/_layout.js
// =============================================================
// VigiApp — Root layout avec bootstrap PUSH robuste & verbosé
// - Crée le canal Android "alerts-high" (importance MAX) + vérif perms
// - Attache les listeners (foreground & taps) + deep-link
// - Récupère Expo Push Token & FCM Device Token (et upsert device)
// - Compatible app ouverte / arrière-plan / app fermée
// =============================================================

import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Platform, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

// ⚠️ init monétisation hors de /app
import '../src/_bootstrap/monetization-init';

// UI toast custom
import CustomTopToast from './components/CustomTopToast';

// 🔔 Push libs (signatures conservées)
import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  registerForPushNotificationsAsync,
  ensureAndroidChannels, // ✅ nouveau: “default” + “alerts-high”
} from '../libs/notifications';

// Upsert device côté backend
import { upsertDevice } from '../libs/registerDevice';

// Firebase
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { auth } from '../firebase';

// ✅ Zustand store
import { useUserStore } from '../store/users';

// ========== Logging util ==========
const extra = Constants?.expoConfig?.extra || {};
const SILENCE_RELEASE = !!extra?.SILENCE_CONSOLE_IN_RELEASE;
const APP_TAG = 'VigiApp';
const LAYOUT_TAG = 'PushBootstrap';

function ts() {
  try { return new Date().toISOString(); } catch { return String(Date.now()); }
}
function log(...args) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try { console.log(`[${APP_TAG}][${LAYOUT_TAG}][${ts()}]`, ...args); } catch {}
  }
}
function warn(...args) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try { console.warn(`[${APP_TAG}][${LAYOUT_TAG}][${ts()}]`, ...args); } catch {}
  }
}
function err(...args) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try { console.error(`[${APP_TAG}][${LAYOUT_TAG}][${ts()}]`, ...args); } catch {}
  }
}

// === Polyfill structuredClone (Hermes) ===
if (typeof global.structuredClone !== 'function') {
  // @ts-ignore
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
  log('structuredClone polyfilled');
}

// === Mute logs en prod (optionnel) ===
if (!__DEV__ && SILENCE_RELEASE) {
  // eslint-disable-next-line no-console
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

// === Error Boundary UI ===
function MyFallback({ error }) {
  err('ErrorBoundary caught:', error?.message, error?.stack);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#181A20' }}>
      <Text style={{ color: '#FFD600', fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>Oops !</Text>
      <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, marginBottom: 10 }}>
        {error?.message || 'Une erreur est survenue.'}
      </Text>
      <Text style={{ color: '#aaa', fontSize: 12 }}>Essaie de relancer l’application.</Text>
    </View>
  );
}

// --- map severidade -> toast type
function mapSeverityToToastType(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'high' || s === 'grave') return 'error';
  if (s === 'low' || s === 'minor') return 'success';
  return 'info'; // medium / défaut
}

// Helper: récup Firestore CEP si store vide
async function fetchUserCepFromFirestore(uid) {
  try {
    const db = getFirestore();
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const cep = snap.exists() ? (snap.data()?.cep ?? null) : null;
    log('[PushBootstrap][fallback] Firestore CEP =', cep || '(none)');
    return cep ? String(cep) : null;
  } catch (e) {
    warn('[PushBootstrap][fallback] Firestore CEP error:', e?.message || e);
    return null;
  }
}

// === Handler foreground moderne (SDK 53+) ===
// (Android: l’affichage heads-up dépend surtout de l’importance du canal)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ---------------------------
// Bootstrap Push (one-shot)
// ---------------------------
function PushBootstrap() {
  const expoTokenRef = useRef(null);
  const fcmTokenRef = useRef(null);
  const lastUpsertKeyRef = useRef(''); // `${uid}:${expoPrefix}:${fcmPrefix}`
  const { user } = useUserStore();

  useEffect(() => {
    let detachListeners;
    let unsubscribeAuth;
    let triedFallbackForUid = '';

    (async () => {
      const t0 = Date.now();
      log('mount → start bootstrap');

      // ✅ 0) Crée/MAJ les canaux Android AVANT toute notif (clé du fix)
      try {
        await ensureAndroidChannels();
      } catch (e) {
        warn('ensureAndroidChannels error:', e?.message || e);
      }

      // 1) Listeners + tokens
      try {
        // a) Listeners
        detachListeners = attachNotificationListeners({
          onReceive: (n) => {
            const content = n?.request?.content || {};
            const title = content?.title || 'VigiApp';
            const body = content?.body || '';
            const sev = content?.data?.severidade || content?.data?.severity;
            const type = mapSeverityToToastType(sev);
            const line = body ? `${title} — ${body}` : title;
            const imageUrl =
              content?.data?.image ||
              content?.image ||
              content?.data?.imageUrl ||
              content?.imageUrl ||
              null;

            log('listener:onReceive', safeJson({ title, data: content?.data }));
            Toast.show({
              type,
              text1: line,
              position: 'top',
              visibilityTime: 8000,
              autoHide: true,
              props: { imageUrl },
            });
          },
          onResponse: (r) => {
            log('listener:onResponse', safeJson({
              data: r?.notification?.request?.content?.data,
            }));
            const dl =
              r?.notification?.request?.content?.data?.deepLink ||
              r?.notification?.request?.content?.data?.deeplink;
            if (dl && typeof dl === 'string') {
              try { router.push(dl.replace('vigiapp://', '/')); }
              catch (e) { warn('router.push deepLink failed:', e?.message || e); }
            }
          },
        });
        log('listeners attached');

        // b) Permissions + Expo push token
        const expoTok = await registerForPushNotificationsAsync();
        expoTokenRef.current = expoTok;
        log('expo token obtained:', maskToken(expoTok));

        // c) FCM device token (sauvé côté Firestore si user connecté)
        const fcmTok = await getFcmDeviceTokenAsync();
        fcmTokenRef.current = fcmTok;
        log('fcm token obtained:', maskToken(fcmTok));
      } catch (e) {
        err('bootstrap register/listeners failed:', e?.message || e);
      }

      // 2) Upsert device dès qu’on a un user + tokens
      try {
        unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
          if (!fbUser) {
            log('auth: signed out (no upsert)');
            return;
          }
          if (!expoTokenRef.current && !fcmTokenRef.current) {
            warn('auth: user present but no tokens yet (will upsert later)');
            return;
          }

          let cep = user?.cep ? String(user.cep) : null;
          log('auth: CEP from store =', cep || '(none)');

          if (!cep && triedFallbackForUid !== fbUser.uid) {
            triedFallbackForUid = fbUser.uid;
            cep = await fetchUserCepFromFirestore(fbUser.uid);
          }
          if (!cep) {
            warn('auth: CEP missing → skip device upsert');
            return;
          }

          const key = `${fbUser.uid}:${String(expoTokenRef.current || '').slice(0, 12)}:${String(fcmTokenRef.current || '').slice(0, 12)}`;
          if (lastUpsertKeyRef.current === key) {
            log('auth: upsert skipped (same uid+tokens prefix)', key);
            return;
          }

          log('auth: signed in → upsert device…', { uid: fbUser.uid, key, cep });
          try {
            const res = await upsertDevice({
              userId: fbUser.uid,
              expoPushToken: expoTokenRef.current,
              fcmDeviceToken: fcmTokenRef.current,
              cep,
            });
            if (res?.ok) {
              log('upsert success:', res?.id || '(no id)');
              lastUpsertKeyRef.current = key;
            } else {
              warn('upsert returned not ok:', res?.error || 'unknown');
            }
          } catch (e) {
            err('upsert failed:', e?.message || e);
          }
        });
        log('auth listener attached');
      } catch (e) {
        err('attach onAuthStateChanged failed:', e?.message || e);
      }

      const dt = Date.now() - t0;
      log('bootstrap completed in', `${dt}ms`);
    })();

    // Cleanup
    return () => {
      log('unmount → cleanup…');
      try { detachListeners?.(); log('listeners detached'); } catch (e) { err('detach listeners error:', e?.message || e); }
      try { unsubscribeAuth?.(); log('auth listener detached'); } catch (e) { err('detach auth error:', e?.message || e); }
    };
  }, [user?.cep]);

  return null; // pas d'UI ici
}

// Utils d’affichage log-safe
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2)?.slice(0, 1000); }
  catch { return '[unserializable]'; }
}
function maskToken(tok) {
  if (!tok) return tok;
  const s = String(tok);
  return s.length <= 12 ? s : `${s.slice(0, 12)}…(${s.length})`;
}

export default function Layout() {
  const publishableKey = Constants.expoConfig?.extra?.STRIPE_PUBLISHABLE_KEY || '';
  if (!publishableKey) {
    warn('Stripe publishableKey is empty in extra.STRIPE_PUBLISHABLE_KEY');
  } else {
    log('Stripe publishableKey present (masked length):', `${String(publishableKey).length} chars`);
  }

  log('Layout render');

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PaperProvider>
          <StripeProvider publishableKey={publishableKey}>
            <ErrorBoundary FallbackComponent={MyFallback}>
              {/* Boot push + upsert device (no UI) */}
              <PushBootstrap />

              {/* Navigation app */}
              <Stack screenOptions={{ headerShown: false }} />

              {/* Toasts globaux */}
              <Toast
                config={{
                  success: (props) => <CustomTopToast {...props} />,
                  info: (props) => <CustomTopToast {...props} />,
                  error: (props) => <CustomTopToast {...props} />,
                  default: (props) => <CustomTopToast {...props} />,
                }}
                position="top"
                topOffset={0}
              />
            </ErrorBoundary>
          </StripeProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
// =============================================================
// Fin app/_layout.js