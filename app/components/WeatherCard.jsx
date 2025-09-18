// components/WeatherCard.jsx
// ------------------------------------------------------------------
// WeatherCard (VigiApp 2050)
// - Date + heure (gras) au-dessus
// - "Cidade, UF" centrés (Ville VERT, UF JAUNE) + mini-drapeau (UF sinon 🇧🇷)
// - Température XXL, emoji animé, description PT-BR
// - Aucun texte de provider affiché (mais logs temps & provider)
// - Skeleton futuriste + logs de performance
// ------------------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image, Dimensions } from 'react-native';
import {
  resolveCoordsAndLabel,
  ensureCityFromCapitalIfMissing,
  getWeatherNowWithFallback,
  mapConditionToEmojiLabel,
  normalizeUf,
  normalizeConditionText,
} from '@/utils/weather';

const W = Dimensions.get('window').width;

// ------- cache simple des drapeaux (12h) -------
let __UF_FLAGS_CACHE = null;
let __UF_FLAGS_TS = 0;
const UF_FLAGS_API = 'https://apis.codante.io/bandeiras-dos-estados';
async function getUfFlagUrl(uf) {
  if (!uf) {
    return null;
  }
  const now = Date.now();
  if (__UF_FLAGS_CACHE && now - __UF_FLAGS_TS < 12 * 60 * 60 * 1000) {
    return (__UF_FLAGS_CACHE[uf.toUpperCase()] || {}).circle || null;
  }
  const resp = await fetch(UF_FLAGS_API);
  if (!resp.ok) {return null;}
  const list = await resp.json();
  const map = {};
  for (const item of list || []) {
    const key = String(item.uf || '').toUpperCase();
    map[key] = {
      circle: item.flag_url_circle,
      rounded: item.flag_url_rounded,
      square: item.flag_url_square,
      full: item.flag_url,
      name: item.name,
    };
  }
  __UF_FLAGS_CACHE = map;
  __UF_FLAGS_TS = now;
  return (map[uf.toUpperCase()] || {}).circle || null;
}

export default function WeatherCard({ cep }) {
  // ---- states
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('');
  const [temp, setTemp] = useState(null);
  const [conditionText, setConditionText] = useState('');
  const [conditionCode, setConditionCode] = useState('');
  const [flagUrl, setFlagUrl] = useState(null);

  // ---- animations: halo + parallax + particules
  const halo = useRef(new Animated.Value(1)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const particles = new Array(7).fill(0).map(() => useRef(new Animated.Value(0)).current);

  const label = useMemo(
    () => mapConditionToEmojiLabel(conditionCode, conditionText),
    [conditionCode, conditionText]
  );

  const animKind = useMemo(() => {
    const t = normalizeConditionText(conditionText, conditionCode).toLowerCase();
    if (t.includes('thunder') || t.includes('trovoada') || t.includes('tempest')) {return 'storm';}
    if (t.includes('rain') || t.includes('chuva') || t.includes('shower') || t.includes('garoa'))
      {return 'rain';}
    if (t.includes('cloud') || t.includes('nublado')) {return 'cloud';}
    if (t.includes('clear') || t.includes('limpo') || t.includes('sun')) {return 'sun';}
    return 'default';
  }, [conditionText, conditionCode]);

  // ---- load météo + label
  useEffect(() => {
    let mounted = true;
    (async () => {
      const t0 = Date.now();
      try {
        setLoading(true);
        setErr(null);

        const base = await resolveCoordsAndLabel({ cep }); // -> {coords, city, uf, source}
        if (!mounted) {return;}

        const fixed = ensureCityFromCapitalIfMissing(base);
        if (!mounted) {return;}
        setCity(fixed.city);
        setUf(normalizeUf(fixed.uf));
        console.log('[WeatherCard] coords source =', base.source);

        const now = await getWeatherNowWithFallback(fixed.coords);
        if (!mounted) {return;}
        setTemp(now?.tempC ?? null);
        setConditionText(normalizeConditionText(now?.text, now?.code));
        setConditionCode(now?.code || '');

        const ms = Date.now() - t0;
        console.log('[WeatherCard] loaded in', ms, 'ms', '| provider =', now?.provider || '—');
      } catch (e) {
        if (!mounted) {return;}
        setErr(e?.message || String(e));
      } finally {
        if (mounted) {setLoading(false);}
      }
    })();
    return () => {
      mounted = false;
    };
  }, [cep]);

  // ---- flag
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!uf) {return setFlagUrl(null);}
        const url = await getUfFlagUrl(uf);
        if (alive) {setFlagUrl(url || null);}
      } catch {
        if (alive) {setFlagUrl(null);}
      }
    })();
    return () => {
      alive = false;
    };
  }, [uf]);

  // ---- animations
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1.1,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(halo, {
          toValue: 1.0,
          duration: 1100,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    particles.forEach((p, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(p, {
            toValue: 1,
            duration: 1700,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(p, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // styles animés
  const haloStyle = { transform: [{ scale: halo }] };
  const driftStyle = {
    transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] }) }],
  };

  // particules (emoji selon animKind)
  const particleChar = useMemo(() => {
    if (animKind === 'storm') {return '⚡';}
    if (animKind === 'rain') {return '💧';}
    if (animKind === 'cloud') {return '•';}
    if (animKind === 'sun') {return '✦';}
    return '·';
  }, [animKind]);

  const formatHeaderDate = () => {
    const d = new Date();
    const date = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
  };
  const { date: dateBR, time: timeBR } = formatHeaderDate();

  const Title = () => (
    <View style={styles.titleWrap}>
      {/* date + heure (gras, sur 2 lignes si besoin) */}
      <Text style={styles.date}>{dateBR} —</Text>
      <Text style={styles.date}>{timeBR}</Text>

      {/* Ville, UF + drapeau */}
      <View style={styles.cityRow}>
        <Text style={styles.cityH1} numberOfLines={1}>
          {city || 'Localização'}
          {uf ? <Text style={styles.cityComma}>, </Text> : null}
        </Text>
        {uf ? <Text style={styles.ufH1}>{uf}</Text> : <Text style={styles.ufH1}>—</Text>}
        {flagUrl ? (
          <Image source={{ uri: flagUrl }} style={styles.flag} resizeMode="cover" />
        ) : (
          <Text style={styles.flagFallback}>🇧🇷</Text>
        )}
      </View>
    </View>
  );

  // UI
  return (
    <View style={styles.card}>
      {loading ? (
        <View style={styles.skeleton}>
          <View style={styles.shimmerBar} />
          <View style={[styles.shimmerBar, { width: '46%', opacity: 0.85 }]} />
          <View style={styles.tempGhost} />
          <View style={styles.scene}>
            <Animated.View style={[styles.halo, haloStyle]} />
            <Animated.Text style={[styles.emoji, driftStyle]}>🌤️</Animated.Text>
          </View>
        </View>
      ) : err ? (
        <View style={styles.errorBox}>
          <Title />
          <Text style={styles.errTitle}>Não foi possível carregar a previsão.</Text>
          <Text style={styles.errSmall}>{err}</Text>
        </View>
      ) : (
        <>
          <Title />

          {/* température + état */}
          <View style={styles.nowRow}>
            <Text style={styles.temp}>{temp != null ? Math.round(temp) : '--'}°</Text>
          </View>

          {/* scène animée + description */}
          <View style={styles.scene}>
            <Animated.View style={[styles.halo, haloStyle]} />
            <Animated.Text style={[styles.emoji, driftStyle]}>
              {animKind === 'sun'
                ? '☀️'
                : animKind === 'cloud'
                  ? '☁️'
                  : animKind === 'rain'
                    ? '🌧️'
                    : animKind === 'storm'
                      ? '⛈️'
                      : '🌤️'}
            </Animated.Text>

            {particles.map((p, i) => (
              <Animated.Text
                key={i}
                style={[
                  styles.particle,
                  {
                    left: W * 0.14 + i * 20,
                    opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.85] }),
                    transform: [
                      { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-8, 14] }) },
                      { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) },
                    ],
                  },
                ]}
              >
                {particleChar}
              </Animated.Text>
            ))}
          </View>

          {/* description PT-BR */}
          <Text style={styles.descText} numberOfLines={1}>
            {normalizeConditionText(conditionText, conditionCode) ||
              mapConditionToEmojiLabel(conditionCode, conditionText)}
          </Text>
        </>
      )}
    </View>
  );
}

const VIGI_GREEN = '#22C55E';
const VIGI_YELLOW = '#FACC15';

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#22252b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d3038',
    marginBottom: 16,
    overflow: 'hidden',
    minHeight: 176,
    justifyContent: 'center',
  },

  /* TITRES */
  titleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  date: {
    color: '#bfe2ff',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cityH1: {
    color: VIGI_GREEN,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  cityComma: { color: '#94a3b8', fontWeight: '900' },
  ufH1: {
    color: VIGI_YELLOW,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  flag: { width: 18, height: 18, borderRadius: 9, marginLeft: 6 },
  flagFallback: { fontSize: 16, marginLeft: 6 },

  /* NOW */
  nowRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 4,
  },
  temp: { color: '#fff', fontSize: 50, fontWeight: '900', lineHeight: 54 },

  /* SCÈNE ANIMÉE */
  scene: {
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  halo: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 48,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
  },
  emoji: { fontSize: 34, color: '#fff' },
  particle: { position: 'absolute', top: 16, fontSize: 13, color: '#e5e7eb' },

  /* Loading / Error */
  skeleton: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shimmerBar: {
    width: '62%',
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2a2e37',
  },
  tempGhost: {
    width: 90,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#2a2e37',
    marginTop: 6,
  },
  errorBox: {
    borderColor: 'rgba(248,113,113,0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  errTitle: { color: '#fff', fontWeight: '800' },
  errSmall: { color: '#9aa3ad', fontSize: 12 },

  /* Description */
  descText: {
    color: '#cbd5e1',
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
  },
});
