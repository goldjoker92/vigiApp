// app/public-alerts/[id].jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

import { db } from '@/firebase';

/* ===================== THEME ===================== */
const theme = {
  bg: '#0B0F14',
  card: '#12171E',
  cardAlt: '#141B24',
  text: '#E7EEF7',
  textMuted: '#94A2B8',
  accent: '#0AA8FF',
  warn: '#FFC857',
  danger: '#FF5A60',
  divider: 'rgba(255,255,255,0.06)',
};

/* ===================== HELPERS ===================== */
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ~300–400 m de fenêtre par défaut
const DEFAULT_DELTA = 0.003;

// Haversine (m)
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fmtDistance(m) {
  if (!Number.isFinite(m)) {return '—';}
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/* ===================== PAGE ===================== */
export default function PublicAlertDetail() {
  const router = useRouter();
  const { id: alertIdParam } = useLocalSearchParams();
  const alertId = useMemo(() => String(alertIdParam || '').trim(), [alertIdParam]);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [data, setData] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [firestorePath, setFirestorePath] = useState('');

  // user location (optionnelle)
  const [userLoc, setUserLoc] = useState(null);
  const [locDenied, setLocDenied] = useState(false);

  // carte
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);

  const isExpired = useCallback((docData) => {
    const statusExpired = docData?.status === 'expired';
    const expiresAtDate = docData?.expiresAt?.toDate ? docData.expiresAt.toDate() : null;
    const timeExpired = expiresAtDate ? expiresAtDate.getTime() < Date.now() : false;
    return statusExpired || timeExpired;
  }, []);

  const fetchOnce = useCallback(async () => {
    if (!alertId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    try {
      const ref = doc(db, 'publicAlerts', alertId);
      setFirestorePath(`publicAlerts/${alertId}`);
      const snap = await getDoc(ref);

      setLastCheckedAt(new Date().toISOString());

      if (!snap.exists()) {
        setNotFound(true);
        setExpired(false);
        setData(null);
        return;
      }

      const docData = snap.data();
      setExpired(isExpired(docData));
      setNotFound(false);
      setData({ id: snap.id, ...docData });
    } catch (e) {
      console.warn('[public-alerts/[id]] getDoc error:', e);
      setNotFound(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [alertId, isExpired]);

  // Live updates (temps réel)
  useEffect(() => {
    if (!alertId) {return;}
    const ref = doc(db, 'publicAlerts', alertId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setLastCheckedAt(new Date().toISOString());
        if (!snap.exists()) {
          setNotFound(true);
          setExpired(false);
          setData(null);
          return;
        }
        const docData = snap.data();
        setExpired(isExpired(docData));
        setNotFound(false);
        setData({ id: snap.id, ...docData });
      },
      (err) => console.warn('[public-alerts/[id]] onSnapshot:', err)
    );
    return () => unsub();
  }, [alertId, isExpired]);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  // demande de position (soft-fail si refusé)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocDenied(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = pos?.coords || {};
        if (isFiniteNum(latitude) && isFiniteNum(longitude)) {
          setUserLoc({ lat: latitude, lng: longitude });
        }
      } catch (e) {
        // pas bloquant
        setLocDenied(true);
      }
    })();
  }, []);

  // zoom auto : par défaut serré sur l’incident (~300–400m),
  // si userLoc connu → fit sur user + incident
  useEffect(() => {
    const lat = data?.lat;
    const lng = data?.lng;
    if (!mapReady || !mapRef.current || !isFiniteNum(lat) || !isFiniteNum(lng)) {return;}

    try {
      if (userLoc?.lat && userLoc?.lng) {
        mapRef.current.fitToCoordinates(
          [
            { latitude: lat, longitude: lng },
            { latitude: userLoc.lat, longitude: userLoc.lng },
          ],
          { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }
        );
      } else {
        mapRef.current.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: DEFAULT_DELTA,
            longitudeDelta: DEFAULT_DELTA,
          },
          450
        );
      }
    } catch (e) {
      setMapError(e?.message || String(e));
    }
  }, [mapReady, data?.lat, data?.lng, userLoc?.lat, userLoc?.lng]);

  const distanceText = useMemo(() => {
    if (!userLoc || !isFiniteNum(data?.lat) || !isFiniteNum(data?.lng)) {return null;}
    const m = distanceMeters(userLoc.lat, userLoc.lng, data.lat, data.lng);
    return fmtDistance(m);
  }, [userLoc, data?.lat, data?.lng]);

  const title = data?.titulo || data?.descricao || 'Alerte';

  const recenterToIncident = () => {
    if (!mapRef.current || !isFiniteNum(data?.lat) || !isFiniteNum(data?.lng)) {return;}
    mapRef.current.animateToRegion(
      {
        latitude: data.lat,
        longitude: data.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      },
      350
    );
  };

  const fitUserAndIncident = () => {
    if (!mapRef.current || !userLoc || !isFiniteNum(data?.lat) || !isFiniteNum(data?.lng)) {return;}
    mapRef.current.fitToCoordinates(
      [
        { latitude: data.lat, longitude: data.lng },
        { latitude: userLoc.lat, longitude: userLoc.lng },
      ],
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }
    );
  };

  const openNav = () => {
    if (!isFiniteNum(data?.lat) || !isFiniteNum(data?.lng)) {return;}
    const lat = data.lat;
    const lng = data.lng;
    const label = encodeURIComponent(title || 'Incident');
    const url =
      Platform.select({
        ios: `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}`,
        android: `geo:0,0?q=${lat},${lng}(${label})`,
        default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      }) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <Stack.Screen
        options={{
          title: 'Alerte publique',
          headerStyle: { backgroundColor: theme.bg },
          headerTitleStyle: { color: theme.text },
          headerTintColor: theme.accent,
        }}
      />

      {loading ? (
        <Centered>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Chargement…</Text>
        </Centered>
      ) : notFound ? (
        <ScrollView contentContainerStyle={styles.container}>
          <StatusBanner
            tone="danger"
            title="Este alerta não está mais disponível."
            subtitle={`Document inexistant: ${firestorePath}`}
          />
          <PrimaryButton label="Rechercher de nouveau" onPress={fetchOnce} />
          <DebugPanel
            alertId={alertId}
            firestorePath={firestorePath}
            lastCheckedAt={lastCheckedAt}
            flags={{ loading, notFound, expired }}
            data={null}
          />
        </ScrollView>
      ) : expired ? (
        <ScrollView contentContainerStyle={styles.container}>
          <StatusBanner
            tone="warn"
            title="Alerta expirado"
            subtitle="Statut 'expired' ou date 'expiresAt' dépassée."
          />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          {/* Header / titre */}
          <View style={styles.headerCard}>
            <Text numberOfLines={2} style={styles.title}>
              {title}
            </Text>

            <View style={styles.badgeRow}>
              <Badge emoji="🧭" label={`${data?.cidade || '—'}${data?.uf ? `/${data.uf}` : ''}`} />
              {data?.radius_m ? <Badge emoji="🛟" label={`${data.radius_m} m`} /> : null}
              {distanceText ? <Badge emoji="📏" label={distanceText} /> : null}
              <StatusPill status={data?.status} severity={data?.gravidade} />
            </View>
          </View>

          {/* Carte interactive (avec fallback si problème) */}
          {isFiniteNum(data?.lat) && isFiniteNum(data?.lng) ? (
            <View style={styles.mapWrap}>
              <MapView
                ref={mapRef}
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                initialRegion={{
                  latitude: data.lat,
                  longitude: data.lng,
                  latitudeDelta: DEFAULT_DELTA,
                  longitudeDelta: DEFAULT_DELTA,
                }}
                onMapReady={() => setMapReady(true)}
                onError={(e) => setMapError(e?.nativeEvent?.message || 'Map error')}
                scrollEnabled
                zoomEnabled
                rotateEnabled
                pitchEnabled
                showsUserLocation={!!userLoc}
                showsMyLocationButton={false}
                toolbarEnabled={false}
              >
                <Marker coordinate={{ latitude: data.lat, longitude: data.lng }} />
                <Circle
                  center={{ latitude: data.lat, longitude: data.lng }}
                  radius={Number(data.radius_m) || 500}
                  strokeWidth={2}
                  strokeColor={data?.color || theme.accent}
                  fillColor="rgba(10,168,255,0.12)"
                />
              </MapView>

              {/* Boutons flottants */}
              <View style={styles.fabCol}>
                <SmallFab label="Recentrer" onPress={recenterToIncident} />
                {userLoc ? <SmallFab label="Fit 2 points" onPress={fitUserAndIncident} /> : null}
                <SmallFab label="Itinéraire" onPress={openNav} />
              </View>

              {/* Alerte d’erreur carte (fallback visuel non bloquant) */}
              {mapError ? (
                <View style={styles.mapErrorOverlay}>
                  <Text style={styles.mapErrorText}>Carte indisponible ({mapError})</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <StatusBanner
              tone="warn"
              title="Localisation indisponible pour cette alerte"
              subtitle="Pas de latitude/longitude. La fiche reste accessible."
            />
          )}

          {/* Localisation */}
          <SectionCard>
            {data?.endereco ? <InfoRow emoji="📍" label="Adresse" value={data.endereco} /> : null}
            {data?.cidade || data?.uf ? (
              <InfoRow
                emoji="🗺️"
                label="Localité"
                value={`${data?.cidade || '—'}${data?.uf ? `/${data.uf}` : ''}`}
              />
            ) : null}
            {isFiniteNum(data?.lat) && isFiniteNum(data?.lng) ? (
              <InfoRow
                emoji="🧿"
                label="Coordonnées"
                value={`${Number(data.lat).toFixed(5)}, ${Number(data.lng).toFixed(5)}`}
              />
            ) : null}
            {data?.radius_m ? (
              <InfoRow emoji="🎯" label="Rayon" value={`${data.radius_m} m`} />
            ) : null}
            {distanceText ? <InfoRow emoji="📏" label="Distance" value={distanceText} /> : null}
            {locDenied ? (
              <InfoRow emoji="🔒" label="Localisation" value="Permission refusée (facultatif)." />
            ) : null}
          </SectionCard>

          {/* Description */}
          <SectionCard>
            <InfoRow emoji="📝" label="Description" value={data?.descricao || 'Sem descrição.'} />
          </SectionCard>

          {/* Dates */}
          <SectionCard>
            {data?.createdAt?.toDate && (
              <InfoRow emoji="⏱️" label="Criado" value={data.createdAt.toDate().toLocaleString()} />
            )}
            {data?.expiresAt?.toDate && (
              <InfoRow emoji="⌛" label="Expira" value={data.expiresAt.toDate().toLocaleString()} />
            )}
            {data?.status ? (
              <InfoRow emoji="🏷️" label="Status" value={String(data.status)} />
            ) : null}
          </SectionCard>

          {/* Debug minimal */}
          <DebugPanel
            alertId={alertId}
            firestorePath={firestorePath}
            lastCheckedAt={lastCheckedAt}
            flags={{ loading, notFound, expired, mapReady, locDenied }}
            data={data}
          />
        </ScrollView>
      )}
    </View>
  );
}

/* ===================== UI COMPOSANTS ===================== */

function Centered({ children }) {
  return <View style={styles.centered}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function Badge({ emoji, label }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>
        {emoji} {label}
      </Text>
    </View>
  );
}

function StatusPill({ status, severity }) {
  const color =
    status === 'expired'
      ? theme.warn
      : severity === 'grave' || severity === 'high'
        ? theme.danger
        : severity === 'minor' || severity === 'low'
          ? theme.warn
          : theme.accent;

  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.pillText}>
        {status === 'expired' ? 'Expiré' : severity ? `Gravité: ${severity}` : 'Actif'}
      </Text>
    </View>
  );
}

function StatusBanner({ tone = 'info', title, subtitle }) {
  const map = {
    info: { bg: theme.cardAlt, emoji: 'ℹ️' },
    warn: { bg: '#2D2414', emoji: '⚠️' },
    danger: { bg: '#2B1E21', emoji: '⛔' },
    success: { bg: '#14261C', emoji: '✅' },
  };
  const t = map[tone] || map.info;

  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Text style={styles.bannerTitle}>
        {t.emoji} {title}
      </Text>
      {subtitle ? <Text style={styles.bannerSub}>{subtitle}</Text> : null}
    </View>
  );
}

function SectionCard({ children }) {
  return <View style={styles.card}>{children}</View>;
}

function InfoRow({ emoji, label, value }) {
  return (
    <>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>
          {emoji} {label}
        </Text>
        <Text style={styles.rowValue} numberOfLines={3}>
          {value}
        </Text>
      </View>
      <Divider />
    </>
  );
}

function PrimaryButton({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

/* Fab minimal */
function SmallFab({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}>
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

function DebugPanel({ alertId, firestorePath, lastCheckedAt, flags, data }) {
  return (
    <View style={styles.debug}>
      <Text style={styles.debugTitle}>Debug</Text>
      <Text style={styles.debugText}>ID: {alertId}</Text>
      <Text style={styles.debugText}>Path: {firestorePath}</Text>
      <Text style={styles.debugText}>Flags: {JSON.stringify(flags)}</Text>
      <Text style={styles.debugText}>LastCheckedAt: {lastCheckedAt || '—'}</Text>
      <Text style={styles.debugText}>Fields: {data ? Object.keys(data).join(', ') : '—'}</Text>
    </View>
  );
}

/* ===================== STYLES ===================== */

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.bg,
  },
  loadingText: { color: theme.textMuted, marginTop: 8 },

  headerCard: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 16,
    ...shadow(),
    gap: 8,
  },
  title: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  badge: {
    backgroundColor: theme.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.divider,
  },
  badgeText: { color: theme.text, fontSize: 13 },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { color: '#081018', fontWeight: '700', fontSize: 12 },

  banner: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.divider,
    ...shadow(1),
  },
  bannerTitle: { color: theme.text, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  bannerSub: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },

  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.divider,
    ...shadow(),
  },
  row: {
    paddingVertical: 10,
    gap: 6,
  },
  rowLabel: {
    color: theme.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rowValue: {
    color: theme.text,
    fontSize: 15.5,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: theme.divider,
  },

  // Map
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.divider,
    backgroundColor: theme.card,
    ...shadow(),
  },
  map: { flex: 1 },
  fabCol: {
    position: 'absolute',
    right: 10,
    top: 10,
    gap: 8,
  },
  fab: {
    backgroundColor: theme.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    ...shadow(2),
  },
  fabText: { color: '#07131B', fontWeight: '800', fontSize: 12 },
  mapErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapErrorText: { color: '#fff', fontWeight: '700' },

  // Buttons
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    ...shadow(2),
  },
  primaryBtnText: {
    color: '#07131B',
    fontWeight: '800',
    fontSize: 15,
  },
  btnPressed: { opacity: 0.85 },

  // Debug
  debug: {
    marginTop: 12,
    backgroundColor: theme.cardAlt,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.divider,
  },
  debugTitle: { color: theme.text, fontWeight: '800', marginBottom: 6 },
  debugText: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
});

// petites ombres cross-platform
function shadow(level = 3) {
  const e = Math.max(1, Math.min(level, 4));
  if (Platform.OS === 'android') {
    return { elevation: 2 * e };
  }
  return {
    shadowColor: '#000',
    shadowOpacity: 0.15 + e * 0.05,
    shadowRadius: 4 + e * 2,
    shadowOffset: { width: 0, height: 2 + e },
  };
}
