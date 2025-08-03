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
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import dayjs from "dayjs";
import { createChatOnAccept } from "../services/chatService"; // fonction de création de chat

// --- Helper universel pour Timestamp Firestore ---
function toFirestoreTimestamp(val) {
  if (!val) return null;
  if (val instanceof Timestamp) return val;
  if (val instanceof Date) return Timestamp.fromDate(val);
  if (typeof val === "string" || typeof val === "number")
    return Timestamp.fromDate(new Date(val));
  return null;
}

// 1️⃣ Créer une demande d'entraide (immédiate ou agendada)
export async function createGroupHelp({
  groupId,
  userId,
  apelido,
  message,
  isScheduled,
  dateHelp,
  badgeId,
}) {
  if (!groupId || !userId) throw new Error("Paramètre manquant à createGroupHelp");

  const cleanMessage = (message || "").trim();
  if (!cleanMessage) throw new Error("Message vide");

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

  let docRef;
  try {
    docRef = await addDoc(collection(db, "groupHelps"), docData);
    console.log("[createGroupHelp] DOC GROUPHELPS OK, id:", docRef.id);
  } catch (err) {
    console.error("[createGroupHelp] ERREUR addDoc groupHelps:", err);
    throw err;
  }

  // Sous-collection optionnelle pour historique groupe
  try {
    await addDoc(collection(db, `groups/${groupId}/helpRequests`), {
      ...docData,
      groupHelpSubId: docRef.id,
    });
    console.log("[createGroupHelp] SOUS-COLLECTION OK");
  } catch (err) {
    console.error("[createGroupHelp] ERREUR sous-collection:", err);
  }

  return docRef.id;
}

// 2️⃣ Compter demandes user
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
  return snapshot.size;
}

// 3️⃣ Cacher demande pour user
export async function hideGroupHelpForUser(demandaId, userId) {
  if (!demandaId || !userId) throw new Error("Manque demandaId/userId");
  const ref = doc(db, "groupHelps", demandaId);
  await updateDoc(ref, { hiddenBy: arrayUnion(userId) });
}

// 4️⃣ Cacher toutes demandes groupe pour user
export async function hideAllGroupHelpsForUser(groupId, userId) {
  if (!groupId || !userId) throw new Error("Manque groupId/userId");
  const q = query(collection(db, "groupHelps"), where("groupId", "==", groupId));
  const snapshot = await getDocs(q);

  const batch = writeBatch(db);
  snapshot.forEach((docSnap) => {
    batch.update(doc(db, "groupHelps", docSnap.id), {
      hiddenBy: arrayUnion(userId),
    });
  });
  await batch.commit();
}

// 5️⃣ Accepter une demande d’aide (ancienne méthode simple)
export async function acceptGroupHelp({ demandaId, acceptedById, acceptedByApelido }) {
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

// 6️⃣ Mettre à jour message d’une demande
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
  if (!userId || !groupId) throw new Error("Paramètre manquant à getUserRequests");
  const q = query(
    collection(db, "groupHelps"),
    where("userId", "==", userId),
    where("groupId", "==", groupId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  const result = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return result;
}

// 9️⃣ Obtenir toutes les demandes du groupe (hors hiddenBy)
export async function getGroupRequests({ groupId, userId }) {
  if (!userId || !groupId) throw new Error("Paramètre manquant à getGroupRequests");
  const q = query(
    collection(db, "groupHelps"),
    where("groupId", "==", groupId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  const result = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((demanda) => !(demanda.hiddenBy || []).includes(userId));
  return result;
}

// === NOUVELLES FONCTIONS POUR ACCEPTATION EN DEUX ÉTAPES ET CHAT ===

// Accepter la demande côté aidant (clic bouton Accepter)
export async function acceptHelpDemand(demandaId, aidantId) {
  const docRef = doc(db, "groupHelps", demandaId);
  await updateDoc(docRef, {
    status: "pending",
    aidantAcceptedRegulation: false,
    demandeurAcceptedRegulation: false,
    aidantId,
    lastUpdateAt: serverTimestamp(),
  });
  console.log("[acceptHelpDemand] Demande mise en pending, aidant:", aidantId);
}

// Aidant accepte le règlement
export async function aidantAcceptRegulation(demandaId) {
  const docRef = doc(db, "groupHelps", demandaId);
  await updateDoc(docRef, {
    aidantAcceptedRegulation: true,
    lastUpdateAt: serverTimestamp(),
  });
  console.log("[aidantAcceptRegulation] Aidant a accepté le règlement:", demandaId);
  // TODO : notifier demandeur
}

// Demandeur accepte règlement + création chat si aidant déjà ok
export async function demandeurAcceptRegulation(demandaId, demandeur) {
  const docRef = doc(db, "groupHelps", demandaId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Demande introuvable");
  const data = snap.data();

  if (data.aidantAcceptedRegulation) {
    await updateDoc(docRef, {
      demandeurAcceptedRegulation: true,
      status: "accepted",
      lastUpdateAt: serverTimestamp(),
    });
    console.log("[demandeurAcceptRegulation] Demande acceptée, création chat", demandaId);
    // Création du chat et mise à jour du chatId dans la demande
    const chatId = await createChatOnAccept(data, demandeur);
    await updateDoc(docRef, { chatId, lastUpdateAt: serverTimestamp() });
  } else {
    await updateDoc(docRef, {
      demandeurAcceptedRegulation: true,
      lastUpdateAt: serverTimestamp(),
    });
    console.log("[demandeurAcceptRegulation] Demandeur accepté règlement, en attente aidant");
  }
}

// Refuser la demande
export async function refuseHelpDemand(demandaId, who) {
  const docRef = doc(db, "groupHelps", demandaId);
  await updateDoc(docRef, {
    status: "refused",
    refusedBy: who,
    lastUpdateAt: serverTimestamp(),
  });
  console.log("[refuseHelpDemand] Demande refusée par", who);
}

// 🔟 Proposer son aide (ajoute volunteerId & volunteerApelido à une demande)
export async function proposeHelp({ demandaId, volunteerId, volunteerApelido }) {
  if (!demandaId || !volunteerId || !volunteerApelido) {
    throw new Error("[proposeHelp] Paramètre manquant");
  }
  const demandaRef = doc(db, "groupHelps", demandaId);
  await updateDoc(demandaRef, {
    volunteerId,
    volunteerApelido,
    status: "pending", // optionnel
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      action: "proposed",
      by: volunteerId,
      at: dayjs().toISOString(),
    }),
  });
  console.log("[proposeHelp] Demande", demandaId, "volunteer:", volunteerApelido, volunteerId);
}
