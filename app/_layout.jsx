// =============================================================
// VigiApp — Root layout (Push bootstrap robuste)
// - Crée le canal Android "alerts-high" (MAX) + vérif perms
// - Attache listeners (foreground & taps) + deep-link
// - Garde d’auth → navigation fiable après clic lorsque app fermée
// - Récupère Expo Push Token & FCM Device Token (+ upsert device)
// =============================================================

import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import '../src/_bootstrap/monetization-init';
import CustomTopToast from './components/CustomTopToast';

// 🔔 Notifications
import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  registerForPushNotificationsAsync,
  ensureAndroidChannels,
  initNotifications, // ✅
  wireAuthGateForNotifications, // ✅
} from '../libs/notifications';

// Backend device upsert
import { upsertDevice } from '../libs/registerDevice';

// Firebase
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { auth } from '../firebase';

// Store
import { useUserStore } from '../store/users';

const extra = Constants?.expoConfig?.extra || {};
const SILENCE_RELEASE = !!extra?.SILENCE_CONSOLE_IN_RELEASE;
const APP_TAG = 'VigiApp';
const LAYOUT_TAG = 'PushBootstrap';

function ts() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}
function log(...a) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try {
      console.log(`[${APP_TAG}][${LAYOUT_TAG}][${ts()}]`, ...a);
    } catch {}
  }
}
function warn(...a) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try {
      console.warn(`[${APP_TAG}][${LAYOUT_TAG}][${ts()}]`, ...a);
    } catch {}
  }
}
function err(...a) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try {
      console.error(`[${APP_TAG}][${LAYOUT_TAG}][${ts()}]`, ...a);
    } catch {}
  }
}

// Polyfill Hermes
if (typeof global.structuredClone !== 'function') {
  // @ts-ignore
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
  log('structuredClone polyfilled');
}

if (!__DEV__ && SILENCE_RELEASE) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}

function MyFallback({ error }) {
  err('ErrorBoundary caught:', error?.message, error?.stack);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#181A20',
      }}
    >
      <Text style={{ color: '#FFD600', fontWeight: 'bold', fontSize: 20, marginBottom: 16 }}>
        Oops !
      </Text>
      <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, marginBottom: 10 }}>
        {error?.message || 'Une erreur est survenue.'}
      </Text>
      <Text style={{ color: '#aaa', fontSize: 12 }}>Essaie de relancer l’application.</Text>
    </View>
  );
}

function mapSeverityToToastType(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'high' || s === 'grave') {
    return 'error';
  }
  if (s === 'low' || s === 'minor') {
    return 'success';
  }
  return 'info';
}

async function fetchUserCepFromFirestore(uid) {
  try {
    const db = getFirestore();
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const cep = snap.exists() ? (snap.data()?.cep ?? null) : null;
    log('[fallback] Firestore CEP =', cep || '(none)');
    return cep ? String(cep) : null;
  } catch (e) {
    warn('[fallback] Firestore CEP error:', e?.message || e);
    return null;
  }
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj)?.slice(0, 1000);
  } catch {
    return '[unserializable]';
  }
}
function maskToken(tok) {
  if (!tok) {
    return tok;
  }
  const s = String(tok);
  return s.length <= 12 ? s : `${s.slice(0, 12)}…(${s.length})`;
}

function PushBootstrap() {
  const expoTokenRef = useRef(null);
  const fcmTokenRef = useRef(null);
  const lastUpsertKeyRef = useRef('');
  const { user } = useUserStore();

  useEffect(() => {
    let detachListeners;
    let unsubscribeAuth;
    let triedFallbackForUid = '';

    (async () => {
      const t0 = Date.now();
      log('mount → start bootstrap');

      // 🔐 Relie notifs ↔ auth pour naviguer correctement après clic
      wireAuthGateForNotifications(auth);

      // 🔔 Initialisation notifications (canaux + permissions + cold start)
      try {
        await initNotifications();
        log('initNotifications ok');
      } catch (e) {
        warn('initNotifications error:', e?.message || e);
      }

      // (Garde : s’assurer des canaux Android au tout début)
      try {
        await ensureAndroidChannels();
      } catch (e) {
        warn('ensureAndroidChannels error:', e?.message || e);
      }

      // Listeners + tokens
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
            log(
              'listener:onResponse',
              safeJson({
                data: r?.notification?.request?.content?.data,
              })
            );
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

      // Upsert device quand on a un user + au moins un token
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

    return () => {
      log('unmount → cleanup…');
      try {
        detachListeners?.();
        log('listeners detached');
      } catch (e) {
        err('detach listeners error:', e?.message || e);
      }
      try {
        unsubscribeAuth?.();
        log('auth listener detached');
      } catch (e) {
        err('detach auth error:', e?.message || e);
      }
    };
  }, [user?.cep]);

  return null;
}

export default function Layout() {
  const publishableKey = Constants.expoConfig?.extra?.STRIPE_PUBLISHABLE_KEY || '';
  if (!publishableKey) {
    warn('Stripe publishableKey is empty in extra.STRIPE_PUBLISHABLE_KEY');
  } else {
    log('Stripe key present (masked len):', `${String(publishableKey).length} chars`);
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

              {/* Navigation */}
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
