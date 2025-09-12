import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

// --- HELPERS ---
function parseFirestoreDate(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return val; // déjà une Date JS
}

function formatHojeOuData(date) {
  const d = dayjs(date);
  const now = dayjs();
  if (d.isSame(now, 'day')) {
    return `Hoje às ${d.format('HH:mm')}`;
  }
  return `${d.locale('pt-br').format('dddd, D [de] MMMM')} às ${d.format('HH:mm')}`;
}

/**
 * @typedef {Object} Demanda
 * @property {string} id
 * @property {string} apelido
 * @property {string} message
 * @property {string} status
 * @property {any} [dateHelp]
 * @property {any} createdAt
 * @property {string} [volunteerId]
 * @property {string} [volunteerApelido]
 */

/**
 * @typedef {Object} Props
 * @property {Demanda} demanda
 * @property {string} [badgeId]
 * @property {boolean} [isMine]
 * @property {boolean} [showAccept]
 * @property {boolean} [showHide]
 * @property {"close"|"cancel"} [loading]
 * @property {number} [numPedido]
 * @property {(demanda: Demanda) => void} [onAccept]
 * @property {(demanda: Demanda) => void} [onHide]
 * @property {(demanda: Demanda) => void} [onCancel]
 * @property {(demanda: Demanda) => void} [onClose]
 */

export default function CardHelpRequest({
  demanda,
  badgeId,
  isMine = false,
  onCancel,
  onClose,
  onAccept,
  onHide,
  showAccept = false,
  showHide = false,
  loading,
  numPedido,
}) {
  const [fadeAnim] = useState(new Animated.Value(0));

  // --- LOG complet à chaque rendu (pour debug)
  useEffect(() => {
    console.log('[CardHelpRequest] Render', {
      id: demanda?.id,
      apelido: demanda?.apelido,
      isMine,
      showAccept,
      showHide,
      badgeId,
      numPedido,
      loading,
      hasOnAccept: !!onAccept,
    });
  }, [demanda, isMine, showAccept, showHide, badgeId, numPedido, loading, onAccept]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, demanda.id]);

  const dateHelp = parseFirestoreDate(demanda.dateHelp);
  const createdAt = parseFirestoreDate(demanda.createdAt);

  const isAgendada = demanda.status === 'scheduled' && dateHelp;
  const isRapido = demanda.status === 'open' && !demanda.dateHelp;
  const isCancelada = demanda.status === 'cancelled';
  const isAberta = demanda.status === 'open' && !isCancelada && !isAgendada;

  const color = isCancelada ? '#ff5d5d' : isAgendada ? '#ffd13a' : '#7fd06e';
  const borderColor = color;
  const shadowColor = color + '55';

  return (
    <Animated.View
      style={[
        styles.card,
        { borderColor, shadowColor, opacity: fadeAnim, backgroundColor: '#181a20' },
      ]}
    >
      <View style={[styles.numBulle, { borderColor, shadowColor }]}>
        <Text style={styles.numPedido}>{`#${badgeId || numPedido || '----'}`}</Text>
      </View>

      <Text style={styles.apelido}>{demanda.apelido || '—'}</Text>
      <Text style={styles.message}>{demanda.message}</Text>

      {isAgendada && (
        <Text style={styles.agendada}>
          <Text style={styles.agendadaEmoji}>🟡</Text>
          {` Agendada para ${formatHojeOuData(dateHelp)}`}
        </Text>
      )}

      {isRapido && (
        <>
          <Text style={styles.rapido}>O mais rápido possível, por favor 🙏</Text>
          <Text style={styles.criadaEm}>{formatHojeOuData(createdAt)}</Text>
        </>
      )}

      {isCancelada && <Text style={styles.cancelada}>Cancelada</Text>}

      <View style={styles.actions}>
        {isMine && (isAberta || isAgendada) && (
          <>
            <TouchableOpacity
              style={[styles.btn, styles.cloturerBtn]}
              onPress={() => {
                console.log('[CardHelpRequest] Clôturer tapped', demanda?.id);
                onClose && onClose(demanda);
              }}
              disabled={loading === 'close'}
              activeOpacity={0.86}
            >
              <Feather name="check-circle" size={18} color="#43b57b" />
              <Text style={[styles.btnText, { color: '#43b57b' }]}>Clôturer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.cancelarBtn]}
              onPress={() => {
                console.log('[CardHelpRequest] Cancelar tapped', demanda?.id);
                onCancel && onCancel(demanda);
              }}
              disabled={loading === 'cancel'}
              activeOpacity={0.86}
            >
              <Feather name="x-circle" size={18} color="#b55a43" />
              <Text style={[styles.btnText, { color: '#b55a43' }]}>Cancelar</Text>
            </TouchableOpacity>
          </>
        )}

        {!isMine && showAccept && (
          <TouchableOpacity
            style={[styles.btn, styles.acceptBtn]}
            onPress={() => {
              console.log('[CardHelpRequest] Aceitar tapped', demanda?.id);
              onAccept && onAccept(demanda);
            }}
            activeOpacity={0.86}
          >
            <Feather name="user-check" size={17} color="#43b57b" />
            <Text style={[styles.btnText, { color: '#43b57b' }]}>Aceitar</Text>
          </TouchableOpacity>
        )}

        {!isMine && showHide && (
          <TouchableOpacity
            style={[styles.btn, styles.hideBtn]}
            onPress={() => {
              console.log('[CardHelpRequest] Ocultar tapped', demanda?.id);
              onHide && onHide(demanda);
            }}
            activeOpacity={0.86}
          >
            <Feather name="eye-off" size={17} color="#FFD600" />
            <Text style={[styles.btnText, { color: '#FFD600' }]}>Ocultar</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderRadius: 17,
    padding: 16,
    marginBottom: 18,
    minHeight: 112,
    shadowOpacity: 0.17,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    position: 'relative',
  },
  numBulle: {
    position: 'absolute',
    top: -19,
    left: -11,
    backgroundColor: '#FFD600',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 2,
    zIndex: 5,
    borderWidth: 3,
    shadowColor: '#FFD600',
    shadowOpacity: 0.39,
    shadowRadius: 7,
    elevation: 4,
  },
  numPedido: {
    color: '#222',
    fontWeight: 'bold',
    fontSize: 18.5,
    letterSpacing: 1,
    textAlign: 'center',
  },
  apelido: {
    color: '#b2ec6b',
    fontWeight: 'bold',
    fontSize: 17,
    marginBottom: 2,
    letterSpacing: 0.09,
    marginTop: 5,
  },
  message: {
    color: '#ededed',
    fontSize: 17.7,
    marginBottom: 7,
    fontWeight: '500',
  },
  agendada: {
    color: '#ffd13a',
    fontWeight: 'bold',
    fontSize: 15.9,
    marginBottom: 2,
  },
  agendadaEmoji: {
    fontSize: 16,
    marginRight: 2,
  },
  rapido: {
    color: '#92be78',
    fontSize: 15.4,
    fontStyle: 'italic',
    marginBottom: 2,
    marginTop: 1,
    fontWeight: '500',
  },
  criadaEm: {
    color: '#aaa',
    fontSize: 13.6,
    fontStyle: 'italic',
    marginBottom: 1,
  },
  cancelada: {
    color: '#ff5d5d',
    fontWeight: 'bold',
    fontSize: 15.7,
    marginBottom: 2,
  },
  actions: {
    marginTop: 10,
    gap: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    width: '100%',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#232628',
    borderColor: '#6ea98d',
    borderWidth: 2,
    borderRadius: 13,
    paddingVertical: 8,
    paddingHorizontal: 19,
    marginRight: 9,
    shadowColor: '#232628',
    shadowOpacity: 0.11,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  btnText: {
    fontWeight: 'bold',
    fontSize: 15.2,
    marginLeft: 7,
    letterSpacing: 0.08,
  },
  cloturerBtn: {
    borderColor: '#43b57b',
    backgroundColor: '#192d23',
  },
  cancelarBtn: {
    borderColor: '#b55a43',
    backgroundColor: '#2a1916',
  },
  acceptBtn: {
    borderColor: '#43b57b',
    backgroundColor: '#192d23',
  },
  hideBtn: {
    borderColor: '#FFD600',
    backgroundColor: '#181a20',
  },
});
