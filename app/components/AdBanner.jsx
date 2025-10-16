import React from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

// === IDs AdMob ===
// 👉 Test Google : ca-app-pub-3940256099942544/6300978111
// 👉 Prod : remplace BANNER_ID_PROD par ton vrai ID
const BANNER_ID_DEV = 'ca-app-pub-3940256099942544/6300978111';
const BANNER_ID_PROD = 'ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx';

const BANNER_ID = __DEV__ ? BANNER_ID_DEV : BANNER_ID_PROD;

export default function AdBanner({ onLoaded, onFailed }) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <BannerAd
        unitId={BANNER_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {
          console.log('[Ads] ✅ banner loaded');
          onLoaded && onLoaded();
        }}
        onAdFailedToLoad={(e) => {
          console.log('[Ads] ❌ banner fail', e);
          onFailed && onFailed(e);
        }}
      />
    </View>
  );
}
