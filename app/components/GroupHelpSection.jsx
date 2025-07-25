import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Modal,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import Toast from "react-native-toast-message";
import 'dayjs/locale/pt-br';

import { createGroupHelp } from "../../services/groupHelpService";
// ADAPTE ICI si ton store user a une autre structure
import { useUserStore } from "../../store/users";


dayjs.locale('pt-br');

export default function GroupHelpSection({ groupId }) {
  const [tipoAjuda, setTipoAjuda] = useState("rapido");
  const [descricao, setDescricao] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);

  const { user } = useUserStore(); // DOIT retourner {id, apelido, ...}

  const minDate = new Date();
  const maxDate = dayjs().add(3, "day").endOf('day').toDate();
  const dataLimite = dayjs(maxDate).format("D [de] MMMM");

  const handleSelectAjuda = (type) => setTipoAjuda(type);
  const handleChangeDescricao = (text) => setDescricao(text);

  const handleDateChange = (event, date) => {
    if (date) {
      const corrige = dayjs(date).isAfter(maxDate)
        ? maxDate
        : dayjs(date).isBefore(minDate)
        ? minDate
        : date;
      setSelectedDate(corrige);
      setShowPicker(false);
    } else if (Platform.OS === "android") {
      setShowPicker(false);
    }
  };

  const handlePedirAjuda = async () => {
    if (!descricao.trim()) {
      Toast.show({
        type: "error",
        text1: "Descreva sua necessidade",
        text2: "O campo descrição é obrigatório.",
      });
      return;
    }
    if (!user || !user.id) {
      Toast.show({
        type: "error",
        text1: "Usuário não autenticado",
        text2: "Faça login para pedir ajuda.",
      });
      return;
    }
    setIsLoading(true);
    try {
      await createGroupHelp({
        groupId,
        userId: user.id,
        apelido: user.apelido,
        message: descricao,
        isScheduled: tipoAjuda === "agendada",
        dateHelp: tipoAjuda === "agendada" ? selectedDate : null,
      });
      Toast.show({
        type: "success",
        text1: "Ajuda solicitada!",
        text2: "Seu pedido foi enviado aos vizinhos.",
      });
      setDescricao("");
      setTipoAjuda("rapido");
      setSelectedDate(new Date());
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Erro ao enviar pedido",
        text2: err.message || "Tente novamente.",
      });
    }
    setIsLoading(false);
  };

  const handleCancelar = () => {
    setDescricao("");
    setTipoAjuda("rapido");
    setSelectedDate(new Date());
  };

  const handleClosePicker = () => setShowPicker(false);

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Como você precisa de ajuda?</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.optionBtn, tipoAjuda === "rapido" && styles.optionBtnActive]}
          onPress={() => handleSelectAjuda("rapido")}
        >
          <Text style={[styles.optionText, tipoAjuda === "rapido" && styles.optionTextActive]}>
            O mais rápido possível
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.optionBtn, tipoAjuda === "agendada" && styles.optionBtnActive]}
          onPress={() => handleSelectAjuda("agendada")}
        >
          <Text style={[styles.optionText, tipoAjuda === "agendada" && styles.optionTextActive]}>
            Agendada
          </Text>
        </TouchableOpacity>
      </View>

      {tipoAjuda === "agendada" && (
        <View style={{ marginBottom: 18 }}>
          <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.dateBtn}>
            <Text style={styles.dateBtnText}>
              {dayjs(selectedDate).format("DD/MM/YYYY")}
            </Text>
          </TouchableOpacity>
          {showPicker && Platform.OS === "android" && (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="calendar"
              onChange={handleDateChange}
              minimumDate={minDate}
              maximumDate={maxDate}
            />
          )}
          {showPicker && Platform.OS === "ios" && (
            <Modal
              animationType="fade"
              transparent
              visible={showPicker}
              onRequestClose={handleClosePicker}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.pickerModalBox}>
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    style={{ width: 250, alignSelf: "center" }}
                  />
                  <TouchableOpacity style={styles.cancelarPedidoBtn} onPress={handleClosePicker}>
                    <Text style={styles.cancelarPedidoText}>Cancelar pedido</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
          <Text style={styles.infoText}>
            Você pode pedir ajuda até {dataLimite} (máximo 3 dias de antecedência).
          </Text>
        </View>
      )}

      <Text style={styles.label}>Descreva sua necessidade *</Text>
      <TextInput
        value={descricao}
        onChangeText={handleChangeDescricao}
        style={styles.textInput}
        multiline
        maxLength={120}
        placeholder="Ex: Emprestar ferramenta | Montar móvel | Mover sofá"
        placeholderTextColor="#AAA"
      />
      <Text style={styles.precisao}>
        Seja muito preciso no seu pedido para facilitar a ajuda dos vizinhos.
      </Text>

      <View style={styles.alertBox}>
        <Text style={styles.alertText}>
          <Text style={{ fontWeight: "bold" }}>O VigiApp não transmite dados pessoais.</Text>{" "}
          Proibido cobrar ou prestar serviços remunerados. Só use para solidariedade e boa fé.
        </Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.enviarBtn, isLoading && { opacity: 0.7 }]}
          onPress={handlePedirAjuda}
          disabled={isLoading}
        >
          <Text style={styles.enviarBtnText}>
            {isLoading ? "Enviando..." : "Pedir ajuda"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelarBtn} onPress={handleCancelar} disabled={isLoading}>
          <Text style={styles.cancelarBtnText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#23252C",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  optionBtn: {
    flex: 1,
    backgroundColor: "#181A20",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFD60044",
  },
  optionBtnActive: {
    borderColor: "#FFD600",
    backgroundColor: "#FFD60022",
  },
  optionText: {
    color: "#FFD600",
    fontSize: 14,
    fontWeight: "500",
  },
  optionTextActive: {
    color: "#181A20",
    fontWeight: "bold",
  },
  dateBtn: {
    backgroundColor: "#181A20",
    borderRadius: 10,
    padding: 11,
    alignItems: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#FFD600",
  },
  dateBtnText: {
    color: "#FFD600",
    fontSize: 16,
  },
  infoText: {
    color: "#FFD600",
    fontSize: 13,
    marginLeft: 4,
    marginTop: 2,
    marginBottom: 6,
  },
  precisao: {
    color: "#FFD600",
    fontSize: 13,
    marginBottom: 6,
    marginTop: -8,
    marginLeft: 2,
  },
  textInput: {
    backgroundColor: "#181A20",
    borderRadius: 10,
    color: "#fff",
    padding: 13,
    minHeight: 60,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#FFD60022",
  },
  alertBox: {
    backgroundColor: "#FFF4DE",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  alertText: {
    color: "#FF9900",
    fontSize: 14,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16,
  },
  enviarBtn: {
    flex: 1,
    backgroundColor: "#FFD600",
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 2,
  },
  enviarBtnText: {
    color: "#23252C",
    fontWeight: "bold",
    fontSize: 15,
  },
  cancelarBtn: {
    flex: 1,
    backgroundColor: "#23252C",
    padding: 13,
    borderRadius: 12,
    alignItems: "center",
    marginLeft: 2,
    borderWidth: 1,
    borderColor: "#FFD600",
  },
  cancelarBtnText: {
    color: "#FFD600",
    fontWeight: "bold",
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.23)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerModalBox: {
    backgroundColor: "#23252C",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    width: 290,
    maxWidth: "90%",
  },
  cancelarPedidoBtn: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 24,
    backgroundColor: "#FFD600",
    borderRadius: 8,
  },
  cancelarPedidoText: {
    color: "#23252C",
    fontWeight: "bold",
    fontSize: 15,
  },
});
