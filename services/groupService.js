// services/groupService.js
import { db, serverTimestamp } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  getDoc,
} from "firebase/firestore";

// Liste les groupes du même CEP qui ne sont pas pleins
export async function getGroupsByCep(cep) {
  if (!cep) return [];
  const q = query(collection(db, "groups"), where("cep", "==", cep));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((g) => (g.members?.length || 0) < (g.maxMembers || 30));
}

// Crée un groupe, en évitant les doublons de nom sur le même cep
export async function createGroup({ cep, name, description = "", userId, apelido }) {
  if (!cep || !name || !userId || !apelido)
    throw new Error("Dados obrigatórios ausentes: cep, name, userId, apelido.");

  // Vérifie unicité du groupe par nom/cep
  const q = query(collection(db, "groups"), where("cep", "==", cep), where("name", "==", name));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error("Nome de grupo já existe neste CEP.");

  // Prépare la donnée (description jamais undefined)
  const data = {
    cep,
    name,
    description: description ?? "",
    members: [userId],
    apelidos: [apelido],
    maxMembers: 30,
    createdAt: serverTimestamp(), // Utilise toujours serverTimestamp pour Firestore
  };

  const docRef = await addDoc(collection(db, "groups"), data);
  return docRef.id;
}

// Rejoint un groupe si pas complet ni doublon de pseudo
export async function joinGroup({ groupId, userId, apelido }) {
  const groupRef = doc(db, "groups", groupId);
  const snap = await getDoc(groupRef);
  const data = snap.data();
  if ((data.members?.length || 0) >= (data.maxMembers || 30))
    throw new Error("Grupo completo.");
  if ((data.apelidos || []).includes(apelido))
    throw new Error("Apelido já usado neste grupo.");
  await updateDoc(groupRef, {
    members: arrayUnion(userId),
    apelidos: arrayUnion(apelido),
  });
}

// Quitte un groupe
export async function leaveGroup({ groupId, userId, apelido }) {
  const groupRef = doc(db, "groups", groupId);
  await updateDoc(groupRef, {
    members: arrayRemove(userId),
    apelidos: arrayRemove(apelido),
  });
}
