// hooks/useAdminProposalListener.ts
import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useAdminProposalListener(grupoId, currentUser, setModalVisible) {
  // Ce hook déclenche la modale si c'est le bon user concerné
  useEffect(() => {
    if (!grupoId || !currentUser) return;
    const unsub = onSnapshot(doc(db, 'groups', grupoId), async (snap) => {
      const grupo = snap.data();
      const proposta = grupo?.propostaAdmin;
      if (proposta && proposta.status === 'pending' && proposta.userId === currentUser.id) {
        setModalVisible(true);
      }
    });
    return () => unsub();
  }, [grupoId, currentUser, setModalVisible]);
}
