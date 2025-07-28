import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

export default function CardHelpRequest({
  demanda,
  numPedido,
  isMine = false,
  onCancel,
  onClose,
  onAccept,
  onHide,
  showAccept,
  showHide,
  loading,
}) {
  const [fadeAnim] = React.useState(new Animated.Value(0));
  const { width } = useWindowDimensions();

  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 340, useNativeDriver: true }).start();
  }, [fadeAnim]);

  function getStatus(status) {
    switch (status) {
      case "open": return { label: "Aberta", color: "#00C859", emoji: "🟩" };
      case "scheduled": return { label: "Agendada", color: "#FFD600", emoji: "🟡" };
      case "accepted": return { label: "Aceita", color: "#4F8DFF", emoji: "🔵" };
      case "cancelled": return { label: "Cancelada", color: "#FF4D4F", emoji: "🔴" };
      case "closed": return { label: "Fechada", color: "#aaa", emoji: "⚫️" };
      default: return { label: status, color: "#eee", emoji: "❔" };
    }
  }
  const status = getStatus(demanda.status);

  // Date affichée
  let dateString = "";
  if (demanda.dateHelp) {
    const date = dayjs(demanda.dateHelp.toDate?.() || demanda.dateHelp).locale("pt-br");
    dateString = `${status.emoji} ${status.label} para ${date.format("dddd, D [de] MMMM [às] HH:mm")}`;
  } else {
    const date = dayjs(demanda.createdAt?.toDate?.() || demanda.createdAt).locale("pt-br");
    dateString = `${status.emoji} ${status.label} — ${date.format("DD/MM/YYYY, HH:mm")}`;
  }

  // Responsive : passe en colonne sous 370px de largeur
  const actionsFlexDirection = width < 370 ? "column" : "row";

  return (
    <Animated.View style={[
      styles.card,
      { borderColor: status.color, opacity: fadeAnim, shadowColor: status.color }
    ]}>
      <View style={styles.numBulle}>
        <Text style={styles.numPedido}>{`#${numPedido}`}</Text>
      </View>
      <Text style={styles.message}>{demanda.message}</Text>
      <Text style={styles.by}><Text style={styles.apelido}>{`Por ${demanda.apelido || "?"}`}</Text></Text>
      <Text style={[styles.date, { fontWeight: "bold", color: "#13d872" }]}>{dateString}</Text>
      <View style={[styles.actions, { flexDirection: actionsFlexDirection }]}>
        {isMine && (demanda.status === "open" || demanda.status === "scheduled") && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cloturerBtn]}
              onPress={onClose}
              disabled={loading === "close"}
              activeOpacity={0.85}
            >
              <Feather name="check-circle" size={19} color="#13d872" />
              <Text style={[styles.actionText, { color: "#13d872" }]}>Clôturer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelarBtn]}
              onPress={onCancel}
              disabled={loading === "cancel"}
              activeOpacity={0.85}
            >
              <Feather name="x-circle" size={19} color="#FF4D4F" />
              <Text style={[styles.actionText, { color: "#FF4D4F" }]}>Cancelar</Text>
            </TouchableOpacity>
          </>
        )}
        {!isMine && showAccept && (
          <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={onAccept}>
            <Feather name="handshake" size={18} color="#00C859" />
            <Text style={[styles.actionText, { color: "#00C859" }]}>Aceitar</Text>
          </TouchableOpacity>
        )}
        {!isMine && showHide && (
          <TouchableOpacity style={[styles.actionBtn, styles.hideBtn]} onPress={onHide}>
            <Feather name="eye-off" size={18} color="#FFD600" />
            <Text style={[styles.actionText, { color: "#FFD600" }]}>Ocultar</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: 15,
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#181A20",
    shadowOpacity: 0.13,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minHeight: 128,
    position: "relative",
  },
  numBulle: {
    position: "absolute",
    top: -18,
    left: -13,
    backgroundColor: "#FFD600",
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 2,
    zIndex: 3,
    borderWidth: 3,
    borderColor: "#13151A",
    shadowColor: "#FFD600",
    shadowOpacity: 0.38,
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
  message: { color: "#fff", fontSize: 18.5, marginBottom: 6, fontWeight: "bold" },
  apelido: { color: "#FFD600", fontWeight: "bold", fontSize: 15.5 },
  by: { marginBottom: 2, marginTop: 2 },
  date: { color: "#b9b9b9", fontSize: 14.5, fontWeight: "500", marginBottom: 3 },
  actions: {
    marginTop: 7,
    gap: 12,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 2,
    minWidth: 108,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.11,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 0,
    backgroundColor: "#222",
  },
  cloturerBtn: {
    borderColor: "#13d872",
    backgroundColor: "#eafff2",
    shadowColor: "#13d872",
  },
  cancelarBtn: {
    borderColor: "#FF4D4F",
    backgroundColor: "#fff0f2",
    shadowColor: "#FF4D4F",
  },
  acceptBtn: {
    borderColor: "#00C859",
    backgroundColor: "#eafff2",
    shadowColor: "#00C859",
  },
  hideBtn: {
    borderColor: "#FFD600",
    backgroundColor: "#fffbe4",
    shadowColor: "#FFD600",
  },
  actionText: {
    fontWeight: "bold",
    fontSize: 16,
    marginLeft: 7,
  },
});
