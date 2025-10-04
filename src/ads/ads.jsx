import { useEffect, useRef, useState } from 'react';
import mobileAds, {
  AdEventType,
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
} from 'react-native-google-mobile-ads';

// === IDs Google TEST ===
// ⚠️ Ces IDs sont fournis par Google uniquement pour le DEV
// Ne rapportent AUCUN revenu.
// Remplace par tes propres IDs AdMob en prod.
const DEV = {
  APP_ID: 'ca-app-pub-3940256099942544~3347511713',
  BANNER: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
};

// === Bootstrap SDK ===
// Ce composant initialise AdMob quand l’app démarre.
// Monte-le dans ton _layout.jsx ou App.js.
export function AdBootstrap() {
  useEffect(() => {
    console.log('[Ads] 🚀 Initialisation du SDK MobileAds...');
    mobileAds()
      .setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.T, // Contenu "Teen" max
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        testDeviceIdentifiers: __DEV__ ? ['EMULATOR'] : [], // Active les devices de test
      })
      .then(() => {
        console.log('[Ads] ✅ Configuration appliquée, SDK en cours d’initialisation...');
        return mobileAds().initialize();
      })
      .then(() => {
        console.log('[Ads] 🎉 SDK initialisé avec succès');
      })
      .catch((e) => console.log('[Ads] ❌ Erreur init SDK:', e));
  }, []);

  return null;
}

// === Bannière simple ===
// Exemple basique d’affichage d’une bannière.
export function AdBanner() {
  console.log('[Ads] 🖼️ Bannière rendue');
  return (
    <BannerAd
      unitId={DEV.BANNER}
      size={BannerAdSize.BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: true }}
    />
  );
}

// === Hook Interstitial ===
export function useInterstitial() {
  const [loaded, setLoaded] = useState(false);
  const interstitialRef = useRef(null);

  useEffect(() => {
    console.log('[Ads] 🎬 Création d’un nouvel interstitial');
    const ad = InterstitialAd.createForAdRequest(DEV.INTERSTITIAL, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitialRef.current = ad;

    // Listener: Loaded
    const uLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      console.log('[Ads] ✅ Interstitial chargé et prêt');
      setLoaded(true);
    });

    // Listener: Closed
    const uClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('[Ads] ❎ Interstitial fermé par l’utilisateur → rechargement');
      setLoaded(false);
      try {
        ad.load();
      } catch (e) {
        console.log('[Ads] ⚠️ Erreur reload après fermeture:', e);
      }
    });

    // Listener: Error
    const uError = ad.addAdEventListener(AdEventType.ERROR, (err) => {
      console.log('[Ads] ❌ Erreur interstitial:', err);
      setLoaded(false);
    });

    // Premier chargement
    console.log('[Ads] ⏳ Chargement interstitial...');
    ad.load();

    return () => {
      console.log('[Ads] 🧹 Cleanup interstitial');
      try {
        uLoaded();
        uClosed();
        uError();
      } catch {}
      interstitialRef.current = null;
    };
  }, []);

  // Fonction pour montrer la pub
  const show = () => {
    if (loaded && interstitialRef.current) {
      console.log('[Ads] 🎥 Affichage interstitial');
      interstitialRef.current.show();
    } else {
      console.log('[Ads] ⚠️ Interstitial pas prêt');
    }
  };

  return { loaded, show };
}

// === Hook Rewarded ===
export function useRewarded(onReward) {
  const [loaded, setLoaded] = useState(false);
  const rewardedRef = useRef(null);

  useEffect(() => {
    console.log('[Ads] 🎬 Création d’un nouvel rewarded');
    const ad = RewardedAd.createForAdRequest(DEV.REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });
    rewardedRef.current = ad;

    // Listener: Loaded
    const uLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log('[Ads] ✅ Rewarded chargé et prêt');
      setLoaded(true);
    });

    // Listener: Reward Earned
    const uEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      console.log('[Ads] 🏆 Reward gagné:', reward);
      onReward?.(Number(reward?.amount ?? 0), reward?.type);
    });

    // Listener: Closed
    const uClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('[Ads] ❎ Rewarded fermé par l’utilisateur → rechargement');
      setLoaded(false);
      try {
        ad.load();
      } catch (e) {
        console.log('[Ads] ⚠️ Erreur reload après fermeture:', e);
      }
    });

    // Listener: Error
    const uError = ad.addAdEventListener(AdEventType.ERROR, (err) => {
      console.log('[Ads] ❌ Erreur rewarded:', err);
      setLoaded(false);
    });

    // Premier chargement
    console.log('[Ads] ⏳ Chargement rewarded...');
    ad.load();

    return () => {
      console.log('[Ads] 🧹 Cleanup rewarded');
      try {
        uLoaded();
        uEarned();
        uClosed();
        uError();
      } catch {}
      rewardedRef.current = null;
    };
  }, [onReward]);

  // Fonction pour montrer la pub
  const show = () => {
    if (loaded && rewardedRef.current) {
      console.log('[Ads] 🎥 Affichage rewarded');
      rewardedRef.current.show();
    } else {
      console.log('[Ads] ⚠️ Rewarded pas prêt');
    }
  };

  return { loaded, show };
}
