import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  KeyboardAvoidingView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";

export default function EditHelpModal({ visible, demanda, onClose, onSave }) {
  const [desc, setDesc] = useState(demanda ? demanda.message : "");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  // Reset la description quand on ouvre une nouvelle demande
  useEffect(() => {
    setDesc(demanda?.message || "");
  }, [demanda, visible]);

  // Gère la fermeture de la modale (clic en dehors)
  function handleBackdropPress() {
    Keyboard.dismiss();
    setTimeout(() => onClose && onClose(), 120);
  }

  // Gère l’envoi
  async function handleSave() {
    if (!desc.trim()) return;
    setLoading(true);
    try {
      await onSave(desc.trim());
    } catch (_err) {
      // Optionnel : toast d’erreur ici
    }
    setLoading(false);
  }

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={72}
          >
            <TouchableWithoutFeedback>
              <View style={styles.modalBox}>
                <Text style={styles.title}>Modificar sua demanda</Text>
                <ScrollView
                  contentContainerStyle={{ flexGrow: 1 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.label}>Descrição*</Text>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="Explique sua necessidade..."
                    value={desc}
                    onChangeText={setDesc}
                    multiline
                    maxLength={200}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnCancel]}
                      onPress={onClose}
                      disabled={loading}
                    >
                      <Feather name="x" size={17} color="#FFD600" />
                      <Text style={styles.btnCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSave]}
                      onPress={handleSave}
                      disabled={loading || !desc.trim()}
                    >
                      <Feather name="check" size={17} color="#fff" />
                      <Text style={styles.btnSaveText}>
                        {loading ? "Salvando..." : "Salvar"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,12,22,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  modalBox: {
    backgroundColor: "#181A20",
    borderRadius: 17,
    padding: 22,
    minWidth: 300,
    maxWidth: 430,
    width: "100%",
    elevation: 7,
    shadowColor: "#000",
    shadowOpacity: 0.23,
    shadowRadius: 13,
  },
  title: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#FFD600",
    marginBottom: 16,
    textAlign: "center",
  },
  label: {
    fontWeight: "600",
    color: "#FFD600",
    marginBottom: 4,
    fontSize: 15.5,
  },
  input: {
    backgroundColor: "#22242D",
    color: "#fff",
    borderRadius: 12,
    padding: 13,
    fontSize: 16.5,
    minHeight: 72,
    marginBottom: 17,
    borderWidth: 1.2,
    borderColor: "#FFD600",
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 9,
  },
  btnCancel: {
    backgroundColor: "#23262F",
    borderColor: "#FFD600",
    borderWidth: 2,
  },
  btnCancelText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 7,
  },
  btnSave: {
    backgroundColor: "#00C859",
  },
  btnSaveText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    marginLeft: 7,
  },
});
