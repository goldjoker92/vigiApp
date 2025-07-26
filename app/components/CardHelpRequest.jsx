import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import dayjs from "dayjs";

const CARD_WIDTH = Dimensions.get("window").width * 0.82;

export default function CardHelpRequest({
  apelido,
  motivo,
  tipoAjuda,
  dataAgendada,
  status,
  createdAt,
  expiresAt,
  numPedido,
  isMine,
  onAccept,
  onHide,
  onEdit,
  onCancel,
  onUnhide,
  isHidden,
  swipeable,
  onSwipe,
  showHideBtn = true,
}) {
  // Gestion du swipe (supprimer visuellement la carte)
  const pan = React.useRef(new Animated.ValueXY()).current;

  const panResponder = swipeable
    ? PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 14,
        onPanResponderMove: Animated.event(
          [null, { dx: pan.x }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -CARD_WIDTH * 0.3) {
            // Swipe gauche : cache la carte du feed local
            Animated.timing(pan, {
              toValue: { x: -CARD_WIDTH * 1.2, y: 0 },
              duration: 220,
              useNativeDriver: false,
            }).start(() => {
              pan.setValue({ x: 0, y: 0 });
              onSwipe && onSwipe();
            });
          } else {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
            }).start();
          }
        },
      })
    : {};

  // Format date
  const formatDate = (date) => {
    const d = dayjs(date);
    if (d.isSame(dayjs(), "day")) return "Hoje";
    if (d.isSame(dayjs().subtract(1, "day"), "day")) return "Ontem";
    return d.format("ddd, DD/MM");
  };

  return (
    <Animated.View
      style={[
        styles.card,
        isHidden && styles.cardHidden,
        status === "accepted" && styles.cardAccepted,
        status === "closed" && styles.cardClosed,
        pan.getLayout && pan.getLayout(),
      ]}
      {...(swipeable ? panResponder.panHandlers : {})}
    >
      {/* Ligne du haut */}
      <View style={styles.header}>
        <Text style={styles.numPedido}>
          #{numPedido} · {formatDate(createdAt)}
        </Text>
        {status === "accepted" && (
          <Text style={styles.statusAccepted}>ACEITA</Text>
        )}
        {status === "open" && (
          <Text style={styles.statusOpen}>ABERTA</Text>
        )}
        {status === "closed" && (
          <Text style={styles.statusClosed}>FECHADA</Text>
        )}
      </View>
      <View style={styles.row}>
        <Feather name="user" size={18} color="#FFD600" />
        <Text style={styles.apelido}>{apelido}</Text>
      </View>
      <View style={styles.row}>
        <Feather name="message-circle" size={17} color="#4F8DFF" />
        <Text style={styles.motivo}>{motivo}</Text>
      </View>
      <View style={styles.row}>
        <MaterialIcons name="event" size={17} color="#00C859" />
        {tipoAjuda === "agendada" && dataAgendada ? (
          <Text style={styles.ajudaAgendada}>
            Agendada para {dayjs(dataAgendada).format("dddd, DD/MM [às] HH:mm")}
          </Text>
        ) : (
          <Text style={styles.ajudaRapida}>
            O mais rápido possível, por gentileza
          </Text>
        )}
      </View>
      <View style={styles.row}>
        <Feather name="clock" size={15} color="#FFD600" />
        <Text style={styles.createdAt}>
          Criado em: {dayjs(createdAt).format("DD/MM/YYYY [às] HH:mm")}
        </Text>
      </View>
      <View style={styles.row}>
        <MaterialIcons name="hourglass-empty" size={16} color="#FFD600" />
        <Text style={styles.expire}>
          Expira em: {dayjs(expiresAt).format("DD/MM/YYYY [às] HH:mm")}
        </Text>
      </View>
      {/* Actions */}
      <View style={styles.actionsRow}>
        {/* Bouton Accepter si pas ma demande */}
        {!isMine && status === "open" && (
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={onAccept}
            activeOpacity={0.85}
          >
            <Feather name="check-circle" size={17} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.acceptBtnText}>Aceitar</Text>
          </TouchableOpacity>
        )}
        {/* Bouton masquer/démasquer */}
        {showHideBtn &&
          (!isHidden ? (
            <TouchableOpacity
              style={styles.hideBtn}
              onPress={onHide}
              activeOpacity={0.85}
            >
              <Feather name="eye-off" size={17} color="#FFD600" style={{ marginRight: 6 }} />
              <Text style={styles.hideBtnText}>Masquer</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.unhideBtn}
              onPress={onUnhide}
              activeOpacity={0.85}
            >
              <Feather name="eye" size={17} color="#00C859" style={{ marginRight: 6 }} />
              <Text style={styles.unhideBtnText}>Démasquer</Text>
            </TouchableOpacity>
          ))}
        {/* Actions pour mes propres demandes */}
        {isMine && (
          <>
            <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.85}>
              <Feather name="edit" size={17} color="#4F8DFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
              <MaterialIcons name="cancel" size={19} color="#FF4D4F" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#23262F",
    borderRadius: 16,
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 7,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  cardHidden: {
    opacity: 0.2,
    backgroundColor: "#23262F33",
  },
  cardAccepted: {
    borderWidth: 2,
    borderColor: "#00C859",
  },
  cardClosed: {
    borderWidth: 2,
    borderColor: "#FF4D4F",
    opacity: 0.7,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  numPedido: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 15,
    marginRight: 13,
  },
  statusOpen: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 8,
    letterSpacing: 0.2,
  },
  statusAccepted: {
    color: "#00C859",
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 8,
    letterSpacing: 0.2,
  },
  statusClosed: {
    color: "#FF4D4F",
    fontWeight: "bold",
    fontSize: 14,
    marginLeft: 8,
    letterSpacing: 0.2,
  },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  apelido: { color: "#fff", fontWeight: "bold", fontSize: 15, marginLeft: 7 },
  motivo: { color: "#fff", fontSize: 15, marginLeft: 7, flexShrink: 1 },
  ajudaAgendada: { color: "#FFD600", marginLeft: 7, fontSize: 13.5 },
  ajudaRapida: { color: "#FFD600", marginLeft: 7, fontSize: 13.5 },
  createdAt: { color: "#AAA", marginLeft: 7, fontSize: 12 },
  expire: { color: "#FFD600", marginLeft: 7, fontSize: 12 },
  actionsRow: { flexDirection: "row", alignItems: "center", marginTop: 13, gap: 8 },
  acceptBtn: {
    backgroundColor: "#00C859",
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 17,
    marginRight: 5,
  },
  acceptBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  hideBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181A20",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#FFD600",
    marginRight: 3,
  },
  hideBtnText: { color: "#FFD600", fontWeight: "600", fontSize: 13 },
  unhideBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181A20",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "#00C859",
    marginRight: 3,
  },
  unhideBtnText: { color: "#00C859", fontWeight: "600", fontSize: 13 },
  editBtn: {
    backgroundColor: "#23262F",
    borderRadius: 8,
    padding: 7,
    marginRight: 4,
    borderWidth: 1,
    borderColor: "#4F8DFF",
  },
  cancelBtn: {
    backgroundColor: "#23262F",
    borderRadius: 8,
    padding: 7,
    borderWidth: 1,
    borderColor: "#FF4D4F",
  },
});
