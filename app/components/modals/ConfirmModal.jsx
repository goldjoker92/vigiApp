import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";

export default function ConfirmModal({
  visible,
  title = "Confirmação",
  description = "",
  onCancel,
  onConfirm,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  loading = false,
}) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Feather name="alert-triangle" size={32} color="#FFD600" style={{ alignSelf: "center", marginBottom: 6 }} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>{description}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onCancel} disabled={loading}>
              <Text style={styles.btnCancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnConfirm]} onPress={onConfirm} disabled={loading}>
              <Text style={styles.btnConfirmText}>{loading ? "..." : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,12,22,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  box: {
    backgroundColor: "#181A20",
    borderRadius: 17,
    padding: 22,
    width: "100%",
    maxWidth: 370,
    alignSelf: "center",
  },
  title: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 21,
    textAlign: "center",
    marginBottom: 8,
  },
  desc: {
    color: "#fff",
    textAlign: "center",
    fontSize: 16,
    marginBottom: 22,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 11,
    alignItems: "center",
    marginHorizontal: 7,
  },
  btnCancel: { backgroundColor: "#23262F" },
  btnCancelText: { color: "#FFD600", fontWeight: "bold", fontSize: 16 },
  btnConfirm: { backgroundColor: "#00C859" },
  btnConfirmText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
