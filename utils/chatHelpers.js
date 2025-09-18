import { db } from '../firebase';
import { collection, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Crée un chat room Firestore lors de l'acceptation d'une demande d'aide.
 * @param {Object} demanda - Objet de demande d'aide accepté.
 * @param {Object} currentUser - L'utilisateur qui clique sur "Aceitar" (help giver).
 * @returns {Promise<string>} - L'ID du chat créé.
 */
export async function createChatOnAccept(demanda, currentUser) {
  if (!demanda || !currentUser) {throw new Error('demanda and currentUser required');}
  const requesterId = demanda.userId;
  const helperId = currentUser.uid;

  // Générer un nouvel ID de chat unique
  const chatDocRef = doc(collection(db, 'chats'));

  await setDoc(chatDocRef, {
    demandaId: demanda.id,
    participants: [
      { uid: requesterId, apelido: demanda.apelido || 'Anon' },
      { uid: helperId, apelido: currentUser.displayName || 'Helper' },
    ],
    createdAt: serverTimestamp(),
    status: 'active',
    demandaMessage: demanda.message || '',
    groupId: demanda.groupId || null,
  });

  // 1er message système dans le chat
  const messagesColRef = collection(db, 'chats', chatDocRef.id, 'messages');
  await addDoc(messagesColRef, {
    text: 'Chat iniciado! Você pode conversar aqui.',
    senderId: helperId,
    senderApelido: currentUser.displayName || 'Helper',
    createdAt: serverTimestamp(),
    system: true,
  });

  return chatDocRef.id;
}
