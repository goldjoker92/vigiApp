// app.config.js
import 'dotenv/config';

// 🔎 Logger build-time (facultatif) — décommente pour vérifier que les vars .env sont bien lues
// const mask = (s = '') => (s ? s.slice(0, 6) + '…' + s.slice(-4) : '(vide)');
// console.log('[VigiApp build] EXPO_PUBLIC_GOOGLE_MAPS_KEY =', mask(process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY));
// console.log('[VigiApp build] FIREBASE_PROJECT_ID        =', process.env.FIREBASE_PROJECT_ID || '(vide)');

export default ({ config }) => ({
  ...config,

  // --- App ---
  name: 'VigiApp',
  slug: 'vigiapp',
  owner: 'goldjoker92',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vigiapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  // --- iOS (pas ciblé V1) ---
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.guigui92.vigiapp',
  },

  // --- Android ---
  android: {
    version: '1.0.1',
    versionCode: 2,
    package: 'com.guigui92.vigiapp',
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },

    // ✅ Google Maps injectée depuis .env (source unique)
    config: {
      googleMaps: {
        apiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY // clé que tu as déjà dans .env
          || process.env.ANDROID_MAPS_API_KEY     // fallback (optionnel)
          || '',
      },
      // AdMob App ID (test). En prod: remplace par ton ID réel.
      googleMobileAdsAppId: 'ca-app-pub-3940256099942544~3347511713',
    },

    // ✅ Permissions nécessaires (géoloc + Ads)
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],

    // FCM
    googleServicesFile: './google-services.json',

    // Deep links
    intentFilters: [
      {
        action: 'VIEW',
        categories: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'vigiapp' }],
      },
    ],
  },

  // --- Splash ---
  splash: {
    image: './assets/images/logoVigiApp.png',
    backgroundColor: '#181A20',
    resizeMode: 'contain',
  },

  // --- Web (inoffensif) ---
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  // --- Plugins ---
  plugins: [
    'expo-router',
    ['expo-notifications', { icon: './assets/images/notification-icon.png', color: '#0A84FF' }],
    ['expo-splash-screen', { image: './assets/images/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#ffffff' }],
    ['react-native-google-mobile-ads', { androidAppId: 'ca-app-pub-3940256099942544~3347511713' }],
    ['expo-build-properties', { android: { compileSdkVersion: 35, targetSdkVersion: 35, kotlinVersion: '2.0.21' } }],
  ],

  experiments: { typedRoutes: true },

  notification: {
    icon: './assets/images/notification-icon.png',
    color: '#0A84FF',
    androidMode: 'default',
    androidCollapsedTitle: 'VigiApp',
  },

  // --- Variables exposées runtime (utiles dans ton JS) ---
  extra: {
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    eas: { projectId: '38fd672e-850f-436f-84f6-8a1626ed338a' },
  },
});
