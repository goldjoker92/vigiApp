// src/hooks/useAdsSetup.ts
import { useEffect } from 'react';
import mobileAds, {
  AdsConsent,
  AdsConsentStatus,
  AdsConsentDebugGeography,
} from 'react-native-google-mobile-ads';

export function useAdsSetup() {
  useEffect(() => {
    (async () => {
      try {
        // [DEV] Simule l’UE pour forcer l’affichage du formulaire UMP en test.
        // ⚠️ En prod, supprime cette ligne.
        await AdsConsent.setDebugGeography(AdsConsentDebugGeography.EEA);

        // 1) Met à jour les infos de consentement
        const info = await AdsConsent.requestInfoUpdate();

        // 2) Si dispo et requis, affiche le formulaire UMP
        const status = await AdsConsent.getStatus();
        if (
          info.isConsentFormAvailable &&
          (status === AdsConsentStatus.REQUIRED || status === AdsConsentStatus.UNKNOWN)
        ) {
          await AdsConsent.showForm();
        }

        // 3) Initialise le SDK AdMob
        await mobileAds().initialize();
        console.warn('[Ads] initialized');
      } catch (e) {
        console.error('[Ads] Error initializing ads:', e);
      }
    })();
  }, []);
}
