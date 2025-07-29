import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Feather } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

// --- HELPERS ---
function parseFirestoreDate(val) {
  if (!val) return null;
  if (typeof val.toDate === "function") return val.toDate();
  if (typeof val === "string" || typeof val === "number") return new Date(val);
  return val; // déjà une Date JS
}

/**
 * Retourne "Hoje às HH:mm" si la date est aujourd'hui,
 * sinon "dddd, D de MMMM às HH:mm" en portugais.
 */
function formatHojeOuData(date) {
  const d = dayjs(date);
  const now = dayjs();
  if (d.isSame(now, "day")) {
    return `Hoje às ${d.format("HH:mm")}`;
  }
  return `${d.locale("pt-br").format("dddd, D [de] MMMM")} às ${d.format("HH:mm")}`;
}

// Génère un ID alphanumérique aléatoire de 4 caractères
function generateRandomId(length = 4) {
  return Math.random().toString(36).substr(2, length).toUpperCase();
}

export default function CardHelpRequest({
  demanda,
  isMine = false,
  onCancel,
  onClose,
  onAccept,
  onHide,
  showAccept,
  showHide,
  loading,
}) {
  const [fadeAnim] = useState(new Animated.Value(0));
  // Génère un ID à 4 caractères pour le badge
  const [randomId] = useState(() => generateRandomId());

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Parse des dates
  const dateHelp = parseFirestoreDate(demanda.dateHelp);
  const createdAt = parseFirestoreDate(demanda.createdAt);

  // Types de demande
  const isAgendada = demanda.status === "scheduled" && dateHelp;
  const isRapido = demanda.status === "open" && !demanda.dateHelp;
  const isCancelada = demanda.status === "cancelled";
  const isAberta = demanda.status === "open" && !isCancelada && !isAgendada;

  // Couleurs dynamiques
  const color = isCancelada
    ? "#ff5d5d"
    : isAgendada
    ? "#ffd13a"
    : "#7fd06e";
  const borderColor = color;
  const shadowColor = color + "55";

  return (
    <Animated.View
      style={[
        styles.card,
        { borderColor, shadowColor, opacity: fadeAnim, backgroundColor: "#181a20" },
      ]}
    >
      {/* Badge alphanumérique */}
      <View style={[styles.numBulle, { borderColor, shadowColor }]}> 
        <Text style={styles.numPedido}>{`#${randomId}`}</Text>
      </View>

      {/* Apelido */}
      <Text style={styles.apelido}>{demanda.apelido || "—"}</Text>

      {/* Message */}
      <Text style={styles.message}>{demanda.message}</Text>

      {/* Demande programmée */}
      {isAgendada && (
        <Text style={styles.agendada}>
          <Text style={styles.agendadaEmoji}>🟡</Text>
          {` Agendada para ${formatHojeOuData(dateHelp)}`}
        </Text>
      )}

      {/* Demande urgente */}
      {isRapido && (
        <>
          <Text style={styles.rapido}>O mais rápido possível, por favor 🙏</Text>
          <Text style={styles.criadaEm}>{formatHojeOuData(createdAt)}</Text>
        </>
      )}

      {/* Annulée */}
      {isCancelada && <Text style={styles.cancelada}>Cancelada</Text>}

      {/* Actions */}
      <View style={styles.actions}>
        {isMine && (isAberta || isAgendada) && (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.cloturerBtn]}
              onPress={onClose}
              disabled={loading === "close"}
              activeOpacity={0.86}
            >
              <Feather name="check-circle" size={18} color="#43b57b" />
              <Text style={[styles.btnText, { color: "#43b57b" }]}>Clôturer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.cancelarBtn]}
              onPress={onCancel}
              disabled={loading === "cancel"}
              activeOpacity={0.86}
            >
              <Feather name="x-circle" size={18} color="#b55a43" />
              <Text style={[styles.btnText, { color: "#b55a43" }]}>Cancelar</Text>
            </TouchableOpacity>
          </>
        )}
        {!isMine && showAccept && (
          <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={onAccept}>
            <Feather name="user-check" size={17} color="#43b57b" />
            <Text style={[styles.btnText, { color: "#43b57b" }]}>Aceitar</Text>
          </TouchableOpacity>
        )}
        {!isMine && showHide && (
          <TouchableOpacity style={[styles.btn, styles.hideBtn]} onPress={onHide}>
            <Feather name="eye-off" size={17} color="#FFD600" />
            <Text style={[styles.btnText, { color: "#FFD600" }]}>Ocultar</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: 17,
    padding: 16,
    marginBottom: 18,
    minHeight: 112,
    shadowOpacity: 0.17,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    position: "relative",
  },
  numBulle: {
    position: "absolute",
    top: -19,
    left: -11,
    backgroundColor: "#FFD600",
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 2,
    zIndex: 5,
    borderWidth: 3,
    shadowColor: "#FFD600",
    shadowOpacity: 0.39,
    shadowRadius: 7,
    elevation: 4,
  },
  numPedido: {
    color: "#222",
    fontWeight: "bold",
    fontSize: 18.5,
    letterSpacing: 1,
    textAlign: "center",
  },
  apelido: {
    color: "#b2ec6b",
    fontWeight: "bold",
    fontSize: 17,
    marginBottom: 2,
    letterSpacing: 0.09,
    marginTop: 5,
  },
  message: {
    color: "#ededed",
    fontSize: 17.7,
    marginBottom: 7,
    fontWeight: "500",
  },
  agendada: {
    color: "#ffd13a",
    fontWeight: "bold",
    fontSize: 15.9,
    marginBottom: 2,
  },
  agendadaEmoji: {
    fontSize: 16,
    marginRight: 2,
  },
  rapido: {
    color: "#92be78",
    fontSize: 15.4,
    fontStyle: "italic",
    marginBottom: 2,
    marginTop: 1,
    fontWeight: "500",
  },
  criadaEm: {
    color: "#aaa",
    fontSize: 13.6,
    fontStyle: "italic",
    marginBottom: 1,
  },
  cancelada: {
    color: "#ff5d5d",
    fontWeight: "bold",
    fontSize: 15.7,
    marginBottom: 2,
  },
  actions: {
    marginTop: 10,
    gap: 13,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    width: "100%",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#232628",
    borderColor: "#6ea98d",
    borderWidth: 2,
    borderRadius: 13,
    paddingVertical: 8,
    paddingHorizontal: 19,
    marginRight: 9,
    shadowColor: "#232628",
    shadowOpacity: 0.11,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  btnText: {
    fontWeight: "bold",
    fontSize: 15.2,
    marginLeft: 7,
    letterSpacing: 0.08,
  },
  cloturerBtn: {
    borderColor: "#43b57b",
    backgroundColor: "#192d23",
  },
  cancelarBtn: {
    borderColor: "#b55a43",
    backgroundColor: "#2a1916",
  },
  acceptBtn: {
    borderColor: "#43b57b",
    backgroundColor: "#192d23",
  },
  hideBtn: {
    borderColor: "#FFD600",
    backgroundColor: "#181a20",
  },
});
