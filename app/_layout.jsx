// app/_layout.js
// =============================================================
// VigiApp — Root layout avec bootstrap PUSH ultra-verbosé
// - Logs horodatés (préfixés) pour suivre chaque étape
// - Init listeners + permission + Expo token
// - Upsert device sur changement d'auth (idempotent, anti-doublons)
// - Cleanup propre à l’unmount
// - Silence console en release optionnel via extra.SILENCE_CONSOLE_IN_RELEASE
// =============================================================

import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
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
} from '../libs/notifications';

// Upsert device côté backend (conserve ton implémentation)
import { upsertDevice } from '../libs/registerDevice';

// Firebase auth
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

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
// Par défaut on conserve les logs (utile en preview).
if (!__DEV__ && SILENCE_RELEASE) {
  // eslint-disable-next-line no-console
  console.log = () => {};
  // eslint-disable-next-line no-console
  console.warn = () => {};
  // eslint-disable-next-line no-console
  console.error = () => {};
  // volontairement aucun log ici (silence total)
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

// ---------------------------
// Bootstrap Push (one-shot)
// ---------------------------
function PushBootstrap() {
  // Mémoire locale pour limiter les upserts répétitifs
  const expoTokenRef = useRef(null);
  const lastUpsertKeyRef = useRef(''); // `${uid}:${tokenPrefix}` pour dédup

  useEffect(() => {
    let detachListeners;     // pour nettoyer les listeners notifs
    let unsubscribeAuth;     // pour détacher l'observateur auth

    (async () => {
      const t0 = Date.now();
      log('mount → start bootstrap');

      // 1) Listeners + permissions + Expo token
      try {
        // a) brancher les listeners (réception + tap réponse)
        detachListeners = attachNotificationListeners({
          onReceive: (n) => log('listener:onReceive', safeJson(n)),
          onResponse: (r) => log('listener:onResponse', safeJson(r)),
        });
        log('listeners attached');

        // b) permission + channel + Expo push token
        const token = await registerForPushNotificationsAsync();
        expoTokenRef.current = token;
        log('expo token obtained:', maskToken(token));
      } catch (e) {
        err('bootstrap register/listeners failed:', e?.message || e);
      }

      // 2) Dès qu’on a un user, on upsert le device (idempotent)
      try {
        unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
          if (!user) {
            log('auth: signed out (no upsert)');
            return;
          }
          if (!expoTokenRef.current) {
            // Cas rare: token pas encore dispo → on upsertera au prochain passage
            warn('auth: user present but no expo token yet (will upsert later)');
            return;
          }

          // Anti-doublon: évite spam d'upsert si uid/token inchangés
          const key = `${user.uid}:${String(expoTokenRef.current).slice(0, 12)}`;
          if (lastUpsertKeyRef.current === key) {
            log('auth: upsert skipped (same uid+token prefix)', key);
            return;
          }

          log('auth: signed in → upsert device…', { uid: user.uid, key });
          try {
            // ⚠️ Ajuste les champs selon ce que ton upsertDevice attend
            const res = await upsertDevice({
              userId: user.uid,
              expoPushToken: expoTokenRef.current,
              // Optionnel: CEP par défaut si tu veux tester les fallback CEP côté Function
              // cep: '62595-000',
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
  }, []);

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
                config={{ success: (props) => <CustomTopToast {...props} /> }}
                position="top"
                topOffset={42}
              />
            </ErrorBoundary>
          </StripeProvider>
        </PaperProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
