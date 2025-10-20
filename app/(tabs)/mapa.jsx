// app/(tabs)/mapa.jsx
// -------------------------------------------------------------
// VigiApp — Carte publique (fluide + perf + sonar)
// - RAIO vertical (pliable)
// - Presets: 500 m, 1/2/3/5/10/50/100 km + Estado + Brasil
// - Incidents Firestore (TTL 5min), fenêtre 36h
// - Cluster pré-calculé sur changements d'alerts (pas sur les gestes)
// - Filtrage par distance au centre utilisateur (rayon sélectionné)
// - Radar: balayage lent "sonar" (durée 7s)
// - Pulse lent sur le cercle (overlay pixel)
// - Moins de bridge (pas de getCamera sur gestures)
// -------------------------------------------------------------
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import MapView, { Marker, Circle, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, Stop, Path, G, Circle as SvgCircle } from 'react-native-svg';
import { cacheGet, cacheSet, cacheSetForever } from '../../utils/cache';
import { safeForEach } from '../../utils/safeEach';
import { createMapLogger } from '../../src/log/mapLog';

// Firestore
import { collection, query, where, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const { width, height } = Dimensions.get('window');

// ---------- Thème ----------
const ACCENT = '#27C2FF';
const GLASS_BG = 'rgba(12,34,70,0.55)';
const CARD_BORDER = 'rgba(39,194,255,0.25)';
const PILL_IDLE_BG = 'rgba(39,194,255,0.10)';
const PILL_IDLE_BORDER = 'rgba(39,194,255,0.20)';
const PILL_ACTIVE_BG = '#27C2FF';

// Couleurs fallback par catégorie
const CATEGORY_COLOR = {
  'Roubo/Furto': '#FFA500',
  Agressão: '#FFA500',
  'Incidente de trânsito': '#FFE600',
  Incêndio: '#FF3B30',
  'Falta de luz': '#FFE600',
  'Mal súbito (problema de saúde)': '#FF3B30',
  Outros: '#007AFF',
};

// ---------- Presets (hors composant) ----------
const PRESETS = [
  { key: '500m', meters: 500, label: '500 m' },
  { key: '1k', meters: 1000, label: '1 km' },
  { key: '2k', meters: 2000, label: '2 km' },
  { key: '3k', meters: 3000, label: '3 km' },
  { key: '5k', meters: 5000, label: '5 km' },
  { key: '10k', meters: 10000, label: '10 km' },
  { key: '50k', meters: 50000, label: '50 km' },
  { key: '100k', meters: 100000, label: '100 km' },
  { key: 'estado', meters: null, label: 'Estado', kind: 'estado' },
  { key: 'brasil', meters: null, label: 'Brasil', kind: 'brasil' },
];

// ---------- Utils géo ----------
function zoomForRadiusMeters(radiusMeters, latitude, viewportWidthPx = width, fill = 0.82) {
  const metersWanted = (2 * radiusMeters) / (viewportWidthPx * fill);
  const base = 156543.03392 * Math.cos((latitude * Math.PI) / 180);
  const z = Math.log(base / (metersWanted || 1)) / Math.log(2);
  return Math.max(3, Math.min(20, z));
}
function metersPerPixelWithDelta(latitudeDelta, latitude /* deg */, viewportHeightPx = height) {
  // PERF: mpp approximé à partir du delta vertical (sans getCamera)
  // 1° latitude ≈ 111_320 m
  const metersPerDegreeLat = 111320;
  return (latitudeDelta * metersPerDegreeLat) / Math.max(1, viewportHeightPx);
}
function haversineMeters(a, b) {
  if (!a || !b) {
    return Infinity;
  }
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const h = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function fmtDate(tsMillis) {
  const d = new Date(tsMillis);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mo} ${hh}:${mm}`;
}

// ---------- Cluster à ~80 m si pas de count ----------
const CLUSTER_THRESHOLD_M = 80;
function clusterByTypeNoCount(rows, proximityM = CLUSTER_THRESHOLD_M) {
  const clusters = [];
  for (const a of rows) {
    let idx = -1;
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      if ((c.type || c.categoria) === (a.type || a.categoria)) {
        const dist = haversineMeters(
          { latitude: c.lat, longitude: c.lng },
          { latitude: a.lat, longitude: a.lng },
        );
        if (dist <= proximityM) {
          idx = i;
          break;
        }
      }
    }
    if (idx === -1) {
      clusters.push({ ...a, count: 1 });
    } else {
      const c = clusters[idx];
      const n = c.count + 1;
      c.lat = (c.lat * c.count + a.lat) / n;
      c.lng = (c.lng * c.count + a.lng) / n;
      c.count = n;
      if (a.createdAt > c.createdAt) {
        c.createdAt = a.createdAt;
        c.title = a.title;
        c.descricao = a.descricao;
        c.color = a.color || c.color;
      }
    }
  }
  return clusters;
}

// ---------- Overlays animés (Radar & Pulse) ----------
function RadarSweepBounded({
  centerPx,
  pxRadius,
  sweepDeg = 50, // sonar plus fin
  duration = 7000, // sonar plus lent
  colorHex = '#1EA0FF',
  opacity = 0.38,
}) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [rot, duration]);
  if (!centerPx || !pxRadius || pxRadius < 8) {
    return null;
  }

  const size = Math.max(8, Math.min(Math.floor(pxRadius * 2), Math.max(width, height) * 1.2));
  const half = size / 2;
  const path = (() => {
    const a = (ang) => {
      const rad = (ang - 90) * (Math.PI / 180);
      return { x: half + half * Math.cos(rad), y: half + half * Math.sin(rad) };
    };
    const start = a(0),
      end = a(sweepDeg);
    const largeArc = sweepDeg > 180 ? 1 : 0;
    return `M ${half} ${half} L ${start.x} ${start.y} A ${half} ${half} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  })();
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={{
          position: 'absolute',
          top: centerPx.y - half,
          left: centerPx.x - half,
          width: size,
          height: size,
          transform: [{ rotate: spin }],
        }}
      >
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="beam" x1="0%" y1="50%" x2="100%" y2="50%">
              <Stop offset="0%" stopColor={colorHex} stopOpacity={opacity} />
              <Stop offset="100%" stopColor={colorHex} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <G>
            <Path d={path} fill="url(#beam)" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

function PulseCircleOverlay({ centerPx, pxRadius, color = '#1EA0FF' }) {
  // PERF: Animated overlay (2 pulses) plutôt que d'animer Map.Circle
  const s1 = useRef(new Animated.Value(0)).current;
  const s2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 2800,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    const a1 = mk(s1, 0);
    const a2 = mk(s2, 1400);
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
    };
  }, [s1, s2]);

  if (!centerPx || !pxRadius) {
    return null;
  }

  const base = Math.max(8, pxRadius);
  const ring = (val, k) => {
    const scale = val.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
    const alpha = val.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] });
    const size = base * 2 * k;
    const half = size / 2;
    return (
      <Animated.View
        key={k}
        style={{
          position: 'absolute',
          top: centerPx.y - half,
          left: centerPx.x - half,
          width: size,
          height: size,
          transform: [{ scale }],
          opacity: alpha,
        }}
      >
        <Svg width={size} height={size}>
          <SvgCircle cx={half} cy={half} r={base * k} stroke={color} strokeWidth={2} fill="none" />
        </Svg>
      </Animated.View>
    );
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ring(s1, 1)}
      {ring(s2, 1)}
    </View>
  );
}

// ---------- Écran ----------
export default function MapaScreen() {
  const MAP = createMapLogger('MAPA:MAP');
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const mapRef = useRef(null);

  const [center, setCenter] = useState(null);
  const [radiusM, setRadiusM] = useState(1000);
  const [stateName, setStateName] = useState('Estado');
  const [barOpen, setBarOpen] = useState(true);

  const [alerts, setAlerts] = useState([]);
  const [centerPx, setCenterPx] = useState(null);
  const [pxRadius, setPxRadius] = useState(120);

  // PERF: ne pas garder "region" en state; ref suffit
  const regionRef = useRef(null);
  const lastGeomTs = useRef(0);

  const animateTo = useCallback(
    (cameraLike) => {
      const m = mapRef.current;
      if (!m) {
        return;
      }
      try {
        // MAP.info('animateCamera →', cameraLike); // PERF: réduire le bruit logs
        m.animateCamera(
          {
            center: { latitude: cameraLike.latitude, longitude: cameraLike.longitude },
            pitch: 0,
            heading: 0,
            zoom: cameraLike.zoom ?? 14,
          },
          { duration: 250 },
        );
      } catch (e) {
        MAP.err('animateCamera error', e?.message || e);
      }
    },
    [MAP],
  );

  const colorFor = useCallback(
    (a) => a.color || CATEGORY_COLOR[a.categoria] || CATEGORY_COLOR[a.type] || '#007AFF',
    [],
  );

  // Localisation + reverse geocode + cache Estado
  useEffect(() => {
    // MAP.group('MOUNT'); // PERF: couper group verbose
    (async () => {
      try {
        const cachedUF = await cacheGet('geo:stateName');
        if (cachedUF) {
          setStateName(cachedUF);
          // MAP.info('[CACHE] uf hydrated', cachedUF);
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        let c = { latitude: -3.7327, longitude: -38.527 }; // Fortaleza fallback
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          try {
            const info = await Location.reverseGeocodeAsync(c);
            const reg = info?.[0]?.region;
            if (reg) {
              setStateName(reg);
              await cacheSetForever('geo:stateName', reg);
            }
          } catch {}
        }
        setCenter(c);
        const z = zoomForRadiusMeters(radiusM, c.latitude);
        animateTo({ ...c, zoom: z });

        // calcule centre px au layout initial
        requestAnimationFrame(async () => {
          try {
            const m = mapRef.current;
            if (m) {
              const pt = await m.pointForCoordinate(c);
              setCenterPx(pt);
            }
          } catch {}
        });
      } catch (e) {
        MAP.err('localisation error', e?.message || e);
      } finally {
        // MAP.groupEndAll();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rayon => ajuste zoom
  useEffect(() => {
    if (!center) {
      return;
    }
    const z = zoomForRadiusMeters(radiusM, center.latitude);
    animateTo({ ...center, zoom: z });
  }, [radiusM, center, animateTo]);

  // Pré-hydrate incidents + abonnement Firestore (<=48h)
  useEffect(() => {
    let unsub = null;
    (async () => {
      const cached = await cacheGet('alerts:public:v1');
      if (cached) {
        setAlerts(cached);
        // MAP.info('[CACHE] alerts hydrated', { count: cached.length });
      }
      const col = collection(db, 'publicAlerts');
      const t48h = Timestamp.fromMillis(Date.now() - 48 * 3600 * 1000);
      const q = query(col, where('createdAt', '>=', t48h), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(
        q,
        async (snap) => {
          const rows = [];
          safeForEach(snap, (doc) => {
            const d = doc.data() || {};
            const hasCount =
              Object.prototype.hasOwnProperty.call(d, 'count') ||
              Object.prototype.hasOwnProperty.call(d, 'reports');
            rows.push({
              id: doc.id,
              lat: d?.location?.latitude ?? d.lat,
              lng: d?.location?.longitude ?? d.lng,
              categoria: d.categoria || d.type || 'Outros',
              type: d.categoria || d.type || 'Outros',
              color: d.color || null,
              createdAt:
                d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : d.createdAt || 0,
              count: d.count ?? d.reports ?? 1,
              hasCount,
              title: d.title || null,
              descricao: d.descricao || d.note || null,
            });
          });
          // PERF: hash simple pour éviter setState inutile
          const hash = rows.map((r) => `${r.id}:${r.createdAt}`).join('|');
          const prev = alerts;
          const prevHash = prev.map?.((r) => `${r.id}:${r.createdAt}`).join('|');
          if (hash !== prevHash) {
            setAlerts(rows);
            await cacheSet('alerts:public:v1', rows, 300);
            // MAP.info('[CACHE] alerts saved', { count: rows.length });
          }
        },
        (err) => MAP.err('onSnapshot error', err?.message || err),
      );
    })();
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PERF: cluster calculé quand 'alerts' change uniquement
  const clusteredAlerts = useMemo(() => {
    const now = Date.now();
    const recent = (alerts || []).filter((a) => now - a.createdAt <= 36 * 3600 * 1000);
    const withCount = recent.filter((a) => a.hasCount);
    const withoutCount = recent.filter((a) => !a.hasCount);
    const clustered = clusterByTypeNoCount(withoutCount, CLUSTER_THRESHOLD_M);
    return [...withCount, ...clustered];
  }, [alerts]);

  // Filtrage rayon par distance depuis 'center'
  const markers = useMemo(() => {
    if (!center) {
      return [];
    }
    return clusteredAlerts.filter(
      (c) => haversineMeters(center, { latitude: c.lat, longitude: c.lng }) <= radiusM,
    );
  }, [clusteredAlerts, center, radiusM]);

  // PERF: géométrie pixel sans getCamera — utilise latitudeDelta du dernier region
  const recomputePx = useCallback(
    (reg) => {
      if (!center || !reg) {
        return;
      }
      const now = Date.now();
      if (now - lastGeomTs.current < 120) {
        return;
      } // throttle ~8fps
      lastGeomTs.current = now;

      // approx mpp via latitudeDelta
      const mpp = metersPerPixelWithDelta(reg.latitudeDelta, center.latitude, height);
      const rpx = Math.max(
        8,
        Math.min(radiusM / Math.max(0.00001, mpp), Math.max(width, height) * 1.2),
      );
      setPxRadius(rpx);

      // centre px (bridge) — mais uniquement quand nécessaire
      requestAnimationFrame(async () => {
        try {
          const m = mapRef.current;
          if (m) {
            const pt = await m.pointForCoordinate(center);
            setCenterPx(pt);
          }
        } catch {}
      });
    },
    [center, radiusM],
  );

  const onRegionChangeComplete = useCallback(
    (reg) => {
      regionRef.current = reg;
      recomputePx(reg);
    },
    [recomputePx],
  );

  const onLayout = useCallback(async () => {
    // recalcule le centre px au layout
    try {
      const m = mapRef.current;
      if (m && center) {
        const pt = await m.pointForCoordinate(center);
        setCenterPx(pt);
      }
    } catch {}
  }, [center]);

  const onPressPreset = useCallback(
    (p) => {
      if (!center) {
        return;
      }
      if (p.kind === 'brasil') {
        animateTo({ ...center, zoom: 4.2 });
        return;
      }
      if (p.kind === 'estado') {
        animateTo({ ...center, zoom: 6.2 });
        return;
      }
      setRadiusM(p.meters);
      // déclenche un recompute via effet/zoom
      if (regionRef.current) {
        recomputePx(regionRef.current);
      }
    },
    [center, animateTo, recomputePx],
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: center?.latitude ?? -3.7327,
          longitude: center?.longitude ?? -38.527,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
        onLayout={onLayout}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        zoomTapEnabled={false} // PERF: Android smoother
        moveOnMarkerPress={false}
      >
        {/* User marker + callout */}
        {center && (
          <>
            <Marker coordinate={center} anchor={{ x: 0.5, y: 1 }} calloutAnchor={{ x: 0.5, y: 0 }}>
              <Callout tooltip={false}>
                <View style={styles.userCard}>
                  <Text style={styles.userText}>Você está aqui</Text>
                </View>
              </Callout>
            </Marker>

            {/* Cercle de rayon (couche Map) */}
            <Circle
              center={center}
              radius={radiusM}
              strokeColor="rgba(30,160,255,0.95)"
              fillColor="rgba(30,160,255,0.18)"
              zIndex={1}
            />
          </>
        )}

        {/* Incidents */}
        {markers.map((a, idx) => {
          const pinColor = colorFor(a);
          const key = a.id || `${a.lat},${a.lng},${a.type || a.categoria},${idx}`;
          return (
            <Marker
              key={key}
              coordinate={{ latitude: a.lat, longitude: a.lng }}
              pinColor={pinColor}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              calloutAnchor={{ x: 0.5, y: 0 }}
            >
              <Callout tooltip={false} style={{ maxWidth: 260 }}>
                <View style={styles.calloutCard}>
                  <Text style={[styles.calloutTitle, { color: pinColor }]}>
                    {(a.type || a.categoria).toUpperCase()} • {a.count}{' '}
                    {a.count > 1 ? 'relatos' : 'relato'}
                  </Text>
                  <Text style={styles.calloutSub}>{fmtDate(a.createdAt)}</Text>
                  {!!a.descricao && <Text style={styles.calloutBody}>{a.descricao}</Text>}
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Radar visuel borné au cercle (sonar lent) */}
      {center && centerPx && pxRadius ? (
        <RadarSweepBounded
          centerPx={centerPx}
          pxRadius={pxRadius}
          sweepDeg={50}
          duration={7000}
          colorHex="#1EA0FF"
          opacity={0.36}
        />
      ) : null}

      {/* Pulse lent (double anneau) */}
      {center && centerPx && pxRadius ? (
        <PulseCircleOverlay centerPx={centerPx} pxRadius={pxRadius} color="#1EA0FF" />
      ) : null}

      {/* Barre RAIO (verticale, pliable) */}
      <View
        pointerEvents="box-none"
        style={[styles.radiusWrap, { top: insets.top + headerHeight }]}
      >
        <View style={styles.radiusCard}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={styles.radiusHeader} onPress={() => setBarOpen((v) => !v)}>
            <Text style={styles.radiusTitle}>RAIO</Text>
            <Text style={styles.chevron}>{barOpen ? '▾' : '▸'}</Text>
          </Pressable>
          {barOpen && <Text style={styles.scrollHint}>deslize ⇵</Text>}
          {barOpen && (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.radiusList}
              style={{ maxHeight: 230 }}
            >
              {PRESETS.map((p) => {
                const isActive = typeof p.meters === 'number' ? radiusM === p.meters : false;
                const label = p.kind
                  ? p.kind === 'estado'
                    ? stateName || 'Estado'
                    : p.label
                  : p.label;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => onPressPreset({ ...p, label })}
                    style={[styles.pillSmall, isActive && styles.pillSmallActive]}
                    android_ripple={{ color: '#0b397744' }}
                  >
                    <Text style={[styles.pillSmallText, isActive && styles.pillSmallTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  radiusWrap: {
    position: 'absolute',
    alignSelf: 'flex-start',
    marginLeft: 12,
    width: 140,
    zIndex: 1000,
  },
  radiusCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: GLASS_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 8 },
    }),
  },
  radiusHeader: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: 'rgba(10,60,120,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radiusTitle: {
    color: ACCENT,
    fontWeight: '800',
    letterSpacing: 0.6,
    fontSize: 14,
    textTransform: 'uppercase',
  },
  chevron: { color: '#BFEAFF', fontSize: 16, fontWeight: '800' },
  scrollHint: {
    color: '#9fd9ff',
    fontSize: 11,
    opacity: 0.8,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  radiusList: { paddingHorizontal: 10, paddingBottom: 10, gap: 8 },
  pillSmall: {
    backgroundColor: PILL_IDLE_BG,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PILL_IDLE_BORDER,
    alignItems: 'center',
  },
  pillSmallActive: { backgroundColor: PILL_ACTIVE_BG, borderColor: PILL_ACTIVE_BG },
  pillSmallText: { color: '#E6F7FF', fontWeight: '800', fontSize: 13 },
  pillSmallTextActive: { color: '#0b2033' },
  calloutCard: {
    backgroundColor: '#0b1420',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(39,194,255,0.25)',
    maxWidth: 260,
  },
  calloutTitle: { fontWeight: '900', marginBottom: 2, flexWrap: 'wrap' },
  calloutSub: { color: '#b7e6ff', fontSize: 12, marginBottom: 2 },
  calloutBody: { color: '#d8f2ff', fontSize: 13, flexWrap: 'wrap' },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#00000022',
  },
  userText: { color: '#111', fontWeight: '800' },
});
