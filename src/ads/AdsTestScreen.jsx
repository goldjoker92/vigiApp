import React from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useInterstitial, useRewarded, AdBanner } from './ads'; // importe les hooks depuis ads.jsx

function BigButton({ label, onPress, disabled, secondary }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => [
        styles.button,
        secondary ? styles.buttonSecondary : styles.buttonPrimary,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[
        styles.buttonText,
        secondary && styles.buttonTextSecondary,
        disabled && styles.buttonTextDisabled,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatusPill({ ok, label }) {
  return (
    <View style={[styles.pill, ok ? styles.pillOk : styles.pillWait]}>
      <Text style={[styles.pillText, ok ? styles.pillTextOk : styles.pillTextWait]}>{label}</Text>
    </View>
  );
}

export default function AdsTestScreen() {
  const inter = useInterstitial();
  const rew = useRewarded((amount, type) => {
    console.log('[Reward] earned =>', amount, type);
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>📢 Test des pubs</Text>
          <View style={styles.badgesRow}>
            <StatusPill ok={inter.loaded} label={inter.loaded ? 'Interstitial prêt' : 'Interstitial loading…'} />
            <StatusPill ok={rew.loaded} label={rew.loaded ? 'Rewarded prêt' : 'Rewarded loading…'} />
          </View>
        </View>

        <View style={styles.grid}>
          <BigButton
            label={inter.loaded ? 'Afficher Interstitial' : 'Interstitial…'}
            onPress={inter.show}
            disabled={!inter.loaded}
          />
          <BigButton
            label={rew.loaded ? 'Afficher Rewarded' : 'Rewarded…'}
            onPress={rew.show}
            disabled={!rew.loaded}
          />
        </View>

        <View style={styles.bannerBox}>
          <Text style={styles.bannerLabel}>Bannière (test)</Text>
          <AdBanner />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, padding: 16, gap: 16, justifyContent: 'space-between' },
  header: { gap: 10, alignItems: 'center', marginTop: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  pillOk: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#A5D6A7' },
  pillWait: { backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082' },
  pillText: { fontSize: 12, fontWeight: '600' },
  pillTextOk: { color: '#2E7D32' },
  pillTextWait: { color: '#8D6E00' },
  grid: { gap: 12 },
  button: { minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  buttonPrimary: { backgroundColor: '#111827' },
  buttonSecondary: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonTextSecondary: { color: '#111827' },
  buttonTextDisabled: { color: 'rgba(255,255,255,0.85)' },
  bannerBox: { alignItems: 'center', gap: 6, paddingBottom: 8 },
  bannerLabel: { fontSize: 13, color: '#6B7280' },
});
