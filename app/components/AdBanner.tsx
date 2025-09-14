// src/components/AdBanner.tsx
import { View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const BANNER_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx';

export default function AdBanner() {
  return (
    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' }}>
      <BannerAd
        unitId={BANNER_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => console.log('[Ads] banner loaded')}
        onAdFailedToLoad={(e) => console.log('[Ads] banner fail', e)}
      />
    </View>
  );
}
