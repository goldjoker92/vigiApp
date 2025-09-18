import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const UNIT_ID = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-3940256099942544/1033173712'; // Remplace par ton vrai ID en prod

let interstitial = InterstitialAd.createForAdRequest(UNIT_ID);
let loaded = false;

export function prepareInterstitial(): Promise<void> {
  return new Promise((resolve) => {
    const onLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
      onLoaded();
      resolve();
    });
    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      loaded = false;
      interstitial = InterstitialAd.createForAdRequest(UNIT_ID);
    });
    interstitial.load();
  });
}

export async function showInterstitial() {
  try {
    if (!loaded) {
      await prepareInterstitial();
    }
    interstitial.show();
  } catch (e: any) {
    console.warn('[Ad] show interstitial', e?.message || e);
  }
}
