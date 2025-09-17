// app/public-alerts/[id].jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from "react-native-maps";


import { db } from "@/firebase";

/* ===================== THEME ===================== */
const theme = {
  bg: "#0B0F14",
  card: "#12171E",
  cardAlt: "#141B24",
  text: "#E7EEF7",
  textMuted: "#94A2B8",
  accent: "#0AA8FF",
  warn: "#FFC857",
  danger: "#FF5A60",
  divider: "rgba(255,255,255,0.06)",
};

/* ===================== PAGE ===================== */
export default function PublicAlertDetail() {
  const router = useRouter();
  const { id: alertIdParam } = useLocalSearchParams();
  const alertId = useMemo(() => String(alertIdParam || "").trim(), [alertIdParam]);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expired, setExpired] = useState(false);
  const [data, setData] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [firestorePath, setFirestorePath] = useState("");

  // -- helpers
  const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

  const isExpired = useCallback((docData) => {
    const statusExpired = docData?.status === "expired";
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
      const ref = doc(db, "publicAlerts", alertId);
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
      console.warn("[public-alerts/[id]] getDoc error:", e);
      setNotFound(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [alertId, isExpired]);

  // Live updates (temps réel)
  useEffect(() => {
    if (!alertId) {
      return;
    }
    const ref = doc(db, "publicAlerts", alertId);
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
      (err) => console.warn("[public-alerts/[id]] onSnapshot:", err)
    );
    return () => unsub();
  }, [alertId, isExpired]);

  useEffect(() => {
    fetchOnce();
  }, [fetchOnce]);

  const title = data?.titulo || data?.descricao || "Alerte";

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <Stack.Screen
        options={{
          title: "Alerte publique",
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
          <PrimaryButton label="Retour" onPress={() => router.back()} />
          <DebugPanel
            alertId={alertId}
            firestorePath={firestorePath}
            lastCheckedAt={lastCheckedAt}
            flags={{ loading, notFound, expired }}
            data={data}
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
              <Badge
                emoji="🧭"
                label={`${data?.cidade || "—"}${data?.uf ? `/${data.uf}` : ""}`}
              />
              {data?.radius_m ? <Badge emoji="🛟" label={`${data.radius_m} m`} /> : null}
              <StatusPill status={data?.status} severity={data?.gravidade} />
            </View>
          </View>

          {/* Mini-map compacte */}
          {isFiniteNum(data?.lat) && isFiniteNum(data?.lng) ? (
            <MapCard
              lat={data.lat}
              lng={data.lng}
              radius={Number(data.radius_m) || 500}
              accent={data?.color || theme.accent}
            />
          ) : null}

          {/* Localisation */}
          <SectionCard>
            {data?.endereco ? (
              <InfoRow emoji="📍" label="Adresse" value={data.endereco} />
            ) : null}
            {data?.cidade || data?.uf ? (
              <InfoRow
                emoji="🗺️"
                label="Localité"
                value={`${data?.cidade || "—"}${data?.uf ? `/${data.uf}` : ""}`}
              />
            ) : null}
            {isFiniteNum(data?.lat) && isFiniteNum(data?.lng) ? (
              <InfoRow
                emoji="🧿"
                label="Coordonnées"
                value={`${Number(data.lat).toFixed(5)}, ${Number(data.lng).toFixed(5)}`}
              />
            ) : null}
            {data?.radius_m ? <InfoRow emoji="🎯" label="Rayon" value={`${data.radius_m} m`} /> : null}
          </SectionCard>

          {/* Description */}
          <SectionCard>
            <InfoRow emoji="📝" label="Description" value={data?.descricao || "Sem descrição."} />
          </SectionCard>

          {/* Dates */}
          <SectionCard>
            {data?.createdAt?.toDate && (
              <InfoRow
                emoji="⏱️"
                label="Criado"
                value={data.createdAt.toDate().toLocaleString()}
              />
            )}
            {data?.expiresAt?.toDate && (
              <InfoRow
                emoji="⌛"
                label="Expira"
                value={data.expiresAt.toDate().toLocaleString()}
              />
            )}
            {data?.status ? <InfoRow emoji="🏷️" label="Status" value={String(data.status)} /> : null}
          </SectionCard>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <PrimaryButton label="Rafraîchir" onPress={fetchOnce} />
            <SecondaryButton label="Retour" onPress={() => router.back()} />
          </View>

          {/* Debug */}
          <DebugPanel
            alertId={alertId}
            firestorePath={firestorePath}
            lastCheckedAt={lastCheckedAt}
            flags={{ loading, notFound, expired }}
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
    status === "expired"
      ? theme.warn
      : severity === "grave" || severity === "high"
      ? theme.danger
      : severity === "minor" || severity === "low"
      ? theme.warn
      : theme.accent;

  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.pillText}>
        {status === "expired" ? "Expiré" : severity ? `Gravité: ${severity}` : "Actif"}
      </Text>
    </View>
  );
}

function StatusBanner({ tone = "info", title, subtitle }) {
  const map = {
    info: { bg: theme.cardAlt, emoji: "ℹ️" },
    warn: { bg: "#2D2414", emoji: "⚠️" },
    danger: { bg: "#2B1E21", emoji: "⛔" },
    success: { bg: "#14261C", emoji: "✅" },
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.btnPressed]}>
      <Text style={styles.secondaryBtnText}>{label}</Text>
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
      <Text style={styles.debugText}>LastCheckedAt: {lastCheckedAt || "—"}</Text>
      <Text style={styles.debugText}>
        Fields: {data ? Object.keys(data).join(", ") : "—"}
      </Text>
    </View>
  );
}

/* ===== Mini-Map compacte (pin + cercle) ===== */
function MapCard({ lat, lng, radius, accent }) {
  // delta approx: 1° ~ 111km → on veut ~3x le rayon dans le viewport
  const delta = Math.max(0.002, (radius / 111_000) * 3);

  const region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };

  return (
    <View style={styles.mapWrap}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        pointerEvents="none"
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} />
        <Circle
          center={{ latitude: lat, longitude: lng }}
          radius={radius}
          strokeWidth={2}
          strokeColor={accent}
          fillColor="rgba(10,168,255,0.12)"
        />
      </MapView>
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
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  pillText: { color: "#081018", fontWeight: "700", fontSize: 12 },

  banner: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.divider,
    ...shadow(1),
  },
  bannerTitle: { color: theme.text, fontWeight: "700", fontSize: 16, marginBottom: 4 },
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
    textTransform: "uppercase",
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

  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    ...shadow(2),
  },
  primaryBtnText: {
    color: "#07131B",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: theme.cardAlt,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.divider,
  },
  secondaryBtnText: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 15,
  },

  debug: {
    marginTop: 12,
    backgroundColor: theme.cardAlt,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.divider,
  },
  debugTitle: { color: theme.text, fontWeight: "800", marginBottom: 6 },
  debugText: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },

  // Mini-map compacte
  mapWrap: {
    height: 160,                // ← compacte
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.divider,
    backgroundColor: theme.card,
    ...shadow(),
  },
  map: {
    flex: 1,
  },

  btnPressed: { opacity: 0.85 },
});

// petites ombres cross-platform
function shadow(level = 3) {
  const e = Math.max(1, Math.min(level, 4));
  if (Platform.OS === "android") {
    return { elevation: 2 * e };
  }
  return {
    shadowColor: "#000",
    shadowOpacity: 0.15 + e * 0.05,
    shadowRadius: 4 + e * 2,
    shadowOffset: { width: 0, height: 2 + e },
  };
}
