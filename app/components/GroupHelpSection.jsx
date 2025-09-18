import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import Toast from 'react-native-toast-message';

import { createGroupHelp, countUserRequests } from '../../services/groupHelpService';
import { useUserStore } from '../../store/users';

dayjs.locale('pt-br');

export default function GroupHelpSection({ groupId: groupIdProp }) {
  const { user, groupId: groupIdStore } = useUserStore();
  const groupId = groupIdProp || groupIdStore;

  const [tipoAjuda, setTipoAjuda] = useState('rapido');
  const [descricao, setDescricao] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);

  const minDate = new Date();
  const maxDate = dayjs().add(3, 'day').endOf('day').toDate();
  const dataLimite = dayjs(maxDate).format('D [de] MMMM');

  // ---- DateTimePicker
  const handleOpenPicker = () => setShowPicker(true);

  const handleDateChange = (event, date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'set' && date) {
        let finalDate = dayjs(date);
        if (finalDate.isAfter(maxDate)) {finalDate = dayjs(maxDate);}
        if (finalDate.isBefore(minDate)) {finalDate = dayjs(minDate);}
        setSelectedDate(finalDate.toDate());
      }
      setShowPicker(false);
    } else if (Platform.OS === 'ios') {
      if (event.type === 'set' && date) {
        let finalDate = dayjs(date);
        if (finalDate.isAfter(maxDate)) {finalDate = dayjs(maxDate);}
        if (finalDate.isBefore(minDate)) {finalDate = dayjs(minDate);}
        setSelectedDate(finalDate.toDate());
      }
    }
  };

  // ---- Formulaire
  const handlePedirAjuda = async () => {
    console.log('[HELP][SEND] param:', { descricao, groupId, user });
    if (!descricao.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Descreva sua necessidade',
        text2: 'O campo descrição é obrigatório.',
      });
      return;
    }
    if (!user || !user.id) {
      Toast.show({
        type: 'error',
        text1: 'Usuário não autenticado',
        text2: 'Faça login para pedir ajuda.',
      });
      return;
    }
    if (!groupId) {
      Toast.show({
        type: 'error',
        text1: 'Nenhum grupo encontrado',
        text2: 'Entre em um grupo antes de pedir ajuda.',
      });
      return;
    }
    if (descricao.trim().length < 15) {
      Toast.show({
        type: 'error',
        text1: 'Descrição muito curta',
        text2: 'Descreva sua necessidade em pelo menos 15 caracteres.',
      });
      return;
    }
    setIsLoading(true);

    try {
      const now = dayjs();
      const todayStart = now.startOf('day').toDate();
      const weekStart = now.startOf('week').toDate();

      // Limite jour
      console.log('[HELP][COUNT] Check demandesHoje', {
        userId: user.id,
        groupId,
        since: todayStart,
      });
      const demandesHoje = await countUserRequests({ userId: user.id, groupId, since: todayStart });
      console.log('[HELP][COUNT] demandesHoje =', demandesHoje);
      if (demandesHoje >= 2) {
        setIsLoading(false);
        Alert.alert(
          'Limite diário atingido',
          'Você atingiu o limite de 2 pedidos por dia. Tente novamente amanhã.'
        );
        return;
      }
      // Limite semaine
      console.log('[HELP][COUNT] Check demandesSemana', {
        userId: user.id,
        groupId,
        since: weekStart,
      });
      const demandesSemana = await countUserRequests({
        userId: user.id,
        groupId,
        since: weekStart,
      });
      console.log('[HELP][COUNT] demandesSemana =', demandesSemana);
      if (demandesSemana >= 8) {
        setIsLoading(false);
        Alert.alert(
          'Limite semanal atingido',
          'Você atingiu o limite de 8 pedidos por semana. Tente novamente na próxima semana.'
        );
        return;
      }

      // Création de la demande
      const payload = {
        groupId,
        userId: user.id,
        apelido: user.apelido,
        message: descricao,
        isScheduled: tipoAjuda === 'agendada',
        dateHelp: tipoAjuda === 'agendada' ? selectedDate : null,
      };
      console.log('[HELP][CREATE] payload:', payload);

      await createGroupHelp(payload);

      if (tipoAjuda === 'agendada') {
        Toast.show({
          type: 'success',
          text1: `Seu pedido agendado para dia ${dayjs(selectedDate).format('dddd, D [de] MMMM [às] HH:mm')}`,
          text2: 'Por gentileza, aguarde contato.',
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Seu pedido foi enviado aos vizinhos.',
          text2: 'O mais rápido possível. Por gentileza, aguarde contato.',
        });
      }
      setDescricao('');
      setTipoAjuda('rapido');
      setSelectedDate(new Date());
      console.log('[HELP][CREATE] SUCCESS');
    } catch (err) {
      console.log('[HELP][ERROR]', err);
      Toast.show({
        type: 'error',
        text1: 'Erro ao enviar pedido',
        text2: err.message || 'Tente novamente.',
      });
    }
    setIsLoading(false);
  };

  const handleCancelar = () => {
    setDescricao('');
    setTipoAjuda('rapido');
    setSelectedDate(new Date());
  };

  const handleClosePicker = () => setShowPicker(false);

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Como você precisa de ajuda?</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.optionBtn, tipoAjuda === 'rapido' && styles.optionBtnActive]}
          onPress={() => setTipoAjuda('rapido')}
        >
          <Text style={[styles.optionText, tipoAjuda === 'rapido' && styles.optionTextActive]}>
            O mais rápido possível
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.optionBtn, tipoAjuda === 'agendada' && styles.optionBtnActive]}
          onPress={() => {
            setTipoAjuda('agendada');
            setShowPicker(true);
          }}
        >
          <Text style={[styles.optionText, tipoAjuda === 'agendada' && styles.optionTextActive]}>
            Agendada (data e hora)
          </Text>
        </TouchableOpacity>
      </View>
      {tipoAjuda === 'agendada' && (
        <View style={{ marginBottom: 18 }}>
          <TouchableOpacity style={styles.dateBtn} onPress={handleOpenPicker}>
            <Text style={styles.dateBtnText}>
              {dayjs(selectedDate).format('dddd, D [de] MMMM [às] HH:mm')}
            </Text>
          </TouchableOpacity>
          {showPicker && Platform.OS === 'android' && (
            <DateTimePicker
              value={selectedDate}
              mode="datetime"
              display="default"
              onChange={handleDateChange}
              minimumDate={minDate}
              maximumDate={maxDate}
              is24Hour={true}
              locale="pt-BR"
            />
          )}
          {showPicker && Platform.OS === 'ios' && (
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
                    mode="datetime"
                    display="spinner"
                    onChange={handleDateChange}
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    is24Hour={true}
                    locale="pt-BR"
                    style={{ width: 250, alignSelf: 'center' }}
                  />
                  <TouchableOpacity style={styles.cancelarPedidoBtn} onPress={handleClosePicker}>
                    <Text style={styles.cancelarPedidoText}>Fechar</Text>
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
        onChangeText={setDescricao}
        style={styles.textInput}
        multiline
        maxLength={120}
        placeholder="Ex: Emprestar ferramenta | Montar móvel | Mover sofá"
        placeholderTextColor="#AAA"
      />
      <Text style={styles.precisao}>
        Seja muito preciso no seu pedido para facilitar a ajuda dos vizinhos.{'\n'}
        (mínimo 15 caracteres)
      </Text>
      <View style={styles.alertBox}>
        <Text style={styles.alertText}>
          <Text style={{ fontWeight: 'bold' }}>O VigiApp não transmite dados pessoais.</Text>{' '}
          Proibido cobrar ou prestar serviços remunerados. Só use para solidariedade e boa fé.
        </Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.enviarBtn, isLoading && { opacity: 0.7 }]}
          onPress={handlePedirAjuda}
          disabled={isLoading}
        >
          <Text style={styles.enviarBtnText}>{isLoading ? 'Enviando...' : 'Pedir ajuda'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelarBtn} onPress={handleCancelar} disabled={isLoading}>
          <Text style={styles.cancelarBtnText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: '#23252C', borderRadius: 16, padding: 16, marginBottom: 24 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  optionBtn: {
    flex: 1,
    backgroundColor: '#181A20',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD60044',
  },
  optionBtnActive: { borderColor: '#FFD600', backgroundColor: '#FFD60022' },
  optionText: { color: '#FFD600', fontSize: 14, fontWeight: '500' },
  optionTextActive: { color: '#181A20', fontWeight: 'bold' },
  dateBtn: {
    backgroundColor: '#181A20',
    borderRadius: 10,
    padding: 11,
    alignItems: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#FFD600',
  },
  dateBtnText: { color: '#FFD600', fontSize: 16 },
  infoText: { color: '#FFD600', fontSize: 13, marginLeft: 4, marginTop: 2, marginBottom: 6 },
  precisao: { color: '#FFD600', fontSize: 13, marginBottom: 6, marginTop: -8, marginLeft: 2 },
  textInput: {
    backgroundColor: '#181A20',
    borderRadius: 10,
    color: '#fff',
    padding: 13,
    minHeight: 60,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FFD60022',
  },
  alertBox: { backgroundColor: '#FFF4DE', borderRadius: 10, padding: 12, marginBottom: 14 },
  alertText: { color: '#FF9900', fontSize: 14 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  enviarBtn: {
    flex: 1,
    backgroundColor: '#FFD600',
    padding: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 2,
  },
  enviarBtnText: { color: '#23252C', fontWeight: 'bold', fontSize: 15 },
  cancelarBtn: {
    flex: 1,
    backgroundColor: '#23252C',
    padding: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginLeft: 2,
    borderWidth: 1,
    borderColor: '#FFD600',
  },
  cancelarBtnText: { color: '#FFD600', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.23)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerModalBox: {
    backgroundColor: '#23252C',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    width: 290,
    maxWidth: '90%',
  },
  cancelarPedidoBtn: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 24,
    backgroundColor: '#FFD600',
    borderRadius: 8,
  },
  cancelarPedidoText: { color: '#23252C', fontWeight: 'bold', fontSize: 15 },
});
