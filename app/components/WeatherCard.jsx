// components/WeatherCard.jsx
// ------------------------------------------------------------------
// WeatherCard (VigiApp style, “full” layout)
// - H1: Cidade (vert), H2: UF (jaune), centrés
// - Drapeau d’UF (ou 🇧🇷) à côté du H2
// - Même taille visuelle qu’avant, mais contenu plus “plein”
// - Animations centrées (halo/parallax/particules) pour remplir l’espace
// - Géoloc: GPS -> CEP -> capitale UF -> Brasília
// - Aucun bandeau "Fonte/origem"
// ------------------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image, Dimensions } from 'react-native';
import {
  resolveCoordsAndLabel,
  ensureCityFromCapitalIfMissing,
  getWeatherNowWithFallback,
  mapConditionToEmojiLabel,
  normalizeUf,
} from '@/utils/weather';

const W = Dimensions.get('window').width;

// ------- cache simple des drapeaux (12h) -------
let __UF_FLAGS_CACHE = null;
let __UF_FLAGS_TS = 0;
const UF_FLAGS_API = 'https://apis.codante.io/bandeiras-dos-estados';
async function getUfFlagUrl(uf) {
  if (!uf) return null;
  const now = Date.now();
  if (__UF_FLAGS_CACHE && now - __UF_FLAGS_TS < 12 * 60 * 60 * 1000) {
    return (__UF_FLAGS_CACHE[uf.toUpperCase()] || {}).circle || null;
  }
  const resp = await fetch(UF_FLAGS_API);
  if (!resp.ok) return null;
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
    const t = (conditionText || conditionCode || '').toLowerCase();
    if (t.includes('thunder') || t.includes('trovoada') || t.includes('tempest')) return 'storm';
    if (t.includes('rain') || t.includes('chuva') || t.includes('shower') || t.includes('garoa')) return 'rain';
    if (t.includes('cloud') || t.includes('nublado')) return 'cloud';
    if (t.includes('clear') || t.includes('limpo') || t.includes('sun')) return 'sun';
    return 'default';
  }, [conditionText, conditionCode]);

  // ---- load météo + label
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const base = await resolveCoordsAndLabel({ cep }); // -> {coords, city, uf, source}
        if (!mounted) return;

        // si pas de city mais UF ok → capitale
        const fixed = ensureCityFromCapitalIfMissing(base);
        if (!mounted) return;
        setCity(fixed.city);
        setUf(normalizeUf(fixed.uf));

        const now = await getWeatherNowWithFallback(fixed.coords);
        if (!mounted) return;
        setTemp(now?.tempC ?? null);
        setConditionText(now?.text || '');
        setConditionCode(now?.code || '');
      } catch (e) {
        if (!mounted) return;
        setErr(e?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [cep]);

  // ---- flag
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!uf) return setFlagUrl(null);
        const url = await getUfFlagUrl(uf);
        if (alive) setFlagUrl(url || null);
      } catch { if (alive) setFlagUrl(null); }
    })();
    return () => { alive = false; };
  }, [uf]);

  // ---- animations
  useEffect(() => {
    // halo pulsant (plus ample pour “remplir”)
    Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1.1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 1.0, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    // drift (parallax du pictogramme)
    Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    // particules (7 pour densifier)
    particles.forEach((p, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(p, { toValue: 1, duration: 1700, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(p, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // styles animés
  const haloStyle = { transform: [{ scale: halo }] };
  const driftStyle = { transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] }) }] };

  // particules (emoji selon animKind)
  const particleChar = useMemo(() => {
    if (animKind === 'storm') return '⚡';
    if (animKind === 'rain') return '💧';
    if (animKind === 'cloud') return '•';
    if (animKind === 'sun') return '✦';
    return '·';
  }, [animKind]);

  const Title = () => (
    <View style={styles.titleWrap}>
      {/* H1: Ville */}
      <Text style={styles.cityH1} numberOfLines={1}>
        {city || 'Localização'}
      </Text>

      {/* H2: UF + drapeau */}
      <View style={styles.ufRow}>
        {flagUrl ? (
          <Image source={{ uri: flagUrl }} style={styles.flag} resizeMode="cover" />
        ) : (
          <Text style={styles.flagFallback}>🇧🇷</Text>
        )}
        {uf ? (
          <Text style={styles.ufH2}>{uf}</Text>
        ) : (
          <Text style={styles.ufH2}>—</Text>
        )}
      </View>
    </View>
  );

  // UI
  return (
    <View style={styles.card}>
      {loading ? (
        <View style={styles.skeleton}>
          <View style={styles.skelBarLg} />
          <View style={styles.skelBarSm} />
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

          {/* température + état : gros pour remplir */}
          <View style={styles.nowRow}>
            <Text style={styles.temp}>{temp != null ? Math.round(temp) : '--'}°</Text>
            <Text style={styles.desc}>{label}</Text>
          </View>

          {/* scène animée — centrée et large */}
          <View style={styles.scene}>
            <Animated.View style={[styles.halo, haloStyle]} />
            <Animated.Text style={[styles.emoji, driftStyle]}>
              {animKind === 'sun' ? '☀️' : animKind === 'cloud' ? '☁️' : animKind === 'rain' ? '🌧️' : animKind === 'storm' ? '⛈️' : '🌤️'}
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
    // même empreinte visuelle qu’avant
    minHeight: 168,
    justifyContent: 'center',
  },

  /* TITRES */
  titleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cityH1: {
    color: VIGI_GREEN,
    fontSize: 22,           // H1
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  ufRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ufH2: {
    color: VIGI_YELLOW,
    fontSize: 16,           // H2
    fontWeight: '800',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  flag: { width: 18, height: 18, borderRadius: 9 },
  flagFallback: { fontSize: 16 },

  /* NOW */
  nowRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 12,
    marginTop: 2,
  },
  temp: { color: '#fff', fontSize: 44, fontWeight: '900', lineHeight: 48 },
  desc: { color: '#cbd5e1', fontSize: 15, fontWeight: '700' },

  /* SCÈNE ANIMÉE */
  scene: {
    height: 70,                   // occupe bien la card, sans “trou”
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  halo: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 48,
    backgroundColor: 'rgba(34,197,94,0.12)',   // vert VigiApp doux
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
  },
  emoji: { fontSize: 34, color: '#fff' },
  particle: { position: 'absolute', top: 16, fontSize: 13, color: '#e5e7eb' },

  /* LOADING / ERROR */
  skeleton: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  skelBarLg: { width: '60%', height: 18, borderRadius: 8, backgroundColor: '#2a2e37' },
  skelBarSm: { width: '36%', height: 14, borderRadius: 8, backgroundColor: '#2a2e37' },
  errorBox: {
    borderColor: 'rgba(248,113,113,0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  errTitle: { color: '#fff', fontWeight: '800' },
  errSmall: { color: '#9aa3ad', fontSize: 12 },
});
