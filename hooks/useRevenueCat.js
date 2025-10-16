/* =============================================================
 useRevenueCat Hook
 - Expose isPro, offering, buy, restore
 - Auto logIn / logOut selon userId
 - Tous logs commentés
============================================================= */

import { useEffect, useState } from 'react';
import Purchases from 'react-native-purchases';
import {
  getCurrentOfferingWithRetry,
  buyWithFallback as _buyWithFallback,
  restoreWithRetry as _restoreWithRetry,
} from '../services/purchases';

export function useRevenueCat(userId) {
  const [isPro, setIsPro] = useState(false);
  const [offering, setOffering] = useState(null);

  // LogIn / LogOut RC auto
  useEffect(() => {
    (async () => {
      if (!userId) {
        try {
          await Purchases.logOut();
          // console.log('[RC] logOut ok');
        } catch (e) {
          console.error('RevenueCat error:', e);
        }
        return;
      }
      try {
        await Purchases.logIn(userId);
        // console.log('[RC] logIn ok:', userId);
      } catch (e) {
        console.error('RevenueCat error:', e);
      }
    })();
  }, [userId]);

  // Offering
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const off = await getCurrentOfferingWithRetry();
        if (mounted) {
          setOffering(off);
        }
        // console.log('[RC] offering actuel:', off?.identifier);
      } catch (e) {
        console.error('RevenueCat error:', e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Abos actifs
  useEffect(() => {
    const sub = Purchases.addCustomerInfoUpdateListener((info) => {
      const pro = info?.entitlements?.active?.pro;
      setIsPro(!!pro);
      // console.log('[RC] entitlements maj → isPro:', !!pro);
    });
    return () => {
      sub && sub.remove();
    };
  }, []);

  return {
    isPro,
    offering,
    buyWithFallback: _buyWithFallback,
    restoreWithRetry: _restoreWithRetry,
    refresh: async () => {
      try {
        const off = await getCurrentOfferingWithRetry();
        setOffering(off);
      } catch (e) {
        console.error('RevenueCat error:', e);
      }
    },
    logInRC: async (uid) => {
      try {
        await Purchases.logIn(uid);
        // console.log('[RC] logInRC manuel ok:', uid);
      } catch (e) {
        console.error('RevenueCat error:', e);
      }
    },
    logOutRC: async () => {
      try {
        await Purchases.logOut();
        // console.log('[RC] logOutRC manuel ok');
      } catch (e) {
        console.error('RevenueCat error:', e);
      }
    },
  };
}
