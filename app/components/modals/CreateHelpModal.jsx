import React, { useState, useEffect } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Dimensions, ScrollView
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

const MODAL_WIDTH = Math.min(Dimensions.get("window").width * 0.97, 410);

export default function CreateHelpModal({ visible, onClose, onCreate, loading }) {
  const [desc, setDesc] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState("date");
  const [pickedDate, setPickedDate] = useState(null);
  const [dateConfirmed, setDateConfirmed] = useState(false);

  // Min/max dates : today -> +4 days
  const minDate = new Date();
  const maxDate = new Date();
  maxDate.setDate(minDate.getDate() + 4);

  useEffect(() => {
    if (visible) {
      setDesc("");
      setShowPicker(false);
      setPickedDate(null);
      setDateConfirmed(false);
    }
  }, [visible]);

  function formatDateWithHour(date) {
    return dayjs(date)
      .locale("pt-br")
      .format("dddd, D [de] MMMM [às] HH:mm")
      .replace(/^./, m => m.toUpperCase());
  }

  // --- Sélection DATE puis HEURE ---
  const handleOpenDatePicker = () => {
    setPickerMode("date");
    setShowPicker(true);
    setDateConfirmed(false);
  };

  function onDateChange(event, selected) {
    if (pickerMode === "date" && selected) {
      // Stocke la date choisie, puis passe au picker heure
      const tempDate = new Date(selected);
      setPickedDate(tempDate);
      setPickerMode("time");
      setShowPicker(true);
      return;
    }
    if (pickerMode === "time" && selected) {
      // Fusionne heure choisie à la date déjà choisie
      const newDate = new Date(pickedDate);
      newDate.setHours(selected.getHours());
      newDate.setMinutes(selected.getMinutes());
      newDate.setSeconds(0);
      setPickedDate(newDate);
      setDateConfirmed(true);
      setShowPicker(false);
      return;
    }
    // Si l'utilisateur annule
    setShowPicker(false);
  }

  function handleCreateImmediate() {
    if (!desc.trim()) return;
    onCreate({ message: desc.trim(), isScheduled: false });
  }

  function handleCreateScheduled() {
    if (!desc.trim() || !pickedDate) return;
    onCreate({ message: desc.trim(), isScheduled: true, dateHelp: pickedDate });
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 48 : 0} // ← Descend la modale ici si besoin
      >
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={styles.modalBox}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.emoji}>🤝</Text>
            <Text style={styles.title}>Nova demanda de ajuda</Text>

            <Text style={styles.label}>Descrição*</Text>
            <TextInput
              style={styles.input}
              value={desc}
              onChangeText={setDesc}
              placeholder="Ex: Me ajuda a mover um sofá, me empresta ferramentas, preciso de uma escada..."
              placeholderTextColor="#b9b9b9"
              multiline
              maxLength={240}
              editable={!loading}
              autoFocus
              blurOnSubmit
            />

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[
                  styles.btn, styles.btnImmediate,
                  !desc.trim() && { opacity: 0.45 }
                ]}
                onPress={handleCreateImmediate}
                disabled={!desc.trim() || loading}
                activeOpacity={0.86}
              >
                <Feather name="zap" size={22} color="#FFD600" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Pedido quando possível</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btn, styles.btnSchedule,
                  !desc.trim() && { opacity: 0.45 }
                ]}
                onPress={handleOpenDatePicker}
                disabled={!desc.trim() || loading}
                activeOpacity={0.86}
              >
                <Feather name="calendar" size={21} color="#00C859" style={{ marginRight: 8 }} />
                <Text style={styles.btnTextAlt}>Agendar pedido</Text>
              </TouchableOpacity>
            </View>

            {/* Picker Date+Time */}
            {showPicker && (
              <DateTimePicker
                value={pickedDate || minDate}
                mode={pickerMode}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={minDate}
                maximumDate={maxDate}
                onChange={onDateChange}
                locale="pt-BR"
                themeVariant="dark"
                style={{ alignSelf: "center" }}
              />
            )}

            {/* Affichage date choisie */}
            {pickedDate && dateConfirmed && (
              <View style={styles.selectedDateBox}>
                <Feather name="calendar" size={19} color="#00C859" style={{ marginRight: 5 }} />
                <Text style={styles.selectedDate}>{formatDateWithHour(pickedDate)}</Text>
              </View>
            )}

            {/* Valider agendamento */}
            {pickedDate && dateConfirmed && (
              <TouchableOpacity
                style={[
                  styles.btnScheduleCreate,
                  !desc.trim() && { opacity: 0.55 },
                ]}
                onPress={handleCreateScheduled}
                disabled={!desc.trim() || loading}
                activeOpacity={0.85}
              >
                <Feather name="check-circle" size={20} color="#fff" style={{ marginRight: 7 }} />
                <Text style={styles.btnTextSchedule}>Confirmar agendamento</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.btnCancel}
              onPress={onClose}
              activeOpacity={0.78}
            >
              <Feather name="x-circle" size={20} color="#FFD600" style={{ marginRight: 7 }} />
              <Text style={styles.btnTextCancel}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoider: { flex: 1, justifyContent: "center", alignItems: "center" },
  overlay: {
    flex: 1,
    width: "100%",
    backgroundColor: "rgba(14,15,18,0.82)",
    justifyContent: "center",
    alignItems: "center"
  },
  modalBox: {
    width: MODAL_WIDTH,
    borderRadius: 22,
    backgroundColor: "#191C22",
    paddingHorizontal: 22,
    paddingTop: 23, // ← Ajuste ici si tu veux descendre le contenu
    paddingBottom: 29,
    alignItems: "center",
    elevation: 11,
    shadowColor: "#000",
    shadowOpacity: 0.13,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 3 },
  },
  emoji: { fontSize: 38, marginBottom: 3 },
  title: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 27,
    marginBottom: 18,
    textAlign: "center",
    letterSpacing: 0.1,
    lineHeight: 33
  },
  label: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 21,
    alignSelf: "flex-start",
    marginBottom: 6,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  input: {
    width: "100%",
    minHeight: 66,
    maxHeight: 113,
    borderWidth: 2,
    borderColor: "#FFD600",
    borderRadius: 13,
    backgroundColor: "#17191f",
    color: "#ededed",
    fontSize: 20,
    padding: 13,
    marginBottom: 15,
  },
  btnRow: {
    width: "100%",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "stretch",
    marginBottom: 8,
    gap: 13
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 15,
    marginBottom: 0,
    width: "100%",
    justifyContent: "center",
    minHeight: 49
  },
  btnImmediate: { borderColor: "#FFD600", backgroundColor: "#16181c" },
  btnSchedule: { borderColor: "#13d872", backgroundColor: "#17191f", marginTop: 8 },
  btnText: {
    color: "#FFD600", fontWeight: "bold", fontSize: 19, letterSpacing: 0.1,
  },
  btnTextAlt: {
    color: "#13d872", fontWeight: "bold", fontSize: 19, letterSpacing: 0.1,
  },
  btnScheduleCreate: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#13d872",
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 22,
    width: "100%",
    marginTop: 11,
    justifyContent: "center",
  },
  btnTextSchedule: {
    color: "#fff", fontWeight: "bold", fontSize: 18, letterSpacing: 0.05,
  },
  selectedDateBox: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 13,
    marginBottom: -2,
    backgroundColor: "#1e222a",
    borderWidth: 1.2,
    borderColor: "#13d872",
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 15,
    alignSelf: "center"
  },
  selectedDate: {
    color: "#13d872",
    fontWeight: "bold",
    fontSize: 16.5,
    letterSpacing: 0.04,
    marginLeft: 4,
  },
  btnCancel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#23272E",
    borderColor: "#FFD600",
    borderWidth: 2,
    borderRadius: 13,
    marginTop: 26,
    paddingVertical: 10,
    paddingHorizontal: 19,
    width: "100%",
    justifyContent: "center"
  },
  btnTextCancel: {
    color: "#FFD600", fontWeight: "bold", fontSize: 20, letterSpacing: 0.11,
  }
});
