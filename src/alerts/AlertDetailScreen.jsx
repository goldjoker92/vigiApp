// src/alerts/AlertDetailScreen.jsx
// ---------------------------------------------------------
// VigiApp — Renderer commun : Public + Missing
// - Missing: ID = caseId (routage & notif), support alertId en fallback
// - kindHint prioritaire (deep link) puis Firestore, sinon fallback
// - Fetch multi-collections (incl. /missingCases) avec priorité dépendant du channel
// - Photo redacted + watermark sécurisé
// - Action bar & partage
// - Maps + recentrage + distance
// - Padding bas (ads/CTA)
// - 🔎 ULTRA LOG: traceId, steps, timings, garde-fous
// ---------------------------------------------------------

import { db } from '../../firebase';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  Image,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { BlurView } from 'expo-blur';

// ---------------------------------------------------------------------------
// LOGGING (ultra verbeux)
// ---------------------------------------------------------------------------
const TAG = '[ALERT_PAGE]';
const TAG_MISSING = '[MISSING_PAGE]';

const nowIso = () => new Date().toISOString();
const newTrace = (p = 'al') =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const msSince = (t0) => `${Math.max(0, Date.now() - t0)}ms`;
const L = {
  i: (tid, step, extra = {}) => console.log(TAG, 'ℹ', step, { t: nowIso(), traceId: tid, ...extra }),
  w: (tid, step, extra = {}) => console.warn(TAG, '⚠', step, { t: nowIso(), traceId: tid, ...extra }),
  e: (tid, step, extra = {}) => console.error(TAG, '❌', step, { t: nowIso(), traceId: tid, ...extra }),
  ok: (tid, step, extra = {}) => console.log(TAG, '✅', step, { t: nowIso(), traceId: tid, ...extra }),
};

// ---------------------------------------------------------------------------
// Layout / UI
// ---------------------------------------------------------------------------
const { width: W } = Dimensions.get('window');
const scale = (s) => Math.round((W / 375) * s);

// Palette
const C = {
  bg: '#0E0F10',
  card: '#17191C',
  text: '#E9ECF1',
  sub: '#AFB6C2',
  border: '#2A2E34',
  ok: '#22C55E',
  warn: '#F59E0B',
  danger: '#FF3B30',
  mute: '#9aa0a6',
};

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const safeCoord = (lat, lng) => (isNum(lat) && isNum(lng) ? { latitude: lat, longitude: lng } : null);

const normalizeToDate = (v) => {
  try {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (typeof v === 'object' && 'seconds' in v) return new Date(v.seconds * 1000);
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') return new Date(v);
    return null;
  } catch {
    return null;
  }
};
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

// Date courte J/M HH:mm (local)
const fmtDate = (inp) => {
  const d = normalizeToDate(inp);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const relTimePt = (date) => {
  const d = normalizeToDate(date);
  if (!d) return null;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 45 * 1000) return 'agora';
  const min = Math.round(diffMs / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dys = Math.round(h / 24);
  return `há ${dys} d`;
};

// distance (mètres)
function haversineM(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(isNum)) return NaN;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const distanciaTxt = (u, a) => {
  if (!u || !a) return '—';
  const d = haversineM(u.latitude, u.longitude, a.latitude, a.longitude);
  if (!isNum(d)) return '—';
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
};

// ---------------------------------------------------------------------------
// Mapping Firestore (compat sans régression)
// ---------------------------------------------------------------------------
const pickEstado = (a) => a?.uf || a?.estado || a?.state || a?.address?.uf || a?.endereco?.uf || '—';

const pickCidade = (a) => a?.cidade || a?.city || a?.address?.cidade || a?.endereco?.cidade || '—';

const pickCreated = (a) => a?.createdAt || a?.date || a?.submittedAt || null;
const pickLastReportAt = (a) => a?.lastReportAt || a?.updatedAt || null;

const pickReports = (a) =>
  a?.reportsCount ??
  a?.declaracoes ??
  (a?.declarantsMap ? Object.keys(a.declarantsMap).length : undefined) ??
  (Array.isArray(a?.reports) ? a.reports.length : undefined) ??
  1;

// 🔁 coords robustes (missingCases > device > anciens schémas)
const pickCoords = (a) => {
  // missingCases V1: location.lat/lng
  if (a?.location && isNum(a.location.lat) && isNum(a.location.lng)) {
    return safeCoord(a.location.lat, a.location.lng);
  }
  // fallback device submitMeta.geo
  if (a?.submitMeta?.geo && isNum(a.submitMeta.geo.lat) && isNum(a.submitMeta.geo.lng)) {
    return safeCoord(a.submitMeta.geo.lat, a.submitMeta.geo.lng);
  }
  // anciens schémas
  if (a?.location && isNum(a.location.latitude) && isNum(a.location.longitude)) {
    return safeCoord(a.location.latitude, a.location.longitude);
  }
  if (a?.geo) return safeCoord(a.geo.lat, a.geo.lng);
  if (a?.coords) return safeCoord(a.coords.lat, a.coords.lng);
  return safeCoord(a?.lat, a?.lng);
};

// 🏠 lib d’adresse (priorise missingCases.lastKnownAddress)
const buildEndereco = (a = {}) => {
  // 1) missingCases V1
  const m = a.lastKnownAddress;
  if (m && (m.rua || m.cidade || m.uf || m.cep)) {
    const rua = (m.rua || '').trim();
    const numero = (m.numero || '').trim();
    const cidade = (m.cidade || '').trim();
    const uf = (m.uf || '').toString().trim().toUpperCase();
    const cep = (m.cep || '').trim();

    const left = [rua, numero].filter(Boolean).join(', ');
    const rightParts = [];
    if (cidade) rightParts.push(uf ? `${cidade}/${uf}` : cidade);
    if (cep) rightParts.push(cep);

    const finalParts = [left, rightParts.join(' - ')].filter(Boolean);
    if (finalParts.length) return finalParts.join(' - ');
  }

  // 2) anciens champs textuels précompilés
  if (typeof a.endereco === 'string' && a.endereco.trim()) return a.endereco.trim();
  if (typeof a.ruaNumero === 'string' && a.ruaNumero.trim()) return a.ruaNumero.trim();

  // 3) schémas "address" / bruts
  const src = a.address || a.endereco || a || {};
  const rua2 = (src.rua || src.street || '').trim();
  const numero2 = (src.numero || src.number || '').trim();
  const cidade2 = (src.cidade || src.city || '').trim();
  const uf2 = (src.uf || src.estado || '').toString().trim().toUpperCase();
  const cep2 = (src.cep || src.zip || '').trim();

  const left2 = [rua2, numero2].filter(Boolean).join(', ');
  const right2 = [cidade2 && `${cidade2}${uf2 ? `/${uf2}` : ''}`, cep2].filter(Boolean).join(' - ');

  const out = [left2, right2].filter(Boolean).join(' - ');
  return out || '—';
};

// Δ calcul de région depuis rayon
const radiusToDeltas = (radiusM, lat) => {
  const R_LAT = 111000;
  const latDelta = Math.max(0.0025, (Number(radiusM || 0) / R_LAT) * 2.2);
  const lngDelta = Math.max(0.0025, latDelta / Math.max(0.25, Math.cos(((lat || 0) * Math.PI) / 180)));
  return { latitudeDelta: latDelta, longitudeDelta: lngDelta };
};

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------
const getKindMeta = (kind) => {
  switch ((kind || '').toLowerCase()) {
    case 'child':
      return { label: 'Criança desaparecida', color: C.danger, icon: 'baby-face-outline' };
    case 'animal':
      return { label: 'Animal perdido', color: C.warn, icon: 'paw' };
    case 'object':
      return { label: 'Objeto perdido', color: C.mute, icon: 'package-variant' };
    default:
      return { label: 'Alerta público', color: C.ok, icon: 'alert-decagram-outline' };
  }
};

// Règle: kindHint > Firestore > heuristique > public
const pickKind = (a = {}, channel, kindHint, tid) => {
  if (kindHint && typeof kindHint === 'string') {
    L.i(tid, 'KIND/HINT', { kindHint });
    return kindHint.toLowerCase();
  }

  const fromData = a.kind || a.tipo || a.categoria || a.type || a?.missing?.kind || a?.meta?.kind;

  if (fromData) {
    const k = String(fromData).toLowerCase();
    L.i(tid, 'KIND/FS', { k });
    return k;
  }

  const looksMissing =
    !!(a.photoRedacted || a.photoBlur || a?.photos?.redacted || a?.media?.photoRedacted || a?.images?.redacted) ||
    !!(a.childDobISO || a.fullName || a.child || a.animal || a.object) ||
    (typeof a.category === 'string' && /missing|desaparecid/i.test(a.category)) ||
    (typeof a.__source === 'string' && a.__source.toLowerCase().includes('missing'));

  if (channel === 'missing' || looksMissing) {
    L.i(tid, 'KIND/HEURISTIC_MISSING', { channel, looksMissing });
    return 'child';
  }

  L.i(tid, 'KIND/DEFAULT_PUBLIC', { channel });
  return 'public';
};

// ---------------------------------------------------------------------------
// Deep link & share
// ---------------------------------------------------------------------------
const buildDeepLink = (channel, id) => {
  const base = channel === 'missing' ? 'vigiapp://missing-public-alerts' : 'vigiapp://public-alerts';
  return `${base}/${encodeURIComponent(String(id || ''))}`;
};

const STORE_FALLBACK = Platform.select({
  ios: 'https://apps.apple.com/app/id0000000000', // TODO
  android: 'https://play.google.com/store/apps/details?id=com.vigiapp', // TODO
  default: 'https://vigiapp.example.com', // TODO
});

const buildShareText = (kind, channel, id) => {
  const link = buildDeepLink(channel, id);
  const intro =
    kind === 'child'
      ? 'Criança desaparecida — clique para ver no VigiApp'
      : kind === 'animal'
      ? 'Animal perdido — clique para ver no VigiApp'
      : kind === 'object'
      ? 'Objeto perdido — clique para ver no VigiApp'
      : 'Alerta no seu bairro — abrir no VigiApp';
  const privacy = 'A visualização completa (foto e detalhes) está protegida. Abra o VigiApp para ajudar.';
  return `${intro}\n\n${privacy}\n\n${link}`;
};

// ---------------------------------------------------------------------------
// Fetch multi-collections (incl. /missingCases) avec priorité dépendant du channel
// ---------------------------------------------------------------------------
async function fetchAlertDoc(id, channel, tid) {
  const missingFirst = [
    'missingCases', // priorité pour channel 'missing'
    'missingPublicAlerts',
    'missing-public-alerts',
    'missingAlerts',
    'publicAlerts',
    'missing',
    'alerts',
    'cases',
  ];
  const publicFirst = [
    'publicAlerts',
    'alerts',
    'missingCases',
    'missingPublicAlerts',
    'missing-public-alerts',
    'missingAlerts',
    'cases',
    'missing',
  ];
  const CANDIDATES = channel === 'missing' ? missingFirst : publicFirst;

  L.i(tid, 'FETCH/BEGIN', { id, channel, tries: CANDIDATES.length });
  const t0 = Date.now();

  for (const coll of CANDIDATES) {
    try {
      const snap = await getDoc(doc(db, coll, id));
      if (snap.exists()) {
        const data = { id: snap.id, __source: coll, ...snap.data() };
        const hasLoc = !!pickCoords(data);
        L.ok(tid, 'FETCH/HIT', { coll, hasLoc, dt: msSince(t0) });
        return data;
      } else {
        L.w(tid, 'FETCH/MISS', { coll });
      }
    } catch (e) {
      L.w(tid, 'FETCH/ERR', { coll, err: e?.message || String(e) });
    }
  }

  L.w(tid, 'FETCH/NOT_FOUND', { id, dt: msSince(t0) });
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AlertDetailScreen({
  channel = 'public',
  alertId,
  caseId,
  kindHint, // "animal" | "child" | "object" (depuis la notif / query param)
}) {
  const router = useRouter();
  const traceIdRef = useRef(newTrace('al'));
  const mountTsRef = useRef(Date.now());

  // ID canonique : caseId (missing) > alertId (public/fallback)
  const id = String((caseId || alertId || '')).split('?')[0];

  const [raw, setRaw] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  const [tick, setTick] = useState(0);
  const mapRef = useRef(null);

  // MOUNT
  useEffect(() => {
    const tid = traceIdRef.current;
    L.i(tid, 'MOUNT', { channel, id, kindHint });
    return () => {
      L.w(tid, 'UNMOUNT', { alive: msSince(mountTsRef.current) });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch doc
  useEffect(() => {
    const tid = traceIdRef.current;
    if (!id) {
      L.w(tid, 'NO_ID_IN_PROPS', { channel, alertId, caseId });
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const data = await fetchAlertDoc(id, channel, tid);
        if (!mounted) return;
        setRaw(data);
        L.ok(tid, 'DATA/SET', { present: !!data, source: data?.__source });
      } catch (e) {
        L.e(tid, 'FETCH/THROW', { err: e?.message || String(e) });
      }
    })();
    return () => {
      mounted = false;
      L.i(tid, 'FETCH/CANCELLED');
    };
  }, [id, channel]);

  // Geo user
  useEffect(() => {
    const tid = traceIdRef.current;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        L.i(tid, 'GEO/PERM', { status });
        if (status !== 'granted') return;
        const t0 = Date.now();
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setUserLoc({ latitude: coords.latitude, longitude: coords.longitude });
          L.ok(tid, 'GEO/OK', { lat: coords.latitude, lng: coords.longitude, dt: msSince(t0) });
        }
      } catch (e) {
        L.w(tid, 'GEO/ERR', { err: e?.message || String(e) });
      }
    })();
    return () => {
      cancelled = true;
      L.i(tid, 'GEO/CANCELLED');
    };
  }, []);

  // Tick pour badge "Atualizado há …"
  useEffect(() => {
    const tid = traceIdRef.current;
    const it = setInterval(() => setTick((n) => n + 1), 30000);
    L.i(tid, 'TICK/START', { intervalMs: 30000 });
    return () => {
      clearInterval(it);
      L.i(tid, 'TICK/STOP');
    };
  }, []);

  const kind = useMemo(
    () => pickKind(raw || {}, channel, kindHint, traceIdRef.current),
    [raw, channel, kindHint],
  );
  const kindMeta = getKindMeta(kind);

  // Mapping UI
  const alert = useMemo(() => {
    const d = raw || {};
    const coords = pickCoords(d);
    const radiusM = Number(d?.radius_m ?? d?.radius ?? d?.radiusMeters ?? 1000);

    const out = {
      id,
      kind,
      tipo: d?.tipo || d?.categoria || d?.type || kindMeta.label,

      // Adresse/ville/état
      endereco: buildEndereco(d || {}),
      cidade: pickCidade(d || {}),
      estado: pickEstado(d || {}),

      // Dates (priorité lastSeenAt pour missingCases)
      createdAt: d?.lastSeenAt || pickCreated(d || {}),
      lastReportAt: pickLastReportAt(d || {}),
      expiresAt: d?.expiresAt || null,

      // Compteurs / statut
      reports: pickReports(d || {}),
      status: d?.status || null,

      // Localisation
      coords,
      radiusM,

      // Texte / média
      descricao: (d && (d.descricao || d.description || d?.context?.description)) || '—',
      extraInfo: d?.context?.extraInfo || null,
      photoRedacted:
        d?.photoRedacted ||
        d?.photoBlur ||
        d?.photos?.redacted ||
        d?.media?.photoRedacted ||
        d?.images?.redacted ||
        d?.media?.photo || // parfois redacted=photo
        null,
      photo:
        d?.photo ||
        d?.photoUrl ||
        d?.photos?.original ||
        d?.media?.photo ||
        d?.images?.original ||
        null,

      // Badges UI
      _locSource: d?.location?.source || (d?.submitMeta?.geo ? 'gps' : null),
      _addrConf: isNum(d?.location?.addressConfidence) ? d.location.addressConfidence : null,
    };

    L.i(traceIdRef.current, 'MAP/ALERT', {
      id: out.id,
      src: d?.__source,
      hasCoords: !!out.coords,
      radiusM: out.radiusM,
      locSource: out._locSource,
      addrConf: out._addrConf,
      status: out.status,
    });
    return out;
  }, [raw, id, kind, kindMeta.label]);

  const updatedChip = useMemo(
    () => relTimePt(alert.lastReportAt || alert.createdAt) || null,
    [alert.lastReportAt, alert.createdAt, tick],
  );

  const region = useMemo(() => {
    if (!alert.coords) return null;
    const deltas = radiusToDeltas(alert.radiusM, alert.coords.latitude);
    const r = { ...alert.coords, ...deltas };
    L.i(traceIdRef.current, 'MAP/REGION_COMPUTED', { r });
    return r;
  }, [alert.coords, alert.radiusM]);

  const handleRecenter = useCallback(() => {
    const tid = traceIdRef.current;
    if (!region) {
      L.w(tid, 'MAP/RECENTER/NO_REGION');
      return;
    }
    try {
      mapRef.current?.animateToRegion(region, 300);
      L.ok(tid, 'MAP/RECENTER');
    } catch (e) {
      L.w(tid, 'MAP/RECENTER/ERR', { err: e?.message || String(e) });
    }
  }, [region]);

  if (!raw) {
    return (
      <SafeAreaView style={S.container}>
        <View style={S.header}>
          <Text style={S.title}>Alertas</Text>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: scale(96) }}>
          {/* Header */}
          <View style={S.header}>
            <View style={S.headerLine}>
              <Icon name={kindMeta.icon} size={scale(18)} color={kindMeta.color} />
              <Text style={[S.title, { color: kindMeta.color }]}>{kindMeta.label}</Text>

              {/* Chip "Atualizado há …" */}
              {updatedChip ? (
                <View style={S.chip}>
                  <Icon name="update" size={scale(12)} color={C.bg} />
                  <Text style={S.chipText}>Atualizado {updatedChip}</Text>
                </View>
              ) : null}

              {/* Chip source localisation (address/gps) */}
              {alert._locSource ? (
                <View
                  style={[
                    S.chip,
                    { backgroundColor: alert._locSource === 'address' ? C.ok : C.warn, marginLeft: 6 },
                  ]}
                >
                  <Icon
                    name={alert._locSource === 'address' ? 'home-map-marker' : 'crosshairs-gps'}
                    size={scale(12)}
                    color={C.bg}
                  />
                  <Text style={S.chipText}>
                    {alert._locSource === 'address' ? 'Endereço' : 'GPS aprox'}
                    {isNum(alert._addrConf) ? ` · conf ${Math.round(alert._addrConf * 100)}%` : ''}
                  </Text>
                </View>
              ) : null}

              {/* Chip status si ≠ validated */}
              {alert.status && String(alert.status).toLowerCase() !== 'validated' ? (
                <View style={[S.chip, { backgroundColor: C.danger, marginLeft: 6 }]}>
                  <Icon name="alert-circle" size={scale(12)} color={C.bg} />
                  <Text style={S.chipText}>{String(alert.status).toUpperCase()}</Text>
                </View>
              ) : null}
            </View>

            {/* Action Bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.actionBarScroll}>
              <ActionBtn label="Compartilhar" icon="share-variant" onPress={() => onShare(alert, channel)} />
              <ActionBtn label="WhatsApp" icon="whatsapp" onPress={() => onWhatsAppShare(alert, channel)} />
              <ActionBtnPrimary
                label="Tenho informações"
                icon="hand-heart"
                color={kindMeta.color}
                onPress={() => onTenhoInfos(alert, router)}
              />
            </ScrollView>
          </View>

          {/* Rendu conditionnel */}
          {kind === 'child' || kind === 'animal' || kind === 'object' ? (
            <MissingAlertContent
              alert={alert}
              userLoc={userLoc}
              region={region}
              mapRef={mapRef}
              onRecenter={handleRecenter}
            />
          ) : (
            <PublicIncidentContent
              alert={alert}
              userLoc={userLoc}
              region={region}
              mapRef={mapRef}
              onRecenter={handleRecenter}
              distance={distance}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Missing
// ---------------------------------------------------------------------------
function MissingAlertContent({ alert, userLoc, region, mapRef, onRecenter }) {
  console.log(TAG_MISSING, 'render', { id: alert.id, kind: alert.kind });

  return (
    <>
      {alert.photoRedacted ? (
        <View style={S.photoWrap}>
          <SecureWatermarkedImage
            imageUri={alert.photoRedacted || alert.photo}
            alertId={alert.id}
            photographerId={undefined}
            showBlur={true}
            enableDefocus={true}
            style={S.photoPress}
          />
        </View>
      ) : null}

      {region ? (
        <View style={S.mapWrap}>
          <MapView ref={mapRef} style={S.map} initialRegion={region}>
            <Marker coordinate={alert.coords} title="Último local visto" pinColor="#ff5656" />
            <Circle
              center={alert.coords}
              radius={alert.radiusM}
              strokeColor="rgba(255,86,86,0.9)"
              strokeWidth={2}
              fillColor="rgba(255,86,86,0.18)"
            />
            {userLoc && <Marker coordinate={userLoc} title="Você" pinColor={C.ok} />}
          </MapView>
          <Pressable onPress={onRecenter} style={({ pressed }) => [S.recenter, pressed && { opacity: 0.85 }]}>
            <Icon name="crosshairs-gps" size={scale(18)} color={C.bg} />
          </Pressable>
        </View>
      ) : (
        <View style={S.banner}>
          <Icon name="map-marker-off" size={scale(18)} color={C.sub} />
          <Text style={S.bannerText}>Localização indisponível para este caso.</Text>
        </View>
      )}

      <View style={S.card}>
        <Row label="📍 Último visto" value={alert.endereco} multiline color={C.warn} />
        <Row label="🏙️ Cidade" value={alert.cidade} color={C.ok} />
        <Row label="🗺️ Estado" value={alert.estado} color={C.mute} />
        <Row label="🕒 Data & hora" value={fmtDate(alert.createdAt)} color={C.ok} />
        {alert.expiresAt ? (
          <Row label="⏳ Expira em" value={fmtDate(alert.expiresAt)} color={C.warn} />
        ) : null}
      </View>

      <View style={S.card}>
        <Text style={[S.cardTitle, { color: C.danger }]}>Descrição</Text>
        <Text style={S.body}>{alert.descricao}</Text>
      </View>

      {alert.extraInfo ? (
        <View style={S.card}>
          <Text style={[S.cardTitle, { color: C.text }]}>Informações adicionais</Text>
          <Text style={S.body}>{alert.extraInfo}</Text>
        </View>
      ) : null}

      <View style={[S.row, { justifyContent: 'space-between', marginHorizontal: scale(20) }]}>
        <TinyBtn
          icon="check-circle-outline"
          label="Marcar como visto"
          onPress={() => {
            console.log(TAG_MISSING, 'visto_mark', { id: alert.id });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        />
        <TinyBtn icon="crosshairs-gps" label="Recentrar mapa" onPress={onRecenter} />
      </View>

      <View style={[S.note, { marginHorizontal: scale(20) }]}>
        <Text style={S.noteTxt}>Informações sensíveis — VigiApp protege menores. Evite divulgação inadequada.</Text>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
function PublicIncidentContent({ alert, userLoc, region, mapRef, onRecenter, distance }) {
  return (
    <>
      {region ? (
        <View style={S.mapWrap}>
          <MapView ref={mapRef} style={S.map} initialRegion={region}>
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
          <Pressable onPress={onRecenter} style={({ pressed }) => [S.recenter, pressed && { opacity: 0.85 }]}>
            <Icon name="crosshairs-gps" size={scale(18)} color={C.bg} />
          </Pressable>
        </View>
      ) : (
        <View style={S.banner}>
          <Icon name="map-marker-off" size={scale(18)} color={C.sub} />
          <Text style={S.bannerText}>Localização indisponível para este alerta.</Text>
        </View>
      )}

      <View style={S.card}>
        <Row label="🚨 Tipo" value={alert.tipo} color={C.danger} />
        <Row label="📍 Endereço" value={alert.endereco} color={C.warn} multiline />
        <Row label="🏙️ Cidade" value={alert.cidade} color={C.ok} />
        <Row label="🗺️ Estado" value={alert.estado} color={C.mute} />
        <Row label="📏 Distância" value={distance || '—'} color={C.warn} />
        <Row label="🕒 Data & hora" value={fmtDate(alert.createdAt)} color={C.ok} />
        <Row label="👥 Declarações" value={`${alert.reports}`} color={C.ok} />
      </View>

      <View style={S.card}>
        <Text style={[S.cardTitle, { color: C.text }]}>Descrição</Text>
        <Text style={S.body}>{alert.descricao}</Text>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function onShare(alert, channel) {
  const tid = newTrace('share');
  try {
    await Haptics.selectionAsync();
    const message = buildShareText(alert.kind, channel, alert.id);
    L.i(tid, 'SHARE/CLICK', { id: alert.id, kind: alert.kind, channel });
    await Share.share({ message });
    L.ok(tid, 'SHARE/DONE');
  } catch (e) {
    L.w(tid, 'SHARE/ERR', { err: e?.message || e });
  }
}
async function onWhatsAppShare(alert, channel) {
  const tid = newTrace('wa');
  try {
    await Haptics.selectionAsync();
    const text = encodeURIComponent(buildShareText(alert.kind, channel, alert.id));
    const url = `whatsapp://send?text=${text}`;
    const supported = await Linking.canOpenURL(url);
    L.i(tid, 'WA/CLICK', { id: alert.id, supported });
    if (supported) {
      await Linking.openURL(url);
      L.ok(tid, 'WA/OPENED');
    } else {
      await Linking.openURL(STORE_FALLBACK);
      L.w(tid, 'WA/FALLBACK_STORE');
    }
  } catch (e) {
    L.w(tid, 'WA/ERR', { err: e?.message || e });
  }
}
async function onTenhoInfos(alert /* , router */) {
  const tid = newTrace('haveinfo');
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    L.i(tid, 'INFO/CLICK', { id: alert.id, kind: alert.kind });
    // TODO: route vers le flux sécurisé/chat
  } catch (e) {
    L.w(tid, 'INFO/ERR', { err: e?.message || e });
  }
}

// ---------------------------------------------------------------------------
// UI atoms
// ---------------------------------------------------------------------------
function ActionBtn({ label, icon, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View style={[S.actionBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={S.btnInner}>
            <Icon name={icon} size={scale(18)} color={C.text} />
            <Text style={S.actionTxt}>{label}</Text>
          </View>
          <View style={[S.touchOverlay, { opacity: pressed ? 0.14 : 0 }]} pointerEvents="none" />
        </View>
      )}
    </Pressable>
  );
}
function ActionBtnPrimary({ label, icon, onPress, color }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View style={[S.actionBtnPrimary, { backgroundColor: color }, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={S.btnInner}>
            <Icon name={icon} size={scale(18)} color={C.bg} />
            <Text style={S.actionTxtPrimary}>{label}</Text>
          </View>
          <View style={[S.touchOverlay, { opacity: pressed ? 0.14 : 0 }]} pointerEvents="none" />
        </View>
      )}
    </Pressable>
  );
}
function TinyBtn({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View style={[S.tinyBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name={icon} size={scale(14)} color={C.text} />
            <Text style={S.tinyTxt}>{label}</Text>
          </View>
          <View style={[S.touchOverlay, { opacity: pressed ? 0.12 : 0 }]} pointerEvents="none" />
        </View>
      )}
    </Pressable>
  );
}
function Row({ label, value, color, multiline = false }) {
  return (
    <View style={S.row}>
      <Text style={[S.rowLabel, { color }]} numberOfLines={3} ellipsizeMode="clip">
        {label}
      </Text>
      <Text style={[S.rowValue, multiline && { textAlign: 'left', lineHeight: scale(20) }]}>{value ?? '—'}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingTop: scale(16), paddingBottom: scale(8), gap: scale(10) },
  headerLine: {
    paddingHorizontal: scale(20),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    flexWrap: 'wrap',
  },
  title: { fontSize: scale(22), fontWeight: '800' },
  chip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    backgroundColor: C.warn,
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    borderRadius: 999,
  },
  chipText: { color: C.bg, fontWeight: '700', fontSize: scale(12) },

  actionBarScroll: { paddingHorizontal: scale(20), paddingVertical: scale(8), alignItems: 'center' },
  btnInner: { flexDirection: 'row', alignItems: 'center' },

  actionBtn: {
    position: 'relative',
    marginRight: scale(10),
    borderRadius: 999,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingHorizontal: scale(12),
    paddingVertical: scale(10),
    overflow: 'hidden',
  },
  actionTxt: { color: C.text, fontWeight: '700', fontSize: scale(13), marginLeft: scale(6) },

  actionBtnPrimary: {
    position: 'relative',
    marginRight: scale(10),
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D5D7DB',
    paddingHorizontal: scale(14),
    paddingVertical: scale(10),
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    overflow: 'hidden',
  },
  actionTxtPrimary: { color: C.bg, fontWeight: '800', fontSize: scale(13) },

  touchOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffff', borderRadius: 999 },

  tinyBtn: {
    position: 'relative',
    backgroundColor: C.card,
    paddingHorizontal: scale(10),
    paddingVertical: scale(8),
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
  },
  tinyTxt: { color: C.text, marginLeft: scale(6), fontSize: scale(12), fontWeight: '700' },

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

  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: scale(8), gap: scale(14) },
  rowLabel: { fontSize: scale(14), fontWeight: '700', width: '50%' },
  rowValue: { color: C.text, fontSize: scale(14), flex: 1, textAlign: 'right', flexShrink: 1 },

  body: { color: C.text, fontSize: scale(14), lineHeight: scale(20) },

  skel: { height: scale(12), backgroundColor: '#22262c', borderRadius: 6, marginVertical: scale(6), width: '85%' },

  photoWrap: {
    marginHorizontal: scale(20),
    marginTop: scale(12),
    borderRadius: scale(14),
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: '#101216',
  },
  photoPress: { width: '100%', height: Math.max(scale(240), 240) },

  note: {
    backgroundColor: '#121418',
    padding: scale(12),
    borderRadius: scale(8),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    marginTop: scale(8),
  },
  noteTxt: { color: C.sub, fontSize: scale(12) },
});

// ---------------------------------------------------------------------------
// SecureWatermarkedImage
// ---------------------------------------------------------------------------
function SecureWatermarkedImage({
  imageUri,
  alertId,
  photographerId,
  showBlur = true,
  enableDefocus = true,
  style,
}) {
  const [isBlurred, setIsBlurred] = useState(Boolean(showBlur));
  const wmText = `vigiApp ${alertId}`;
  const partialPhotographer = photographerId ? `p:${String(photographerId).slice(0, 6)}` : null;

  const microLines = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 14; i++) {
      arr.push({
        key: `m-${i}`,
        top: `${(i / 14) * 120 - 10}%`,
        rotate: -22 + (i % 3),
        opacity: 0.14 + (i % 2 ? 0.02 : 0),
        offsetX: i % 2 === 0 ? -6 : 6,
      });
    }
    return arr;
  }, []);

  const onTap = useCallback(() => {
    console.log('[IMG_WM] tapped', { alertId, isBlurred });
    if (enableDefocus && isBlurred) {
      Haptics.selectionAsync();
      setIsBlurred(false);
    }
  }, [enableDefocus, isBlurred, alertId]);

  return (
    <Pressable onPress={onTap} accessibilityLabel="Imagem protegida">
      {() => (
        <View style={[{ width: '100%', height: Math.max(scale(240), 240) }, style]}>
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          {isBlurred ? <BlurView intensity={62} tint="dark" style={StyleSheet.absoluteFill} /> : null}

          <View style={wmStyles.microWrap} pointerEvents="none">
            {microLines.map((m) => (
              <Text
                key={m.key}
                numberOfLines={1}
                style={[
                  wmStyles.microText,
                  { top: m.top, transform: [{ translateX: m.offsetX }, { rotate: `${m.rotate}deg` }], opacity: m.opacity },
                ]}
              >
                {wmText}
              </Text>
            ))}
          </View>

          <View style={wmStyles.hatchWrap} pointerEvents="none">
            {Array.from({ length: 12 }).map((_, i) => (
              <View
                key={`h-${i}`}
                style={[wmStyles.hatchLine, { top: `${(i / 12) * 100}%`, opacity: i % 2 === 0 ? 0.06 : 0.04 }]}
              />
            ))}
          </View>

          <View style={wmStyles.corner} pointerEvents="none">
            <Text style={wmStyles.cornerId}>ID: {String(alertId).slice(0, 18)}</Text>
            {partialPhotographer && <Text style={wmStyles.cornerSmall}>{partialPhotographer}</Text>}
          </View>

          {isBlurred ? (
            <View style={wmStyles.ribbon} pointerEvents="none">
              <Text style={wmStyles.ribbonTxt}>Imagem protegida — toque para ajudar</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const wmStyles = StyleSheet.create({
  microWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  microText: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.16)',
    fontSize: scale(11),
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hatchWrap: { ...StyleSheet.absoluteFillObject },
  hatchLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  corner: {
    position: 'absolute',
    right: scale(8),
    top: scale(8),
    paddingHorizontal: scale(8),
    paddingVertical: scale(5),
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  cornerId: { color: 'rgba(255,255,255,0.9)', fontSize: scale(11), fontWeight: '700', letterSpacing: 0.6 },
  cornerSmall: { color: 'rgba(255,255,255,0.7)', fontSize: scale(9), marginTop: scale(2) },
  ribbon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: scale(8),
    paddingHorizontal: scale(12),
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbonTxt: { color: '#fff', fontSize: scale(12), fontWeight: '700' },
});
