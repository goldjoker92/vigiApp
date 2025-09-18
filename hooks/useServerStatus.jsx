// src/hooks/useServerStatus.js
import { useEffect, useState, useRef } from 'react';
import Toast from 'react-native-toast-message';

export function useServerStatus({ url = 'https://api.ton-backend.com/ping', interval = 15000 }) {
  const [isOnline, setIsOnline] = useState(true);
  const prevOnline = useRef(true);

  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (mounted) {
          setIsOnline(res.ok);
        }
      } catch {
        if (mounted) {
          setIsOnline(false);
        }
      }
    };

    ping(); // Ping au mount
    const timer = setInterval(ping, interval);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [url, interval]);

  // Affiche un toast si le status change (UX)
  useEffect(() => {
    if (prevOnline.current !== isOnline) {
      if (!isOnline) {
        Toast.show({
          type: 'error',
          text1: 'Connexion perdue',
          text2: 'Le serveur est temporairement indisponible.',
          autoHide: false,
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Connexion rétablie',
          text2: 'Le serveur est de nouveau en ligne.',
        });
      }
      prevOnline.current = isOnline;
    }
  }, [isOnline]);

  return isOnline;
}
