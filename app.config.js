import "dotenv/config";

export default ({ config }) => ({
  ...config,
  name: "VigiApp",
  slug: "vigiapp",
  version: "1.0.0",
  scheme: "vigiapp",
  scheme: "vigiapp",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  jsEngine: "hermes",
  newArchEnabled: false,

  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.guigui92.vigiapp",
    merchantIdentifier: "merchant.com.guigui92.vigiapp",
    config: { googleMapsApiKey: process.env.IOS_MAPS_API_KEY }
  },

  android: {
    package: "com.guigui92.vigiapp",
    edgeToEdgeEnabled: true,
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    // ⬇⬇⬇  Injection de la clé Google Maps (OBLIGATOIRE pour RN Maps)
    config: {
      googleMaps: {
        apiKey: process.env.ANDROID_MAPS_API_KEY
      }
    }
  },

  splash: {
    image: "./assets/images/logoVigiApp.png",
    backgroundColor: "#181A20",
    resizeMode: "contain"
  },

  web: { bundler: "metro", output: "static", favicon: "./assets/images/favicon.png" },

  plugins: [
    "expo-router",
    ["expo-splash-screen", {
      image: "./assets/images/splash-icon.png",
      imageWidth: 200,
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    }],
    ["react-native-google-mobile-ads", {
      androidAppId: "ca-app-pub-3940256099942544~3347511713",
      iosAppId: "ca-app-pub-3940256099942544~1458002511"
    }],
    ["@stripe/stripe-react-native", {
      merchantIdentifier: "merchant.com.guigui92.vigiapp",
      enableGooglePay: true
    }],
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 414120d (fix(android): clean debug.keystore & add Google Maps API key config)
    ["expo-build-properties", {
      android: {
        compileSdkVersion: 35,
        targetSdkVersion: 35,
        buildToolsVersion: "35.0.0"
      }
    }]
=======
                                
>>>>>>> 1944cfb (Sauvegarde avant mise à jour Expo)
  ],

  experiments: { typedRoutes: true },

  extra: {
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

    eas: { projectId: "95fb1fec-76a3-409d-b573-4d7127def99a" }
  }
});
