// app.config.js
import 'dotenv/config';

export default ({ config }) => ({
  ...config,

  // --- App metadata ---
  name: 'VigiApp',
  slug: 'vigiapp',
  owner: 'goldjoker92',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vigiapp',                 // deep links "app-only"
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,               // OK avec SDK 53 / RN 0.79

  // --- iOS (laisse par défaut, on ne shippe pas iOS en V1) ---
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.guigui92.vigiapp',
    // Pas de Stripe/iOS merchant ici en V1
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

    // Google Maps (facultatif)
    config: { googleMaps: { apiKey: process.env.ANDROID_MAPS_API_KEY } },

    // FCM (Expo copiera vers android/app/google-services.json)
    googleServicesFile: './google-services.json',

    // Permissions (Android 13+) + AD_ID pour AdMob
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'com.google.android.gms.permission.AD_ID'
    ],

    // Intent-filters pour ouvrir des écrans précis via scheme (notifs/partages internes)
    intentFilters: [
      {
        action: 'VIEW',
        categories: ['BROWSABLE', 'DEFAULT'],
        data: [
          { scheme: 'vigiapp' },                // vigiapp://...
        ]
      }
    ]
  },

  // --- Splash ---
  splash: {
    image: './assets/images/logoVigiApp.png',
    backgroundColor: '#181A20',
    resizeMode: 'contain',
  },

  // --- Web (inutile pour V1, mais inoffensif) ---
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  // --- Plugins ---
  plugins: [
    'expo-router',

    // Notifications (plugin Expo) — options supportées
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#0A84FF',
        // pas de "mode: 'production'" ici (clé non supportée)
      },
    ],

    // Splash (ok)
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],

    // AdMob (IDs de test en dev — remplace l’androidAppId en prod)
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: 'ca-app-pub-3940256099942544~3347511713'
      },
    ],

    // Build properties : on fige toolchain pour éviter la drift Gradle
    [
      'expo-build-properties',
      {
        android: {
          // Expo 53 le fait déjà, on les rend explicites
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          kotlinVersion: '2.0.21',
          // Pas de flavors "play" (IAP supprimé)
        },
      },
    ],
  ],

  // --- Expériences ---
  experiments: { typedRoutes: true },

  // --- Fallback global notifications ---
  notification: {
    icon: './assets/images/notification-icon.png',
    color: '#0A84FF',
    androidMode: 'default',
    androidCollapsedTitle: 'VigiApp',
  },

  // --- Env exposées ---
  extra: {
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,

    // RevenueCat (Android)
    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,

    // Firebase Web (si tu utilises le SDK JS côté web/services)
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,

    // EAS
    eas: { projectId: '38fd672e-850f-436f-84f6-8a1626ed338a' },
  },
});
