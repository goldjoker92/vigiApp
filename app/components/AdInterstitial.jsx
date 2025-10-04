import React, { useEffect, useState } from 'react';
import { Button } from 'react-native';
import { InterstitialAd, AdEventType } from 'react-native-google-mobile-ads';

// === IDs AdMob ===
// 👉 Test Google : ca-app-pub-3940256099942544/1033173712
// 👉 Prod : remplace INTERSTITIAL_ID_PROD par ton vrai ID
const INTERSTITIAL_ID_DEV = 'ca-app-pub-3940256099942544/1033173712';
const INTERSTITIAL_ID_PROD = 'ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx';

const INTERSTITIAL_ID = __DEV__ ? INTERSTITIAL_ID_DEV : INTERSTITIAL_ID_PROD;

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
  requestNonPersonalizedAdsOnly: true,
});

export default function AdInterstitial({ onLoaded, onFailed }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      console.log('[Ads] ✅ interstitial loaded');
      setLoaded(true);
      onLoaded && onLoaded();
    });

    const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('[Ads] 🔁 interstitial closed, reloading…');
      interstitial.load();
    });

    const unsubscribeFailed = interstitial.addAdEventListener(AdEventType.ERROR, (err) => {
      console.log('[Ads] ❌ interstitial failed', err);
      onFailed && onFailed(err);
    });

    interstitial.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeClosed();
      unsubscribeFailed();
    };
  }, [onLoaded, onFailed]);

  return (
    <Button
      title="Show Interstitial"
      onPress={() => {
        if (loaded) {
          interstitial.show();
          setLoaded(false);
        } else {
          console.log('[Ads] ⚠️ interstitial not ready');
        }
      }}
    />
  );
}
