import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import dayjs from "dayjs";

export default function CardHelpRequest({
  demanda,
  numPedido,
  isMine = false,
  onEdit,
  onCancel,
  onClose,
  onAccept,
  onHide,
  showEdit,
  showCancel,
  showAccept,
  showHide,
}) {
  if (!demanda) return null;

  // Statut : “aberta” ou “fechada”
  const status = demanda.status || "aberta";
  const isClosed = status === "fechada" || status === "closed";
  const canEdit = isMine && !isClosed;
  const canCancel = isMine && !isClosed;
  const canClose = isMine && !isClosed;

  // Pour afficher la date joliment
  const createdAt =
    demanda.createdAt?.toDate?.() ||
    demanda.createdAt ||
    demanda.dateHelp?.toDate?.() ||
    demanda.dateHelp ||
    new Date();

  return (
    <View
      style={[
        styles.card,
        isMine ? styles.cardMine : {},
        isClosed ? styles.cardClosed : {},
      ]}
    >
      <Text style={styles.numPedido}>#{numPedido}</Text>
      <Text style={styles.message}>{demanda.message}</Text>
      <Text style={styles.by}>
        por {demanda.apelido || "?"} — {dayjs(createdAt).format("DD/MM/YYYY, HH:mm")}
      </Text>
      {/* Status */}
      <View style={styles.statusRow}>
        <Text
          style={[
            styles.status,
            isClosed ? styles.statusClosed : styles.statusOpen,
          ]}
        >
          {isClosed ? "Fechada" : "Aberta"}
        </Text>
      </View>
      {/* Actions */}
      <View style={styles.actions}>
        {canEdit && (
          <TouchableOpacity style={styles.btnEdit} onPress={onEdit}>
            <Feather name="edit-3" size={18} color="#222" />
            <Text style={styles.btnEditText}>Modificar</Text>
          </TouchableOpacity>
        )}
        {canCancel && (
          <TouchableOpacity style={styles.btnCancel} onPress={onCancel}>
            <MaterialIcons name="cancel" size={18} color="#fff" />
            <Text style={styles.btnCancelText}>Cancelar</Text>
          </TouchableOpacity>
        )}
        {canClose && (
          <TouchableOpacity style={styles.btnClose} onPress={onClose}>
            <Feather name="check-circle" size={18} color="#fff" />
            <Text style={styles.btnCloseText}>Clôturer</Text>
          </TouchableOpacity>
        )}
        {/* Pour les autres utilisateurs */}
        {!isMine && showAccept && (
          <TouchableOpacity style={styles.btnAccept} onPress={onAccept}>
            <Feather name="handshake" size={18} color="#fff" />
            <Text style={styles.btnAcceptText}>Ajudar</Text>
          </TouchableOpacity>
        )}
        {!isMine && showHide && (
          <TouchableOpacity style={styles.btnHide} onPress={onHide}>
            <Feather name="eye-off" size={18} color="#FFD600" />
            <Text style={styles.btnHideText}>Ocultar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#23262F",
    borderRadius: 12,
    padding: 14,
    marginBottom: 13,
    borderWidth: 2,
    borderColor: "#FFD600",
  },
  cardMine: {
    backgroundColor: "#183924",
    borderColor: "#FFD600",
  },
  cardClosed: {
    opacity: 0.67,
    borderColor: "#AAA",
    backgroundColor: "#282828",
  },
  numPedido: {
    position: "absolute",
    left: 5,
    top: 5,
    backgroundColor: "#FFD600",
    color: "#222",
    fontWeight: "bold",
    paddingHorizontal: 8,
    borderRadius: 10,
    fontSize: 15,
    zIndex: 1,
  },
  message: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
  },
  by: {
    color: "#ccc",
    fontSize: 13,
    marginBottom: 6,
  },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  status: {
    fontWeight: "bold",
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "#222",
    alignSelf: "flex-start",
    marginRight: 8,
  },
  statusOpen: {
    color: "#2dd36f",
    backgroundColor: "#111",
  },
  statusClosed: {
    color: "#aaa",
    backgroundColor: "#444",
  },
  actions: { flexDirection: "row", marginTop: 4, flexWrap: "wrap" },
  btnEdit: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFD600",
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginRight: 10,
    marginBottom: 6,
  },
  btnEditText: {
    color: "#222",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 6,
  },
  btnCancel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D32F2F",
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginRight: 10,
    marginBottom: 6,
  },
  btnCancelText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 6,
  },
  btnClose: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#333",
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginRight: 10,
    marginBottom: 6,
  },
  btnCloseText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 6,
  },
  btnAccept: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00C859",
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginRight: 10,
    marginBottom: 6,
  },
  btnAcceptText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 6,
  },
  btnHide: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#23262F",
    borderColor: "#FFD600",
    borderWidth: 2,
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginRight: 10,
    marginBottom: 6,
  },
  btnHideText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 6,
  },
});
