// app/components/HubRapidoCard.jsx
// -------------------------------------------------------------
// Hub Rápido — grille propre, responsive, vrais logos + fallback
// -------------------------------------------------------------

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
  Easing,
  Dimensions,
} from 'react-native';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import UberLogo from '../components/icons/UberLogo';

import {
  openGmail,
  openWaze,
  openGoogleNewsBR,
  openUber,
  openWhatsAppPersonal,
} from '../../utils/deeplinks';
import { openWithGrace } from '../../utils/graceOpen';
import OverlayOpening from './OverlayOpening';

const W = Dimensions.get('window').width;

function SafeIcon({ render, fallback = '●', color = '#e5e7eb', size = 18 }) {
  try {
    const node = render?.();
    return node || <Text style={{ color, fontSize: size }}>{fallback}</Text>;
  } catch {
    return <Text style={{ color, fontSize: size }}>{fallback}</Text>;
  }
}

function AppChip({ icon, label, tint, onOpen, setOverlay }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.timing(scale, { toValue: 1.05, duration: 90, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.timing(scale, {
      toValue: 1,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <TouchableWithoutFeedback
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => {
        console.log('[HubRapido] onPress', label);
        openWithGrace({ appLabel: label, setOverlay, openFn: onOpen, delayMs: 1800 });
      }}
    >
      <Animated.View style={[styles.chip, { transform: [{ scale }] }]}>
        <View style={[styles.iconWrap, { backgroundColor: tint.bg }]}>
          <SafeIcon render={icon} />
        </View>
        <Text numberOfLines={1} style={styles.chipLabel}>
          {label}
        </Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

export default function HubRapidoCard() {
  const [overlayApp, setOverlayApp] = useState(null);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Hub Rápido</Text>

      <View style={styles.grid}>
        <AppChip
          label="WhatsApp"
          tint={{ bg: 'rgba(34,197,94,0.15)' }}
          icon={() => <MaterialCommunityIcons name="whatsapp" size={22} color="#22C55E" />}
          onOpen={() => openWhatsAppPersonal({ text: 'Oi, do VigiApp 🚀' })}
          setOverlay={setOverlayApp}
        />
        <AppChip
          label="Uber"
          tint={{ bg: 'rgba(255,255,255,0.10)' }}
          icon={() => <UberLogo size={22} />}
          onOpen={openUber}
          setOverlay={setOverlayApp}
        />
        <AppChip
          label="News"
          tint={{ bg: 'rgba(66,133,244,0.15)' }}
          icon={() => <Ionicons name="logo-google" size={20} color="#4285F4" />}
          onOpen={openGoogleNewsBR}
          setOverlay={setOverlayApp}
        />
        <AppChip
          label="Waze"
          tint={{ bg: 'rgba(28,176,246,0.15)' }}
          icon={() => <FontAwesome6 name="location-arrow" size={18} color="#1CB0F6" />}
          onOpen={openWaze}
          setOverlay={setOverlayApp}
        />
        <AppChip
          label="Gmail"
          tint={{ bg: 'rgba(234,67,53,0.15)' }}
          icon={() => <MaterialCommunityIcons name="gmail" size={20} color="#EA4335" />}
          onOpen={openGmail}
          setOverlay={setOverlayApp}
        />
      </View>

      <OverlayOpening
        visible={!!overlayApp}
        appLabel={overlayApp || 'app'}
        subtitle="Você vai sair do VigiApp…"
        onHide={() => console.log('[HubRapido] overlay hidden')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e2229',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d3038',
    padding: 14,
    width: Math.min(W - 36, 520),
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 10 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  chip: {
    width: (W - 36 - 14 - 14) / 2 - 6,
    maxWidth: 180,
    minWidth: 130,
    height: 64,
    borderRadius: 14,
    backgroundColor: '#20242b',
    marginBottom: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  chipLabel: { color: '#E5E7EB', fontSize: 14, fontWeight: '700', flexShrink: 1 },
});
