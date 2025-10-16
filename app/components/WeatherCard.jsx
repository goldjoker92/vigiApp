// app/components/WeatherCard.jsx
// ------------------------------------------------------------------
// WeatherCard (robuste + logs)
// - Timeouts élargis (geo 4s, météo 5s) + "hard stop" du skeleton à 4.5s
// - Toujours sortir du loading (pas de skeleton infini)
// - Fallback user-friendly si réseau lent + cache 10min
// - Pas de .forEach fragile; logs précis pour profiler.
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
} from '../../utils/weather';
import { cacheGet, cacheSet } from '../../utils/cache';
import { withTimeout } from '../../utils/net'; // bien présent
import { safeForEach } from '../../utils/safeEach';

const W = Dimensions.get('window').width;
const WX_TTL_SEC = 10 * 60; // 10 min
const keyFor = (cep) => `wx:${cep || 'unknown'}`;

const UF_FLAGS_KEY = 'uf-flags-map';
const UF_FLAGS_API = 'https://apis.codante.io/bandeiras-dos-estados';
const UF_FLAGS_TTL_SEC = 12 * 60 * 60;

async function getUfFlagUrl(uf) {
  if (!uf) {
    return null;
  }
  let map = await cacheGet(UF_FLAGS_KEY);
  if (!map) {
    console.time('[flags] fetch');
    try {
      const resp = await withTimeout(fetch(UF_FLAGS_API), 2500, 'flags-timeout');
      if (!resp.ok) {
        throw new Error(`flags-status-${resp.status}`);
      }
      const list = await resp.json();
      map = {};
      for (const item of list || []) {
        const key = String(item.uf || '').toUpperCase();
        map[key] = { circle: item.flag_url_circle };
      }
      await cacheSet(UF_FLAGS_KEY, map, UF_FLAGS_TTL_SEC);
      console.timeEnd('[flags] fetch');
    } catch (e) {
      console.timeEnd('[flags] fetch');
      console.warn('[flags] fetch error:', e?.message || String(e));
      return null;
    }
  }
  return (map[uf.toUpperCase()] || {}).circle || null;
}

export default function WeatherCard({ cep, showScrollHint = false }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('');
  const [temp, setTemp] = useState(null);
  const [conditionText, setConditionText] = useState('');
  const [conditionCode, setConditionCode] = useState('');
  const [flagUrl, setFlagUrl] = useState(null);

  // animations
  const halo = useRef(new Animated.Value(1)).current;
  const drift = useRef(new Animated.Value(0)).current;
  // Ref contenant un ARRAY d'Animated.Value ; on dérèfère une fois pour obtenir l'array.
  const particlesRef = useRef(Array.from({ length: 9 }, () => new Animated.Value(0)));
  const particles = Array.isArray(particlesRef.current) ? particlesRef.current : [];

  // Hard-stop du skeleton (si tout foire, on bascule en erreur lisible)
  useEffect(() => {
    if (!loading) {
      return;
    }
    const t = setTimeout(() => {
      if (loading) {
        console.warn('[WeatherCard] hard-stop skeleton (timeout 4500ms)');
        setLoading(false);
        setErr('Tempo esgotado para carregar a previsão.');
      }
    }, 4500);
    return () => clearTimeout(t);
  }, [loading]);

  const animKind = useMemo(() => {
    const t = normalizeConditionText(conditionText, conditionCode).toLowerCase();
    if (/(thunder|trovoada|tempest)/.test(t)) {
      return 'storm';
    }
    if (/(heavy rain|chuva|downpour|garoa|drizzle)/.test(t)) {
      return t.includes('drizzle') || t.includes('garoa') ? 'drizzle' : 'rain';
    }
    if (/(snow|neve)/.test(t)) {
      return 'snow';
    }
    if (/(hail|granizo)/.test(t)) {
      return 'hail';
    }
    if (/(fog|mist|neblina)/.test(t)) {
      return 'fog';
    }
    if (/(wind|vento)/.test(t)) {
      return 'wind';
    }
    if (/(night|noite).*?(clear|limpo)/.test(t)) {
      return 'night';
    }
    if (/(cloud|nublado|encoberto|overcast)/.test(t)) {
      return 'cloud';
    }
    if (/(clear|limpo|sunny|sol)/.test(t)) {
      return 'sun';
    }
    return 'default';
  }, [conditionText, conditionCode]);

  const mainEmoji = useMemo(() => {
    switch (animKind) {
      case 'sun':
        return '☀️';
      case 'cloud':
        return '☁️';
      case 'rain':
        return '🌧️';
      case 'drizzle':
        return '🌦️';
      case 'storm':
        return '⛈️';
      case 'snow':
        return '❄️';
      case 'hail':
        return '🌨️';
      case 'fog':
        return '🌫️';
      case 'wind':
        return '🌬️';
      case 'night':
        return '🌙';
      default:
        return '🌤️';
    }
  }, [animKind]);

  const particleChar = useMemo(() => {
    switch (animKind) {
      case 'storm':
        return '⚡';
      case 'rain':
        return '💧';
      case 'drizzle':
        return '·';
      case 'snow':
        return '❄';
      case 'hail':
        return '•';
      case 'fog':
        return '﹅';
      case 'wind':
        return '~';
      case 'cloud':
        return '•';
      case 'sun':
        return '✦';
      default:
        return '·';
    }
  }, [animKind]);

  // SWR-ish bootstrap
  const lastPayloadRef = useRef(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const key = keyFor(cep);
      console.time(`[WeatherCard] bootstrap ${key}`);

      // 1) cache instantané
      const cached = await cacheGet(key);
      if (cached) {
        console.log('[WeatherCard] cache HIT', key, cached);
        if (!mounted) {
          return;
        }
        setCity(cached.city);
        setUf(cached.uf);
        setTemp(cached.temp);
        setConditionText(cached.conditionText);
        setConditionCode(cached.conditionCode);
        lastPayloadRef.current = cached;
        setLoading(false);
      } else {
        console.log('[WeatherCard] cache MISS', key);
        setLoading(true);
      }

      // 2) refresh réseau
      try {
        console.time('[WeatherCard] geo');
        const base = await withTimeout(resolveCoordsAndLabel({ cep }), 4000, 'geo-timeout');
        console.timeEnd('[WeatherCard] geo');
        if (!mounted) {
          return;
        }

        const fixed = ensureCityFromCapitalIfMissing(base);

        console.time('[WeatherCard] weather');
        const now = await withTimeout(
          getWeatherNowWithFallback(fixed.coords),
          5000,
          'weather-timeout',
        );
        console.timeEnd('[WeatherCard] weather');
        if (!mounted) {
          return;
        }

        const fresh = {
          city: fixed.city,
          uf: normalizeUf(fixed.uf),
          temp: now?.tempC ?? null,
          conditionText: normalizeConditionText(now?.text, now?.code),
          conditionCode: now?.code || '',
        };

        const prev = lastPayloadRef.current;
        const changed =
          !prev ||
          prev.city !== fresh.city ||
          prev.uf !== fresh.uf ||
          prev.temp !== fresh.temp ||
          prev.conditionText !== fresh.conditionText ||
          prev.conditionCode !== fresh.conditionCode;

        if (changed) {
          setCity(fresh.city);
          setUf(fresh.uf);
          setTemp(fresh.temp);
          setConditionText(fresh.conditionText);
          setConditionCode(fresh.conditionCode);
          lastPayloadRef.current = fresh;
        }
        await cacheSet(key, fresh, WX_TTL_SEC);
        setErr(null);
        console.log(
          '[WeatherCard] refreshed | provider =',
          now?.provider || '—',
          '| changed =',
          changed,
        );
      } catch (e) {
        console.warn('[WeatherCard] refresh error:', e?.message || String(e));
        if (!cached) {
          // Fallback minimal si rien en cache
          setCity('—');
          setUf('');
          setTemp(null);
          setConditionText('Sem dados de rede');
          setConditionCode('');
          setErr('Sem conexão');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
        console.timeEnd(`[WeatherCard] bootstrap ${key}`);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [cep]);

  // drapeau
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uf) {
        setFlagUrl(null);
        return;
      }
      console.time(`[flags] ${uf}`);
      try {
        const url = await getUfFlagUrl(uf);
        if (alive) {
          setFlagUrl(url || null);
        }
      } catch {
        if (alive) {
          setFlagUrl(null);
        }
      }
      console.timeEnd(`[flags] ${uf}`);
    })();
    return () => {
      alive = false;
    };
  }, [uf]);

  // animations
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(halo, {
          toValue: 1.12,
          duration: 1000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(halo, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    safeForEach(particles, (p, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 120),
          Animated.timing(p, {
            toValue: 1,
            duration: 1500,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(p, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haloStyle = { transform: [{ scale: halo }] };
  const driftStyle = {
    transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] }) }],
  };

  const d = new Date();
  const dateBR = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeBR = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const Title = () => (
    <View style={styles.titleWrap}>
      <Text style={styles.date}>{dateBR} —</Text>
      <Text style={styles.date}>{timeBR}</Text>
      <View style={styles.cityRow}>
        <Text style={styles.cityH1} numberOfLines={1}>
          {city || 'Localização'}
          {uf ? <Text style={styles.cityComma}>, </Text> : null}
        </Text>
        {uf ? <Text style={styles.ufH1}>{uf}</Text> : <Text style={styles.ufH1}>—</Text>}
        {flagUrl ? (
          <Image source={{ uri: flagUrl }} style={styles.flag} />
        ) : (
          <Text style={styles.flagFallback}>🇧🇷</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      {loading ? (
        <View style={styles.skeleton}>
          <Animated.View style={[styles.shimmerBar, { opacity: halo }]} />
          <Animated.View style={[styles.shimmerBar, { width: '50%', opacity: drift }]} />
          <View style={styles.tempGhost} />
          <Text style={styles.loadingHint}>
            Atualizando previsão… {showScrollHint ? 'deslize para ver mais ⟶' : ''}
          </Text>
        </View>
      ) : err ? (
        <View style={styles.errorBox}>
          <Title />
          <Text style={styles.errTitle}>Não foi possível carregar a previsão.</Text>
          <Text style={styles.errSmall}>{String(err)}</Text>
        </View>
      ) : (
        <>
          <Title />
          <View style={styles.nowRow}>
            <Text style={styles.temp}>{temp !== null ? Math.round(temp) : '--'}°</Text>
          </View>
          <View style={styles.scene}>
            <Animated.View style={[styles.halo, haloStyle]} />
            <Animated.Text style={[styles.emoji, driftStyle]}>{mainEmoji}</Animated.Text>
            {(particles || []).map((p, i) => (
              <Animated.Text
                key={i}
                style={[
                  styles.particle,
                  {
                    left: W * 0.14 + i * 20,
                    opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.85] }),
                    transform: [
                      { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-10, 16] }) },
                      { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) },
                    ],
                  },
                ]}
              >
                {particleChar}
              </Animated.Text>
            ))}
          </View>
          <Text style={styles.descText} numberOfLines={1}>
            {normalizeConditionText(conditionText, conditionCode) ||
              mapConditionToEmojiLabel(conditionCode, conditionText)}
          </Text>
          {showScrollHint && <Text style={styles.scrollHint}>deslize para ver mais ⟶</Text>}
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
    marginBottom: 12,
    overflow: 'hidden',
    minHeight: 196,
    justifyContent: 'center',
    width: Math.min(W - 36, 520),
    alignSelf: 'center',
  },

  titleWrap: { alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 },
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

  nowRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: 4 },
  temp: { color: '#fff', fontSize: 52, fontWeight: '900', lineHeight: 56 },

  scene: { height: 76, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  halo: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 52,
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.32)',
  },
  emoji: { fontSize: 36, color: '#fff' },
  particle: { position: 'absolute', top: 16, fontSize: 13, color: '#e5e7eb' },

  skeleton: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  shimmerBar: { width: '62%', height: 16, borderRadius: 8, backgroundColor: '#2a2e37' },
  tempGhost: { width: 100, height: 44, borderRadius: 10, backgroundColor: '#2a2e37', marginTop: 6 },
  loadingHint: { color: '#9aa3ad', fontSize: 12, marginTop: 8 },

  errorBox: {
    borderColor: 'rgba(248,113,113,0.25)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  errTitle: { color: '#fff', fontWeight: '800' },
  errSmall: { color: '#9aa3ad', fontSize: 12 },

  descText: { color: '#cbd5e1', fontWeight: '800', textAlign: 'center', marginTop: 6 },
  scrollHint: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
