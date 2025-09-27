// app/_layout.jsx
// -------------------------------------------------------------
// VigiApp — Root Layout (Expo Router)
// - Notifications (Expo + FCM) initialisées au boot
// - Chemins: ../libs/notifications, ../store/users, ../services/purchases
// - Aucune régression: toasts, store, RevenueCat conservés
// - Logs lisibles pour debug
// -------------------------------------------------------------

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';

// UI globale
import CustomTopToast from './components/CustomTopToast';

// Store (emplacement root/../store/* dans ton projet)
import { useUserStore } from '../store/users';

// RevenueCat
import { initRevenueCat } from '../services/purchases';
import { useRevenueCat } from '../hooks/useRevenueCat';

// 🔔 Notifications (lib à la racine: ../libs/notifications)
import {
  initNotifications,
  attachNotificationListeners,
  wireAuthGateForNotifications,
  getFcmDeviceTokenAsync,
} from '../libs/notifications';

export default function Layout() {
  // Si tu veux garder la lecture du userId sans warning "unused",
  // on le log en debug une fois.
  const userId = useUserStore((s) => s?.user?.uid);

  // === Notifications : init complète au boot ===
  useEffect(() => {
    let detachListeners;

    (async () => {
      console.log('[Layout][NOTIF] boot → wireAuthGateForNotifications()');
      // 1) Gate d’auth: garantit le routing des taps (cold/warm) après login
      wireAuthGateForNotifications();

      try {
        console.log('[Layout][NOTIF] initNotifications()…');
        // 2) Canaux Android + permissions + cold-start (ouvre si lancé via notif)
        await initNotifications();
        console.log('[Layout][NOTIF] init OK ✅');
      } catch (e) {
        console.warn('[Layout][NOTIF] init FAILED:', e?.message || e);
      }

      try {
        console.log('[Layout][NOTIF] attachNotificationListeners()…');
        // 3) Listeners: réception en foreground + réponse (tap)
        detachListeners = attachNotificationListeners({
          onReceive: (n) => {
            const d = n?.request?.content?.data;
            console.log('[Layout][NOTIF] received (foreground) data =', d);
          },
          onResponse: (r) => {
            const d = r?.notification?.request?.content?.data;
            console.log('[Layout][NOTIF] tap response data =', d);
          },
        });
        console.log('[Layout][NOTIF] listeners attached ✅');
      } catch (e) {
        console.warn('[Layout][NOTIF] listeners FAILED:', e?.message || e);
      }

      // 4) Optionnel: récup FCM (device physique / Dev Client / APK)
      try {
        const token = await getFcmDeviceTokenAsync();
        if (token) {
          console.log('[Layout][NOTIF] FCM token ✅', token);
        } else {
          console.log('[Layout][NOTIF] FCM token indisponible (simulateur/dev ?)');
        }
      } catch (e) {
        console.warn('[Layout][NOTIF] FCM token error:', e?.message || e);
      }

      // Debug gentil: évite le warning "userId is defined but never used"
      console.log('[Layout] userId =', userId || '(anon)');
    })();

    // Cleanup: détache proprement les listeners à l’unmount
    return () => {
      try {
        detachListeners?.();
        console.log('[Layout][NOTIF] listeners detached ✅');
      } catch {}
    };
  }, [userId]);

  // === RevenueCat & co — inchangé, non bloquant ===
  useEffect(() => {
    (async () => {
      try {
        console.log('[Layout][RC] initRevenueCat()…');
        await initRevenueCat();
        console.log('[Layout][RC] init OK ✅');
      } catch (e) {
        console.warn('[Layout][RC] init FAILED:', e?.message || e);
      }
    })();
  }, []);

  // Hook RC conservé (no-op si déjà géré ailleurs)
  useRevenueCat();

  // === Rendu racine ===
  return (
    <View style={{ flex: 1 }}>
      <CustomTopToast />
      <Slot />
    </View>
  );
}
