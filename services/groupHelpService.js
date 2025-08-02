// src/services/groupHelpService.js
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
import { db } from "../firebase"; // adapte le chemin si besoin
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
  badgeId,
}) {
  if (!groupId || !userId)
    throw new Error("Paramètre manquant à createGroupHelp");
  console.log("[createGroupHelp] REÇU:", {
    groupId,
    userId,
    apelido,
    message,
    isScheduled,
    dateHelp,
    badgeId,
  });

  // --- Validation/normalisation champs ---
  const cleanMessage = (message || "").trim();
  if (!cleanMessage) throw new Error("Message vide");

  // --- Prépare les datas ---
  const docData = {
    groupId,
    userId,
    apelido,
    message: cleanMessage,
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
    badgeId: badgeId || null,
    history: [
      {
        action: isScheduled ? "scheduled" : "open",
        by: userId,
        at: dayjs().toISOString(),
      },
    ],
    chatId: null,
    lastUpdateAt: serverTimestamp(),
  };

  // --- Ajout dans collection globale ---
  let docRef;
  try {
    docRef = await addDoc(collection(db, "groupHelps"), docData);
    console.log("[createGroupHelp] DOC GROUPHELPS OK, id:", docRef.id, docData);
  } catch (err) {
    console.error("[createGroupHelp] ERREUR addDoc groupHelps:", err);
    throw err;
  }

  // --- Ajout en sous-collection (optionnel, pour historique groupe) ---
  try {
    await addDoc(collection(db, `groups/${groupId}/helpRequests`), {
      ...docData,
      groupHelpSubId: docRef.id,
    });
    console.log("[createGroupHelp] SOUS-COLLECTION group/groupId/helpRequests OK");
  } catch (err) {
    console.error("[createGroupHelp] ERREUR addDoc sous-collection:", err);
    // Ne bloque pas le flux général
  }

  return docRef.id;
}

// 2️⃣ Compter le nombre de demandes d’un user (limite/jour/semaine)
export async function countUserRequests({ userId, groupId, since }) {
  if (!userId || !groupId || !since)
    throw new Error("Paramètre manquant pour countUserRequests");
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

// 3️⃣ Cacher une demande pour un user
export async function hideGroupHelpForUser(demandaId, userId) {
  if (!demandaId || !userId) throw new Error("Manque demandaId/userId");
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, { hiddenBy: arrayUnion(userId) });
  console.log("[hideGroupHelpForUser]", demandaId, "for", userId);
}

// 4️⃣ Cacher toutes les demandes d’un groupe pour un user
export async function hideAllGroupHelpsForUser(groupId, userId) {
  if (!groupId || !userId) throw new Error("Manque groupId/userId");
  const q = query(
    collection(db, "groupHelps"),
    where("groupId", "==", groupId)
  );
  const snapshot = await getDocs(q);

  const batch = writeBatch(db);
  snapshot.forEach((docSnap) => {
    batch.update(doc(db, "groupHelps", docSnap.id), {
      hiddenBy: arrayUnion(userId),
    });
  });
  await batch.commit();
  console.log("[hideAllGroupHelpsForUser]", groupId, "for", userId);
}

// 5️⃣ Accepter une demande d’aide
export async function acceptGroupHelp({
  demandaId,
  acceptedById,
  acceptedByApelido,
}) {
  if (!demandaId || !acceptedById)
    throw new Error("Paramètre manquant à acceptGroupHelp");
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, {
    status: "accepted",
    acceptedById,
    acceptedBy: acceptedByApelido,
    acceptedAt: serverTimestamp(),
    lastUpdateAt: serverTimestamp(),
    history: arrayUnion({
      action: "accepted",
      by: acceptedById,
      at: dayjs().toISOString(),
    }),
  });
  console.log("[acceptGroupHelp]", demandaId, "by", acceptedById);
}

// 6️⃣ Mettre à jour le message d’une demande
export async function updateGroupHelpMessage(demandaId, newMessage) {
  if (!demandaId || !newMessage)
    throw new Error("Paramètre manquant à updateGroupHelpMessage");
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, {
    message: newMessage,
    lastUpdateAt: serverTimestamp(),
  });
  console.log("[updateGroupHelpMessage]", demandaId, newMessage);
}

// 7️⃣ Annuler une demande
export async function cancelGroupHelp(demandaId, userId) {
  if (!demandaId || !userId) throw new Error("Manque demandaId/userId");
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
    lastUpdateAt: serverTimestamp(),
    history: arrayUnion({
      action: "cancelled",
      by: userId,
      at: dayjs().toISOString(),
    }),
  });
  console.log("[cancelGroupHelp]", demandaId, "by", userId);
}

// 8️⃣ Obtenir toutes les demandes d’un user dans un groupe
export async function getUserRequests({ userId, groupId }) {
  if (!userId || !groupId)
    throw new Error("Paramètre manquant à getUserRequests");
  const q = query(
    collection(db, "groupHelps"),
    where("userId", "==", userId),
    where("groupId", "==", groupId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  const result = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  console.log("[getUserRequests]", result.length);
  return result;
}

// 9️⃣ Obtenir toutes les demandes du groupe (hors hiddenBy)
export async function getGroupRequests({ groupId, userId }) {
  if (!userId || !groupId)
    throw new Error("Paramètre manquant à getGroupRequests");
  const q = query(
    collection(db, "groupHelps"),
    where("groupId", "==", groupId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  const result = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((demanda) => !(demanda.hiddenBy || []).includes(userId));
  console.log("[getGroupRequests]", result.length);
  return result;
}
