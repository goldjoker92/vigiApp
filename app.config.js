// app.config.js
// -------------------------------------------------------------
// Charge les variables d'environnement (.env) et configure Expo.
// Config Android prête pour Notifications + FCM (google-services.json).
// Aucun projectId EAS hardcodé (le lien se fait via .eas/project.json).
// -------------------------------------------------------------
import 'dotenv/config';

export default ({ config }) => ({
  // Hérite des valeurs par défaut (Expo)
  ...config,

  // --- Métadonnées app ---
  name: 'VigiApp',
  slug: 'vigiapp',
  owner: 'goldjoker92', // si tu préfères l’org: 'goldjoker92-org'
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vigiapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  // --- iOS (prêt pour plus tard, n’impacte pas Android) ---
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.guigui92.vigiapp',
    merchantIdentifier: 'merchant.com.guigui92.vigiapp',
    config: { googleMapsApiKey: process.env.IOS_MAPS_API_KEY },
    // Pour activer le push iOS plus tard, place le fichier et décommente :
    // googleServicesFile: './GoogleService-Info.plist',
  },

  // --- Android (cible principale pour notifs/FCM) ---

  
  android: {
    version: "1.0.1",
    versionCode: 2,
    package: 'com.guigui92.vigiapp',
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    // Clé Google Maps Android (SDK Maps)
    config: { googleMaps: { apiKey: process.env.ANDROID_MAPS_API_KEY } },
    // FCM : place le fichier à la racine du projet
    // (EAS le copie dans android/app/ au build)
    googleServicesFile: './google-services.json',
    // Permissions explicites pour Android 13+
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ],
  },

  // --- Splash ---
  splash: {
    image: './assets/images/logoVigiApp.png',
    backgroundColor: '#181A20',
    resizeMode: 'contain',
  },

  // --- Web ---
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  // --- Plugins Expo & natifs ---
  plugins: [
    'expo-router',

    // Notifications (gère manifest + native bindings)
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#0A84FF',
        sounds: ['default'],
        mode: 'production',
      },
    ],

    // Splash screen
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],

    // Google Mobile Ads (IDs de test par défaut)
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: 'ca-app-pub-3940256099942544~3347511713',
        iosAppId: 'ca-app-pub-3940256099942544~1458002511',
      },
    ],

    // Stripe
    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: 'merchant.com.guigui92.vigiapp',
        enableGooglePay: true,
      },
    ],
  ],

  // --- Expériences ---
  experiments: { typedRoutes: true },

  // --- Notification (fallback global Android) ---
  notification: {
    icon: './assets/images/notification-icon.png',
    color: '#0A84FF',
    androidMode: 'default',
    androidCollapsedTitle: 'VigiApp',
  },

  // --- Variables accessibles côté JS (process.env -> extra) ---
  extra: {
    // Web/Maps/Services
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,

    // RevenueCat / Stripe
    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,

    // Firebase Web (utilisées par ton app)
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    
    // ✅ Lie explicitement ce repo au bon projet EAS
    eas: { projectId: '38fd672e-850f-436f-84f6-8a1626ed338a' },
  },
});
