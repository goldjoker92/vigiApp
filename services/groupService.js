import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

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
    userId: userId + "",
    nome: nome + "",
    apelido: apelido + "",
    cpf: cpf + "",
    cep: cep + "",
  };

  const docToCreate = {
    cep: cep + "",
    name: name + "",
    description: description || "",
    creatorUserId: userId + "",
    creatorNome: nome + "",
    creatorApelido: apelido + "",
    creatorCpf: cpf + "",
    creatorCep: cep + "",
    members: [creatorMember],
    maxMembers: 30,
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
