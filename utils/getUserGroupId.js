import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Retourne l'ID du groupe dont userId est membre, ou null s'il n'en a pas.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getUserGroupId(userId) {
  console.log("[getUserGroupId] Recherche groupe pour userId:", userId);
  if (!userId) return null;

  // ✅ Requête correcte : on cherche dans le champ membersIds (array de strings)
  const q = query(
    collection(db, "groups"),
    where("membersIds", "array-contains", userId)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    console.log("[getUserGroupId] ❌ Aucun groupe trouvé pour userId:", userId);
    return null;
  }

  const doc = snap.docs[0];
  console.log("[getUserGroupId] ✅ Groupe trouvé, ID:", doc.id);
  return doc.id;
}
