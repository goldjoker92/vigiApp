import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function NovaDemandaModal({ visible, onClose, onCreate }) {
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  // Reset à l'ouverture
  React.useEffect(() => {
    if (visible) {
      setDesc('');
    }
  }, [visible]);

  // Fermer sur backdrop
  function handleBackdropPress() {
    Keyboard.dismiss();
    setTimeout(() => onClose && onClose(), 100);
  }

  // Création
  async function handleCreate() {
    if (!desc.trim()) {
      return;
    }
    setLoading(true);
    try {
      await onCreate(desc.trim());
      setDesc('');
      onClose();
    } catch (_) {
      // Toast d’erreur possible ici
    }
    setLoading(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={72}
          >
            <TouchableWithoutFeedback>
              <View style={styles.modalBox}>
                <Text style={styles.title}>Nova demanda de ajuda</Text>
                <ScrollView
                  contentContainerStyle={{ flexGrow: 1 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.label}>Descrição*</Text>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="Explique sua necessidade..."
                    placeholderTextColor="#999"
                    value={desc}
                    onChangeText={setDesc}
                    multiline
                    maxLength={200}
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                  />
                  <View style={styles.btnRow}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnCancel]}
                      onPress={onClose}
                      disabled={loading}
                    >
                      <Feather name="x" size={20} color="#FFD600" />
                      <Text style={styles.btnCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnCreate, !desc.trim() && { opacity: 0.7 }]}
                      onPress={handleCreate}
                      disabled={loading || !desc.trim()}
                    >
                      <Feather name="check" size={20} color="#fff" />
                      <Text style={styles.btnCreateText}>{loading ? 'Criando...' : 'Criar'}</Text>
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
    backgroundColor: 'rgba(10,12,22,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalBox: {
    backgroundColor: '#181A20',
    borderRadius: 17,
    padding: 22,
    minWidth: 300,
    maxWidth: 430,
    width: '100%',
    elevation: 7,
    shadowColor: '#000',
    shadowOpacity: 0.23,
    shadowRadius: 13,
  },
  title: {
    fontSize: 23,
    fontWeight: 'bold',
    color: '#FFD600',
    marginBottom: 16,
    textAlign: 'center',
  },
  label: {
    fontWeight: '600',
    color: '#FFD600',
    marginBottom: 4,
    fontSize: 15.5,
  },
  input: {
    backgroundColor: '#22242D',
    color: '#fff',
    borderRadius: 12,
    padding: 13,
    fontSize: 16.5,
    minHeight: 72,
    marginBottom: 17,
    borderWidth: 1.2,
    borderColor: '#FFD600',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 9,
  },
  btnCancel: {
    backgroundColor: '#23262F',
    borderColor: '#FFD600',
    borderWidth: 2,
  },
  btnCancelText: {
    color: '#FFD600',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 7,
  },
  btnCreate: {
    backgroundColor: '#00C859',
  },
  btnCreateText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 7,
  },
});
