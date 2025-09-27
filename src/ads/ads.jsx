import { useEffect, useRef, useState } from 'react';
import mobileAds, {
  AdEventType,
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

// IDs de test Google (DEV uniquement, aucun revenu)
const DEV = {
  APP_ID: 'ca-app-pub-3940256099942544~3347511713',
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
};

// Bootstrap SDK
export function AdBootstrap() {
  useEffect(() => {
    mobileAds()
      .setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.T,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        testDeviceIdentifiers: __DEV__ ? ['EMULATOR'] : [],
      })
      .then(() => mobileAds().initialize());
  }, []);
  return null;
}

// Bannière simple
export function AdBanner() {
  return (
    <BannerAd
      unitId={DEV.BANNER}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );
}

// Hook interstitiel
export function useInterstitial() {
  const [loaded, setLoaded] = useState(false);
  const interstitialRef = useRef(null);

  useEffect(() => {
    interstitialRef.current = InterstitialAd.createForAdRequest(DEV.INTERSTITIAL, {
      requestNonPersonalizedAdsOnly: true,
    });
    const ad = interstitialRef.current;

    const onLoaded = ad.addAdEventListener(AdEventType.LOADED, () => setLoaded(true));
    const onClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setLoaded(false);
      ad.load();
    });
    const onError = ad.addAdEventListener(AdEventType.ERROR, () => setLoaded(false));

    ad.load();
    return () => {
      onLoaded();
      onClosed();
      onError();
    };
  }, []);

  const show = () => {
    if (loaded && interstitialRef.current) {
      interstitialRef.current.show();
    }
  };
  return { loaded, show };
}

// Hook rewarded
export function useRewarded(onReward) {
  const [loaded, setLoaded] = useState(false);
  const rewardedRef = useRef(null);

  useEffect(() => {
    rewardedRef.current = RewardedAd.createForAdRequest(DEV.REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });
    const ad = rewardedRef.current;

    const onLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => setLoaded(true));
    const onEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      onReward?.(Number(reward.amount ?? 0), reward.type);
    });
    const onClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setLoaded(false);
      ad.load();
    });
    const onError = ad.addAdEventListener(AdEventType.ERROR, () => setLoaded(false));

    ad.load();
    return () => {
      onLoaded();
      onEarned();
      onClosed();
      onError();
    };
  }, [onReward]);

  const show = () => {
    if (loaded && rewardedRef.current) {
      rewardedRef.current.show();
    }
  };
  return { loaded, show };
}

const interstitial = InterstitialAd.createForAdRequest(TestIds.INTERSTITIAL);

interstitial.onAdEvent((type, _error) => {
  if (type === AdEventType.LOADED) {
    interstitial.show();
  }
});
