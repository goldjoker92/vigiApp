import { collection, query, where, getDocs, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import dayjs from "dayjs";

// Compter les demandes du user (corrigé pour Timestamp)
export async function countUserRequests({ userId, groupId, since }) {
  // Guard & conversion
  if (!userId || !groupId || !since) {
    throw new Error("Paramètre manquant pour countUserRequests");
  }
  const sinceTimestamp =
    since instanceof Date ? Timestamp.fromDate(since) : 
    typeof since === "string" ? Timestamp.fromDate(new Date(since)) :
    since; // déjà Timestamp

  // Logs debug robustes
  console.log('==[countUserRequests]==');
  console.log('userId:', userId, typeof userId);
  console.log('groupId:', groupId, typeof groupId);
  console.log('since:', since, typeof since);
  console.log('sinceTimestamp:', sinceTimestamp, sinceTimestamp instanceof Timestamp);

  const q = query(
    collection(db, "groupHelps"),
    where("userId", "==", userId),
    where("groupId", "==", groupId),
    where("createdAt", ">=", sinceTimestamp)
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// Créer une demande d'entraide
export async function createGroupHelp({
  groupId,
  userId,
  apelido,
  message,
  isScheduled,
  dateHelp,
}) {
  if (!groupId || !userId) throw new Error("Paramètre manquant à createGroupHelp");

  const docData = {
    groupId,
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

  // Ajout global
  const docRef = await addDoc(collection(db, "groupHelps"), docData);

  // Sous-collection dans le groupe
  await addDoc(collection(db, `groups/${groupId}/helpRequests`), {
    ...docData,
    groupHelpSubId: docRef.id,
  });

  return docRef.id;
}
