import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

/**
 * Retourne tous les groupes d’un CEP (en temps réel)
 */
export function useGruposPorCep(cep) {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cep) {
      setGrupos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, "groups"), where("cep", "==", cep));
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((doc) => {
        const data = doc.data();
        arr.push({ id: doc.id, ...data });
      });
      setGrupos(arr);
      setLoading(false);
      console.log("[useGruposPorCep] Groupes Firestore du CEP", cep, arr);
    });
    return () => unsub();
  }, [cep]);

  return { grupos, loading };
}
