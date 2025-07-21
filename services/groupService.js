import { 
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  arrayUnion
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Crée un groupe de voisins dans Firestore.
 * Vérifie l'unicité (nom + cep) et ajoute tous les champs nécessaires.
 */
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
    membersIds: [String(userId)], // Champ clé pour retrouver le groupe plus tard
    apelidos: [String(apelido)],
    maxMembers: 30,
    adminApelido: String(apelido),
    createdAt: serverTimestamp(),
  };

  console.log("[createGroup] Document prêt à push:", docToCreate);

  try {
    const docRef = await addDoc(collection(db, "groups"), docToCreate);
    console.log("[createGroup] ✅ Groupe créé avec succès, ID :", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("[createGroup] ❌ Erreur Firestore :", error);
    throw error;
  }
}

/**
 * Retire un membre d'un groupe et met à jour les champs (members, membersIds, apelidos).
 * Si le groupe devient vide après départ, il est supprimé.
 */
export async function leaveGroup({ groupId, userId, apelido }) {
  console.log("[leaveGroup] Début retrait du membre du groupe", groupId);

  const groupRef = doc(db, "groups", groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) {
    throw new Error("Groupe introuvable");
  }
  const groupData = snap.data();

  // Filtrage manuel du membre dans tous les tableaux
  const members = (groupData.members || []).filter((m) => m.userId !== userId);
  const membersIds = (groupData.membersIds || []).filter((id) => id !== userId);
  const apelidos = (groupData.apelidos || []).filter((a) => a !== apelido);

  await updateDoc(groupRef, {
    members,
    membersIds,
    apelidos,
  });
  console.log("[leaveGroup] ✅ Membre retiré du groupe", groupId);

  // Suppression du groupe si plus aucun membre
  if (members.length === 0) {
    await deleteDoc(groupRef);
    console.log("[leaveGroup] 🚮 Groupe supprimé car vide :", groupId);
  }
}

// Ajoute un utilisateur au groupe (mises à jour Firestore).
export async function joinGroup({ groupId, user }) {
  const groupRef = doc(db, "groups", groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) throw new Error("Groupe introuvable");

  const data = snap.data();
  if ((data.membersIds || []).includes(user.id)) throw new Error("Vous êtes déjà dans ce groupe.");
  if ((data.members?.length || 0) >= (data.maxMembers || 30)) throw new Error("Le groupe est plein.");

  await updateDoc(groupRef, {
    members: arrayUnion({
      userId: user.id,
      nome: user.nome,
      apelido: user.apelido,
      cpf: user.cpf,
      cep: user.cep,
    }),
    membersIds: arrayUnion(user.id),
    apelidos: arrayUnion(user.apelido),
  });
}
