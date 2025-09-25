// app/public-alerts/[id].jsx
// ---------------------------------------------------------
// VigiApp — Alertas Públicas (FULL FIXED)
// - Mapping Firestore flexible
// - Map + bouton recentrage rouge (CORES.critico)
// - Géoloc utilisateur + distance (evento ~ usuário) avec loader 3 points
// - UI/UX alignée, labels 3 lignes, rien ne déborde
// - Hooks toujours appelés (pas d’erreur "Rendered more hooks")
// - Logs du flux (start/end, fetch, geo, map, distance)
// ---------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import * as Location from "expo-location";

// ---------- responsive
const { width: W } = Dimensions.get("window");
const scale = (s) => Math.round((W / 375) * s);

// ---------- palette
const CORES = {
  bg: "#0E0F10",
  card: "#1A1C1F",
  text: "#E9ECF1",
  sub: "#B8C0CC",
  border: "#2A2E34",
  vigi: "#28a745",
  atencao: "#ffc107",
  critico: "#dc3545", // rouge (Tipo & bouton recentrage)
  neutro: "#6c757d",
};

// ---------- utils
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const safeCoord = (lat, lng) =>
  isNum(lat) && isNum(lng) ? { latitude: lat, longitude: lng } : null;

const normalizeToDate = (v) => {
  try {
    if (!v) {return null;}
    if (v instanceof Date) {return v;}
    if (typeof v?.toDate === "function") {return v.toDate();} // Firestore Timestamp
    if (typeof v === "object" && "seconds" in v) {return new Date(v.seconds * 1000);}
    if (typeof v === "number") {return new Date(v);}
    if (typeof v === "string") {return new Date(v);}
    return null;
  } catch {
    return null;
  }
};
const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const formatarData = (v) => {
  const d = normalizeToDate(v);
  if (!d || Number.isNaN(d.getTime())) {return "—";}
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

function haversineMetros(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(isNum)) {return NaN;}
  const R = 6371000,
    toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1),
    dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const distanciaTexto = (u, a) => {
  if (!u || !a) {return "—";}
  const d = haversineMetros(u.latitude, u.longitude, a.latitude, a.longitude);
  if (!isNum(d)) {return "—";}
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
};

// ---------- mapping Firestore (flex)
const pickTipo = (a) => a?.categoria || a?.categorias || a?.type || a?.tipo || "—";
const pickEstado = (a) => a?.estado || a?.uf || a?.state || "—";
const pickCidade = (a) => a?.cidade || a?.city || "—";
const pickStatus = (a) => a?.status || a?.estadoStatus || "ativo";
const pickGravidade = (a) => a?.gravidade || a?.gravidadeNivel || "médio";
const pickCriadoEm = (a) => a?.createdAt || a?.date || a?.criadoEm || null;
const pickDeclaracoes = (a) => a?.declaracoes || a?.declaracoesCount || a?.reportsCount || 1;

const pickCoords = (a) => {
  const loc = a?.location;
  const fromLoc = loc && safeCoord(loc.latitude, loc.longitude);
  if (fromLoc) {return fromLoc;}
  return safeCoord(a?.lat, a?.lng);
};
const buildEndereco = (a) => {
  const full1 = a?.address || a?.endereco || a?.enderec || null;
  if (full1 && typeof full1 === "string" && full1.trim()) {return full1.trim();}
  const ruaNumero = a?.ruaNumero || null; // "Rua Seis de Março, 128"
  const rua = a?.rua || a?.street || null;
  const numero = a?.numero || a?.number || null;
  const cidade = a?.cidade || a?.city || null;
  const estado = a?.estado || a?.uf || null;
  const cep = a?.cep || null;
  const left = ruaNumero || [rua, numero].filter(Boolean).join(", ");
  const right = [cidade && `${cidade}/${estado || ""}`.replace(/\/$/, ""), cep]
    .filter(Boolean)
    .join(" - ");
  const final = [left, right].filter(Boolean).join(" - ").trim();
  return final || "—";
};

// ---------- badges
function BadgeStatus({ status }) {
  const map = {
    ativo: { label: "Ativo", bg: CORES.vigi },
    resolvido: { label: "Resolvido", bg: CORES.neutro },
    em_analise: { label: "Em análise", bg: CORES.atencao },
  };
  const s = map[status] || map.ativo;
  return (
    <View style={[estilos.badge, { backgroundColor: s.bg }]}>
      <Text style={estilos.badgeText}>{s.label}</Text>
    </View>
  );
}
function BadgeGravidade({ nivel }) {
  const map = {
    baixo: { label: "Baixo", bg: CORES.vigi },
    médio: { label: "Médio", bg: CORES.atencao },
    alto: { label: "Alto", bg: CORES.critico },
  };
  const g = map[nivel] || map.médio;
  return (
    <View style={[estilos.badge, { backgroundColor: g.bg }]}>
      <Text style={estilos.badgeText}>{g.label}</Text>
    </View>
  );
}

// ---------- Loader trois points
function LoaderDots() {
  const a1 = React.useRef(new Animated.Value(0)).current;
  const a2 = React.useRef(new Animated.Value(0)).current;
  const a3 = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (val, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
            delay,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 250,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();

    bounce(a1, 0);
    bounce(a2, 120);
    bounce(a3, 240);
  }, [a1, a2, a3]);

  const dot = (val) => ({
    transform: [
      {
        translateY: val.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -5],
        }),
      },
    ],
    opacity: val.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    color: CORES.sub,
    fontSize: scale(16),
    marginHorizontal: scale(1),
  });

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      <Animated.Text style={dot(a1)}>•</Animated.Text>
      <Animated.Text style={dot(a2)}>•</Animated.Text>
      <Animated.Text style={dot(a3)}>•</Animated.Text>
    </View>
  );
}

// ---------- Firestore
async function fetchAlertaFirestore(alertId) {
  console.log("[public-alerts/[id].jsx] START PAGE → id:", alertId);
  console.time("[public-alerts/[id].jsx] FETCH");
  const snap = await getDoc(doc(db, "publicAlerts", alertId));
  console.timeEnd("[public-alerts/[id].jsx] FETCH");
  if (!snap.exists()) {
    console.warn(
      "[public-alerts/[id].jsx] Firestore: aucun document pour id:",
      alertId
    );
    return null;
  }
  const data = { id: snap.id, ...snap.data() };
  console.log("[public-alerts/[id].jsx] Firestore: données reçues:", data);
  return data;
}

// =========================================================
export default function TelaAlertaPublica() {
  const { id: alertId } = useLocalSearchParams();
  const [raw, setRaw] = useState(null);
  const [locUsuario, setLocUsuario] = useState(null);
  const mapRef = useRef(null);

  // 1) FETCH — hook toujours appelé
  useEffect(() => {
    console.time("[public-alerts/[id].jsx] PAGE LOAD");
    (async () => {
      try {
        const data = await fetchAlertaFirestore(alertId);
        setRaw(data);
      } catch (e) {
        console.error(
          "[public-alerts/[id].jsx] ERREUR fetch:",
          e?.message || e
        );
      } finally {
        console.timeEnd("[public-alerts/[id].jsx] PAGE LOAD");
      }
    })();
    return () => console.log("[public-alerts/[id].jsx] unmount → cleanup");
  }, [alertId]);

  // 2) GEO — hook toujours appelé
  useEffect(() => {
    (async () => {
      try {
        console.log("[public-alerts/[id].jsx] geo: request permission");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted")
          {return console.warn(
            "[public-alerts/[id].jsx] geo: permission refusée"
          );}
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const loc = { latitude: coords.latitude, longitude: coords.longitude };
        console.log("[public-alerts/[id].jsx] geo: user coords:", loc);
        setLocUsuario(loc);
      } catch (e) {
        console.error(
          "[public-alerts/[id].jsx] geo error:",
          e?.message || e
        );
      }
    })();
  }, []);

  // 3) MAPPING — sûr même si raw==null
  const alerta = {
    tipo: pickTipo(raw || {}),
    endereco: buildEndereco(raw || {}),
    cidade: pickCidade(raw || {}),
    estado: pickEstado(raw || {}),
    status: pickStatus(raw || {}),
    gravidade: pickGravidade(raw || {}),
    criadoEm: pickCriadoEm(raw || {}),
    coords: pickCoords(raw || {}),
    descricao: (raw && (raw.descricao || raw.description)) || "—",
    declaracoes: pickDeclaracoes(raw || {}),
  };

  // 4) HOOKS dérivés — avant tout return
  const regiao = useMemo(() => {
    if (!alerta.coords) {return null;}
    const r = {
      ...alerta.coords,
      latitudeDelta: 0.004,
      longitudeDelta: 0.004,
    };
    console.log("[public-alerts/[id].jsx] carte: REGIÃO calculada:", r);
    return r;
  }, [alerta.coords]);

  useEffect(() => {
    const u = locUsuario || null;
    const i = alerta.coords || null;
    if (u && i) {
      const d = haversineMetros(u.latitude, u.longitude, i.latitude, i.longitude);
      console.log("[public-alerts/[id].jsx] distance user↔incidente (m):", d);
    } else {
      console.log(
        "[public-alerts/[id].jsx] distance non calculée — user:",
        u,
        " inc:",
        i
      );
    }
  }, [
    locUsuario,
    alerta.coords,
    locUsuario?.latitude,
    locUsuario?.longitude,
    alerta.coords?.latitude,
    alerta.coords?.longitude,
  ]);

  // 5) SKELETON (après TOUS les hooks)
  if (!raw) {
    return (
      <SafeAreaView style={estilos.container}>
        <View style={estilos.header}>
          <Text style={estilos.titulo}>Alertas Públicas</Text>
          <View style={estilos.badgeRow}>
            <View style={[estilos.badge, { backgroundColor: CORES.neutro }]}>
              <Text style={estilos.badgeText}>—</Text>
            </View>
            <View style={[estilos.badge, { backgroundColor: CORES.neutro }]}>
              <Text style={estilos.badgeText}>—</Text>
            </View>
          </View>
        </View>
        <View style={[estilos.card, { marginTop: scale(14) }]}>
          <View style={estilos.skelLine} />
          <View style={[estilos.skelLine, { width: "70%" }]} />
        </View>
      </SafeAreaView>
    );
  }

  // ========================================================= UI
  const coordUsuario = locUsuario || null;
  const coordIncidente = alerta.coords || null;

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingBottom: scale(24) }}
        >
          {/* Header */}
          <View style={estilos.header}>
            <Text style={estilos.titulo}>Alertas Públicas</Text>
            <View style={estilos.badgeRow}>
              <BadgeStatus status={alerta.status} />
              <BadgeGravidade nivel={alerta.gravidade} />
            </View>
          </View>

          {/* Map + bouton recentrage (rouge) */}
          {regiao ? (
            <View style={estilos.mapWrap}>
              <MapView
                ref={mapRef}
                style={estilos.map}
                initialRegion={regiao}
                onMapReady={() =>
                  console.log("[public-alerts/[id].jsx] carte: prête")
                }
              >
                <Marker
                  coordinate={regiao}
                  title={alerta.tipo || "Incidente"}
                />
                {coordUsuario && (
                  <Marker
                    coordinate={coordUsuario}
                    title="Você"
                    description="Sua localização"
                    pinColor="#28a745"
                  />
                )}
                <Circle
                  center={regiao}
                  radius={50}
                  strokeWidth={1}
                  strokeColor="rgba(220,53,69,0.6)"
                  fillColor="rgba(220,53,69,0.18)"
                />
              </MapView>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  mapRef.current?.animateToRegion(regiao, 300);
                  console.log("[public-alerts/[id].jsx] action: recentrer");
                }}
                style={({ pressed }) => [
                  estilos.recenterBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Icon name="crosshairs-gps" size={scale(18)} color={CORES.bg} />
              </Pressable>
            </View>
          ) : (
            <View style={estilos.banner}>
              <Icon name="map-marker-off" size={scale(18)} color={CORES.sub} />
              <Text style={estilos.bannerText}>
                Localização indisponível para este alerta.
              </Text>
            </View>
          )}

          {/* Détails */}
          <View style={estilos.card}>
            <Linha
              label="🚨 Tipo"
              valor={alerta.tipo}
              cor={CORES.critico}
              compact
            />
            <Linha
              label="📍 Endereço"
              valor={alerta.endereco}
              cor={CORES.atencao}
              multiline
              extraGap={scale(12)}
            />
            <Linha
              label="🏙️ Cidade"
              valor={alerta.cidade}
              cor={CORES.vigi}
              compact
            />
            <Linha
              label="🗺️ Estado"
              valor={alerta.estado}
              cor={CORES.neutro}
              compact
            />
            <Linha
              label="📏 Distância (evento ~ usuário)"
              valor={
                coordUsuario && coordIncidente
                  ? distanciaTexto(coordUsuario, coordIncidente)
                  : null
              }
              valorNode={
                coordUsuario && coordIncidente ? null : <LoaderDots />
              }
              cor={CORES.atencao}
              compact
            />
            <Linha
              label="🕒 Data & hora"
              valor={formatarData(alerta.criadoEm)}
              cor={CORES.vigi}
              compact
            />
            <Linha
              label="👥 Declarações"
              valor={`${alerta.declaracoes}`}
              cor={CORES.vigi}
              compact
            />
          </View>

          {/* Description */}
          <View style={estilos.card}>
            <Text style={[estilos.cardTitle, { color: CORES.critico }]}>
              Descrição
            </Text>
            <Text style={estilos.body}>{alerta.descricao}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------- sub-component (valorNode pour loader, extraGap pour décalage)
function Linha({
  label,
  valor,
  valorNode,
  cor,
  multiline = false,
  compact = false,
  extraGap = 0,
}) {
  return (
    <View style={[estilos.row, compact && estilos.rowCompact]}>
      <Text
        style={[estilos.rowLabel, { color: cor }]}
        numberOfLines={3}
        ellipsizeMode="clip"
      >
        {label}
      </Text>

      {valorNode ? (
        <View
          style={{ flex: 1, alignItems: "flex-end", marginLeft: extraGap }}
        >
          {valorNode}
        </View>
      ) : (
        <Text
          style={[
            estilos.rowValue,
            multiline && estilos.rowValueMultiline,
            compact && estilos.rowValueCompact,
            extraGap ? { marginLeft: extraGap } : null,
          ]}
        >
          {valor}
        </Text>
      )}
    </View>
  );
}

// ---------- styles
const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.bg },

  header: {
    paddingHorizontal: scale(20),
    paddingTop: scale(16),
    paddingBottom: scale(4),
    alignItems: "center",
  },
  titulo: { color: CORES.vigi, fontSize: scale(24), fontWeight: "700" },
  badgeRow: { flexDirection: "row", gap: scale(8), marginTop: scale(8) },

  badge: { paddingHorizontal: scale(10), paddingVertical: scale(4), borderRadius: 999 },
  badgeText: { color: "#081016", fontWeight: "800", fontSize: scale(12) },

  mapWrap: {
    height: Math.max(scale(240), 220),
    borderRadius: scale(12),
    overflow: "hidden",
    marginHorizontal: scale(20),
    marginTop: scale(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CORES.border,
    backgroundColor: CORES.card,
  },
  map: { flex: 1 },
  recenterBtn: {
    position: "absolute",
    right: scale(12),
    bottom: scale(12),
    backgroundColor: CORES.critico, // rouge
    borderRadius: 999,
    paddingVertical: scale(8),
    paddingHorizontal: scale(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D5D7DB",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  banner: {
    marginHorizontal: scale(20),
    marginTop: scale(14),
    backgroundColor: CORES.card,
    borderRadius: scale(12),
    padding: scale(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CORES.border,
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
  },
  bannerText: { color: CORES.text, fontSize: scale(14), flex: 1 },

  card: {
    backgroundColor: CORES.card,
    marginHorizontal: scale(20),
    marginTop: scale(12),
    borderRadius: scale(12),
    padding: scale(14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CORES.border,
  },
  cardTitle: {
    color: CORES.text,
    fontWeight: "700",
    fontSize: scale(16),
    marginBottom: scale(8),
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: scale(8),
    gap: scale(14), // espace label/valeur augmenté
  },
  rowCompact: { alignItems: "center", minHeight: scale(28) },
  rowLabel: {
    fontSize: scale(14),
    fontWeight: "700",
    width: "50%", // élargi pour éviter la coupe de "Usuário"
    color: CORES.sub,
  },
  rowValue: {
    color: CORES.text,
    fontSize: scale(14),
    flex: 1,
    textAlign: "right",
    flexShrink: 1,
  },
  rowValueMultiline: { textAlign: "left", lineHeight: scale(20) },
  rowValueCompact: { lineHeight: scale(18) },

  body: { color: CORES.text, fontSize: scale(14), lineHeight: scale(20) },

  skelLine: {
    height: scale(12),
    backgroundColor: "#22262c",
    borderRadius: 6,
    marginVertical: scale(6),
    width: "85%",
  },
});