import 'dotenv/config';

export default ({ config }) => ({

  ...config,
  name: 'VigiApp',
  slug: 'vigiapp',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vigiapp',
  userInterfaceStyle: 'automatic',
  platforms: ['android'],

  newArchEnabled: false,

  android: {
    edgeToEdgeEnabled: true,
    package: 'com.guigui92.vigiapp',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    config: {
      googleMaps: { apiKey: process.env.ANDROID_MAPS_API_KEY },
    },
    // -> POINT IMPORTANT : indique là où est vraiment ton google-services.json
    googleServicesFile: './android/app/google-services.json',

    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'INTERNET',
      'POST_NOTIFICATIONS',
    ],
    softwareKeyboardLayoutMode: 'pan',
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
    // garde les plugins utiles ; vérifie que './plugins/force-androidx-browser' existe si tu le laisses
    'expo-router',
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
      { merchantIdentifier: 'merchant.com.guigui92.vigiapp', enableGooglePay: true },
    ],
    // plugins de config (RN Firebase expose des plugins via la communauté,
    // laisser ces lignes n'est pas bloquant; Expo appliquera les config plugins disponibles)
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          minSdkVersion: 24,
          // -> alignement avec android/gradle.properties
          kotlinVersion: '1.9.10',
        },
      },
    ],
    './plugins/force-androidx-browser',
  ],

  experiments: { typedRoutes: true },

  extra: {
    // garde les clés dans les env / EAS secrets — ne commite pas les vraies valeurs
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY,
    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    eas: { projectId: '95fb1fec-76a3-409d-b573-4d7127def99a' },
  },
});
