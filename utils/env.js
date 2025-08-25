// utils/env.js
import Constants from 'expo-constants';

export const GOOGLE_MAPS_KEY = (
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  Constants?.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  Constants?.manifest2?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
  ''
).trim();

export function hasGoogleKey() {
  const ok = GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY.length > 30;
  if (!global.__GOOGLE_KEY_LOGGED__) {
    console.log('[ENV] GOOGLE_KEY present =', !!ok, 'len =', (GOOGLE_MAPS_KEY || '').length);
    global.__GOOGLE_KEY_LOGGED__ = true;
  }
  return !!ok;
}
// Note : ne pas exporter de variable "hasGoogleKey" car elle ne sera pas reactive.