import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import dayjs from "dayjs";

/**
 * Crée une demande d'entraide dans la sous-collection du groupe ET dans la collection globale.
 * @param {Object} params - { groupId, userId, apelido, message, isScheduled, dateHelp }
 * @returns {Promise<{subId: string, globalId: string}>}
 */
export async function createGroupHelp({
  groupId,
  userId,
  apelido,
  message,
  isScheduled,
  dateHelp,
}) {
  const docData = {
    groupId, // utile pour la globale
    userId,
    apelido,
    message,
    isScheduled: !!isScheduled,
    dateHelp: isScheduled ? dateHelp : null,
    createdAt: serverTimestamp(),
    status: isScheduled ? "scheduled" : "open",
    acceptedBy: null,
    acceptedById: null,
    acceptedAt: null,
    closedAt: null,
    closedReason: null,
    cancelledAt: null,
    history: [
      { action: isScheduled ? "scheduled" : "open", by: userId, at: dayjs().toISOString() },
    ],
    chatId: null,
    lastUpdateAt: serverTimestamp(),
  };

  // 1. Ajout sous-collection du groupe
  const subRef = await addDoc(collection(db, "groups", groupId, "helpRequests"), docData);

  // 2. Ajout collection globale
  const globalRef = await addDoc(collection(db, "groupHelps"), {
    ...docData,
    groupHelpSubId: subRef.id, // tu peux garder le lien
  });

  return { subId: subRef.id, globalId: globalRef.id };
}
