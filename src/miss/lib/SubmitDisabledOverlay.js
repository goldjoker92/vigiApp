// src/miss/lib/SubmitDisabledOverlay.jsx
// ----------------------------------------------------------------------------
// VigiApp — Overlay de capture sur bouton "disabled"
// Affiche toasts précis via onExplain() sans perturber le flux quand actif
// ----------------------------------------------------------------------------

import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';

export default function SubmitDisabledOverlay({ disabled, onExplain, borderRadius = 12 }) {
  if (!disabled) {
    return null;
  }
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        onPress={onExplain}
        style={[styles.hit, { borderRadius }]}
        android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
});
