// src/miss/lib/firestoreWrite.js
// Écriture (upsert) d’un "missingCase" dans Firestore — JS safe, no-regression

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, app } from '../../../firebase';
import { getAuth, signInAnonymously } from 'firebase/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sanitizeCaseId(v) {
  return String(v || '')
    .trim()
    .replace(/[^\w\-]+/g, '_') // safe path
    .slice(0, 120);
}
function upper2(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
}
function onlyStr(s) {
  return typeof s === 'string' ? s : (s === null || s === undefined) ? '' : String(s);
}

// ---------------------------------------------------------------------------
// Auth anonyme si besoin (web SDK)
// ---------------------------------------------------------------------------
async function ensureAuthWeb() {
  const auth = getAuth(app);
  if (auth.currentUser) {return auth.currentUser;}
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch {
    // Si l’anonyme est OFF et que l’app a déjà un user par ailleurs, on continue
    return auth.currentUser || null;
  }
}

// ---------------------------------------------------------------------------
// Upsert principal (merge:true + createdAt préservé)
// ---------------------------------------------------------------------------
/**
 * @param {string} caseId
 * @param {object} payload  — structure construite par MissingStart (déjà validée côté client)
 * @returns {Promise<{ok:boolean, id:string}>}
 */
export async function writeMissingCaseOnce(caseId, payload) {
  const safeId = sanitizeCaseId(caseId);
  if (!safeId) {throw new Error('[writeMissingCaseOnce] caseId manquant');}

  // 1) Auth si règles exigent request.auth != null
  await ensureAuthWeb();

  // 2) Référence doc
  const ref = doc(db, 'missingCases', safeId);

  // 3) Lire l’existant pour préserver createdAt (évite les réécritures “fraîches”)
  let existingCreatedAt = null;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() || {};
      existingCreatedAt = d.createdAt || null;
    }
  } catch {
    // lecture best-effort : si ça échoue, on posera createdAt maintenant
  }

  // 4) Construction d’un objet “complet mais safe”
  const full = {
    // clés de routage
    kind: onlyStr(payload?.kind || 'child'),
    ownerId: onlyStr(payload?.ownerId || 'anon'),

    // media (tous redacted côté client)
    media: {
      photoRedacted: onlyStr(payload?.media?.photoRedacted),
      photoStoragePath: onlyStr(payload?.media?.photoStoragePath),
      idDocFrontRedacted: onlyStr(payload?.guardian?.docs?.idDocFrontRedacted),
      idDocBackRedacted: onlyStr(payload?.guardian?.docs?.idDocBackRedacted),
      linkDocFrontRedacted: onlyStr(payload?.guardian?.docs?.linkDocFrontRedacted),
      linkDocBackRedacted: onlyStr(payload?.guardian?.docs?.linkDocBackRedacted),
    },

    // entité principale
    primary: {
      name: onlyStr(payload?.primary?.name),
    },

    // quand
    lastSeenAt: payload?.lastSeenAt || null, // ISO string ou null

    // où
    lastKnownAddress: {
      rua: onlyStr(payload?.lastKnownAddress?.rua),
      numero: onlyStr(payload?.lastKnownAddress?.numero),
      cidade: onlyStr(payload?.lastKnownAddress?.cidade),
      uf: upper2(payload?.lastKnownAddress?.uf),
      cep: onlyStr(payload?.lastKnownAddress?.cep),
    },

    // contexte
    context: {
      description: onlyStr(payload?.context?.description),
      extraInfo: onlyStr(payload?.context?.extraInfo),
    },

    // bloc guardian uniquement pour child
    guardian:
      onlyStr(payload?.kind) === 'child'
        ? {
            fullName: onlyStr(payload?.guardian?.fullName),
            cpfRaw: onlyStr(payload?.guardian?.cpfRaw),
            idType: onlyStr(payload?.guardian?.idType),
            childDocType: onlyStr(payload?.guardian?.childDocType),
            childDobISO: payload?.guardian?.childDobISO || null, // ISO
          }
        : null,

    // statut & consent
    consent: !!payload?.consent,
    status: onlyStr(payload?.status || 'validated'),
    statusReasons: Array.isArray(payload?.statusReasons) ? payload.statusReasons : [],
    statusWarnings: Array.isArray(payload?.statusWarnings) ? payload.statusWarnings : [],

    // meta submit
    submitMeta: {
      geo: payload?.submitMeta?.geo || null,
      submittedAt: serverTimestamp(),
    },

    // dates système
    createdAt: existingCreatedAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 5) Upsert (merge:true) — pas d’écrasement des champs ajoutés par backend/ops
  await setDoc(ref, full, { merge: true });

  return { ok: true, id: safeId };
}
