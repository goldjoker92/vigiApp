// hooks/useDebugFcmToken.js
import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';

const wait = (ms) => new Promise(res => setTimeout(res, ms));

export default function useDebugFcmToken() {
  const shownRef = useRef(false); // évite les popups multiples

  useEffect(() => {
    let unsubscribeOnTokenRefresh;

    (async () => {
      try {
        // iOS: permission FCM (alerte/badge/son)
        if (Platform.OS === 'ios') {
          const status = await messaging().requestPermission();
          const enabled =
            status === messaging.AuthorizationStatus.AUTHORIZED ||
            status === messaging.AuthorizationStatus.PROVISIONAL;
          console.log('[FCM] iOS permission:', status, 'enabled:', enabled);
        }

        // Android 13+ : permission notif système (pour afficher des notifs locales/test)
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          const { status, canAskAgain, granted } = await Notifications.requestPermissionsAsync();
          console.log('[FCM] Android notif permission ->', { status, canAskAgain, granted });
        }

        // Enregistre l’appareil (utile surtout iOS; Android tolère)
        await messaging().registerDeviceForRemoteMessages();

        const show = async (token) => {
          if (!token || shownRef.current) return;
          shownRef.current = true;
          console.log('FCM TOKEN ▶', token);
          try {
            await Clipboard.setStringAsync(token);
            Alert.alert('FCM token', 'Copié dans le presse-papiers ✅');
          } catch {
            Alert.alert('FCM token', token);
          }
        };

        // Récupération du token avec 3 petites tentatives si Play Services tarde
        let token = null;
        for (let i = 0; i < 3; i++) {
          try {
            token = await messaging().getToken();
            if (token) break;
          } catch (e) {
            console.log('[FCM] getToken attempt failed:', e?.message || e);
          }
          await wait(600); // petit backoff
        }
        await show(token);

        // Écoute d’un futur refresh
        unsubscribeOnTokenRefresh = messaging().onTokenRefresh((newToken) => {
          console.log('[FCM] onTokenRefresh ▶', newToken);
          shownRef.current = false; // autorise une nouvelle popup
          show(newToken);
        });
      } catch (e) {
        console.log('FCM TOKEN ERR ▶', e);
        Alert.alert('FCM error', String(e?.message || e));
      }
    })();

    return () => {
      try { unsubscribeOnTokenRefresh?.(); } catch {}
    };
  }, []);
}
