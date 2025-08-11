// src/bootstrap/monetization-init.js
import { Platform } from "react-native";
import Constants from "expo-constants";
import mobileAds from "react-native-google-mobile-ads";
import Purchases from "react-native-purchases";

let booted = false;
export default function bootOnce() {
  if (booted) return;
  booted = true;

  try { mobileAds().initialize(); } catch {}

  try {
    const rcKey =
      Platform.select({
        android: Constants.expoConfig?.extra?.RC_API_KEY_ANDROID,
        ios: Constants.expoConfig?.extra?.RC_API_KEY_IOS
      }) || "";
    if (rcKey) Purchases.configure({ apiKey: rcKey });
  } catch {}
}

bootOnce();
