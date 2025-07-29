import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  writeBatch,
  orderBy,
} from "firebase/firestore";
import { db } from "../firebase"; // ← adapte ce chemin à ta config
import dayjs from "dayjs";

// --- Helper universel pour Timestamp Firestore ---
function toFirestoreTimestamp(val) {
  if (!val) return null;
  if (val instanceof Timestamp) return val;
  if (val instanceof Date) return Timestamp.fromDate(val);
  if (typeof val === "string" || typeof val === "number") return Timestamp.fromDate(new Date(val));
  return null;
}

// 1️⃣ Créer une demande d'entraide (immédiate ou agendada)
export async function createGroupHelp({
  groupId,
  userId,
  apelido,
  message,
  isScheduled,
  dateHelp, // Peut être Date JS, string, Timestamp ou null
}) {
  if (!groupId || !userId) throw new Error("Paramètre manquant à createGroupHelp");
  console.log("[createGroupHelp] REÇU:", { groupId, userId, apelido, message, isScheduled, dateHelp });

  const docData = {
    groupId,
    userId,
    apelido,
    message,
    isScheduled: !!isScheduled,
    dateHelp: isScheduled ? toFirestoreTimestamp(dateHelp) : null,
    createdAt: serverTimestamp(),
    status: isScheduled ? "scheduled" : "open",
    acceptedBy: null,
    acceptedById: null,
    acceptedAt: null,
    closedAt: null,
    closedReason: null,
    cancelledAt: null,
    hiddenBy: [],
    history: [
      { action: isScheduled ? "scheduled" : "open", by: userId, at: dayjs().toISOString() },
    ],
    chatId: null,
    lastUpdateAt: serverTimestamp(),
  };

  // Ajout global
  const docRef = await addDoc(collection(db, "groupHelps"), docData);

  // (Optionnel) Ajouter à une sous-collection dans le groupe
  await addDoc(collection(db, `groups/${groupId}/helpRequests`), {
    ...docData,
    groupHelpSubId: docRef.id,
  });

  console.log("[createGroupHelp] Crée avec ID:", docRef.id, "DATA ENVOYÉE:", docData);
  return docRef.id;
}

// 2️⃣ Compter les demandes du user dans le groupe depuis une date
export async function countUserRequests({ userId, groupId, since }) {
  if (!userId || !groupId || !since) throw new Error("Paramètre manquant pour countUserRequests");
  const sinceTimestamp = toFirestoreTimestamp(since);

  const q = query(
    collection(db, "groupHelps"),
    where("userId", "==", userId),
    where("groupId", "==", groupId),
    where("createdAt", ">=", sinceTimestamp)
  );
  const snapshot = await getDocs(q);
  console.log("[countUserRequests]", snapshot.size);
  return snapshot.size;
}

// 3️⃣ Masquer une demande pour un user
export async function hideGroupHelpForUser(demandaId, userId) {
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, { hiddenBy: arrayUnion(userId) });
  console.log("[hideGroupHelpForUser]", demandaId, "for", userId);
}

// 4️⃣ Masquer toutes les demandes du groupe pour un user
export async function hideAllGroupHelpsForUser(groupId, userId) {
  const q = query(collection(db, "groupHelps"), where("groupId", "==", groupId));
  const snapshot = await getDocs(q);

  const batch = writeBatch(db);
  snapshot.forEach(docSnap => {
    batch.update(doc(db, "groupHelps", docSnap.id), {
      hiddenBy: arrayUnion(userId)
    });
  });
  await batch.commit();
  console.log("[hideAllGroupHelpsForUser]", groupId, "for", userId);
}

// 5️⃣ Accepter une demande d'aide
export async function acceptGroupHelp({ demandaId, acceptedById, acceptedByApelido }) {
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, {
    status: "accepted",
    acceptedById,
    acceptedBy: acceptedByApelido,
    acceptedAt: serverTimestamp(),
    lastUpdateAt: serverTimestamp(),
    history: arrayUnion({ action: "accepted", by: acceptedById, at: dayjs().toISOString() }),
  });
  console.log("[acceptGroupHelp]", demandaId, "by", acceptedById);
}

// 6️⃣ Modifier le texte d'une demande
export async function updateGroupHelpMessage(demandaId, newMessage) {
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, {
    message: newMessage,
    lastUpdateAt: serverTimestamp()
  });
  console.log("[updateGroupHelpMessage]", demandaId, newMessage);
}

// 7️⃣ Annuler une demande (soft cancel)
export async function cancelGroupHelp(demandaId, userId) {
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
    lastUpdateAt: serverTimestamp(),
    history: arrayUnion({ action: "cancelled", by: userId, at: dayjs().toISOString() })
  });
  console.log("[cancelGroupHelp]", demandaId, "by", userId);
}

// 8️⃣ Récupérer MES demandes d'aide dans le groupe (pour "Minhas demandas")
export async function getUserRequests({ userId, groupId }) {
  if (!userId || !groupId) throw new Error("Paramètre manquant à getUserRequests");
  const q = query(
    collection(db, "groupHelps"),
    where("userId", "==", userId),
    where("groupId", "==", groupId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  const result = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log("[getUserRequests]", result.length);
  return result;
}

// 9️⃣ Récupérer TOUTES les demandes visibles pour ce user (feed groupe)
export async function getGroupRequests({ groupId, userId }) {
  if (!userId || !groupId) throw new Error("Paramètre manquant à getGroupRequests");
  const q = query(
    collection(db, "groupHelps"),
    where("groupId", "==", groupId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  // Filtre : ne garde QUE celles qui ne sont PAS masquées par ce user
  const result = snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(demanda => !(demanda.hiddenBy || []).includes(userId));
  console.log("[getGroupRequests]", result.length);
  return result;
}
