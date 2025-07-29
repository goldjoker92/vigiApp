import React, { useState, useEffect, useRef } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Dimensions, ScrollView, Animated, Keyboard, TouchableWithoutFeedback
} from "react-native";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

// --- CONSTANTES
const MODAL_WIDTH = Math.min(Dimensions.get("window").width * 0.97, 410);

// --- STEPPER HEURE/MINUTE (modale maison)
function HeureStepperModal({ visible, onValidate, onCancel, initialHour = 8, initialMinute = 0 }) {
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  useEffect(() => {
    if (visible) {
      setHour(initialHour);
      setMinute(initialMinute);
      console.log("[Stepper] Reset ->", initialHour, initialMinute);
    }
  }, [visible, initialHour, initialMinute]);

  function adjustHour(val) {
    setHour(h => {
      let n = h + val;
      if (n < 8) n = 22;
      if (n > 22) n = 8;
      console.log("[Stepper] Hour ajusté :", n);
      return n;
    });
  }
  function adjustMinute(val) {
    setMinute(m => {
      let next = m + val;
      if (next < 0) next = 55;
      if (next > 55) next = 0;
      console.log("[Stepper] Minute ajustée :", next);
      return next;
    });
  }

  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={stepper.overlay}>
        <View style={stepper.box}>
          <Text style={stepper.title}>Choisis l’heure</Text>
          <View style={stepper.row}>
            <TouchableOpacity onPress={() => adjustHour(-1)} style={stepper.btn}><Text style={stepper.btnTxt}>-</Text></TouchableOpacity>
            <Text style={stepper.timeVal}>{hour.toString().padStart(2, "0")}</Text>
            <TouchableOpacity onPress={() => adjustHour(1)} style={stepper.btn}><Text style={stepper.btnTxt}>+</Text></TouchableOpacity>
            <Text style={stepper.sep}>:</Text>
            <TouchableOpacity onPress={() => adjustMinute(-5)} style={stepper.btn}><Text style={stepper.btnTxt}>-</Text></TouchableOpacity>
            <Text style={stepper.timeVal}>{minute.toString().padStart(2, "0")}</Text>
            <TouchableOpacity onPress={() => adjustMinute(5)} style={stepper.btn}><Text style={stepper.btnTxt}>+</Text></TouchableOpacity>
          </View>
          <Text style={stepper.summary}>
            {hour.toString().padStart(2, "0")}:{minute.toString().padStart(2, "0")}
          </Text>
          <View style={stepper.actions}>
            <TouchableOpacity
              style={stepper.validateBtn}
              onPress={() => {
                console.log("[Stepper] VALIDATE hour/minute", hour, minute);
                onValidate({ hour, minute });
              }}
            >
              <Feather name="check-circle" size={20} color="#fff" />
              <Text style={stepper.validateTxt}>Valider</Text>
            </TouchableOpacity>
            <TouchableOpacity style={stepper.cancelBtn} onPress={onCancel}>
              <Feather name="x-circle" size={19} color="#FFD600" />
              <Text style={stepper.cancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const stepper = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(18,19,22,0.88)", justifyContent: "center", alignItems: "center" },
  box: { backgroundColor: "#232628", borderRadius: 21, padding: 28, alignItems: "center", minWidth: 280 },
  title: { color: "#FFD600", fontSize: 21, fontWeight: "bold", marginBottom: 13 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 19 },
  btn: { padding: 8, marginHorizontal: 2, backgroundColor: "#191C22", borderRadius: 10 },
  btnTxt: { color: "#FFD600", fontSize: 24, fontWeight: "bold" },
  sep: { color: "#FFD600", fontSize: 23, fontWeight: "bold", marginHorizontal: 4 },
  timeVal: { color: "#fff", fontWeight: "bold", fontSize: 29, minWidth: 38, textAlign: "center" },
  summary: { marginBottom: 11, color: "#b2ec6b", fontSize: 18, fontWeight: "bold", letterSpacing: 0.03 },
  actions: { flexDirection: "row", gap: 13, alignItems: "center", marginTop: 3 },
  validateBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#13d872", borderRadius: 13, paddingHorizontal: 23, paddingVertical: 10, marginRight: 9 },
  validateTxt: { color: "#fff", fontWeight: "bold", fontSize: 17, marginLeft: 7 },
  cancelBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#23272E", borderColor: "#FFD600", borderWidth: 2, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 9 },
  cancelTxt: { color: "#FFD600", fontWeight: "bold", fontSize: 16, marginLeft: 7 },
});

// --- MODALE PRINCIPALE ---
export default function CreateHelpModal({ visible, onClose, onCreate, loading }) {
  const [desc, setDesc] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimeStepper, setShowTimeStepper] = useState(false);
  const [pickedDate, setPickedDate] = useState(null);
  const [pickedTime, setPickedTime] = useState(null); // date+heure finale

  const dateBtnAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef(null);

  const minDate = new Date();
  const maxDate = new Date();
  maxDate.setDate(minDate.getDate() + 4);

  useEffect(() => {
    if (visible) {
      setDesc("");
      setShowDatePicker(false);
      setShowTimeStepper(false);
      setPickedDate(null);
      setPickedTime(null);
    }
  }, [visible]);

  function scrollToAndPulse(refAnim, position = 330) {
    if (scrollRef.current) scrollRef.current.scrollTo({ y: position, animated: true });
    Animated.sequence([
      Animated.timing(refAnim, { toValue: 1.12, duration: 180, useNativeDriver: true }),
      Animated.spring(refAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  }

  function formatDateTime(date) {
    return date
      ? dayjs(date).locale("pt-br").format("dddd, D [de] MMMM [de] YYYY [às] HH:mm").replace(/^./, m => m.toUpperCase())
      : "";
  }

  function handleCreateImmediate() {
    if (!desc.trim()) return;
    console.log("[CREATE] Demande immédiate :", desc.trim());
    onCreate({ message: desc.trim(), isScheduled: false });
  }

  function handleCreateScheduled() {
    if (!desc.trim() || !pickedTime) return;
    console.log("[ENVOI] dateHelp:", pickedTime, pickedTime.toString());
    onCreate({ message: desc.trim(), isScheduled: true, dateHelp: pickedTime });
  }

  useEffect(() => {
    console.log("[STATE DEBUG]", {
      pickedDate, pickedTime, showDatePicker, showTimeStepper
    });
  }, [pickedDate, pickedTime, showDatePicker, showTimeStepper]);

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
                multiline maxLength={240} editable={!loading}
                autoFocus onSubmitEditing={Keyboard.dismiss}
                returnKeyType="done" blurOnSubmit
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
                    setTimeout(() => scrollToAndPulse(dateBtnAnim, 330), 350);
                  }}
                  disabled={!desc.trim() || loading}
                  activeOpacity={0.86}
                >
                  <Feather name="calendar" size={21} color="#00C859" style={{ marginRight: 8 }} />
                  <Text style={styles.btnTextAlt}>Agendar pedido</Text>
                </TouchableOpacity>
              </View>
              {/* Step 1 — Picker DATE */}
              {showDatePicker && (
                <View style={{ alignSelf: "stretch", alignItems: "center", marginTop: 9 }}>
                  <View style={{ width: 230, alignSelf: "center" }}>
                    <TouchableOpacity
                      activeOpacity={1}
                      style={{ opacity: 1 }}
                    >
                      <Text style={{
                        color: "#FFD600", fontWeight: "bold", fontSize: 18, marginBottom: 6, textAlign: "center"
                      }}>
                        Choisis une date entre aujourd’hui et {dayjs(maxDate).locale("pt-br").format("D [de] MMMM")}
                      </Text>
                    </TouchableOpacity>
                    <View style={{ borderRadius: 14, overflow: "hidden" }}>
                      {/* Picker natif pour la date seulement */}
                      <DateTimePicker
                        value={pickedDate || minDate}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "calendar"}
                        minimumDate={minDate}
                        maximumDate={maxDate}
                        onChange={(e, d) => {
                          if (d) {
                            setPickedDate(new Date(d));
                            console.log("[DATE PICK] choisie :", d, new Date(d).toString());
                          }
                        }}
                        locale="pt-BR"
                        themeVariant="dark"
                      />
                    </View>
                  </View>
                  <Animated.View style={{ transform: [{ scale: dateBtnAnim }] }}>
                    <TouchableOpacity
                      style={styles.btnValidate}
                      onPress={() => {
                        setShowDatePicker(false);
                        setShowTimeStepper(true);
                        console.log("[STEP] Passage à l’heure !");
                      }}
                    >
                      <Text style={styles.btnValidateText}>Validar data</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              )}
              {/* Step 2 — Stepper Heure */}
              <HeureStepperModal
                visible={showTimeStepper}
                onValidate={({ hour, minute }) => {
                  if (!pickedDate) return;
                  const final = new Date(
                    pickedDate.getFullYear(),
                    pickedDate.getMonth(),
                    pickedDate.getDate(),
                    hour, minute, 0, 0
                  );
                  setPickedTime(final);
                  setShowTimeStepper(false);
                  console.log("[HEURE VALIDEE] (stepper):", final, final.toString());
                }}
                onCancel={() => setShowTimeStepper(false)}
              />
              {/* Résumé + bouton final valider */}
              {pickedTime && (
                <View style={styles.selectedDateBox}>
                  <Feather name="calendar" size={19} color="#00C859" style={{ marginRight: 5 }} />
                  <Text style={styles.selectedDate}>{formatDateTime(pickedTime)}</Text>
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

// --- STYLES PRINCIPAUX ---
const styles = StyleSheet.create({
  avoider: { flex: 1, justifyContent: "center", alignItems: "center" },
  overlay: { flex: 1, width: "100%", backgroundColor: "rgba(14,15,18,0.82)", justifyContent: "center", alignItems: "center" },
  modalBox: {
    width: MODAL_WIDTH, borderRadius: 22, backgroundColor: "#191C22", paddingHorizontal: 22,
    paddingTop: 17, paddingBottom: 29, alignItems: "center", elevation: 11,
    shadowColor: "#000", shadowOpacity: 0.13, shadowRadius: 15, shadowOffset: { width: 0, height: 3 },
  },
  emoji: { fontSize: 38, marginBottom: 3 },
  title: { color: "#FFD600", fontWeight: "bold", fontSize: 27, marginBottom: 18, textAlign: "center", letterSpacing: 0.1, lineHeight: 33 },
  label: { color: "#FFD600", fontWeight: "bold", fontSize: 21, alignSelf: "flex-start", marginBottom: 6, marginTop: 4, letterSpacing: 0.1 },
  input: { width: "100%", minHeight: 66, maxHeight: 113, borderWidth: 2, borderColor: "#FFD600", borderRadius: 13, backgroundColor: "#17191f", color: "#ededed", fontSize: 20, padding: 13, marginBottom: 15 },
  btnRow: { width: "100%", flexDirection: "column", justifyContent: "center", alignItems: "stretch", marginBottom: 8, gap: 13 },
  btn: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 15, marginBottom: 0, width: "100%", justifyContent: "center", minHeight: 49 },
  btnImmediate: { borderColor: "#FFD600", backgroundColor: "#16181c" },
  btnSchedule: { borderColor: "#13d872", backgroundColor: "#17191f", marginTop: 8 },
  btnText: { color: "#FFD600", fontWeight: "bold", fontSize: 19, letterSpacing: 0.1 },
  btnTextAlt: { color: "#13d872", fontWeight: "bold", fontSize: 19, letterSpacing: 0.1 },
  btnValidate: { marginTop: 13, backgroundColor: "#191C22", borderColor: "#FFD600", borderWidth: 2, borderRadius: 12, paddingHorizontal: 25, paddingVertical: 10, shadowColor: "#FFD600", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 7, elevation: 7 },
  btnValidateText: { color: "#FFD600", fontWeight: "bold", fontSize: 17, letterSpacing: 0.06 },
  btnScheduleCreate: { flexDirection: "row", alignItems: "center", backgroundColor: "#13d872", borderRadius: 11, paddingVertical: 12, paddingHorizontal: 22, width: "100%", marginTop: 14, justifyContent: "center" },
  btnTextSchedule: { color: "#fff", fontWeight: "bold", fontSize: 18, letterSpacing: 0.05 },
  selectedDateBox: { alignItems: "center", marginTop: 13, marginBottom: -2, backgroundColor: "#1e222a", borderWidth: 1.2, borderColor: "#13d872", borderRadius: 9, paddingVertical: 10, paddingHorizontal: 15, alignSelf: "center" },
  selectedDate: { color: "#13d872", fontWeight: "bold", fontSize: 17, letterSpacing: 0.04, marginLeft: 7, marginRight: 7, textAlign: "center" },
  btnCancel: { flexDirection: "row", alignItems: "center", backgroundColor: "#23272E", borderColor: "#FFD600", borderWidth: 2, borderRadius: 13, marginTop: 26, paddingVertical: 10, paddingHorizontal: 19, width: "100%", justifyContent: "center" },
  btnTextCancel: { color: "#FFD600", fontWeight: "bold", fontSize: 20, letterSpacing: 0.11 },
});
