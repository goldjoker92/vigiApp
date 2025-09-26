/* =============================================================
 VigiApp â€” Root layout (Push bootstrap robuste, prod-ready en dev)
 - Android : ensure channels AVANT demande de permissions
 - Listeners toujours dÃ©tachables (fallback no-op)
 - Ne JAMAIS couper console.error (mÃªme en release)
 - Guards sur Firestore/CEP + masking tokens
 - ErrorBoundary + logs horodatÃ©s
============================================================= */

import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Text, View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as Application from 'expo-application';

import '../src/_bootstrap/monetization-init';
import CustomTopToast from './components/CustomTopToast';

// ðŸ”” Notifications
import {
  attachNotificationListeners,
  getFcmDeviceTokenAsync,
  registerForPushNotificationsAsync,
  ensureAndroidChannels,
  initNotifications,
  wireAuthGateForNotifications,
} from '../libs/notifications';

// Backend device upsert
import { upsertDevice } from '../libs/registerDevice';

// Firebase
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { auth } from '../firebase';

// Store
import { useUserStore } from '../store/users';

/** Fallback extra (EAS/production friendly) */
const extra =
  (Constants && Constants.expoConfig && Constants.expoConfig.extra) ||
  (Constants && Constants.manifestExtra) ||
  (Constants && Constants.manifest && Constants.manifest.extra) ||
  {};

const SILENCE_RELEASE = !!extra.SILENCE_CONSOLE_IN_RELEASE;
const APP_TAG = 'VigiApp';
const LAYOUT_TAG = 'PushBootstrap';

// Horodatage compact et safe
function ts() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}

// Logger centralisÃ© (ne coupe pas .error en prod)
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
  try {
    console.error(`[${APP_TAG}][${LAYOUT_TAG}][${ts()}]`, ...a);
  } catch {}
}

// Polyfill Hermes (shallow clone via JSON â€” attention aux types non sÃ©rialisables)
if (typeof global.structuredClone !== 'function') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
  log('structuredClone polyfilled');
}

// En release : on peut rÃ©duire le bruit, mais on NE coupe PAS console.error
if (!__DEV__ && SILENCE_RELEASE) {
  try {
    console.log = () => {};
  } catch {}
  try {
    console.warn = () => {};
  } catch {}
  // console.error RESTE actif
}

// UI fallback de lâ€™ErrorBoundary
function MyFallback({ error }) {
  err('ErrorBoundary caught:', error && error.message, error && error.stack);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#181A20',
        paddingHorizontal: 24,
      }}
    >
      <Text style={{ color: '#FFD600', fontWeight: 'bold', fontSize: 20, marginBottom: 12 }}>
        Oops!
      </Text>
      <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, marginBottom: 8 }}>
        {(error && error.message) || 'Une erreur est survenue.'}
      </Text>
      <Text style={{ color: '#aaa', fontSize: 12, textAlign: 'center' }}>
        Essaie de relancer lâ€™application.
      </Text>
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

// Firestore: rÃ©cup CEP au besoin (fallback unique par uid)
async function fetchUserCepFromFirestore(uid) {
  try {
    const db = getFirestore();
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const cep = snap.exists() ? snap.data() && (snap.data().cep ?? null) : null;
    log('[fallback] Firestore CEP =', cep || '(none)');
    return cep ? String(cep) : null;
  } catch (e) {
    warn('[fallback] Firestore CEP error:', (e && e.message) || e);
    return null;
  }
}

// Utils logs
function safeJson(obj) {
  try {
    return JSON.stringify(obj).slice(0, 1000);
  } catch {
    return '[unserializable]';
  }
}
function maskToken(tok) {
  if (!tok) {
    return tok;
  }
  const s = String(tok);
  return s.length <= 12 ? s : `${s.slice(0, 12)}â€¦(${s.length})`;
}

/** Toast global tenant compte du safe-area top */
function GlobalToasts() {
  const insets = useSafeAreaInsets();
  return (
    <Toast
      config={{
        success: (props) => <CustomTopToast {...props} />,
        info: (props) => <CustomTopToast {...props} />,
        error: (props) => <CustomTopToast {...props} />,
        default: (props) => <CustomTopToast {...props} />,
      }}
      position="top"
      topOffset={Math.max(10, insets.top)}
    />
  );
}

// Composant â€œheadlessâ€ qui fait tout le bootstrap notifs + upsert device
function PushBootstrap() {
  const expoTokenRef = useRef(null);
  const fcmTokenRef = useRef(null);
  const lastUpsertKeyRef = useRef('');
  const triedFallbackForUidRef = useRef(''); // Ã©vite Firestore fallback multiple
  const { user } = useUserStore();

  // A) Infra notifications + listeners â€” une seule fois au montage
  useEffect(() => {
    let detachListeners = () => {};
    (async () => {
      const t0 = Date.now();
      log('mount â†’ start bootstrap');

      // ðŸ” Lie notifs â†” auth (navigation aprÃ¨s tap notif quand app fermÃ©e)
      try {
        wireAuthGateForNotifications(auth);
      } catch (e) {
        warn('wireAuthGateForNotifications error:', (e && e.message) || e);
      }

      // Android : canaux Dâ€™ABORD, puis init (perms, cold start)
      try {
        await ensureAndroidChannels();
      } catch (e) {
        warn('ensureAndroidChannels error:', (e && e.message) || e);
      }

      try {
        await initNotifications();
        log('initNotifications ok');
      } catch (e) {
        warn('initNotifications error:', (e && e.message) || e);
      }

      // a) Listeners
      try {
        const maybeDetach = attachNotificationListeners({
          onReceive: (n) => {
            const content = (n && n.request && n.request.content) || {};
            const title = content.title || 'VigiApp';
            const body = content.body || '';
            const sev =
              (content.data && (content.data.severidade || content.data.severity)) || undefined;
            const type = mapSeverityToToastType(sev);
            const line = body ? `${title} â€” ${body}` : title;
            const imageUrl =
              (content.data && (content.data.image || content.data.imageUrl)) ||
              content.image ||
              content.imageUrl ||
              null;

            log('listener:onReceive', safeJson({ title, data: content.data }));
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
            const data =
              r &&
              r.notification &&
              r.notification.request &&
              r.notification.request.content &&
              r.notification.request.content.data;
            log('listener:onResponse', safeJson({ data }));
          },
        });
        detachListeners = typeof maybeDetach === 'function' ? maybeDetach : () => {};
        log('listeners attached');
      } catch (e) {
        err('attachNotificationListeners failed:', (e && e.message) || e);
      }

      // b) Permissions + Expo push token
      try {
        const expoTok = await registerForPushNotificationsAsync();
        expoTokenRef.current = expoTok || null;
        log('expo token obtained:', maskToken(expoTok));
      } catch (e) {
        warn('registerForPushNotificationsAsync error:', (e && e.message) || e);
      }

      // c) FCM device token (peut arriver en retard)
      try {
        let fcmTok = await getFcmDeviceTokenAsync();
        fcmTokenRef.current = fcmTok || null;
        log('fcm token obtained:', maskToken(fcmTok));
        if (!fcmTok) {
          setTimeout(async () => {
            try {
              const retry = await getFcmDeviceTokenAsync();
              if (retry) {
                fcmTokenRef.current = retry;
                log('fcm token late obtained:', maskToken(retry));
              }
            } catch {}
          }, 2500);
        }
      } catch (e) {
        warn('getFcmDeviceTokenAsync error:', (e && e.message) || e);
      }

      const dt = Date.now() - t0;
      log('bootstrap completed in', `${dt}ms`);
    })();

    // Cleanup strict-mode safe
    return () => {
      log('unmount â†’ cleanupâ€¦');
      try {
        detachListeners && detachListeners();
        log('listeners detached');
      } catch (e) {
        err('detach listeners error:', (e && e.message) || e);
      }
    };
  }, []); // montage unique

  // B) Upsert device â€” rÃ©agit Ã  user?.cep + tokens + auth
  useEffect(() => {
    let unsubscribeAuth;
    (async () => {
      try {
        const unsub = onAuthStateChanged(auth, async (fbUser) => {
          if (!fbUser) {
            log('auth: signed out (no upsert)');
            return;
          }
          if (!expoTokenRef.current && !fcmTokenRef.current) {
            warn('auth: user present but no tokens yet (will upsert later)');
            return;
          }

          // CEP depuis store, sinon fallback Firestore (1x/uid)
          let cep = user && user.cep ? String(user.cep) : null;
          log('auth: CEP from store =', cep || '(none)');

          if (!cep && triedFallbackForUidRef.current !== fbUser.uid) {
            triedFallbackForUidRef.current = fbUser.uid;
            cep = await fetchUserCepFromFirestore(fbUser.uid);
          }
          if (!cep) {
            warn('auth: CEP missing â†’ skip device upsert');
            return;
          }

          // Idempotence via clÃ© (uid + prefixes tokens)
          const key = `${fbUser.uid}:${String(expoTokenRef.current || '').slice(0, 12)}:${String(fcmTokenRef.current || '').slice(0, 12)}`;
          if (lastUpsertKeyRef.current === key) {
            log('auth: upsert skipped (same uid+tokens prefix)', key);
            return;
          }

          log('auth: signed in â†’ upsert deviceâ€¦', { uid: fbUser.uid, key, cep });
          try {
            const res = await upsertDevice({
              userId: fbUser.uid,
              expoPushToken: expoTokenRef.current,
              fcmDeviceToken: fcmTokenRef.current,
              cep,
              appVersion:
                Application.nativeApplicationVersion || Application.nativeApplicationVersion || '0',
              platform: Platform.OS,
            });
            if (res && res.ok) {
              log('upsert success:', (res && res.id) || '(no id)');
              lastUpsertKeyRef.current = key;
            } else {
              warn('upsert returned not ok:', (res && res.error) || 'unknown');
            }
          } catch (e) {
            err('upsert failed:', (e && e.message) || e);
          }
        });
        unsubscribeAuth = typeof unsub === 'function' ? unsub : undefined;
        log('auth listener attached (upsert)');
      } catch (e) {
        err('attach onAuthStateChanged failed (upsert effect):', (e && e.message) || e);
      }
    })();

    return () => {
      try {
        unsubscribeAuth && unsubscribeAuth();
        log('auth listener detached (upsert)');
      } catch (e) {
        err('detach auth error:', (e && e.message) || e);
      }
    };
  }, [user]);

  return null;
}

export default function Layout() {
  const publishableKey = String(extra.STRIPE_PUBLISHABLE_KEY || '');
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

              {/* Toasts globaux (respect safe-area) */}
              <GlobalToasts />
            </ErrorBoundary>
          </StripeProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
/* ============================================================= */
