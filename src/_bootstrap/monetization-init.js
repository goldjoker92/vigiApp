// src/_bootstrap/monetization-init.ts
import mobileAds from 'react-native-google-mobile-ads';

// Initialise une seule fois au démarrage.
// En dev client uniquement : Expo Go n'est pas concerné (mais on est en dev build).
let inited = false;

export async function initMonetization() {
  if (inited) return;
  try {
    await mobileAds().initialize(); // OK même avec l’App ID de test
    inited = true;
  } catch (e) {
    // On ne crash pas l'app si AdMob n'est pas prêt
    if (__DEV__) console.warn('AdMob init failed:', e);
  }
}

// lance l'init immédiatement
initMonetization();
