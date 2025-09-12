import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function ConfirmModal({
  visible,
  title = '',
  description = '',
  confirmLabel = 'Sim',
  cancelLabel = 'Não',
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <Text style={styles.message}>{description}</Text>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Feather name="x-circle" size={20} color="#b55a43" />
              <Text style={[styles.btnText, { color: '#b55a43' }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#43b57b" />
              ) : (
                <>
                  <Feather name="check-circle" size={20} color="#43b57b" />
                  <Text style={[styles.btnText, { color: '#43b57b' }]}>{confirmLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    backgroundColor: '#181A20',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 19,
    color: '#FFD600',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 14,
  },
  message: {
    color: '#ededed',
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#192d23',
    borderRadius: 12,
    paddingVertical: 10,
    marginLeft: 8,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a1916',
    borderRadius: 12,
    paddingVertical: 10,
    marginRight: 8,
  },
  btnText: {
    marginLeft: 6,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
