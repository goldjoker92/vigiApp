import { db } from "../firebase";
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, arrayUnion, arrayRemove, getDoc
} from "firebase/firestore";

export async function getGroupsByCep(cep) {
  if (!cep) return [];
  const q = query(collection(db, "groups"), where("cep", "==", cep));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((g) => (g.members?.length || 0) < (g.maxMembers || 30));
}

export async function createGroup({ cep, name, description, userId, apelido }) {
  const q = query(collection(db, "groups"), where("cep", "==", cep), where("name", "==", name));
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error("Nome de grupo já existe neste CEP.");
  const docRef = await addDoc(collection(db, "groups"), {
    cep,
    name,
    description,
    members: [userId],
    apelidos: [apelido],
    maxMembers: 30,
    createdAt: new Date(),
  });
  return docRef.id;
}

export async function joinGroup({ groupId, userId, apelido }) {
  const groupRef = doc(db, "groups", groupId);
  const snap = await getDoc(groupRef);
  const data = snap.data();
  if ((data.members?.length || 0) >= (data.maxMembers || 30)) throw new Error("Grupo completo.");
  if ((data.apelidos || []).includes(apelido)) throw new Error("Apelido já usado neste groupe.");
  await updateDoc(groupRef, {
    members: arrayUnion(userId),
    apelidos: arrayUnion(apelido),
  });
}

export async function leaveGroup({ groupId, userId, apelido }) {
  const groupRef = doc(db, "groups", groupId);
  await updateDoc(groupRef, {
    members: arrayRemove(userId),
    apelidos: arrayRemove(apelido),
  });
}
