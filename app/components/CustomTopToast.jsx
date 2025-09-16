// app/components/CustomTopToast.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, Vibration, useWindowDimensions, Platform } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TYPE_STYLES = {
  success: { bg: '#0A84FF', icon: 'check-circle', iconColor: '#FFFFFF' },
  info:    { bg: '#23262F', icon: 'info-circle',  iconColor: '#60A5FA' },
  warn:    { bg: '#23262F', icon: 'exclamation-triangle', iconColor: '#FFD600' },
  error:   { bg: '#2B1A1A', icon: 'times-circle', iconColor: '#FF3B30' },
  default: { bg: '#181A20', icon: 'exclamation-circle', iconColor: '#FFD700' },
};

export default function CustomTopToast(props) {
  const {
    text1,
    text2,
    duration = 6000,          // ⏱️ plus long par défaut
    textColor = '#fff',
    containerStyle = {},
    type = 'success',         // fourni par react-native-toast-message
    vibrate = true,           // tu peux désactiver si besoin
  } = props;

  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();

  // responsive: largeur cible
  const CARD_W = Math.min(screenW * 0.92, 520);
  const [measuredH, setMeasuredH] = useState(80); // valeur par défaut
  const [laidOut, setLaidOut] = useState(false);

  // couleurs selon le type
  const palette = TYPE_STYLES[type] || TYPE_STYLES.default;

  // animations
  const slideY = useRef(new Animated.Value(-measuredH)).current;
  const progress = useRef(new Animated.Value(0)).current;

  // progress num width (px)
  const barW = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CARD_W, 0],
  });

  // vibra courte et animations
  useEffect(() => {
    if (vibrate && Platform.OS === 'android') {
      // pattern courte et propre
      Vibration.vibrate([0, 30], false);
    }

    // slide in
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 14,
    }).start();

    // progress
    Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    }).start();

    // slide out
    const hide = setTimeout(() => {
      Animated.timing(slideY, {
        toValue: -measuredH - 16, // un peu plus haut pour masquer l'ombre
        duration: 320,
        useNativeDriver: true,
      }).start();
    }, Math.max(0, duration - 180));

    return () => clearTimeout(hide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, measuredH]);

  // recalc slide when height known
  useEffect(() => {
    if (!laidOut) {
      return;
    }
    slideY.setValue(-measuredH);
    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 14,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidOut, measuredH]);

  // position verticale ~ centre haut, responsive + safe area
  const TOP_POS = Math.max(insets.top + 12, screenH * 0.28);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { top: TOP_POS, width: screenW, transform: [{ translateY: slideY }] },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.card,
          { width: CARD_W, backgroundColor: palette.bg },
          containerStyle,
        ]}
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height || 80;
          setMeasuredH(h);
          setLaidOut(true);
        }}
      >
        <View style={styles.row}>
          <FontAwesome name={palette.icon} size={22} color={palette.iconColor} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            {!!text1 && <Text style={[styles.title, { color: textColor }]} numberOfLines={3}>{text1}</Text>}
            {!!text2 && <Text style={[styles.body, { color: textColor }]} numberOfLines={4}>{text2}</Text>}
          </View>
        </View>

        <Animated.View style={[styles.progressBar, { width: barW }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
  },
  card: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
    elevation: 7,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  body: { fontSize: 14, marginTop: 4, opacity: 0.9 },
  progressBar: {
    height: 3,
    backgroundColor: '#00C859',
    borderRadius: 3,
    marginTop: 10,
  },
});
// Fin CustomTopToast.js