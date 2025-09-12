// app.config.js (fix: remove invalid 'sounds: ["default"]')
import 'dotenv/config';

export default ({ config }) => ({
  ...config,

  name: 'VigiApp',
  slug: 'vigiapp',
  owner: 'goldjoker92',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vigiapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.guigui92.vigiapp',
    merchantIdentifier: 'merchant.com.guigui92.vigiapp',
    config: { googleMapsApiKey: process.env.IOS_MAPS_API_KEY },
    // googleServicesFile: './GoogleService-Info.plist',
  },

  android: {
    version: '1.0.1',
    versionCode: 2,
    package: 'com.guigui92.vigiapp',
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    config: { googleMaps: { apiKey: process.env.ANDROID_MAPS_API_KEY } },
    googleServicesFile: './google-services.json',
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
    ],
  },

  splash: {
    image: './assets/images/logoVigiApp.png',
    backgroundColor: '#181A20',
    resizeMode: 'contain',
  },

  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  plugins: [
    'expo-router',

    // ✅ FIXED: removed invalid `sounds: ['default']`
    [
      'expo-notifications',
      {
        icon: './assets/images/notification-icon.png',
        color: '#0A84FF',
        mode: 'production',
        // To use a real custom sound later:
        // sounds: ['./assets/sounds/ding.mp3'],
      },
    ],

    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],

    [
      'react-native-google-mobile-ads',
      {
        androidAppId: 'ca-app-pub-3940256099942544~3347511713',
        iosAppId: 'ca-app-pub-3940256099942544~1458002511',
      },
    ],

    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: 'merchant.com.guigui92.vigiapp',
        enableGooglePay: true,
      },
    ],
  ],

  experiments: { typedRoutes: true },

  notification: {
    icon: './assets/images/notification-icon.png',
    color: '#0A84FF',
    androidMode: 'default',
    androidCollapsedTitle: 'VigiApp',
  },

  extra: {
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,

    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,

    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,

    // si tu préfères laisser EAS lier le projet via .eas/project.json, tu peux retirer ceci
    eas: { projectId: '38fd672e-850f-436f-84f6-8a1626ed338a' },
  },
});
