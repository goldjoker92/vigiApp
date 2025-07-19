import Toast from 'react-native-toast-message';
import { Vibration } from 'react-native';
import { createGroup } from '../services/groupService'; // <-- Assure-toi que l'import est correct

export async function handleGroupCreate(user, name, description, callback) {
  const userId = user?.id || user?.uid;
  if (!user?.cep || !userId || !user?.apelido) {
    console.log("[GroupCreate] Erreur: infos utilisateur incomplètes", user);
    Toast.show({ type: 'error', text1: "Informações do usuário incompletas. Refaça o login." });
    Vibration.vibrate([0, 100, 50, 100]);
    return;
  }
  if (!name) {
    Toast.show({ type: 'error', text1: "Informe o nome do grupo!" });
    Vibration.vibrate([0, 100, 50, 100]);
    return;
  }

  console.log("[GroupCreate] USER prêt pour création:", {
    id: userId,
    apelido: user.apelido,
    cep: user.cep,
    name,
    description
  });

  try {
    // 🔥 Création dans Firestore
    const groupId = await createGroup({
      cep: user.cep,
      name,
      description: description ?? "",
      userId, // bien userId !
      apelido: user.apelido,
    });
    console.log("[GroupCreate] Groupe créé avec l'id:", groupId);
    Toast.show({ type: 'success', text1: "Grupo criado com sucesso!" });
    Vibration.vibrate(60);
    if (callback) callback(groupId);
    // Ici tu peux faire une navigation ou un autre traitement
  } catch (e) {
    console.log("[GroupCreate] Erreur Firestore:", e);
    Toast.show({ type: 'error', text1: "Erro ao criar grupo", text2: e.message || "Erro desconhecido" });
    Vibration.vibrate([0, 100, 50, 100]);
  }
}
export default handleGroupCreate;
