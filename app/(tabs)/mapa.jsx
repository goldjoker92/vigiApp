// app/(tabs)/mapa.jsx
// -------------------------------------------------------------
// VigiApp — Carte publique (clean, full spec)
// - RAIO vertical (pliable, overlays bleus, hint “deslize ⇵”)
// - Presets: 500 m, 1/2/3/5/10/50/100 km + Estado (dynamique via cache+reverse) + Brasil
// - Par défaut: 1 km (modifiable)
// - Incidents: /publicAlerts, couleur = Report.payload.color (fallback par categoria)
//   tooltip: "TIPO • N relatos" + date/heure + description (si dispo)
//   fenêtre: visibles <= 36 h depuis createdAt
//   comptage: si doc a count/reports => on l’utilise, sinon cluster ~80 m par type
// - Filtrage: rien hors du cercle sélectionné
// - Radar: part du centre user, borné au cercle (taille px = rayon / mpp)
// - Marker user: "Você está aqui" en noir (callout propre, pas coupé)
// - Actions à droite: + / − (couleur RAIO) + unique bouton "Sinalizar"
// - Cache: estado persistant (AsyncStorage), incidents TTL 5 min (pré-hydratation)
// - JS pur
// -------------------------------------------------------------
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing, ScrollView, Pressable, Platform } from 'react-native';
import MapView, { Marker, Circle, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, Stop, Path, G } from 'react-native-svg';
import { cacheGet, cacheSet, cacheSetForever } from '@/utils/cache';

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

// Couleurs côté Report (fallback si payload.color absent)
const CATEGORY_COLOR = {
  'Roubo/Furto': '#FFA500',
  'Agressão': '#FFA500',
  'Incidente de trânsito': '#FFE600',
  'Incêndio': '#FF3B30',
  'Falta de luz': '#FFE600',
  'Mal súbito (problema de saúde)': '#FF3B30',
  'Outros': '#007AFF',
};

// ---------- Utils ----------
function zoomForRadiusMeters(radiusMeters, latitude, viewportWidthPx = width, fill = 0.82) {
  const metersWanted = (2 * radiusMeters) / (viewportWidthPx * fill);
  const base = 156543.03392 * Math.cos((latitude * Math.PI) / 180);
  const z = Math.log(base / (metersWanted || 1)) / Math.log(2);
  return Math.max(3, Math.min(20, z));
}
function metersPerPixelAt(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom || 14);
}
function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
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

// ---------- Cluster "sans count" (~80 m par type) ----------
const CLUSTER_THRESHOLD_M = 80;
function clusterByTypeNoCount(rows, proximityM = CLUSTER_THRESHOLD_M) {
  const clusters = [];
  for (const a of rows) {
    let idx = -1;
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      if ((c.type || c.categoria) === (a.type || a.categoria)) {
        const dist = haversineMeters({ latitude: c.lat, longitude: c.lng }, { latitude: a.lat, longitude: a.lng });
        if (dist <= proximityM) { idx = i; break; }
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
        c.title = a.title; c.descricao = a.descricao;
        c.color = a.color || c.color;
      }
    }
  }
  return clusters;
}

// ---------- Radar (centré user, borné au cercle) ----------
function polarToCartesian(cx, cy, r, angleDeg) { const a = (angleDeg - 90) * (Math.PI/180); return { x: cx + r*Math.cos(a), y: cy + r*Math.sin(a) }; }
function sectorPath(cx, cy, r, sweepDeg) {
  const start = polarToCartesian(cx, cy, r, 0);
  const end = polarToCartesian(cx, cy, r, sweepDeg);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}
function RadarSweepBounded({ centerPx, pxRadius, sweepDeg = 70, duration = 2800, colorHex = '#1EA0FF', opacity = 0.42 }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(rot, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start(); return () => loop.stop();
  }, [rot, duration]);
  if (!centerPx || !pxRadius || pxRadius < 8) return null;

  const size = Math.max(8, Math.min(Math.floor(pxRadius * 2), Math.max(width, height) * 1.2));
  const half = size / 2;
  const path = sectorPath(half, half, half, sweepDeg);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={{ position:'absolute', top:centerPx.y - half, left:centerPx.x - half, width:size, height:size, transform:[{ rotate: spin }] }}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="beam" x1="0%" y1="50%" x2="100%" y2="50%">
              <Stop offset="0%" stopColor={colorHex} stopOpacity={opacity}/>
              <Stop offset="100%" stopColor={colorHex} stopOpacity={0}/>
            </LinearGradient>
          </Defs>
          <G><Path d={path} fill="url(#beam)" /></G>
        </Svg>
      </Animated.View>
    </View>
  );
}

// ---------- Écran ----------
export default function MapaScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const mapRef = useRef(null);

  const [center, setCenter] = useState(null);
  const [region, setRegion] = useState(null);
  const [radiusM, setRadiusM] = useState(1000); // 1 km par défaut
  // const [loadingLoc, setLoadingLoc] = useState(true);
  const [stateName, setStateName] = useState('Estado'); // dynamique + cache
  const [barOpen, setBarOpen] = useState(true);

  const [alerts, setAlerts] = useState([]);     // bruts /publicAlerts
  // const [cameraZoom, setCameraZoom] = useState(14);
  const [centerPx, setCenterPx] = useState(null);
  const [pxRadius, setPxRadius] = useState(120);

  const animateTo = useCallback((cameraLike) => {
    const m = mapRef.current; if (!m) return;
    try {
      m.animateCamera(
        { center: { latitude: cameraLike.latitude, longitude: cameraLike.longitude }, pitch:0, heading:0, zoom: cameraLike.zoom ?? 14 },
        { duration: 250 }
      );
    } catch(e){ console.log('[MAP] animateCamera error', e); }
  }, []);
  const colorFor = useCallback((a) => a.color || CATEGORY_COLOR[a.categoria] || CATEGORY_COLOR[a.type] || '#007AFF', []);

  // Localisation + reverse geocode + cache Estado
  useEffect(() => {
    (async () => {
      try {
        const cachedUF = await cacheGet('geo:stateName');
        if (cachedUF) { setStateName(cachedUF); console.log('[CACHE] uf hydrated =', cachedUF); }

        const { status } = await Location.requestForegroundPermissionsAsync();
        let c = { latitude: -3.7327, longitude: -38.5270 }; // Fortaleza fallback
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          try {
            const info = await Location.reverseGeocodeAsync({ latitude: c.latitude, longitude: c.longitude });
            const reg = info?.[0]?.region;
            if (reg) { setStateName(reg); await cacheSetForever('geo:stateName', reg); }
          } catch(_) {}
        } else {
          console.log('[MAP] permission refusée → fallback Fortaleza');
        }
        setCenter(c);
        const z = zoomForRadiusMeters(radiusM, c.latitude);
        animateTo({ ...c, zoom: z });
      } catch(e) {
        console.log('[MAP] localisation error', e);
      } finally { /* setLoadingLoc(false); */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rayon => ajuste zoom
  useEffect(() => {
    if (!center) return;
    const z = zoomForRadiusMeters(radiusM, center.latitude);
    animateTo({ ...center, zoom: z });
  }, [radiusM, center, animateTo]);

  // Pré-hydrate incidents (TTL 5m) + abonnement Firestore (publicAlerts)
  useEffect(() => {
    let unsub = null;
    (async () => {
      const cached = await cacheGet('alerts:public:v1');
      if (cached) { setAlerts(cached); console.log('[CACHE] alerts hydrated =', cached.length); }

      const col = collection(db, 'publicAlerts'); // = Report.jsx
      const t48h = Timestamp.fromMillis(Date.now() - 48*3600*1000);
      const q = query(col, where('createdAt', '>=', t48h), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(q, async (snap) => {
        const rows = [];
        snap.forEach((doc) => {
          const d = doc.data() || {};
          const hasCount = Object.prototype.hasOwnProperty.call(d, 'count') || Object.prototype.hasOwnProperty.call(d, 'reports');
          rows.push({
            id: doc.id,
            lat: d?.location?.latitude ?? d.lat,
            lng: d?.location?.longitude ?? d.lng,
            categoria: d.categoria || d.type || 'Outros',
            type: d.categoria || d.type || 'Outros',
            color: d.color || null,
            createdAt: (d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt || 0)),
            count: d.count ?? d.reports ?? 1,
            hasCount,
            title: d.title || null,
            descricao: d.descricao || d.note || null,
          });
        });
        setAlerts(rows);
        await cacheSet('alerts:public:v1', rows, 300); // cache alerts (5 min)
        console.log('[CACHE] alerts saved =', rows.length);
      }, (err)=>console.log('[MAP] onSnapshot error', err));
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  // Géométrie pour borner le radar
  const refreshScreenGeometry = useCallback(async () => {
    const m = mapRef.current; if (!m || !center) return;
    try {
      const cam = await m.getCamera();
      const zoom = cam?.zoom ?? 14;
      // setCameraZoom(zoom);
      const pt = await m.pointForCoordinate(center);
      setCenterPx(pt);
      const mpp = metersPerPixelAt(center.latitude, zoom);
      const rpx = Math.max(8, Math.min((radiusM / mpp), Math.max(width, height) * 1.2));
      setPxRadius(rpx);
    } catch(_) {}
  }, [center, radiusM]);
  useEffect(() => { refreshScreenGeometry(); }, [refreshScreenGeometry]);
  const onRegionChangeComplete = useCallback(async (reg) => {
    setRegion(reg);
    refreshScreenGeometry();
  }, [refreshScreenGeometry]);

  // Incidents dynamiques: <=36h, cluster ~80m UNIQUEMENT si pas de count, puis filtrage dans le cercle
  const markers = useMemo(() => {
    if (!center) return [];
    const now = Date.now();
    const recent = alerts.filter(a => (now - a.createdAt) <= 36*3600*1000);

    const withCount = recent.filter(a => a.hasCount);
    const withoutCount = recent.filter(a => !a.hasCount);

    const clusteredNoCount = clusterByTypeNoCount(withoutCount, CLUSTER_THRESHOLD_M);
    const combined = [...withCount, ...clusteredNoCount];

    return combined.filter(c =>
      haversineMeters(center, { latitude: c.lat, longitude: c.lng }) <= radiusM
    );
  }, [alerts, center, radiusM]);

  // Presets RAIO
  const PRESETS = [
    { key: '500m', meters: 500, label: '500 m' },
    { key: '1k', meters: 1000, label: '1 km' },
    { key: '2k', meters: 2000, label: '2 km' },
    { key: '3k', meters: 3000, label: '3 km' },
    { key: '5k', meters: 5000, label: '5 km' },
    { key: '10k', meters: 10000, label: '10 km' },
    { key: '50k', meters: 50000, label: '50 km' },
    { key: '100k', meters: 100000, label: '100 km' },
    { key: 'estado', meters: null, label: stateName || 'Estado', kind: 'estado' },
    { key: 'brasil', meters: null, label: 'Brasil', kind: 'brasil' },
  ];
  const onPressPreset = useCallback((p) => {
    if (!center) return;
    if (p.kind === 'brasil') { animateTo({ ...center, zoom: 4.2 }); return; }
    if (p.kind === 'estado') { animateTo({ ...center, zoom: 6.2 }); return; }
    setRadiusM(p.meters);
  }, [center, animateTo]);


  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={ region ?? { latitude: center?.latitude ?? -3.7327, longitude: center?.longitude ?? -38.5270, latitudeDelta: 0.2, longitudeDelta: 0.2 } }
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation showsCompass={false}
        toolbarEnabled={false} rotateEnabled={false} moveOnMarkerPress={false}
      >
        {/* User marker + callout propre */}
        {center && (
          <>
            <Marker
              coordinate={center}
              anchor={{ x: 0.5, y: 1 }}
              calloutAnchor={{ x: 0.5, y: 0 }}
            >
              <Callout tooltip={false}>
                <View style={styles.userCard}>
                  <Text style={styles.userText}>Você está aqui</Text>
                </View>
              </Callout>
            </Marker>

            {/* Cercle de rayon */}
            <Circle
              center={center}
              radius={radiusM}
              strokeColor="rgba(30,160,255,0.95)"
              fillColor="rgba(30,160,255,0.18)"
              zIndex={1}
            />
          </>
        )}

        {/* Incidents (pins dans le cercle, couleur Report ou fallback categoria) */}
        {markers.map((a, idx) => {
          const pinColor = colorFor(a);
          const key = a.id || `${a.lat},${a.lng},${a.type || a.categoria},${idx}`;
          return (
            <Marker
              key={key}
              coordinate={{ latitude:a.lat, longitude:a.lng }}
              pinColor={pinColor}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
              calloutAnchor={{ x: 0.5, y: 0 }}
            >
              <Callout tooltip={false} style={{ maxWidth: 260 }}>
                <View style={styles.calloutCard}>
                  <Text style={[styles.calloutTitle, { color: pinColor }]}>
                    {(a.type || a.categoria).toUpperCase()} • {a.count} {a.count>1?'relatos':'relato'}
                  </Text>
                  <Text style={styles.calloutSub}>{fmtDate(a.createdAt)}</Text>
                  {!!a.descricao && <Text style={styles.calloutBody}>{a.descricao}</Text>}
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Radar centré user et borné au cercle */}
      {center && centerPx && pxRadius ? (
        <RadarSweepBounded centerPx={centerPx} pxRadius={pxRadius} sweepDeg={70} duration={2800} colorHex="#1EA0FF" opacity={0.42} />
      ) : null}

      {/* ----- Barre RAIO (verticale, pliable) ----- */}
      <View pointerEvents="box-none" style={[styles.radiusWrap, { top: insets.top + headerHeight + 0 }]}>
        <View style={styles.radiusCard}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={styles.radiusHeader} onPress={() => setBarOpen((v)=>!v)}>
            <Text style={styles.radiusTitle}>RAIO</Text>
            <Text style={styles.chevron}>{barOpen ? '▾' : '▸'}</Text>
          </Pressable>
          {barOpen && <Text style={styles.scrollHint}>deslize  ⇵</Text>}
          {barOpen && (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.radiusList} style={{ maxHeight: 230 }}>
              {PRESETS.map((p) => {
                const isActive = typeof p.meters === 'number' ? radiusM === p.meters : false;
                return (
                  <Pressable key={p.key} onPress={() => onPressPreset(p)} style={[styles.pillSmall, isActive && styles.pillSmallActive]} android_ripple={{ color: '#0b397744' }}>
                    <Text style={[styles.pillSmallText, isActive && styles.pillSmallTextActive]}>{p.label}</Text>
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

  // Barre RAIO
  radiusWrap: { position:'absolute', alignSelf:'flex-start', marginLeft:12, width:140, zIndex:1000 },
  radiusCard: {
    borderRadius:18, overflow:'hidden', backgroundColor:GLASS_BG,
    borderWidth:1, borderColor:CARD_BORDER,
    ...Platform.select({ ios:{shadowColor:'#000',shadowOpacity:0.25,shadowRadius:12,shadowOffset:{width:0,height:8}}, android:{elevation:8} }),
  },
  radiusHeader: {
    paddingHorizontal:12, paddingTop:10, paddingBottom:6,
    backgroundColor:'rgba(10,60,120,0.18)', flexDirection:'row', alignItems:'center', justifyContent:'space-between'
  },
  radiusTitle: { color: ACCENT, fontWeight:'800', letterSpacing:0.6, fontSize:14, textTransform:'uppercase' },
  chevron: { color:'#BFEAFF', fontSize:16, fontWeight:'800' },
  scrollHint: { color:'#9fd9ff', fontSize:11, opacity:0.8, paddingHorizontal:12, paddingBottom:4 },
  radiusList: { paddingHorizontal:10, paddingBottom:10, gap:8 },
  pillSmall: {
    backgroundColor: PILL_IDLE_BG,
    paddingHorizontal:10, paddingVertical:6,
    borderRadius:12, borderWidth:1, borderColor: PILL_IDLE_BORDER,
    alignItems:'center',
  },
  pillSmallActive: { backgroundColor: PILL_ACTIVE_BG, borderColor: PILL_ACTIVE_BG },
  pillSmallText: { color:'#E6F7FF', fontWeight:'800', fontSize:13 },
  pillSmallTextActive: { color:'#0b2033' },

  // Callouts
  calloutCard: {
    backgroundColor:'#0b1420',
    borderRadius:12,
    paddingHorizontal:10,
    paddingVertical:8,
    borderWidth:1,
    borderColor:'rgba(39,194,255,0.25)',
    maxWidth:260,
  },
  calloutTitle: { fontWeight:'900', marginBottom:2, flexWrap:'wrap' },
  calloutSub:   { color:'#b7e6ff', fontSize:12, marginBottom:2 },
  calloutBody:  { color:'#d8f2ff', fontSize:13, flexWrap:'wrap' },

  // User callout
  userCard: {
    backgroundColor:'#fff',
    borderRadius:10,
    paddingHorizontal:10,
    paddingVertical:6,
    borderWidth:1,
    borderColor:'#00000022',
  },
  userText: { color:'#111', fontWeight:'800' },

  // Actions (droite)
  actionsWrap: { position:'absolute', right:12, bottom: 40, alignItems:'center', gap:10 },
  actionBtnAccent: {
    width:48, height:48, borderRadius:24,
    backgroundColor: ACCENT,
    alignItems:'center', justifyContent:'center',
    ...Platform.select({ ios:{shadowColor:ACCENT,shadowOpacity:0.35,shadowRadius:10,shadowOffset:{width:0,height:6}}, android:{elevation:8} }),
  },
    actionTxt: { color:'#0b2033', fontSize:26, fontWeight:'900', marginTop:-2 },
  });

  
