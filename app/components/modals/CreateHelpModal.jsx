import React, { useState, useEffect, useRef } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Dimensions, ScrollView, Animated, Keyboard, TouchableWithoutFeedback 
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";


const MODAL_WIDTH = Math.min(Dimensions.get("window").width * 0.97, 410);

export default function CreateHelpModal({ visible, onClose, onCreate, loading }) {
  const [desc, setDesc] = useState("");

  // States pour la validation double
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(null);
  const [pickedDate, setPickedDate] = useState(null);
  const [tempTime, setTempTime] = useState(null);
  const [pickedTime, setPickedTime] = useState(null);

  // Animations
  const dateBtnAnim = useRef(new Animated.Value(1)).current;
  const timeBtnAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef(null);

  // Min/max dates : today -> +4 days
  const minDate = new Date();
  const maxDate = new Date();
  maxDate.setDate(minDate.getDate() + 4);

  useEffect(() => {
    if (visible) {
      setDesc("");
      setShowDatePicker(false);
      setShowTimePicker(false);
      setTempDate(null);
      setPickedDate(null);
      setTempTime(null);
      setPickedTime(null);
    }
  }, [visible]);

  // Format “Terça-feira, 30 de julho de 2025 às 17:45”
  function formatDateTime(date, time) {
    if (!date || !time) return "";
    const merged = new Date(date);
    merged.setHours(time.getHours());
    merged.setMinutes(time.getMinutes());
    return dayjs(merged)
      .locale("pt-br")
      .format("dddd, D [de] MMMM [de] YYYY [às] HH:mm")
      .replace(/^./, m => m.toUpperCase());
  }

  // --- SCROLL + ANIMATION BUTTONS ---
  // Fait défiler la ScrollView jusqu'au bouton et anime le bouton
  function scrollToAndPulse(refAnim, position = 330) {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: position, animated: true });
    }
    Animated.sequence([
      Animated.timing(refAnim, { toValue: 1.11, duration: 200, useNativeDriver: true }),
      Animated.spring(refAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  }

  // Création immédiate
  function handleCreateImmediate() {
    if (!desc.trim()) return;
    onCreate({ message: desc.trim(), isScheduled: false });
  }

  // Création planifiée
  function handleCreateScheduled() {
    if (!desc.trim() || !pickedDate || !pickedTime) return;
    const finalDate = new Date(pickedDate);
    finalDate.setHours(pickedTime.getHours());
    finalDate.setMinutes(pickedTime.getMinutes());
    finalDate.setSeconds(0);
    onCreate({ message: desc.trim(), isScheduled: true, dateHelp: finalDate });
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 38 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.overlay}>
          <ScrollView
            contentContainerStyle={styles.modalBox}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ref={scrollRef}
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
              onSubmitEditing={Keyboard.dismiss}
              returnKeyType="done"
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
                onPress={() => {
                  setShowDatePicker(true);
                  setTempDate(pickedDate || minDate);
                  setTimeout(() => scrollToAndPulse(dateBtnAnim, 330), 350);
                }}
                disabled={!desc.trim() || loading}
                activeOpacity={0.86}
              >
                <Feather name="calendar" size={21} color="#00C859" style={{ marginRight: 8 }} />
                <Text style={styles.btnTextAlt}>Agendar pedido</Text>
              </TouchableOpacity>
            </View>

            {/* Step 1 — Picker DATE + bouton valider + ANIM */}
            {showDatePicker && (
              <View style={{ alignSelf: "stretch", alignItems: "center", marginTop: 9 }}>
                <DateTimePicker
                  value={tempDate || minDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "calendar"}
                  minimumDate={minDate}
                  maximumDate={maxDate}
                  onChange={(e, d) => {
                    if (d) setTempDate(d);
                    setTimeout(() => scrollToAndPulse(dateBtnAnim, 330), 280);
                  }}
                  locale="pt-BR"
                  themeVariant="dark"
                />
                <Animated.View style={{ transform: [{ scale: dateBtnAnim }] }}>
                  <TouchableOpacity
                    style={styles.btnValidate}
                    onPress={() => {
                      setPickedDate(tempDate);
                      setShowDatePicker(false);
                      setTimeout(() => {
                        setShowTimePicker(true);
                        setTempTime(pickedTime || new Date());
                        setTimeout(() => scrollToAndPulse(timeBtnAnim, 440), 350);
                      }, 200);
                    }}
                  >
                    <Text style={styles.btnValidateText}>Validar data</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}

            {/* Step 2 — Picker HEURE + bouton valider + ANIM */}
            {showTimePicker && (
              <View style={{ alignSelf: "stretch", alignItems: "center", marginTop: 10 }}>
                <DateTimePicker
                  value={tempTime || new Date()}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "clock"}
                  onChange={(e, t) => {
                    if (t) setTempTime(t);
                    setTimeout(() => scrollToAndPulse(timeBtnAnim, 440), 280);
                  }}
                  locale="pt-BR"
                  themeVariant="dark"
                  is24Hour
                />
                <Animated.View style={{ transform: [{ scale: timeBtnAnim }] }}>
                  <TouchableOpacity
                    style={[styles.btnValidate, { marginTop: 6 }]}
                    onPress={() => {
                      setPickedTime(tempTime);
                      setShowTimePicker(false);
                    }}
                  >
                    <Text style={styles.btnValidateText}>Validar hora</Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>
            )}

            {/* Résumé + bouton final valider */}
            {pickedDate && pickedTime && (
              <View style={styles.selectedDateBox}>
                <Feather name="calendar" size={19} color="#00C859" style={{ marginRight: 5 }} />
                <Text style={styles.selectedDate}>
                  {formatDateTime(pickedDate, pickedTime)}
                </Text>
                <TouchableOpacity
                  style={styles.btnScheduleCreate}
                  onPress={handleCreateScheduled}
                  disabled={!desc.trim() || loading}
                  activeOpacity={0.85}
                >
                  <Feather name="check-circle" size={20} color="#fff" style={{ marginRight: 7 }} />
                  <Text style={styles.btnTextSchedule}>Confirmar agendamento</Text>
                </TouchableOpacity>
              </View>
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
        </TouchableWithoutFeedback>
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
    paddingTop: 17,
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
  btnValidate: {
    marginTop: 13,
    backgroundColor: "#191C22",
    borderColor: "#FFD600",
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 25,
    paddingVertical: 10,
    // --- boxShadow doux jaune ---
    shadowColor: "#FFD600",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 7,
  },
  btnValidateText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 17,
    letterSpacing: 0.06,
  },
  btnScheduleCreate: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#13d872",
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 22,
    width: "100%",
    marginTop: 14,
    justifyContent: "center",
  },
  btnTextSchedule: {
    color: "#fff", fontWeight: "bold", fontSize: 18, letterSpacing: 0.05,
  },
  selectedDateBox: {
    alignItems: "center",
    marginTop: 13,
    marginBottom: -2,
    backgroundColor: "#1e222a",
    borderWidth: 1.2,
    borderColor: "#13d872",
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 15,
    alignSelf: "center"
  },
  selectedDate: {
    color: "#13d872",
    fontWeight: "bold",
    fontSize: 17,
    letterSpacing: 0.04,
    marginLeft: 7,
    marginRight: 7,
    textAlign: "center"
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
