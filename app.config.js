import 'dotenv/config';

export default ({ config }) => ({
  ...config,

  android: {
    ...config.android,
    config: {
      ...(config.android?.config || {}),
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || process.env.ANDROID_MAPS_API_KEY || '',
      },
    },
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      // Android 13+ (Wi-Fi scans)
      'android.permission.NEARBY_WIFI_DEVICES',
      // Pas besoin de plus pour OpenCage/LocationIQ (HTTP only)
    ],
  },

  extra: {
    ...config.extra,

    // --- Google & Weather ---
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    EXPO_PUBLIC_GOOGLE_WEATHER_KEY: process.env.EXPO_PUBLIC_GOOGLE_WEATHER_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,

    // --- RevenueCat ---
    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,

    // --- Firebase ---
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,

    // --- Geocoding fallbacks ---
    EXPO_PUBLIC_OPENCAGE_KEY: process.env.EXPO_PUBLIC_OPENCAGE_KEY,
    EXPO_PUBLIC_LOCATIONIQ_KEY: process.env.EXPO_PUBLIC_LOCATIONIQ_KEY,
    EXPO_PUBLIC_CONTACT_EMAIL: process.env.EXPO_PUBLIC_CONTACT_EMAIL,

    // --- EAS ---
    eas: {
      projectId: process.env.EAS_PROJECT_ID || '38fd672e-850f-436f-84f6-8a1626ed338a', // fallback
    },
  },
});
