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
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Crée un groupe (unique par name + cep)
 */
export async function createGroup({ cep, name, description, userId, apelido, nome, cpf }) {
  console.log('[createGroup] Params:', { cep, name, userId, apelido, nome, cpf });

  if (!cep || !name || !userId || !apelido || !nome || !cpf) {
    console.error('[createGroup] Champs manquants !');
    throw new Error('Champs obrigatórios faltando');
  }

  // Unicité name+cep
  const q = query(collection(db, 'groups'), where('cep', '==', cep), where('name', '==', name));
  const snap = await getDocs(q);
  console.log('[createGroup] Résultat doublon:', snap.empty ? 'OK' : 'EXISTANT');
  if (!snap.empty) {throw new Error('Nom de groupe déjà utilisé pour ce CEP.');}

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
    description: description || '',
    creatorUserId: String(userId),
    creatorNome: String(nome),
    creatorApelido: String(apelido),
    creatorCpf: String(cpf),
    creatorCep: String(cep),
    members: [creatorMember],
    membersIds: [String(userId)],
    apelidos: [String(apelido)],
    maxMembers: 30,
    adminApelido: String(apelido),
    createdAt: serverTimestamp(),
  };

  console.log('[createGroup] Document envoyé Firestore:', docToCreate);

  try {
    const docRef = await addDoc(collection(db, 'groups'), docToCreate);
    console.log('[createGroup] ✅ Groupe créé, ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[createGroup] ❌ Erreur Firestore:', error);
    throw error;
  }
}

/**
 * Quitter un groupe (mise à jour + suppression si vide)
 */
export async function leaveGroup({ groupId, userId, apelido }) {
  console.log('[leaveGroup] Début retrait du membre:', { groupId, userId, apelido });

  const groupRef = doc(db, 'groups', groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) {throw new Error('Groupe introuvable');}
  const groupData = snap.data();

  const members = (groupData.members || []).filter((m) => m.userId !== userId);
  const membersIds = (groupData.membersIds || []).filter((id) => id !== userId);
  const apelidos = (groupData.apelidos || []).filter((a) => a !== apelido);

  await updateDoc(groupRef, { members, membersIds, apelidos });
  console.log('[leaveGroup] ✅ Membre retiré du groupe', groupId);

  if (members.length === 0) {
    await deleteDoc(groupRef);
    console.log('[leaveGroup] 🚮 Groupe supprimé car vide:', groupId);
  }
}

/**
 * Rejoindre un groupe (ajout Firestore en arrayUnion)
 */
export async function joinGroup({ groupId, user }) {
  console.log('[joinGroup] Ajout user', user.id, 'dans groupe', groupId);

  const groupRef = doc(db, 'groups', groupId);
  const snap = await getDoc(groupRef);
  if (!snap.exists()) {throw new Error('Groupe introuvable');}

  const data = snap.data();
  if ((data.membersIds || []).includes(user.id)) {throw new Error('Déjà membre du groupe.');}
  if ((data.members?.length || 0) >= (data.maxMembers || 30))
    {throw new Error('Le groupe est plein.');}

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
  console.log('[joinGroup] ✅ Ajouté dans Firestore');
}
