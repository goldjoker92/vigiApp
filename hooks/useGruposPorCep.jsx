import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";

export function useGruposPorCep(cep) {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cep) return setGrupos([]);
    setLoading(true);
    const q = query(collection(db, "groups"), where("cep", "==", cep));
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((doc) => {
        const data = doc.data();
        if ((data.members?.length || 0) < (data.maxMembers || 30)) arr.push({ id: doc.id, ...data });
      });
      setGrupos(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [cep]);

  return { grupos, loading };
}
