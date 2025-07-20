import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  arrayRemove,
} from "firebase/firestore";

// ----- CRÉATION DE GROUPE -----
export async function createGroup({
  cep,
  name,
  description,
  userId,
  apelido,
  nome,
  cpf,
}) {
  console.log("[createGroup] Params reçus:", {
    cep,
    name,
    description,
    userId,
    apelido,
    nome,
    cpf,
  });

  if (!cep || !name || !userId || !apelido || !nome || !cpf) {
    console.error("[createGroup] Un ou plusieurs champs obligatoires sont manquants !");
    throw new Error("Champs obrigatórios faltando");
  }

  // Vérifie unicité nom+cep
  const q = query(
    collection(db, "groups"),
    where("cep", "==", cep),
    where("name", "==", name)
  );
  const snap = await getDocs(q);
  console.log("[createGroup] Résultat requête Firestore pour doublon:", snap.empty ? "OK pas de doublon" : "Déjà existant");
  if (!snap.empty) {
    console.error("[createGroup] Groupe déjà existant !");
    throw new Error("Nome de grupo já existe neste CEP.");
  }

  const creatorMember = {
    userId: String(userId),
    nome: String(nome),
    apelido: String(apelido),
    cpf: String(cpf),
    cep: String(cep),
  };

  const docToCreate = {
    cep: String(cep),
    name: String(name),
    description: description || "",
    creatorUserId: String(userId),
    creatorNome: String(nome),
    creatorApelido: String(apelido),
    creatorCpf: String(cpf),
    creatorCep: String(cep),
    members: [creatorMember],
    apelidos: [String(apelido)],    // Pour affichage rapide dans la liste
    maxMembers: 30,
    adminApelido: String(apelido),  // Admin de départ
    createdAt: serverTimestamp(),
  };

  console.log("[createGroup] Document prêt à push:", docToCreate);

  try {
    const docRef = await addDoc(collection(db, "groups"), docToCreate);
    console.log("[createGroup] Groupe créé avec succès, ID :", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("[createGroup] Erreur Firestore :", error);
    throw error;
  }
}

// ----- QUITTER UN GROUPE -----
export async function leaveGroup({ groupId, userId, apelido }) {
  await updateDoc(doc(db, 'groups', groupId), {
    members: arrayRemove(userId),
    apelidos: arrayRemove(apelido),
  });
}
