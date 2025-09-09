// app.config.js
// -------------------------------------------------------------
// Chargement des variables d'environnement (.env) et configuration
// Expo. On ajoute le setup Notifications + FCM (Android) de façon
// non-destructive et entièrement commentée.
// -------------------------------------------------------------
import 'dotenv/config';

export default ({ config }) => ({
  ...config,

  // --- Métadonnées app ---
  name: "VigiApp",
  slug: "vigiapp",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "vigiapp",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,

  // --- iOS (on laisse prêt pour plus tard, sans impacter Android) ---
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.guigui92.vigiapp",
    merchantIdentifier: "merchant.com.guigui92.vigiapp",
    config: { googleMapsApiKey: process.env.IOS_MAPS_API_KEY },

    // (Optionnel) Si tu ajoutes un jour le push iOS, place le fichier
    // Firebase iOS à la racine et dé-commente cette ligne.
    // googleServicesFile: "./GoogleService-Info.plist",
  },

  // --- Android (cible principale pour le push) ---
  android: {
    edgeToEdgeEnabled: true,
    package: "com.guigui92.vigiapp",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    config: { googleMaps: { apiKey: process.env.ANDROID_MAPS_API_KEY } },

    // 🔴 CLÉ FCM CÔTÉ APP : Obligatoire pour FCM
    // Place le fichier téléchargé depuis Firebase à la racine (à côté
    // de app.config.js) sous le nom `google-services.json`.
    // EAS le copiera automatiquement dans android/app/ lors du build.
    googleServicesFile: "./google-services.json",

    // ✅ Permissions explicites (évite les surprises sur Android 13+)
    // - POST_NOTIFICATIONS : requise pour afficher des notifs.
    // - WAKE_LOCK : optionnel mais utile (réveil pour traitement).
    // - RECEIVE_BOOT_COMPLETED : utile si tu planifies des notifs après reboot.
    permissions: [
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.WAKE_LOCK",
      "android.permission.RECEIVE_BOOT_COMPLETED"
    ],
  },

  // --- Splash écran (inchangé) ---
  splash: {
    image: "./assets/images/logoVigiApp.png",
    backgroundColor: "#181A20",
    resizeMode: "contain"
  },

  // --- Web (inchangé) ---
  web: { bundler: "metro", output: "static", favicon: "./assets/images/favicon.png" },

  // --- Plugins Expo & natifs ---
  plugins: [
    "expo-router",

    // ✅ Notifications (expo-notifications)
    // - Gère la configuration Android manifest et le binding natif.
    // - On fixe l’icône/couleur Android pour une UX cohérente.
    [
      "expo-notifications",
      {
        // Icône monochrome Android (24x24dp white) – mets ton chemin si tu veux personnaliser
        icon: "./assets/images/notification-icon.png",
        color: "#0A84FF",            // Couleur accent (barre d’état / petites icônes)
        sounds: ["default"],         // Déclare les sons intégrés (tu peux en ajouter plus tard)
        mode: "production"           // Pas de comportement spécial “debug” côté OS
      }
    ],

    // Splash screen (inchangé)
    ["expo-splash-screen", {
      image: "./assets/images/splash-icon.png",
      imageWidth: 200,
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    }],

    // Google Mobile Ads (inchangé)
    ["react-native-google-mobile-ads", {
      androidAppId: "ca-app-pub-3940256099942544~3347511713",
      iosAppId: "ca-app-pub-3940256099942544~1458002511"
    }],

    // Stripe (inchangé)
    ["@stripe/stripe-react-native", {
      merchantIdentifier: "merchant.com.guigui92.vigiapp",
      enableGooglePay: true
    }],
  ],

  // --- Expériences (inchangé) ---
  experiments: { typedRoutes: true },

  // --- Section notificaton (facultatif mais propre pour Android)
  // Permet d’avoir un fallback global si l’OS n’applique pas l’icône plugin.
  notification: {
    icon: "./assets/images/notification-icon.png",
    color: "#0A84FF",
    androidMode: "default",
    androidCollapsedTitle: "VigiApp"
  },

  // --- Variables exposées au JS ---
  extra: {
    EXPO_PUBLIC_GOOGLE_MAPS_KEY: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY, // Geocoding web
    RC_API_KEY_ANDROID: process.env.RC_API_KEY_ANDROID,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,

    // Firebase (déjà présents, on les conserve)
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,

    // EAS
    eas: { projectId: "95fb1fec-76a3-409d-b573-4d7127def99a" }
  }
});
