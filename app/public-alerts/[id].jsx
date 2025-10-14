// app/public-alerts/[id].jsx
// ---------------------------------------------------------
// VigiApp — Alertas Públicas (UI restaurée + chip pulsante)
// - Pin rouge + cercle de propagation (radius_m)
// - Card sombre avec mêmes labels/icônes
// - Adresse multi-lignes, date createdAt -> DD/MM HH:mm (fallback date)
// - Distance user↔incident + loader
// - Bouton recentrage rouge
// - “Chip” d’actualité: “Atualizado há X min” (pulsation douce)
// - Traces/verbeses: logs homogènes pour debug sans bruit
// - Robuste: id de route sécurisé, fallback champs, guard coords
// ---------------------------------------------------------

import { db } from '../../firebase';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

const TAG = '[ALERT_PAGE]';

const { width: W } = Dimensions.get('window');
const scale = (s) => Math.round((W / 375) * s);

// Palette
const C = {
  bg: '#0E0F10',
  card: '#17191C',
  text: '#E9ECF1',
  sub: '#AFB6C2',
  border: '#2A2E34',
  ok: '#28a745',
  warn: '#ffc107',
  danger: '#dc3545',
  mute: '#6c757d',
};

// --- utils num/coords
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const safeCoord = (lat, lng) =>
  isNum(lat) && isNum(lng) ? { latitude: lat, longitude: lng } : null;

// --- date utils
const normalizeToDate = (v) => {
  try {
    if (!v) {return null;}
    if (v instanceof Date) {return v;}
    if (typeof v?.toDate === 'function') {return v.toDate();}
    if (typeof v === 'object' && 'seconds' in v) {return new Date(v.seconds * 1000);}
    if (typeof v === 'number') {return new Date(v);}
    if (typeof v === 'string') {return new Date(v);}
    return null;
  } catch {
    return null;
  }
};
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const fmtDate = (inp) => {
  const d = normalizeToDate(inp);
  if (!d || Number.isNaN(d.getTime())) {return '—';}
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// libellé relatif en PT (sobre)
const relTimePt = (date) => {
  const d = normalizeToDate(date);
  if (!d) {return null;}
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 45 * 1000) {return 'agora';}
  const min = Math.round(diffMs / 60000);
  if (min < 60) {return `há ${min} min`;}
  const h = Math.round(min / 60);
  if (h < 24) {return `há ${h} h`;}
  const dys = Math.round(h / 24);
  return `há ${dys} d`;
};

// --- distance
function haversineM(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(isNum)) {return NaN;}
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const distanciaTxt = (u, a) => {
  if (!u || !a) {return '—';}
  const d = haversineM(u.latitude, u.longitude, a.latitude, a.longitude);
  if (!isNum(d)) {return '—';}
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
};

// --- mapping Firestore
const pickTipo = (a) => a?.tipo || a?.categoria || a?.type || '—';
const pickEstado = (a) => a?.uf || a?.estado || a?.state || '—';
const pickCidade = (a) => a?.cidade || a?.city || '—';
const pickCreated = (a) => a?.createdAt || a?.date || null;
const pickLastReportAt = (a) => a?.lastReportAt || null;
const pickReports = (a) =>
  a?.reportsCount ?? a?.declaracoes ?? (a?.declarantsMap ? Object.keys(a.declarantsMap).length : 1);
const pickCoords = (a) => {
  if (a?.location) {return safeCoord(a.location.latitude, a.location.longitude);}
  return safeCoord(a?.lat, a?.lng);
};
const buildEndereco = (a) => {
  if (typeof a?.endereco === 'string' && a.endereco.trim()) {return a.endereco.trim();}
  if (typeof a?.ruaNumero === 'string' && a.ruaNumero.trim()) {return a.ruaNumero.trim();}
  const rua = a?.rua || a?.street || '';
  const numero = a?.numero || a?.number || '';
  const left = [rua, numero].filter(Boolean).join(', ');
  const right = [a?.cidade && `${a.cidade}/${a?.uf || a?.estado || ''}`.replace(/\/$/, ''), a?.cep]
    .filter(Boolean)
    .join(' - ');
  const final = [left, right].filter(Boolean).join(' - ');
  return final || '—';
};

// Rayon → deltas carte (pour cadrer cercle)
function radiusToDeltas(radiusM, lat) {
  const R_LAT = 111000; // ~m par degré lat
  const latDelta = Math.max(0.0025, (Number(radiusM || 0) / R_LAT) * 2.2);
  const lngDelta = Math.max(
    0.0025,
    latDelta / Math.max(0.25, Math.cos(((lat || 0) * Math.PI) / 180)),
  );
  return { latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

// Loader 3 points (distance en attente)
function LoaderDots() {
  const dot0 = useRef(new Animated.Value(0));
  const dot1 = useRef(new Animated.Value(0));
  const dot2 = useRef(new Animated.Value(0));
  const a = useMemo(() => [dot0.current, dot1.current, dot2.current], []);

  useEffect(() => {
    a.forEach((val, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: 230,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            delay: i * 120,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 230,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
  }, [a]);

  const dotStyle = (val) => ({
    transform: [{ translateY: val.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    color: C.sub,
    fontSize: scale(16),
    marginHorizontal: scale(1),
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Animated.Text style={dotStyle(a[0])}>•</Animated.Text>
      <Animated.Text style={dotStyle(a[1])}>•</Animated.Text>
      <Animated.Text style={dotStyle(a[2])}>•</Animated.Text>
    </View>
  );
}

// --- Firestore fetch (loggué)
async function fetchAlertDoc(id) {
  console.log(TAG, 'fetch', id);
  try {
    const snap = await getDoc(doc(db, 'publicAlerts', id));
    if (!snap.exists()) {
      console.warn(TAG, 'not found', id);
      return null;
    }
    const data = { id: snap.id, ...snap.data() };
    console.log(TAG, 'data', {
      id: data.id,
      hasLoc: !!(data.location?.latitude && data.location?.longitude),
      reportsCount: data.reportsCount,
      lastReportAt: !!data.lastReportAt,
    });
    return data;
  } catch (e) {
    console.error(TAG, 'fetch error', e?.message || e);
    throw e;
  }
}

// ---------------------------------------------------------
// Composant principal
// ---------------------------------------------------------
export default function PublicAlertPage() {
  // 1) Paramètres de route robustes (gère deep link éventuellement mal formé)
  const params = useLocalSearchParams();
  // on accepte ?alertId=… ou /[id]
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id || params.alertId || '';
  const id = String(rawId || '').split('?')[0]; // strip au cas où

  const [raw, setRaw] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  const [tick, setTick] = useState(0); // force re-render pour le libellé relatif
  const mapRef = useRef(null);

  // 2) fetch Firestore
  useEffect(() => {
    if (!id) {
      console.warn(TAG, '⚠️ no id in route params', params);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const d = await fetchAlertDoc(id);
        if (mounted) {setRaw(d);}
      } catch (e) {
        console.error(TAG, 'fetch error', e?.message || e);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 3) géoloc (distance utilisateur)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log('[public-alerts/[id].jsx] geo: request permission');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {return;}
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setUserLoc({ latitude: coords.latitude, longitude: coords.longitude });
          console.log(TAG, 'geo ok', { lat: coords.latitude, lng: coords.longitude });
        }
      } catch (e) {
        console.warn(TAG, 'geo error', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 4) re-render doux toutes les 30s pour la chip (sans agressivité)
  useEffect(() => {
    const it = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(it);
  }, []);

  // 5) mapping (safe même si raw null)
  const alert = {
    tipo: pickTipo(raw || {}),
    endereco: buildEndereco(raw || {}),
    cidade: pickCidade(raw || {}),
    estado: pickEstado(raw || {}),
    createdAt: pickCreated(raw || {}),
    lastReportAt: pickLastReportAt(raw || {}),
    reports: pickReports(raw || {}),
    coords: pickCoords(raw || {}),
    radiusM: Number(raw?.radius_m ?? raw?.radius ?? 1000),
    descricao: (raw && (raw.descricao || raw.description)) || '—',
  };

  // 6) région carte (guard coords)
  const region = useMemo(() => {
    if (!alert.coords) {return null;}
    const deltas = radiusToDeltas(alert.radiusM, alert.coords.latitude);
    return { ...alert.coords, ...deltas };
  }, [alert.coords, alert.radiusM]);

  // 7) Chip pulsante (alpha douce)
  const chipPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(chipPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(chipPulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [chipPulse]);

  const chipOpacity = chipPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.75],
  });

  // 8) libellé d’actualité (lastReportAt prioritaire)
  const updatedChip = useMemo(
    () => relTimePt(alert.lastReportAt || alert.createdAt) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alert.lastReportAt, alert.createdAt, tick],
  );

  // 9) recentrage
  const handleRecenter = useCallback(() => {
    if (!region) {return;}
    try {
      mapRef.current?.animateToRegion(region, 300);
      console.log(TAG, 'recenter to', region);
    } catch {}
  }, [region]);

  // 10) skeleton simple
  if (!raw) {
    return (
      <SafeAreaView style={S.container}>
        <View style={S.header}>
          <Text style={S.title}>Alertas Públicas</Text>
        </View>
        <View style={[S.card, { marginTop: scale(12) }]}>
          <View style={S.skel} />
          <View style={[S.skel, { width: '60%' }]} />
        </View>
      </SafeAreaView>
    );
  }

  const distance = userLoc && alert.coords ? distanciaTxt(userLoc, alert.coords) : null;

  return (
    <SafeAreaView style={S.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: scale(24) }}>
          {/* header */}
          <View style={S.header}>
            <Text style={S.title}>Alertas Públicas</Text>
          </View>

          {/* Chip “Atualizado há X …” (pulsation douce) */}
          {updatedChip && (
            <View style={S.chipRow}>
              <Animated.View style={[S.chip, { opacity: chipOpacity }]}>
                <Icon name="update" size={scale(14)} color={C.bg} />
                <Text style={S.chipText}>Atualizado {updatedChip}</Text>
              </Animated.View>
            </View>
          )}

          {/* Map + cercle + recentrage */}
          {region ? (
            <View style={S.mapWrap}>
              <MapView ref={mapRef} style={S.map} initialRegion={region} pointerEvents="auto">
                <Marker coordinate={alert.coords} title={alert.tipo || 'Incidente'} pinColor="red" />
                <Circle
                  center={alert.coords}
                  radius={alert.radiusM}
                  strokeColor="rgba(255,0,0,0.85)"
                  strokeWidth={2}
                  fillColor="rgba(255,0,0,0.18)"
                />
                {userLoc && <Marker coordinate={userLoc} title="Você" pinColor={C.ok} />}
              </MapView>
              <Pressable onPress={handleRecenter} style={({ pressed }) => [S.recenter, pressed && { opacity: 0.85 }]}>
                <Icon name="crosshairs-gps" size={scale(18)} color={C.bg} />
              </Pressable>
            </View>
          ) : (
            <View style={S.banner}>
              <Icon name="map-marker-off" size={scale(18)} color={C.sub} />
              <Text style={S.bannerText}>Localização indisponível para este alerta.</Text>
            </View>
          )}

          {/* Détails */}
          <View style={S.card}>
            <Row label="🚨  Tipo" value={alert.tipo} color={C.danger} />
            <Row
              label="📍  Endereço"
              value={alert.endereco}
              color={C.warn}
              multiline
              extraGap={scale(10)}
            />
            <Row label="🏙️  Cidade" value={alert.cidade} color={C.ok} />
            <Row label="🗺️  Estado" value={alert.estado} color={C.mute} />
            <Row
              label="📏  Distância"
              value={distance || undefined}
              valueNode={distance ? null : <LoaderDots />}
              color={C.warn}
            />
            <Row label="🕒  Data & hora" value={fmtDate(alert.createdAt)} color={C.ok} />
            <Row label="👥  Declarações" value={`${alert.reports}`} color={C.ok} />
          </View>

          {/* Description */}
          <View style={S.card}>
            <Text style={[S.cardTitle, { color: C.danger }]}>Descrição</Text>
            <Text style={S.body}>{alert.descricao}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// sous-composant ligne (adresse multi-lignes, loader possible)
function Row({ label, value, valueNode, color, multiline = false, extraGap = 0 }) {
  return (
    <View style={S.row}>
      <Text style={[S.rowLabel, { color }]} numberOfLines={3} ellipsizeMode="clip">
        {label}
      </Text>
      {valueNode ? (
        <View style={{ flex: 1, alignItems: 'flex-end', marginLeft: extraGap }}>{valueNode}</View>
      ) : (
        <Text
          style={[
            S.rowValue,
            multiline && { textAlign: 'left', lineHeight: scale(20) },
            extraGap ? { marginLeft: extraGap } : null,
          ]}
        >
          {value ?? '—'}
        </Text>
      )}
    </View>
  );
}

// styles
const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: scale(20),
    paddingTop: scale(16),
    paddingBottom: scale(6),
    alignItems: 'center',
  },
  title: { color: C.ok, fontSize: scale(24), fontWeight: '700' },

  chipRow: {
    paddingHorizontal: scale(20),
    marginTop: scale(6),
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    backgroundColor: C.warn,
    paddingHorizontal: scale(10),
    paddingVertical: scale(6),
    borderRadius: 999,
  },
  chipText: {
    color: C.bg,
    fontWeight: '700',
    fontSize: scale(12),
  },

  mapWrap: {
    height: Math.max(scale(240), 220),
    borderRadius: scale(12),
    overflow: 'hidden',
    marginHorizontal: scale(20),
    marginTop: scale(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  map: { flex: 1 },
  recenter: {
    position: 'absolute',
    right: scale(12),
    bottom: scale(12),
    backgroundColor: C.danger,
    borderRadius: 999,
    paddingVertical: scale(8),
    paddingHorizontal: scale(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D7DB',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  banner: {
    marginHorizontal: scale(20),
    marginTop: scale(14),
    backgroundColor: C.card,
    borderRadius: scale(12),
    padding: scale(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  bannerText: { color: C.text, fontSize: scale(14), flex: 1 },

  card: {
    backgroundColor: C.card,
    marginHorizontal: scale(20),
    marginTop: scale(12),
    borderRadius: scale(12),
    padding: scale(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  cardTitle: { color: C.text, fontWeight: '700', fontSize: scale(16), marginBottom: scale(8) },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: scale(8),
    gap: scale(14),
  },
  rowLabel: { fontSize: scale(14), fontWeight: '700', width: '50%' },
  rowValue: { color: C.text, fontSize: scale(14), flex: 1, textAlign: 'right', flexShrink: 1 },

  body: { color: C.text, fontSize: scale(14), lineHeight: scale(20) },

  skel: {
    height: scale(12),
    backgroundColor: '#22262c',
    borderRadius: 6,
    marginVertical: scale(6),
    width: '85%',
  },
});
