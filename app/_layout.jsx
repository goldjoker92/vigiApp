// app/_layout.js
// =============================================================
// VigiApp — Root layout avec bootstrap PUSH ultra-verbosé
// - Logs horodatés (préfixés) pour suivre chaque étape
// - Init listeners + permission + Expo token + FCM device token
// - Upsert device sur changement d'auth (idempotent, anti-doublons) + CEP du profil
// - Toast en foreground pour les push reçus in-app (mappage severidade)
// - Cleanup propre à l’unmount
// - Silence console en release optionnel via extra.SILENCE_CONSOLE_IN_RELEASE
// =============================================================

import React, { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from 'react-error-boundary';
import { View, Text } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';

// ⚠️ init monétisation hors de /app
import '../src/_bootstrap/monetization-init';

// UI toast custom
import CustomTopToast from './components/CustomTopToast';

// 🔔 Push libs (conservent les signatures existantes)
import {
  registerForPushNotificationsAsync, // -> Expo push token
  attachNotificationListeners,       // -> listeners receive/response
  getFcmDeviceTokenAsync,            // -> FCM device token (sauvé côté lib)
} from '../libs/notifications';

// Upsert device côté backend (conserve ton implémentation)
import { upsertDevice } from '../libs/registerDevice';

// Firebase
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// ✅ Zustand store (CEP prioritaire depuis ici)
// Ajuste le chemin selon l'emplacement réel du store
import { useUserStore } from '../store/users';

// ========== Logging util (timestamp + filtrage release) ==========
const extra = Constants?.expoConfig?.extra || {};
const SILENCE_RELEASE = !!extra?.SILENCE_CONSOLE_IN_RELEASE; // mets true pour couper en release
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

// === Polyfill structuredClone pour Hermes (sécurisé pour objets simples) ===
if (typeof global.structuredClone !== 'function') {
  // @ts-ignore
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
  log('structuredClone polyfilled');
}

// === Suppression optionnelle des logs en production ===
if (!__DEV__ && SILENCE_RELEASE) {
  // eslint-disable-next-line no-console
  console.log = () => {};
  // eslint-disable-next-line no-console
  console.warn = () => {};
  // eslint-disable-next-line no-console
  console.error = () => {};
}

// === Fallback UI en cas de bug JS (Error Boundary) ===
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

// --- map severidade -> toast type (pour CustomTopToast)
function mapSeverityToToastType(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'high' || s === 'grave') {
    return 'error';
  }
  if (s === 'low' || s === 'minor') {
    return 'success';
  }
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

// ---------------------------
// Bootstrap Push (one-shot)
// ---------------------------
function PushBootstrap() {
  // Mémoire locale pour limiter les upserts répétitifs
  const expoTokenRef = useRef(null);
  const fcmTokenRef = useRef(null);
  const lastUpsertKeyRef = useRef(''); // `${uid}:${expoPref}:${fcmPref}` pour dédup

  // ✅ CEP depuis Zustand prioritaire (profil chargé ailleurs dans l’app)
  const { user } = useUserStore();

  useEffect(() => {
    let detachListeners;     // pour nettoyer les listeners notifs
    let unsubscribeAuth;     // pour détacher l'observateur auth
    let triedFallbackForUid = ''; // évite multiples fetch Firestore pour le même UID

    (async () => {
      const t0 = Date.now();
      log('mount → start bootstrap');

      // 1) Listeners + permissions + Expo token + FCM token
      try {
        // a) brancher les listeners (réception + tap réponse)
        detachListeners = attachNotificationListeners({
          onReceive: (n) => {
            log('listener:onReceive', safeJson(n));
            // 👉 Foreground: affiche un Toast custom (CustomTopToast)
            const content = n?.request?.content || {};
            const title = content?.title || 'VigiApp';
            const body  = content?.body  || '';
            const sev   = content?.data?.severidade || content?.data?.severity;
            const type  = mapSeverityToToastType(sev);

            // Ton CustomTopToast accepte text1 → on combine title + body
            const line = body ? `${title} — ${body}` : title;

            Toast.show({
              type,              // 'success' | 'info' | 'error' (même rendu via CustomTopToast)
              text1: line,
              position: 'top',
              visibilityTime: 8000,
              autoHide: true,
            });
          },
          onResponse: (r) => {
            log('listener:onResponse', safeJson(r));
            // Deep link éventuel
            const dl =
              r?.notification?.request?.content?.data?.deepLink ||
              r?.notification?.request?.content?.data?.deeplink;
            if (dl && typeof dl === 'string') {
              try {
                // expo-router: navigation impérative
                router.push(dl.replace('vigiapp://', '/'));
              } catch (e) {
                warn('router.push deepLink failed:', e?.message || e);
              }
            }
          },
        });
        log('listeners attached');

        // b) permission + channel + Expo push token
        const expoTok = await registerForPushNotificationsAsync();
        expoTokenRef.current = expoTok;
        log('expo token obtained:', maskToken(expoTok));

        // c) FCM device token (et sauvegarde Firestore dans la lib si user connecté)
        const fcmTok = await getFcmDeviceTokenAsync();
        fcmTokenRef.current = fcmTok;
        log('fcm token obtained:', maskToken(fcmTok));
      } catch (e) {
        err('bootstrap register/listeners failed:', e?.message || e);
      }

      // 2) Dès qu’on a un user, on upsert le device (idempotent)
      try {
        unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
          if (!fbUser) {
            log('auth: signed out (no upsert)');
            return;
          }
          if (!expoTokenRef.current && !fcmTokenRef.current) {
            // Cas rare: aucun token dispo → on upsertera au prochain passage
            warn('auth: user present but no tokens yet (will upsert later)');
            return;
          }

          // ✅ 1) CEP via store d’abord
          let cep = user?.cep ? String(user.cep) : null;
          log('auth: CEP from store =', cep || '(none)');

          // ✅ 2) Fallback Firestore (une fois par UID si store vide)
          if (!cep && triedFallbackForUid !== fbUser.uid) {
            triedFallbackForUid = fbUser.uid;
            cep = await fetchUserCepFromFirestore(fbUser.uid);
          }

          // ✅ 3) Si toujours pas de CEP → SKIP proprement (évite l’erreur "CEP requis")
          if (!cep) {
            warn('auth: CEP missing (store+fallback) → skip device upsert');
            return;
          }

          // Anti-doublon: évite spam d'upsert si uid/tokens inchangés
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
              fcmDeviceToken: fcmTokenRef.current, // optionnel, utile côté back/diag
              cep, // ✅ requis par upsertDevice → garanti ici
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

    // Cleanup à l’unmount
    return () => {
      log('unmount → cleanup…');
      try { detachListeners?.(); log('listeners detached'); } catch (e) { err('detach listeners error:', e?.message || e); }
      try { unsubscribeAuth?.(); log('auth listener detached'); } catch (e) { err('detach auth error:', e?.message || e); }
    };
    // 🔁 Re-run si le CEP en store change (ex: profil mis à jour)
  }, [user?.cep]);

  return null; // pas d'UI ici
}

// Utils d’affichage log-safe (évite les crashes sur gros objets)
function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2)?.slice(0, 1000); } catch { return '[unserializable]'; }
}
function maskToken(tok) {
  if (!tok) {
    return tok;
  }
  const s = String(tok);
  if (s.length <= 12) {
    return s;
  }
  return `${s.slice(0, 12)}…(${s.length})`;
}

export default function Layout() {
  // Stripe publishable key (log masqué)
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
                  info:    (props) => <CustomTopToast {...props} />,
                  error:   (props) => <CustomTopToast {...props} />,
                  default: (props) => <CustomTopToast {...props} />,
                }}
                position="top"
                topOffset={0}       // on gère la position dans CustomTopToast
              />
            </ErrorBoundary>
          </StripeProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
// Fin Layout.jsx
// =============================================================