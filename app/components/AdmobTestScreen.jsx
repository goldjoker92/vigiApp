import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// On importe tes 3 composants pubs
import AdBanner from '../components/AdBanner';
import AdInterstitial from '../components/AdInterstitial';
import AdRewarded from '../components/AdRewarded';

export default function AdmobTestScreen() {
  console.log('[Screen] ✅ AdmobTestScreen rendu');

  // États de debug pour chaque type d’ad
  const [bannerStatus, setBannerStatus] = useState('⏳ En attente…');
  const [interstitialStatus, setInterstitialStatus] = useState('⏳ En attente…');
  const [rewardedStatus, setRewardedStatus] = useState('⏳ En attente…');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📱 AdMob Test Screen</Text>

      {/* Debug Panel */}
      <View style={styles.debugPanel}>
        <Text style={styles.debugTitle}>🔍 Debug Ads Status</Text>
        <Text>🖼️ Banner: {bannerStatus}</Text>
        <Text>🎬 Interstitial: {interstitialStatus}</Text>
        <Text>🎁 Rewarded: {rewardedStatus}</Text>
      </View>

      {/* Bouton interstitiel */}
      <AdInterstitial
        onLoaded={() => setInterstitialStatus('✅ Ready')}
        onFailed={() => setInterstitialStatus('❌ Fail')}
      />

      {/* Bouton rewarded */}
      <AdRewarded
        onLoaded={() => setRewardedStatus('✅ Ready')}
        onFailed={() => setRewardedStatus('❌ Fail')}
        onReward={(reward) => {
          console.log('🎁 Reward reçu:', reward);
          setRewardedStatus(`🏆 Reward: ${reward.type} +${reward.amount}`);
        }}
      />

      {/* Bannière en bas */}
      <AdBanner
        onLoaded={() => setBannerStatus('✅ Loaded')}
        onFailed={() => setBannerStatus('❌ Fail')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80, // espace pour la bannière
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  debugPanel: {
    backgroundColor: '#f2f2f2',
    padding: 15,
    borderRadius: 10,
    marginBottom: 30,
    width: '80%',
  },
  debugTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
});
