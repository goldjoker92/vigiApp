import Constants from 'expo-constants';
import mobileAds from 'react-native-google-mobile-ads';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { useMonetizationStore } from '../monetization/store';

const ENTITLEMENT_ID = 'pro';
let _done = false;

async function initAdMob() {
  try {
    await mobileAds().initialize();
    if (__DEV__) {console.log('[AdMob] initialized');}
  } catch (e: any) {
    console.warn('[AdMob init]', e?.message || e);
  }
}

async function initRevenueCat() {
  try {
    const extra: any = Constants?.expoConfig?.extra || {};
    const apiKey = extra?.RC_API_KEY_ANDROID || '';
    if (!apiKey) {
      console.warn('[RC] RC_API_KEY_ANDROID manquant (extra.RC_API_KEY_ANDROID)');
      return;
    }

    if (__DEV__) {Purchases.setLogLevel(LOG_LEVEL.DEBUG);}
    await Purchases.configure({ apiKey, observerMode: false });

    const [offerings, info] = await Promise.all([
      Purchases.getOfferings(),
      Purchases.getCustomerInfo(),
    ]);

    useMonetizationStore.getState().setOfferings(offerings as any);
    useMonetizationStore.getState().applyCustomerInfo(info as any, ENTITLEMENT_ID);

    Purchases.addCustomerInfoUpdateListener((ci) => {
      useMonetizationStore.getState().applyCustomerInfo(ci as any, ENTITLEMENT_ID);
    });

    if (__DEV__) {console.log('[RC] configured');}
  } catch (e: any) {
    console.warn('[RC init]', e?.message || e);
  }
}

(async () => {
  if (_done) {return;}
  _done = true;
  await initAdMob();
  await initRevenueCat();
})();
