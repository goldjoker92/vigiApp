// app/public-alerts/[id].jsx
// ---------------------------------------------------------
// VigiApp — Alertas Públicas (UI restaurée)
// - Pin rouge + cercle de propagation (radius_m)
// - Card sombre avec mêmes labels/icônes que ta version
// - Adresse multi-lignes, date crééeAt -> DD/MM HH:mm (fallback date)
// - Distance user↔incident + loader
// - Bouton recentrage rouge, logs clairs
// ---------------------------------------------------------

import { db } from '../../firebase';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
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

// --- utils
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const safeCoord = (lat, lng) =>
  isNum(lat) && isNum(lng) ? { latitude: lat, longitude: lng } : null;

const normalizeToDate = (v) => {
  try {
    if (!v) {
      return null;
    }
    if (v instanceof Date) {
      return v;
    }
    if (typeof v?.toDate === 'function') {
      return v.toDate();
    }
    if (typeof v === 'object' && 'seconds' in v) {
      return new Date(v.seconds * 1000);
    }
    if (typeof v === 'number') {
      return new Date(v);
    }
    if (typeof v === 'string') {
      return new Date(v);
    }
    return null;
  } catch {
    return null;
  }
};
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const fmtDate = (inp) => {
  const d = normalizeToDate(inp);
  if (!d || Number.isNaN(d.getTime())) {
    return '—';
  }
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function haversineM(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(isNum)) {
    return NaN;
  }
  const R = 6371000,
    toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1),
    dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const distanciaTxt = (u, a) => {
  if (!u || !a) {
    return '—';
  }
  const d = haversineM(u.latitude, u.longitude, a.latitude, a.longitude);
  if (!isNum(d)) {
    return '—';
  }
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
};

// --- mapping Firestore (compatible avec tes champs existants)
const pickTipo = (a) => a?.tipo || a?.categoria || a?.type || '—';
const pickEstado = (a) => a?.uf || a?.estado || a?.state || '—';
const pickCidade = (a) => a?.cidade || a?.city || '—';
const pickCreated = (a) => a?.createdAt || a?.date || null;
const pickReports = (a) =>
  a?.reportsCount ?? a?.declaracoes ?? (a?.declarantsMap ? Object.keys(a.declarantsMap).length : 1);
const pickCoords = (a) => {
  if (a?.location) {
    return safeCoord(a.location.latitude, a.location.longitude);
  }
  return safeCoord(a?.lat, a?.lng);
};
const buildEndereco = (a) => {
  // priorité: `endereco`/`ruaNumero` si présent
  if (typeof a?.endereco === 'string' && a.endereco.trim()) {
    return a.endereco.trim();
  }
  if (typeof a?.ruaNumero === 'string' && a.ruaNumero.trim()) {
    return a.ruaNumero.trim();
  }
  const rua = a?.rua || a?.street || '';
  const numero = a?.numero || a?.number || '';
  const left = [rua, numero].filter(Boolean).join(', ');
  const right = [a?.cidade && `${a.cidade}/${a?.uf || a?.estado || ''}`.replace(/\/$/, ''), a?.cep]
    .filter(Boolean)
    .join(' - ');
  const final = [left, right].filter(Boolean).join(' - ');
  return final || '—';
};

// Rayon → deltas carte (pour bien voir le cercle)
function radiusToDeltas(radiusM, lat) {
  const R_LAT = 111000; // ~m par degré lat
  const latDelta = Math.max(0.0025, (radiusM / R_LAT) * 2.2);
  const lngDelta = Math.max(
    0.0025,
    latDelta / Math.max(0.25, Math.cos(((lat || 0) * Math.PI) / 180)),
  );
  return { latitudeDelta: latDelta, longitudeDelta: lngDelta };
}

// Loader 3 points
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

// --- Firestore
async function fetchAlertDoc(id) {
  console.log('[ALERT_PAGE] fetch', id);
  const snap = await getDoc(doc(db, 'publicAlerts', id));
  if (!snap.exists()) {
    console.warn('[ALERT_PAGE] not found', id);
    return null;
  }
  const data = { id: snap.id, ...snap.data() };
  console.log('[ALERT_PAGE] data', data);
  return data;
}

// =========================================================
export default function PublicAlertPage() {
  const { id } = useLocalSearchParams();
  const [raw, setRaw] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  const mapRef = useRef(null);

  // fetch
  useEffect(() => {
    (async () => {
      try {
        const d = await fetchAlertDoc(id);
        setRaw(d);
      } catch (e) {
        console.error('[ALERT_PAGE] fetch error', e?.message || e);
      }
    })();
  }, [id]);

  // geoloc
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLoc({ latitude: coords.latitude, longitude: coords.longitude });
      } catch (e) {
        console.warn('[ALERT_PAGE] geo error', e?.message || e);
      }
    })();
  }, []);

  // mapping (safe même si raw null)
  const alert = {
    tipo: pickTipo(raw || {}),
    endereco: buildEndereco(raw || {}),
    cidade: pickCidade(raw || {}),
    estado: pickEstado(raw || {}),
    createdAt: pickCreated(raw || {}),
    reports: pickReports(raw || {}),
    coords: pickCoords(raw || {}),
    radiusM: Number(raw?.radius_m ?? raw?.radius ?? 1000),
    descricao: (raw && (raw.descricao || raw.description)) || '—',
  };

  // région carte
  const region = useMemo(() => {
    if (!alert.coords) {
      return null;
    }
    const deltas = radiusToDeltas(alert.radiusM, alert.coords.latitude);
    return { ...alert.coords, ...deltas };
  }, [alert.coords, alert.radiusM]);

  // skeleton simple
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

          {/* Map + cercle propagation + bouton recentrage */}
          {region ? (
            <View style={S.mapWrap}>
              <MapView ref={mapRef} style={S.map} initialRegion={region} pointerEvents="auto">
                <Marker
                  coordinate={alert.coords}
                  title={alert.tipo || 'Incidente'}
                  pinColor="red"
                />
                <Circle
                  center={alert.coords}
                  radius={alert.radiusM}
                  strokeColor="rgba(255,0,0,0.85)"
                  strokeWidth={2}
                  fillColor="rgba(255,0,0,0.18)"
                />
                {userLoc && <Marker coordinate={userLoc} title="Você" pinColor={C.ok} />}
              </MapView>
              <Pressable
                onPress={() => mapRef.current?.animateToRegion(region, 300)}
                style={({ pressed }) => [S.recenter, pressed && { opacity: 0.85 }]}
              >
                <Icon name="crosshairs-gps" size={scale(18)} color={C.bg} />
              </Pressable>
            </View>
          ) : (
            <View style={S.banner}>
              <Icon name="map-marker-off" size={scale(18)} color={C.sub} />
              <Text style={S.bannerText}>Localização indisponível para este alerta.</Text>
            </View>
          )}

          {/* Détails – mêmes lignes que ton UI */}
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
