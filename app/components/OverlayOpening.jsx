// app/components/OverlayOpening.jsx
// ------------------------------------------------------------------
// Overlay plein écran: texte "Você vai sair do VigiApp para {app}"
// + loader 5 points (jaune, vert, orange, violet, rose) qui
// montent/descendent en décalé. Tout au long: logs visibles.
// ------------------------------------------------------------------

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';

const COLORS = ['#FACC15', '#22C55E', '#FB923C', '#8B5CF6', '#F472B6']; // jaune, vert, orange, violet, rose
const { width } = Dimensions.get('window');

export default function OverlayOpening({ visible, appLabel = 'app', subtitle = '' }) {
  const anims = useRef(COLORS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) {
      return;
    }
    console.log('[OverlayOpening] show for', appLabel);

    anims.forEach((v, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 520, delay: i * 90, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 520, useNativeDriver: true }),
        ]),
      ).start();
    });

    return () => {
      console.log('[OverlayOpening] hide for', appLabel);
      anims.forEach((v) => v.stopAnimation && v.stopAnimation());
    };
  }, [visible, appLabel, anims]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.box}>
        <Text style={styles.title}>Você vai sair do VigiApp</Text>
        <Text style={styles.subtitle}>
          para <Text style={styles.app}>{appLabel}</Text>
        </Text>
        {subtitle ? <Text style={styles.subtitleSmall}>{subtitle}</Text> : null}

        <View style={styles.dotsRow}>
          {anims.map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: COLORS[i],
                  transform: [
                    {
                      translateY: v.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -10], // monte/descend
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  box: {
    width: Math.min(width * 0.86, 360),
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#1F2430',
    borderWidth: 1,
    borderColor: '#2D3140',
    alignItems: 'center',
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 16 },
  subtitle: { color: '#e5e7eb', marginTop: 6, fontSize: 14 },
  app: { color: '#FACC15', fontWeight: '900' },
  subtitleSmall: { color: '#9aa3ad', marginTop: 2, fontSize: 12 },
  dotsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
