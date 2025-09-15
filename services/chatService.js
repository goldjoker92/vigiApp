// src/services/chatService.js
import {
  collection,
  doc,
  addDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Crée un chat lors de l'acceptation d'une demande d'aide.
 * @param {Object} demanda - Demande d'aide acceptée.
 * @param {Object} currentUser - Utilisateur aidant.
 * @returns {Promise<string>} - ID du chat créé.
 */
export async function createChatOnAccept(demanda, currentUser) {
  if (!demanda || !currentUser) throw new Error('demanda and currentUser required');

  const requesterId = demanda.userId;
  const helperId = currentUser.uid;

  // Création doc chat
  const chatDocRef = doc(collection(db, 'chats'));
  await setDoc(chatDocRef, {
    demandaId: demanda.id,
    groupId: demanda.groupId || null,
    participants: [
      { uid: requesterId, apelido: demanda.apelido || 'Anon' },
      { uid: helperId, apelido: currentUser.apelido || currentUser.displayName || 'Helper' },
    ],
    createdAt: serverTimestamp(),
    status: 'active',
  });

  // Premier message système
  const messagesColRef = collection(db, 'chats', chatDocRef.id, 'messages');
  await addDoc(messagesColRef, {
    text: 'La demande a été acceptée par les deux parties. Vous pouvez discuter en sécurité.',
    senderId: null,
    senderApelido: 'Système',
    createdAt: serverTimestamp(),
    system: true,
  });

  // Mise à jour de la demande avec chatId
  const demandaRef = doc(db, 'groupHelps', demanda.id);
  await updateDoc(demandaRef, {
    chatId: chatDocRef.id,
    lastUpdateAt: serverTimestamp(),
  });

  return chatDocRef.id;
}

/**
 * Écoute en temps réel les messages d'un chat.
 * @param {string} chatId
 * @param {(messages: Array) => void} callback
 * @returns {function} unsubscribe
 */
export function listenMessages(chatId, callback) {
  if (!chatId) throw new Error('chatId required');
  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(messages);
  });
}

/**
 * Envoie un message dans un chat.
 * @param {string} chatId
 * @param {Object} messageData { text, senderId, senderApelido }
 * @returns {Promise<void>}
 */
export async function sendMessage(chatId, { text, senderId, senderApelido }) {
  if (!chatId || !text || !senderId) throw new Error('chatId, text, senderId required');

  const messagesColRef = collection(db, 'chats', chatId, 'messages');
  await addDoc(messagesColRef, {
    text: text.trim(),
    senderId,
    senderApelido: senderApelido || 'Anonyme',
    createdAt: serverTimestamp(),
    system: false,
  });
}

/**
 * Récupère les infos d'un chat.
 * @param {string} chatId
 * @returns {Promise<Object|null>} données chat ou null si inexistant
 */
export async function getChatInfo(chatId) {
  if (!chatId) throw new Error('chatId required');
  const docSnap = await getDoc(doc(db, 'chats', chatId));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

/**
 * Met à jour le status d'un chat.
 * @param {string} chatId
 * @param {string} newStatus
 * @returns {Promise<void>}
 */
export async function updateChatStatus(chatId, newStatus) {
  if (!chatId || !newStatus) throw new Error('chatId and newStatus required');
  await updateDoc(doc(db, 'chats', chatId), {
    status: newStatus,
    lastUpdateAt: serverTimestamp(),
  });
}
