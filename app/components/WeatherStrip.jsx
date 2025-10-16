// components/WeatherStrip.jsx
// -----------------------------------------------------------------------------
// Bandeau horizontal : WhatsApp / Uber / WeatherCard / News / Waze / Hub Rápido.
// Hint "⬅️➡️ deslize para explorar" + ouverture gracieuse avec overlay.
// -----------------------------------------------------------------------------

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import WeatherCard from './WeatherCard';
import HubRapidoCard from './HubRapidoCard';
import OverlayOpening from './OverlayOpening';
import {
  openWithGrace,
  openWhatsApp,
  openUber,
  openGoogleNews,
  openWaze,
} from '../../utils/graceOpen';

function ConnectCard({ label, bg, subtitle, onOpen, setOverlay }) {
  return (
    <TouchableOpacity
      style={[styles.connectCard, { backgroundColor: bg }]}
      activeOpacity={0.85}
      onPress={() => openWithGrace({ appLabel: label, setOverlay, openFn: onOpen, delayMs: 2400 })}
    >
      <Text style={styles.connectLabel}>{label}</Text>
      {subtitle ? <Text style={styles.connectSub}>{subtitle}</Text> : null}
      <Text style={styles.connectHint}>Toque para abrir</Text>
    </TouchableOpacity>
  );
}

export default function WeatherStrip({ cep }) {
  const [overlayApp, setOverlayApp] = useState(null);

  return (
    <View style={styles.container}>
      <Text style={styles.hintText}>⬅️➡️ deslize para explorar</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => console.log('[WeatherStrip] scroll x=', e.nativeEvent.contentOffset.x)}
        scrollEventThrottle={120}
      >
        <ConnectCard
          label="WhatsApp"
          bg="#25D366"
          subtitle="Conectar/Enviar"
          onOpen={() => openWhatsApp({ text: 'Oi, do VigiApp 🚀' })}
          setOverlay={setOverlayApp}
        />
        <ConnectCard
          label="Uber"
          bg="#000000"
          subtitle="Chamar corrida"
          onOpen={() => openUber()}
          setOverlay={setOverlayApp}
        />

        <WeatherCard cep={cep} showScrollHint />

        <ConnectCard
          label="News"
          bg="#4285F4"
          subtitle="Últimas notícias"
          onOpen={() => openGoogleNews({})}
          setOverlay={setOverlayApp}
        />
        <ConnectCard
          label="Waze"
          bg="#1CB0F6"
          subtitle="Navegar já"
          onOpen={() => openWaze({})}
          setOverlay={setOverlayApp}
        />

        <HubRapidoCard />
      </ScrollView>

      <OverlayOpening
        visible={!!overlayApp}
        appLabel={overlayApp || 'app'}
        subtitle="Abrindo app…"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  hintText: { textAlign: 'center', fontSize: 13, color: '#94a3b8', marginBottom: 6 },
  scrollContent: { paddingHorizontal: 12, alignItems: 'center' },

  connectCard: {
    width: 130,
    height: 196,
    borderRadius: 16,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  connectLabel: { color: '#fff', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  connectSub: { color: '#e5e7eb', fontSize: 12, marginTop: 6, textAlign: 'center' },
  connectHint: { color: '#cbd5e1', fontSize: 11, marginTop: 10 },
});
