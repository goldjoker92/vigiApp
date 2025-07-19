// services/groupService.js
import { db, serverTimestamp } from "../firebase";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";

export async function createGroup({ cep, name, description = "", userId, apelido }) {
  console.log("[groupService] createGroup() entrée:", { cep, name, description, userId, apelido });
  if (!cep || !name || !userId || !apelido)
    throw new Error("Dados obrigatórios ausentes: cep, name, userId, apelido.");

  // Vérifie unicité du groupe par nom/cep
  const q = query(collection(db, "groups"), where("cep", "==", cep), where("name", "==", name));
  const snap = await getDocs(q);
  if (!snap.empty) {
    console.log("[groupService] Nom déjà utilisé pour ce cep");
    throw new Error("Nome de grupo já existe neste CEP.");
  }

  const data = {
    cep,
    name,
    description: description ?? "",
    members: [userId],
    apelidos: [apelido],
    maxMembers: 30,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "groups"), data);
  console.log("[groupService] Groupe créé ID:", docRef.id);
  return docRef.id;
}
