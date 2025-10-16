// CreateHelpModal.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

const MODAL_WIDTH = Math.min(Dimensions.get('window').width * 0.97, 410);

// --- Stepper Heure/Minute Modal ---
function HeureStepperModal({ visible, initialHour = 8, initialMinute = 0, onValidate, onCancel }) {
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  // Reset à chaque ouverture
  useEffect(() => {
    if (visible) {
      setHour(initialHour);
      setMinute(initialMinute);
    }
  }, [visible, initialHour, initialMinute]);

  const adjustHour = useCallback((delta) => {
    setHour((h) => {
      let n = h + delta;
      if (n < 8) {
        n = 22;
      }
      if (n > 22) {
        n = 8;
      }
      return n;
    });
  }, []);

  const adjustMinute = useCallback((delta) => {
    setMinute((m) => {
      let nm = m + delta;
      if (nm < 0) {
        nm = 55;
      }
      if (nm > 55) {
        nm = 0;
      }
      return nm;
    });
  }, []);

  const handleValidate = useCallback(() => {
    onValidate({ hour, minute });
    onCancel();
  }, [hour, minute, onValidate, onCancel]);

  if (!visible) {
    return null;
  }
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={stepperStyles.overlay}>
        <View style={stepperStyles.box}>
          <Text style={stepperStyles.title}>Choisis l’heure</Text>
          <View style={stepperStyles.row}>
            <TouchableOpacity onPress={() => adjustHour(-1)} style={stepperStyles.btn}>
              <Text style={stepperStyles.btnTxt}>-</Text>
            </TouchableOpacity>
            <Text style={stepperStyles.timeVal}>{String(hour).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={() => adjustHour(1)} style={stepperStyles.btn}>
              <Text style={stepperStyles.btnTxt}>+</Text>
            </TouchableOpacity>
            <Text style={stepperStyles.sep}>:</Text>
            <TouchableOpacity onPress={() => adjustMinute(-5)} style={stepperStyles.btn}>
              <Text style={stepperStyles.btnTxt}>-</Text>
            </TouchableOpacity>
            <Text style={stepperStyles.timeVal}>{String(minute).padStart(2, '0')}</Text>
            <TouchableOpacity onPress={() => adjustMinute(5)} style={stepperStyles.btn}>
              <Text style={stepperStyles.btnTxt}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={stepperStyles.summary}>
            {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
          </Text>
          <View style={stepperStyles.actions}>
            <TouchableOpacity onPress={handleValidate} style={stepperStyles.validateBtn}>
              <Feather name="check-circle" size={20} color="#fff" />
              <Text style={stepperStyles.validateTxt}>Valider</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel} style={stepperStyles.cancelBtn}>
              <Feather name="x-circle" size={19} color="#FFD600" />
              <Text style={stepperStyles.cancelTxt}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const stepperStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18,19,22,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    backgroundColor: '#232628',
    borderRadius: 21,
    padding: 28,
    alignItems: 'center',
    minWidth: 280,
  },
  title: { color: '#FFD600', fontSize: 21, fontWeight: 'bold', marginBottom: 13 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 19 },
  btn: { padding: 8, marginHorizontal: 2, backgroundColor: '#191C22', borderRadius: 10 },
  btnTxt: { color: '#FFD600', fontSize: 24, fontWeight: 'bold' },
  sep: { color: '#FFD600', fontSize: 23, fontWeight: 'bold', marginHorizontal: 4 },
  timeVal: { color: '#fff', fontWeight: 'bold', fontSize: 29, minWidth: 38, textAlign: 'center' },
  summary: { marginBottom: 11, color: '#b2ec6b', fontSize: 18, fontWeight: 'bold' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  validateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13d872',
    borderRadius: 13,
    paddingHorizontal: 23,
    paddingVertical: 10,
    marginRight: 9,
  },
  validateTxt: { color: '#fff', fontWeight: 'bold', fontSize: 17, marginLeft: 7 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#23272E',
    borderColor: '#FFD600',
    borderWidth: 2,
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  cancelTxt: { color: '#FFD600', fontWeight: 'bold', fontSize: 16, marginLeft: 7 },
});

// --- Modale Principale ---
export default function CreateHelpModal({ visible, onClose, onCreate, loading = false }) {
  const [desc, setDesc] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimeStepper, setShowTimeStepper] = useState(false);
  const [pickedDate, setPickedDate] = useState(null);
  const [pickedTime, setPickedTime] = useState(null);
  const [stepperInit, setStepperInit] = useState({ hour: 8, minute: 0 });

  const dateBtnAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef(null);

  const minDate = new Date();
  const maxDate = new Date(minDate);
  maxDate.setDate(minDate.getDate() + 4);

  // reset form à chaque ouverture
  useEffect(() => {
    if (visible) {
      setDesc('');
      setShowDatePicker(false);
      setShowTimeStepper(false);
      setPickedDate(null);
      setPickedTime(null);
    }
  }, [visible]);

  const scrollToAndPulse = useCallback((anim, y = 330) => {
    scrollRef.current?.scrollTo({ y, animated: true });
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.12, duration: 180, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  }, []);

  const formatDateTime = useCallback(
    (date) =>
      dayjs(date)
        .locale('pt-br')
        .format('dddd, D [de] MMMM [de] YYYY [às] HH:mm')
        .replace(/^./, (m) => m.toUpperCase()),
    [],
  );

  const isToday = (d) => dayjs(d).isSame(dayjs(), 'day');

  const handleCreateImmediate = useCallback(() => {
    if (!desc.trim()) {
      return;
    }
    onCreate({ message: desc.trim(), isScheduled: false });
    onClose();
  }, [desc, onCreate, onClose]);

  const handleCreateScheduled = useCallback(() => {
    if (!desc.trim() || !pickedTime) {
      return;
    }
    onCreate({ message: desc.trim(), isScheduled: true, dateHelp: pickedTime });
    onClose();
  }, [desc, pickedTime, onCreate, onClose]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 38 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
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
                placeholder="Ex: Me ajuda a mover um sofá..."
                placeholderTextColor="#b9b9b9"
                multiline
                maxLength={240}
                editable={!loading}
              />

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[
                    styles.btn,
                    styles.btnImmediate,
                    (!desc.trim() || loading) && { opacity: 0.5 },
                  ]}
                  onPress={handleCreateImmediate}
                  disabled={!desc.trim() || loading}
                >
                  <Feather name="zap" size={22} color="#FFD600" style={{ marginRight: 8 }} />
                  <Text style={styles.btnText}>Pedido quando possível</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.btn,
                    styles.btnSchedule,
                    (!desc.trim() || loading) && { opacity: 0.5 },
                  ]}
                  onPress={() => {
                    setShowDatePicker(true);
                    setTimeout(() => scrollToAndPulse(dateBtnAnim), 350);
                  }}
                  disabled={!desc.trim() || loading}
                >
                  <Feather name="calendar" size={21} color="#00C859" style={{ marginRight: 8 }} />
                  <Text style={styles.btnTextAlt}>Agendar pedido</Text>
                </TouchableOpacity>
              </View>

              {/* Step 1 — Picker Date */}
              {showDatePicker && (
                <View style={styles.stepSection}>
                  <Text style={styles.stepTitle}>
                    Choisis une date entre aujourd’hui et{' '}
                    {dayjs(maxDate).locale('pt-br').format('D [de] MMMM')}
                  </Text>
                  <DateTimePicker
                    value={pickedDate || minDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    onChange={(_, d) => d && setPickedDate(new Date(d))}
                    locale="pt-BR"
                    themeVariant="dark"
                  />
                  <Animated.View style={{ transform: [{ scale: dateBtnAnim }] }}>
                    <TouchableOpacity
                      style={styles.btnValidate}
                      onPress={() => {
                        // si pas de sélection manuelle, forcer la minDate
                        if (!pickedDate) {
                          setPickedDate(minDate);
                        }
                        const now = new Date();
                        setStepperInit({
                          hour: isToday(pickedDate || minDate) ? (now.getHours() + 2) % 24 : 8,
                          minute: isToday(pickedDate || minDate) ? now.getMinutes() : 0,
                        });
                        setShowDatePicker(false);
                        setShowTimeStepper(true);
                      }}
                    >
                      <Text style={styles.btnValidateText}>Validar data</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              )}

              {/* Step 2 — HeureStepper */}
              <HeureStepperModal
                key={`${stepperInit.hour}-${stepperInit.minute}`}
                visible={showTimeStepper}
                initialHour={stepperInit.hour}
                initialMinute={stepperInit.minute}
                onValidate={({ hour, minute }) => {
                  const final = new Date(
                    pickedDate.getFullYear(),
                    pickedDate.getMonth(),
                    pickedDate.getDate(),
                    hour,
                    minute,
                    0,
                    0,
                  );
                  setPickedTime(final);
                }}
                onCancel={() => setShowTimeStepper(false)}
              />

              {/* Récap + Confirm */}
              {pickedTime && (
                <>
                  <View style={styles.recapWrapper}>
                    <Text style={styles.recapText}>{formatDateTime(pickedTime)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.confirmBtn, loading && { opacity: 0.5 }]}
                    onPress={handleCreateScheduled}
                    disabled={loading}
                  >
                    <Feather
                      name="check-circle"
                      size={20}
                      color="#fff"
                      style={{ marginRight: 7 }}
                    />
                    <Text style={styles.confirmBtnText}>Confirmar agendamento</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Cancel */}
              <TouchableOpacity style={styles.btnCancel} onPress={onClose} disabled={loading}>
                <Feather name="x-circle" size={20} color="#FFD600" />
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
  avoider: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(14,15,18,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    width: MODAL_WIDTH,
    borderRadius: 22,
    backgroundColor: '#191C22',
    paddingHorizontal: 22,
    paddingTop: 17,
    paddingBottom: 29,
    alignItems: 'center',
    elevation: 11,
    shadowColor: '#000',
    shadowOpacity: 0.13,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 3 },
  },
  emoji: { fontSize: 38, marginBottom: 3 },
  title: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 27,
    marginBottom: 18,
    textAlign: 'center',
    lineHeight: 33,
  },
  label: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 21,
    alignSelf: 'flex-start',
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    width: '100%',
    minHeight: 66,
    maxHeight: 113,
    borderWidth: 2,
    borderColor: '#FFD600',
    borderRadius: 13,
    backgroundColor: '#17191f',
    color: '#ededed',
    fontSize: 20,
    padding: 13,
    marginBottom: 15,
  },
  btnRow: { width: '100%', flexDirection: 'column', gap: 13, marginBottom: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 11,
    paddingVertical: 11,
    paddingHorizontal: 15,
    justifyContent: 'center',
    minHeight: 49,
  },
  btnImmediate: { borderColor: '#FFD600', backgroundColor: '#16181c' },
  btnSchedule: { borderColor: '#13d872', backgroundColor: '#17191f' },
  btnText: { color: '#FFD600', fontWeight: 'bold', fontSize: 19 },
  btnTextAlt: { color: '#13d872', fontWeight: 'bold', fontSize: 19 },
  stepSection: { marginTop: 9, alignItems: 'center', width: '100%' },
  stepTitle: {
    color: '#FFD600',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  btnValidate: {
    marginTop: 13,
    backgroundColor: '#191C22',
    borderColor: '#FFD600',
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 25,
    paddingVertical: 10,
    elevation: 7,
  },
  btnValidateText: { color: '#FFD600', fontWeight: 'bold', fontSize: 17 },
  recapWrapper: {
    width: '100%',
    borderWidth: 2,
    borderColor: '#13d872',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 15,
    alignItems: 'center',
    marginTop: 15,
  },
  recapText: { color: '#13d872', fontSize: 17, fontWeight: 'bold', textAlign: 'center' },
  confirmBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#13d872',
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 22,
    marginTop: 10,
  },
  confirmBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  btnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#23272E',
    borderColor: '#FFD600',
    borderWidth: 2,
    borderRadius: 13,
    padding: 10,
    marginTop: 26,
  },
  btnTextCancel: { color: '#FFD600', fontWeight: 'bold', fontSize: 20, marginLeft: 7 },
});
