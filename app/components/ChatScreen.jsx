import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Modal,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  doc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useUserStore } from '../../store/users';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

// Composant bannière quand chat en attente règlement
function ChatPendingBanner({ onAccept, canAccept }) {
  return (
    <View style={bannerStyles.banner}>
      <Feather name="clock" size={22} color="#FFD600" style={{ marginRight: 10 }} />
      <Text style={bannerStyles.text}>
        Aguarde que ambos aceitem o regulamento para iniciar a conversa.
      </Text>
      {canAccept && (
        <TouchableOpacity style={bannerStyles.btn} onPress={onAccept} activeOpacity={0.85}>
          <Text style={bannerStyles.btnText}>Aceitar regulamento</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const bannerStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#23262F',
    borderRadius: 13,
    borderWidth: 1.6,
    borderColor: '#FFD600',
    margin: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
    shadowColor: '#FFD600',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 52,
  },
  text: { color: '#FFD600', fontSize: 14.7, flex: 1, fontWeight: '600' },
  btn: {
    backgroundColor: '#FFD600',
    borderRadius: 9,
    marginLeft: 12,
    paddingVertical: 6,
    paddingHorizontal: 13,
    shadowColor: '#FFD600',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  btnText: { color: '#181A20', fontWeight: 'bold', fontSize: 13.5 },
});

// Modale règlement stylée
function AcceptRulesModal({ visible, onAccept, onCancel }) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.modal}>
          <Feather
            name="shield-check"
            size={46}
            color="#FFD600"
            style={{ alignSelf: 'center', marginBottom: 8 }}
          />
          <Text style={modalStyles.title}>Regulamento do Chat</Text>
          <Text style={modalStyles.text}>
            • O chat é privado entre você e o solicitante{'\n'}• Não compartilhe dados sensíveis
            {'\n'}• Respeite as regras da comunidade{'\n'}• O conteúdo será apagado após 5 dias
          </Text>
          <TouchableOpacity style={modalStyles.acceptBtn} onPress={onAccept} activeOpacity={0.89}>
            <Text style={modalStyles.acceptBtnText}>Aceitar e iniciar chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onCancel} activeOpacity={0.77}>
            <Text style={modalStyles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  modal: {
    width: 330,
    backgroundColor: '#181A20',
    borderRadius: 17,
    padding: 30,
    alignItems: 'center',
    borderColor: '#FFD600',
    borderWidth: 2,
  },
  title: { color: '#FFD600', fontWeight: 'bold', fontSize: 21, marginBottom: 14 },
  text: { color: '#fff', textAlign: 'center', fontSize: 16, marginBottom: 24, lineHeight: 22 },
  acceptBtn: {
    backgroundColor: '#FFD600',
    padding: 15,
    borderRadius: 12,
    marginBottom: 11,
    minWidth: 220,
    alignItems: 'center',
  },
  acceptBtnText: { color: '#181A20', fontWeight: 'bold', textAlign: 'center', fontSize: 17 },
  cancelBtn: { padding: 10 },
  cancelBtnText: {
    color: '#FFD600',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});

// Formatage heure messages
function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return dayjs(date).format('HH:mm');
}

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams();
  const user = useUserStore((s) => s.user);
  const router = useRouter();

  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);

  const flatListRef = useRef(null);

  // Chargement chat en temps réel
  useEffect(() => {
    if (!chatId) return;
    const ref = doc(db, 'chats', chatId);
    const unsub = onSnapshot(ref, (snap) => {
      setChat(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return () => unsub();
  }, [chatId]);

  // Chargement messages en temps réel
  useEffect(() => {
    if (!chatId) return;
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => unsub();
  }, [chatId]);

  // Envoi message
  const sendMessage = useCallback(async () => {
    if (!input.trim() || !user || !chat || chat.status !== 'active') return;
    setSending(true);
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: input.trim(),
        senderId: user.uid,
        senderApelido: user.apelido || user.displayName || 'Você',
        createdAt: serverTimestamp(),
        system: false,
      });
      setInput('');
    } catch (e) {
      console.log('[SEND ERROR]', e);
    }
    setSending(false);
  }, [input, user, chat, chatId]);

  // Acceptation règlement (aideur ou demandeur)
  const handleAcceptRules = async () => {
    if (!chat) return;
    try {
      const who = user.uid === chat.demandeurId ? 'demandeur' : 'aidant';
      await updateDoc(doc(db, 'chats', chatId), {
        [who + 'Accepted']: true,
        status: (who === 'demandeur' ? chat.aidantAccepted : chat.demandeurAccepted)
          ? 'active'
          : 'pending',
      });
      setShowRulesModal(false);
    } catch (e) {
      console.log('[REGLEMENT ERROR]', e);
    }
  };

  const isDemandeur = user && chat ? user.uid === chat.demandeurId : false;
  const needsAccept =
    user &&
    chat &&
    chat.status === 'pending' &&
    ((isDemandeur && !chat.demandeurAccepted) || (!isDemandeur && !chat.aidantAccepted));
  const canSend = chat && chat.status === 'active';

  if (!user || !chat) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#FFD600', fontWeight: 'bold', fontSize: 18 }}>
          Carregando chat...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color="#FFD600" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>VigiApp Chat</Text>
          <View style={{ width: 40 }} />
        </View>

        {chat.status === 'pending' && (
          <ChatPendingBanner canAccept={needsAccept} onAccept={() => setShowRulesModal(true)} />
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={({ item }) => {
            if (item.system) {
              return (
                <View style={styles.sysMsgRow}>
                  <Text style={styles.sysMsgText}>{item.text}</Text>
                </View>
              );
            }
            const isMine = item.senderId === user.uid;
            return (
              <View style={[styles.msgRow, isMine ? styles.right : styles.left]}>
                <View
                  style={[styles.avatarCircle, { backgroundColor: isMine ? '#B2EC6B' : '#FFD600' }]}
                >
                  <Text style={{ color: '#181A20', fontWeight: 'bold', fontSize: 15 }}>
                    {(item.senderApelido?.charAt(0) || 'V').toUpperCase()}
                  </Text>
                </View>
                <View
                  style={[
                    styles.msgBubble,
                    {
                      backgroundColor: isMine ? '#232b37' : '#13181F',
                      borderColor: isMine ? '#B2EC6B' : '#FFD600',
                    },
                  ]}
                >
                  <Text style={[styles.sender, { color: isMine ? '#B2EC6B' : '#FFD600' }]}>
                    {isMine
                      ? 'Você'
                      : item.senderApelido?.charAt(0).toUpperCase() + item.senderApelido?.slice(1)}
                  </Text>
                  <Text style={styles.msgText}>{item.text}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{formatTime(item.createdAt)}</Text>
                    {isMine && (
                      <MaterialCommunityIcons
                        name="check-all"
                        size={14}
                        color="#B2EC6B"
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </View>
                </View>
              </View>
            );
          }}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            style={[styles.input, !canSend && { backgroundColor: '#181A20', color: '#666' }]}
            placeholder={canSend ? 'Escreva uma mensagem…' : 'Aguardando aceite do regulamento…'}
            placeholderTextColor="#888"
            editable={canSend && !sending}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={sendMessage}
            disabled={!input.trim() || sending || !canSend}
          >
            <Feather name="send" size={22} color="#FFD600" />
          </TouchableOpacity>
        </View>

        <AcceptRulesModal
          visible={showRulesModal}
          onAccept={handleAcceptRules}
          onCancel={() => setShowRulesModal(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101218' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#181A20' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    paddingTop: 12,
    paddingBottom: 7,
    backgroundColor: '#181A20',
    borderBottomWidth: 0.5,
    borderColor: '#333',
    elevation: 3,
  },
  headerBack: { padding: 5, width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: {
    color: '#FFD600',
    fontSize: 19,
    fontWeight: 'bold',
    letterSpacing: 1.1,
    flex: 1,
    textAlign: 'center',
  },
  list: { padding: 14, paddingTop: 0, paddingBottom: 10 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14, gap: 7 },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end', flexDirection: 'row-reverse' },
  avatarCircle: {
    width: 33,
    height: 33,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    marginRight: 2,
    marginLeft: 2,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  msgBubble: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 15,
    maxWidth: '78%',
    borderWidth: 1.4,
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
  sender: { fontWeight: 'bold', fontSize: 13.7, marginBottom: 2, letterSpacing: 0.07 },
  msgText: { fontSize: 16.1, color: '#fff', marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  metaText: { color: '#666', fontSize: 12, fontStyle: 'italic' },
  sysMsgRow: { alignItems: 'center', marginBottom: 11 },
  sysMsgText: {
    color: '#FFD600',
    backgroundColor: '#232b37',
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 4,
    fontStyle: 'italic',
    fontSize: 13.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#232b37',
    backgroundColor: '#181A20',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 7,
  },
  input: {
    flex: 1,
    height: 46,
    backgroundColor: '#232b37',
    color: '#FFD600',
    borderRadius: 11,
    paddingHorizontal: 14,
    fontSize: 15.8,
    marginRight: 3,
  },
  sendBtn: { padding: 8, borderRadius: 100, backgroundColor: '#232b37' },
});
