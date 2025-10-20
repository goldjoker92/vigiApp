// hooks/useAdminReassignment.ts
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import dayjs from 'dayjs';

/**
 * Lance la procédure de passation d'admin
 * - Retourne true si un admin est nommé, false si groupe à supprimer
 */
export async function startAdminReassignment(grupo, user) {
  console.log('[ADMIN] Démarrage de la passation admin...');
  const apelidosSorted = [...grupo.apelidos]
    .filter((a) => a !== user.apelido)
    .sort((a, b) => a.localeCompare(b));
  const membrosDetalhados = grupo.membrosDetalhados || [];

  // Filtre pour ne prendre que les membres encore présents
  const candidates = apelidosSorted
    .map((apelido) => membrosDetalhados.find((m) => m.apelido === apelido))
    .filter(Boolean);

  for (let i = 0; i < candidates.length; i++) {
    const membro = candidates[i];

    // Firestore : enregistre la proposition
    await updateDoc(doc(db, 'groups', grupo.id), {
      propostaAdmin: {
        apelido: membro.apelido,
        userId: membro.id,
        status: 'pending',
        order: i,
        proposedAt: serverTimestamp(),
      },
    });
    console.log(`[ADMIN] Proposition envoyée à ${membro.apelido}...`);

    // Attente (boucle) d'une réponse (accepted/refused)
    let result = false;
    await new Promise((resolve) => {
      const unsub = onSnapshot(doc(db, 'groups', grupo.id), (snap) => {
        const g = snap.data();
        if (
          g?.propostaAdmin?.userId === membro.id &&
          ['accepted', 'refused'].includes(g?.propostaAdmin?.status)
        ) {
          result = g.propostaAdmin.status === 'accepted';
          unsub();
          resolve();
        }
      });
    });

    if (result) {
      console.log(`[ADMIN] ${membro.apelido} a accepté !`);
      return true;
    }
    console.log(`[ADMIN] ${membro.apelido} a refusé.`);
    // On passe au suivant...
  }

  // Si on arrive ici : tout le monde a refusé
  // On programme la suppression
  const deleteAt = dayjs().add(7, 'day').toISOString();
  await updateDoc(doc(db, 'groups', grupo.id), {
    adminApelido: null,
    deleteAt,
    propostaAdmin: null,
    deleteWarningSent: false,
  });
  console.log('[ADMIN] Tous ont refusé. Groupe programmé pour suppression le', deleteAt);
  return false;
}
