import 'dotenv/config';

export default ({ config }) => ({
  ...config,

  plugins: [
    // Laisse Expo gérer Kotlin (ne pas mettre kotlinVersion ici)
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          minSdkVersion: 24
          // ❌ pas de kotlinVersion ici
        },
        ios: {
          deploymentTarget: '15.1'
        },
      },
    ],

    'expo-location',

    [
      'react-native-google-mobile-ads',
      {
        androidAppId:
          process.env.ADMOB_ANDROID_APP_ID ||
          'ca-app-pub-3940256099942544~3347511713', // ID de test
      },
    ],
  ],

  updates: {
    url: 'https://u.expo.dev/38fd672e-850f-436f-84f6-8a1626ed338a',
  },

  android: {
    ...config.android,
    package: 'com.guigui92.vigiapp',
    runtimeVersion: '1.0.0',
    googleServicesFile: './credentials/google-services.json',
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'com.google.android.gms.permission.AD_ID',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
    ],
  },

  ios: {
    ...config.ios,
    runtimeVersion: { policy: 'appVersion' },
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'VigiApp utilise votre position pour afficher des alertes de voisinage pertinentes.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "VigiApp a besoin de votre position en arrière-plan pour envoyer des alertes même quand l’app est fermée.",
      NSCameraUsageDescription:
        "VigiApp utilise votre caméra pour joindre des photos à vos signalements.",
      NSPhotoLibraryAddUsageDescription:
        "VigiApp doit enregistrer des photos pour vos signalements.",
    },
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
    eas: {
      projectId: process.env.EAS_PROJECT_ID || '38fd672e-850f-436f-84f6-8a1626ed338a',
    },
  },
});
