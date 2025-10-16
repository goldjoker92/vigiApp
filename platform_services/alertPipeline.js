// platform_services/publicAlertsPipeline.js
// -------------------------------------------------------------
// VigiApp — Public Alerts Pipeline (front-side orchestrator)
// But : centraliser la logique d’écriture liée à un report public.
// - upsertPublicAlert  (doc canonique dans /publicAlerts/{alertId})
// - recordPrivateFull  (copie "riche" privée, pour audit/modération)
// - recordPublicProjection (projection 1:1 non filtrée pour usage futur)
// - métriques légères (compteurs/horodatage)
//
// ⚠️ Ce fichier NE déclenche PAS les notifications.
//    La notif est déclenchée par le front (Report.jsx) juste après
//    l’upsert pour éviter les doublons et garder le flux inchangé.
//
// Hypothèses (existants):
// - upsertPublicAlert({ user, coords, payload, ttlDays }) => { id }
// - Le front lit /publicAlerts/{id} directement (page app/public-alerts/[id].jsx)
// - Firestore client est accessible via ../firebase
// -------------------------------------------------------------

import { db } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';

// ⚙️ Back existant (fourni par toi)
import { upsertPublicAlert } from './incidents';

// -------------------------------------------------------------
// Utils
// -------------------------------------------------------------

/**
 * computeUsernameFallback
 * - Si le username est absent, on génère un alias pseudo-masqué
 *   basé sur "moitié prénom + moitié nom".
 * - Entrées acceptées :
 *    - payload.username OU user.username
 *    - payload.apelido OU user.apelido (garde tel quel s’il existe)
 */
function computeUsernameFallback({ username, apelido }) {
  // priorité : si username fourni, on garde
  if (username && String(username).trim()) {return String(username).trim();}
  // sinon si apelido existe on l’utilise
  if (apelido && String(apelido).trim()) {return String(apelido).trim();}

  // Sinon on invente un alias stable et anodin (pas basé sur uid)
  const rnd = Math.random().toString(36).slice(2, 6);
  return `usuario_${rnd}`;
}

/**
 * clampCategory
 * - S’assure que la catégorie est bien une des libellés front attendus,
 *   sinon fallback sur "Outros".
 */
const VALID_CATEGORIES = new Set([
  'Roubo/Furto',
  'Agressão',
  'Incidente de trânsito',
  'Incêndio',
  'Falta de luz',
  'Mal súbito (saúde)',
  'Outros',
]);

function clampCategory(cat) {
  const s = String(cat || '').trim();
  return VALID_CATEGORIES.has(s) ? s : 'Outros';
}

/**
 * shapePublicPayload
 * - Renvoie une copie défensive des champs attendus par /publicAlerts
 *   (évite de faire entrer des clés parasites).
 */
function shapePublicPayload(raw) {
  const p = raw || {};
  return {
    userId: p.userId || '',
    apelido: (p.apelido || '').trim(),
    username: (p.username || '').trim(),
    categoria: clampCategory(p.categoria),
    descricao: String(p.descricao || '').trim(),
    gravidade: p.gravidade || 'medium',
    color: p.color || '#FFA500',
    ruaNumero: p.ruaNumero || '',
    cidade: p.cidade || '',
    estado: String(p.estado || '').toUpperCase(),
    cep: p.cep || '',
    cepPrecision: p.cepPrecision || 'none',
    pais: p.pais || 'BR',
    location: {
      latitude: p?.location?.latitude ?? null,
      longitude: p?.location?.longitude ?? null,
      accuracy: p?.location?.accuracy ?? null,
      heading: p?.location?.heading ?? null,
      altitudeAccuracy: p?.location?.altitudeAccuracy ?? null,
      speed: p?.location?.speed ?? null,
    },
    date: p.date || '',
    time: p.time || '',
    createdAt: p.createdAt || serverTimestamp(),
    expiresAt: p.expiresAt || null,
    radius: p.radius ?? 1000,
    radius_m: p.radius_m ?? 1000,
  };
}

/**
 * toDocId
 * - Transforme une valeur libre en ID Firestore sûr (collection/doc)
 *   Supprime accents, remplace caractères interdits, compacte espaces.
 */
function toDocId(s) {
  return String(s || 'NA')
    .normalize('NFKD')                  // enlève accents
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/#?%\[\]\.]/g, '-')     // interdit Firestore: / # ? % [ ] .
    .replace(/\s+/g, '_')               // espaces -> underscore
    .toLowerCase()
    .slice(0, 200);
}

// -------------------------------------------------------------
// Écritures secondaires (projection publique + journal privé)
// -------------------------------------------------------------

/**
 * recordPublicProjection
 * - Relit /publicAlerts/{alertId} et clone tel quel dans /publicAlertsProjection/{alertId}
 * - Pas de filtrage pour l’instant (clone 1:1)
 */
export async function recordPublicProjection(alertId) {
  console.log('[PIPE][projection] START', alertId);
  try {
    const ref = doc(db, 'publicAlerts', String(alertId));
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.warn('[PIPE][projection] not found in /publicAlerts', alertId);
      return;
    }
    const data = snap.data();
    const projectionRef = doc(db, 'publicAlertsProjection', String(alertId));
    await setDoc(projectionRef, { ...data, projectedAt: serverTimestamp() }, { merge: true });
    console.log('[PIPE][projection] OK', alertId);
  } catch (e) {
    console.log('[PIPE][projection] ERROR', e?.message || e);
  } finally {
    console.log('[PIPE][projection] END', alertId);
  }
}

/**
 * recordPrivateFull
 * - Enregistre une version privée riche (diagnostic/modération) :
 *   user, alias final, origine payload, coords brutes, timestamps.
 * - Collection : /private/publicAlertsRaw/items/{alertId}
 */
export async function recordPrivateFull(alertId, { user, coords, payload }) {
  console.log('[PIPE][private] START', alertId);
  try {
    const alias = computeUsernameFallback({
      username: payload?.username || user?.username,
      apelido: payload?.apelido || user?.apelido,
    });

    const docRef = doc(db, 'private', 'publicAlertsRaw', 'items', String(alertId));
    const body = {
      alertId,
      userId: user?.uid || payload?.userId || 'anon',
      apelido: payload?.apelido || user?.apelido || '',
      username: alias,
      raw: { coords: coords || null, payload: payload || null },
      createdAt: serverTimestamp(),
      lastUpdateAt: serverTimestamp(),
      audit: {
        origin: 'front-pipeline',
        version: 1,
      },
    };
    await setDoc(docRef, body, { merge: true });
    console.log('[PIPE][private] OK', alertId);
  } catch (e) {
    console.log('[PIPE][private] ERROR', e?.message || e);
  } finally {
    console.log('[PIPE][private] END', alertId);
  }
}

/**
 * bumpMetrics
 * - Compteurs simples pour suivi (ex: total reports par UF/cidade/categoria).
 * - Corrigé pour éviter les IDs Firestore invalides (ex: "Roubo/Furto").
 * - Optionnel: sous-bucket quotidien summary/{YYYYMMDD}.
 */
async function bumpMetrics(payload) {
  try {
    const ufRaw = String(payload?.estado || 'NA').toUpperCase() || 'NA';
    const cidadeRaw = String(payload?.cidade || 'NA') || 'NA';
    const catRaw = clampCategory(payload?.categoria);

    const uf = toDocId(ufRaw);
    const cidade = toDocId(cidadeRaw);
    const categoriaDoc = toDocId(catRaw); // ex: "Roubo/Furto" -> "roubo_furto"

    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Base
    const base = doc(db, 'metrics', 'publicAlerts');
    await setDoc(
      base,
      {
        updatedAt: serverTimestamp(),
        total: increment(1),
      },
      { merge: true },
    );

    // Par UF
    await setDoc(
      doc(db, 'metrics', 'publicAlerts', 'byUF', uf),
      { count: increment(1), updatedAt: serverTimestamp() },
      { merge: true },
    );

    // Par ville (clé composée uf__cidade)
    await setDoc(
      doc(db, 'metrics', 'publicAlerts', 'byCity', `${uf}__${cidade}`),
      { count: increment(1), updatedAt: serverTimestamp() },
      { merge: true },
    );

    // Par catégorie (corrigé : docId safe)
    await setDoc(
      doc(db, 'metrics', 'publicAlerts', 'byCategory', categoriaDoc),
      { count: increment(1), updatedAt: serverTimestamp() },
      { merge: true },
    );

    // (optionnel) résumé quotidien par catégorie
    await setDoc(
      doc(
        db,
        'metrics', 'publicAlerts',
        'byCategory', categoriaDoc,
        'summary', yyyymmdd,
      ),
      { count: increment(1), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.log('[PIPE][metrics] ERROR', e?.message || e);
  }
}

// -------------------------------------------------------------
// Étapes principales
// -------------------------------------------------------------

/**
 * processReportAndPersist
 * - Formate + sécurise le payload, puis délègue l’upsert canonique.
 * - Retourne { alertId }
 */
export async function processReportAndPersist({ user, coords, payload, ttlDays = 90 }) {
  console.log('[PIPE][process] START');
  if (!user?.uid) {throw new Error('AUTH_REQUIRED');}
  if (!coords?.latitude || !coords?.longitude) {throw new Error('COORDS_REQUIRED');}

  // Harmonisation du username côté front (fallback si absent)
  const finalUsername = computeUsernameFallback({
    username: payload?.username || user?.username,
    apelido: payload?.apelido || user?.apelido,
  });

  const shaped = shapePublicPayload({
    ...payload,
    username: finalUsername,
  });

  // Upsert canonique (FIRST-WRITE-WINS) → /publicAlerts/{alertId}
  const { id } = await upsertPublicAlert({
    user: { uid: user.uid },
    coords,
    payload: shaped,
    ttlDays,
  });

  console.log('[PIPE][process] OK =>', id);
  console.log('[PIPE][process] END');
  return { alertId: id, shaped };
}

/**
 * handleReportEvent
 * - Orchestrateur public
 * - 1) upsert canonique
 * - 2) journal privé
 * - 3) projection publique
 * - 4) métriques
 * - ✖ PAS de notification ici (pour éviter doublons)
 */
export async function handleReportEvent({ user, coords, payload }) {
  console.log('[PIPE] handleReportEvent START');
  const { alertId, shaped } = await processReportAndPersist({
    user,
    coords,
    payload,
    ttlDays: 90,
  });

  // Auxiliaires (peu coûteux) — on await pour cohérence minimale
  await recordPrivateFull(alertId, { user, coords, payload: shaped });
  await recordPublicProjection(alertId);
  await bumpMetrics(shaped);

  console.log('[PIPE] handleReportEvent END', { alertId });
  return { alertId };
}

// -------------------------------------------------------------
// (Optionnel) ré-export pour compat si certains imports
//            dans le code existant pointaient déjà ailleurs.
// -------------------------------------------------------------
export default {
  handleReportEvent,
  processReportAndPersist,
  recordPrivateFull,
  recordPublicProjection,
};
