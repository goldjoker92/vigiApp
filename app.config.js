import 'dotenv/config';

export default ({ config }) => ({
  ...config,

  scheme: 'vigiapp',

  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          minSdkVersion: 24,
          kotlinVersion: '2.1.0',
        },
      },
    ],
    'expo-notifications',
  ],

  updates: {
    url: 'https://u.expo.dev/38fd672e-850f-436f-84f6-8a1626ed338a',
  },

  android: {
    ...config.android,
    package: 'com.guigui92.vigiapp',
    runtimeVersion: '1.0.0',
    googleServicesFile: './credentials/google-services.json',
    intentFilters: [
      {
        action: 'VIEW',
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'vigiapp' }],
      },
    ],
    config: {
      ...(config.android?.config || {}),
      googleMaps: {
        apiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
          process.env.ANDROID_MAPS_API_KEY ||
          '',
      },
      googleMobileAdsAppId: 'ca-app-pub-3940256099942544~3347511713',
    },
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.NEARBY_WIFI_DEVICES',
    ],
  },

  ios: {
    ...config.ios,
    runtimeVersion: { policy: 'appVersion' },
  },

  extra: {
    ...config.extra,
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    EXPO_PUBLIC_GOOGLE_WEATHER_KEY: process.env.EXPO_PUBLIC_GOOGLE_WEATHER_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    EXPO_PUBLIC_OPENCAGE_KEY: process.env.EXPO_PUBLIC_OPENCAGE_KEY,
    EXPO_PUBLIC_LOCATIONIQ_KEY: process.env.EXPO_PUBLIC_LOCATIONIQ_KEY,
    EXPO_PUBLIC_CONTACT_EMAIL: process.env.EXPO_PUBLIC_CONTACT_EMAIL,
    api_auto_completion: process.env.api_auto_completion,
    eas: {
      projectId:
        process.env.EAS_PROJECT_ID ||
        '38fd672e-850f-436f-84f6-8a1626ed338a',
    },
  },
});
