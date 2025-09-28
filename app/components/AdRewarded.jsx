import React, { useEffect, useState } from 'react';
import { Button } from 'react-native';
import { RewardedAd, AdEventType, RewardedAdEventType } from 'react-native-google-mobile-ads';

// === IDs AdMob ===
// 👉 Test Google : ca-app-pub-3940256099942544/5224354917
// 👉 Prod : remplace REWARDED_ID_PROD par ton vrai ID
const REWARDED_ID_DEV = 'ca-app-pub-3940256099942544/5224354917';
const REWARDED_ID_PROD = 'ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx';

const REWARDED_ID = __DEV__ ? REWARDED_ID_DEV : REWARDED_ID_PROD;

const rewarded = RewardedAd.createForAdRequest(REWARDED_ID, {
  requestNonPersonalizedAdsOnly: true,
});

export default function AdRewarded({ onLoaded, onFailed, onReward }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribeLoaded = rewarded.addAdEventListener(AdEventType.LOADED, () => {
      console.log('[Ads] ✅ rewarded loaded');
      setLoaded(true);
      onLoaded && onLoaded();
    });

    const unsubscribeFailed = rewarded.addAdEventListener(AdEventType.ERROR, (err) => {
      console.log('[Ads] ❌ rewarded failed', err);
      onFailed && onFailed(err);
    });

    const unsubscribeEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward) => {
        console.log('🎁 Reward reçu:', reward);
        onReward && onReward(reward);
      }
    );

    rewarded.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeFailed();
      unsubscribeEarned();
    };
  }, [onLoaded, onFailed, onReward]);

  return (
    <Button
      title="Show Rewarded"
      onPress={() => {
        if (loaded) {
          rewarded.show();
          setLoaded(false);
        } else {
          console.log('[Ads] ⚠️ rewarded not ready');
        }
      }}
    />
  );
}
