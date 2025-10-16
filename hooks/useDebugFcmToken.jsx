// hooks/useDebugFcmToken.jsx
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';

export default function useDebugFcmToken() {
  const [fcm, setFcm] = useState(null);

  useEffect(() => {
    let canceled = false;

    (async () => {
      try {
        const { data } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
        if (!canceled) {
          setFcm(data || null);
          console.log('[DEBUG][FCM] token =', data);
        }
      } catch (e) {
        console.warn('[DEBUG][FCM] fail:', e?.message || e);
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  return fcm;
}
