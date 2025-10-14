// platform_services/incidents.js
// ============================================================================
// VigiApp — Public Incidents (Firestore upsert, trace enrichi + "Latest")
// - FIRST-WRITE-WINS par bucket (temps + grille) → agrège déclarations
// - Option forceUnique pour forcer un sibling distinct dans la même fenêtre
// - Privacy gate (forbidden terms) + anonymisation de secours
// - Champs "Latest" (…Latest + lastReportSnapshot) pour refléter le dernier report
// - Garde-fous: caps (aliases / declarants), normalisations, validations
// - Traçage maximal: spanId, timings, tailles, anti-PII simple
// - ⚠️ Retour UX: { id, wasCreated, wasAggregated, alreadyDeclared, action }
//      action ∈ "created" | "reinforced" | "already"
// ============================================================================

import { db } from "../firebase";
import {
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
} from "firebase/firestore";

import { getRuntimeConfig } from "./runtime_config";
import {
  timeBucketKey,
  spatialBucketKey,
  forbiddenTermSignals,
  anonymize,
  maskKnownPlacesForForbidden,
} from "./incidents_features";

// --------------------------- Constantes ---------------------------
export const INCIDENT_WINDOW_MIN = 60; // fenêtre temporelle pour le bucket
export const GRID_KM = 1;              // maille spatiale (km)
const DEFAULT_TTL_DAYS = 90;

// Limites “soft” pour éviter la dérive
const MAX_ALIASES = 20;      // cap de categoryAliases (liste FIFO tronquée)
const MAX_DECLARANTS = 500;  // sécurité extrême (ne devrait jamais être atteint)

// --------------------------- Logging helpers ---------------------------
const TAG = "[INCIDENTS]";
const log  = (...a) => console.log(TAG, ...a);
const warn = (...a) => console.warn(TAG, "⚠️", ...a);
const err  = (...a) => console.error(TAG, "❌", ...a);

// masque court (tokens/uid)
function maskToken(t, left = 6, right = 6) {
  if (!t) return t;
  const s = String(t);
  if (s.length <= left + right) return s;
  return `${s.slice(0, left)}…${s.slice(-right)}(${s.length})`;
}
function safeKeys(obj, maxKeys = 50) {
  return Object.keys(obj || {}).slice(0, maxKeys);
}
function spanId() {
  return Math.random().toString(36).slice(2, 10);
}

// --------------------------- Utils ---------------------------
export function buildGroupId(lat, lng, date = new Date()) {
  return `${timeBucketKey(date, INCIDENT_WINDOW_MIN)}__${spatialBucketKey(
    lat,
    lng,
    GRID_KM
  )}`;
}

// suffixe court (si jamais on force un ID sibling)
function shortRand(n = 5) {
  return Math.random().toString(36).slice(2, 2 + n);
}

// Normalise un bout de texte “safe”
function safeStr(v, fallback = "") {
  const s = (v ?? fallback ?? "").toString();
  return s.length <= 10000 ? s : s.slice(0, 10000);
}

// Validation minimale coords
function assertCoords(coords) {
  const lat = Number(coords?.latitude);
  const lng = Number(coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const e = new Error("COORDS_REQUIRED");
    e.code = "COORDS_REQUIRED";
    throw e;
  }
  return { latitude: lat, longitude: lng };
}

// Construit le snapshot "Latest" (écran + feed + page [id])
function buildLatestBlocks({
  latitude,
  longitude,
  payload,
  fallbackColor = "#FFA500",
  fallbackGrav = "medium",
}) {
  const latest = {
    descricaoLatest: safeStr(payload?.descricao ?? payload?.description ?? payload?.desc ?? ""),
    gravidadeLatest: safeStr(payload?.gravidade ?? fallbackGrav),
    colorLatest:     safeStr(payload?.color ?? fallbackColor),
    ruaNumeroLatest: safeStr(payload?.ruaNumero ?? payload?.endereco ?? ""),
    categoriaLatest: safeStr(payload?.categoria ?? ""),
    timeLatest:      safeStr(payload?.time ?? ""),
    dateLatest:      safeStr(payload?.date ?? ""),
    usernameLatest:  safeStr(payload?.username ?? ""),
    apelidoLatest:   safeStr(payload?.apelido ?? ""),
    locationLatest: {
      latitude,
      longitude,
      accuracy: Number.isFinite(payload?.location?.accuracy)
        ? payload.location.accuracy
        : null,
      heading: Number.isFinite(payload?.location?.heading)
        ? payload.location.heading
        : null,
      altitudeAccuracy: Number.isFinite(payload?.location?.altitudeAccuracy)
        ? payload.location.altitudeAccuracy
        : null,
      speed: Number.isFinite(payload?.location?.speed)
        ? payload.location.speed
        : null,
    },
  };

  const radiusFromEither =
    Number.isFinite(payload?.radius) ? payload.radius :
    (Number.isFinite(payload?.radius_m) ? payload.radius_m : 1000);

  const lastReportSnapshot = {
    descricao: latest.descricaoLatest,
    categoria: latest.categoriaLatest,
    gravidade: latest.gravidadeLatest,
    color:     latest.colorLatest,
    ruaNumero: latest.ruaNumeroLatest,
    cidade:    safeStr(payload?.cidade ?? ""),
    estado:    safeStr((payload?.estado ?? "").toUpperCase()),
    cep:       safeStr(payload?.cep ?? ""),
    pais:      safeStr(payload?.pais ?? "BR"),
    date:      latest.dateLatest,
    time:      latest.timeLatest,
    username:  latest.usernameLatest,
    apelido:   latest.apelidoLatest,
    location:  latest.locationLatest,
    radius:    radiusFromEither,
  };

  return { latest, lastReportSnapshot };
}

// --------------------------- Public API ---------------------------
/**
 * upsertPublicAlert (traçage maximal + flags UX)
 *
 * @param {Object} params
 *  - user: { uid }
 *  - coords: { latitude, longitude }
 *  - payload: champs front (descricao, categoria, etc.)
 *  - ttlDays: (optionnel) durée de vie (def: 90j)
 *  - forceUnique: (optionnel, def: false) crée un doc sibling si on veut séparer 2 cas
 *
 * Comportement par défaut (forceUnique=false):
 *  - PREMIER écrit → crée doc canonique (/publicAlerts/{baseId})
 *  - Écritures suivantes dans la même bucket → merge: reportsCount++, aliases, lastReportAt
 *
 * Si forceUnique=true:
 *  - Toujours crée un ID dérivé (/publicAlerts/{baseId}_{rand}), sans toucher au canonique
 *  - Utile pour distinguer 2 incidents différents dans la même fenêtre
 *
 * @returns { id, wasCreated, wasAggregated, alreadyDeclared, action }
 *   action:
 *     - "created"    : nouveau doc créé
 *     - "reinforced" : doc existant renforcé par ce user (1er report de ce user)
 *     - "already"    : ce user avait déjà reporté ce doc
 */
export async function upsertPublicAlert({
  user,
  coords,
  payload,
  ttlDays = DEFAULT_TTL_DAYS,
  forceUnique = false,
}) {
  const span = spanId();
  const t0 = Date.now();
  log("▶️ upsertPublicAlert: START", {
    span,
    hasUser: !!user,
    userId: user?.uid ? maskToken(user.uid) : null,
    hasCoords: !!coords,
    ttlDays,
    forceUnique,
    payloadKeys: safeKeys(payload),
  });

  // ---- Auth & coords
  if (!user?.uid) {
    err("AUTH_REQUIRED: user absent", { span });
    const e = new Error("AUTH_REQUIRED");
    e.code = "AUTH_REQUIRED";
    throw e;
  }
  let latitude, longitude;
  try {
    const c = assertCoords(coords);
    latitude = c.latitude;
    longitude = c.longitude;
  } catch (e) {
    err("COORDS_REQUIRED: coords invalides", { span, coords });
    throw e;
  }

  // ---- Runtime config + privacy gate
  let cfg = {};
  try {
    cfg = (await getRuntimeConfig()) || {};
    log("cfg loaded", {
      span,
      knownPlaces: Array.isArray(cfg.knownPlaces) ? cfg.knownPlaces.length : 0,
      forbiddenAliases: Array.isArray(cfg.forbiddenAliases) ? cfg.forbiddenAliases.length : 0,
    });
  } catch (e) {
    warn("getRuntimeConfig failed → fallback empty cfg", { span, err: e?.message || e });
  }

  const descRaw = payload?.descricao ?? payload?.description ?? payload?.desc ?? "";
  const desc = safeStr(descRaw);
  const masked = maskKnownPlacesForForbidden(desc, cfg?.knownPlaces || []);
  const forb = forbiddenTermSignals(masked, cfg?.forbiddenAliases || []);

  log("privacy check", {
    span,
    descLen: desc.length,
    maskedChanged: masked !== desc,
    hasForbidden: !!forb?.hasForbidden,
    signals: forb?.signals ? forb.signals.slice(0, 5) : [],
  });

  if (forb?.hasForbidden) {
    const suggested = anonymize(desc);
    warn("PRIVACY_BLOCKED", { span, userId: maskToken(user?.uid), suggestedLen: suggested.length });
    const e = new Error("Conteúdo não permitido. Reformule sua descrição.");
    e.code = "PRIVACY_BLOCKED";
    e.meta = { suggestedDescription: suggested };
    throw e;
  }

  // ---- Horodatage & Grouping
  const now = new Date();
  const baseId = buildGroupId(latitude, longitude, now);
  const effectiveId = forceUnique ? `${baseId}_${shortRand(5)}` : baseId;
  const ref = doc(db, "publicAlerts", effectiveId);

  log("grouping", {
    span,
    baseId,
    effectiveId,
    windowMin: INCIDENT_WINDOW_MIN,
    gridKm: GRID_KM,
    when: now.toISOString(),
  });

  // ---- Flags UX (remplis dans la TX)
  let wasCreated = false;
  let wasAggregated = false;
  let alreadyDeclared = false;

  // ---- Transaction agrégative (ou create-only si forceUnique)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const exists = snap.exists();
    log("TX: fetched", { span, exists, id: effectiveId });

    // --- CREATE ---
    if (!exists) {
      const ttl = Number.isFinite(ttlDays) ? ttlDays : DEFAULT_TTL_DAYS;
      const expires = new Date(Date.now() + ttl * 24 * 3600 * 1000);

      // Normalisations "safe"
      const categoria = safeStr(payload?.categoria || "");
      const color = safeStr(payload?.color || "#FFA500");

      const loc = {
        latitude,
        longitude,
        accuracy:
          Number.isFinite(payload?.location?.accuracy) ?
            payload.location.accuracy : null,
        heading:
          Number.isFinite(payload?.location?.heading) ?
            payload.location.heading : null,
        altitudeAccuracy:
          Number.isFinite(payload?.location?.altitudeAccuracy) ?
            payload.location.altitudeAccuracy : null,
        speed:
          Number.isFinite(payload?.location?.speed) ?
            payload.location.speed : null,
      };

      const radiusFromEither =
        Number.isFinite(payload?.radius) ? payload.radius :
        (Number.isFinite(payload?.radius_m) ? payload.radius_m : 1000);

      // Blocs Latest initiaux
      const { latest, lastReportSnapshot } = buildLatestBlocks({
        latitude,
        longitude,
        payload,
        fallbackColor: color,
        fallbackGrav: safeStr(payload?.gravidade || "medium"),
      });

      const canonical = {
        // ID explicite → utile côté clients & projections
        id: effectiveId,

        // payload front (copie défensive + garde-fous)
        ...payload,
        descricao: desc,
        categoria,
        color,

        // localisation normalisée
        location: loc,

        // rayon (compat: radius OR radius_m)
        radius: radiusFromEither,
        radius_m: radiusFromEither,

        // champs système
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
        lastReportAt: serverTimestamp(),
        status: "active",

        // agrégation
        reportsCount: 1,
        declarantsMap: { [user.uid]: true },

        // aliases (catégorie courante initialisée si présente)
        categoryAliases: categoria ? [categoria] : [],

        // grouping explicite dans le doc (clé lisible — n’est PAS l’ID si forceUnique)
        grouping: {
          timeKey: timeBucketKey(now, INCIDENT_WINDOW_MIN),
          gridKm: GRID_KM,
          windowMin: INCIDENT_WINDOW_MIN,
          baseId,
        },

        // copies utiles pour compat UI
        ruaNumero: safeStr(payload?.ruaNumero || payload?.endereco || ""),
        cidade:    safeStr(payload?.cidade || ""),
        estado:    safeStr((payload?.estado || "").toUpperCase()),
        cep:       safeStr(payload?.cep || ""),
        pais:      safeStr(payload?.pais || "BR"),
        date:      safeStr(payload?.date || ""),
        time:      safeStr(payload?.time || ""),
        gravidade: safeStr(payload?.gravidade || "medium"),
        username:  safeStr(payload?.username || ""),
        apelido:   safeStr(payload?.apelido || ""),

        // champs "Latest" + snapshot
        ...latest,
        lastReportSnapshot,
      };

      log("TX: CREATE canonical snapshot", {
        span,
        id: effectiveId,
        reportsCount: canonical.reportsCount,
        categoryAliasesLen: canonical.categoryAliases.length,
        hasRuaNumero: !!canonical.ruaNumero,
        cidade: canonical.cidade,
        estado: canonical.estado,
        cep: canonical.cep,
        gravidade: canonical.gravidade,
        radius_m: canonical.radius_m,
        hasLatest: !!canonical.descricaoLatest,
      });

      tx.set(ref, canonical, { merge: false });
      wasCreated = true;            // ← pour l’UX
      log("TX: CREATE done", { span });
      return;
    }

    // --- UPDATE (agrégation) — seulement si on N’A PAS forceUnique ---
    if (!forceUnique) {
      const data = snap.data() || {};
      const declarantsCount = Object.keys(data?.declarantsMap || {}).length;
      const already = !!data?.declarantsMap?.[user.uid];
      alreadyDeclared = already;    // ← pour l’UX

      // Latest à jour (toujours rafraîchi pour feed + page [id])
      const { latest, lastReportSnapshot } = buildLatestBlocks({
        latitude,
        longitude,
        payload,
        fallbackColor: data?.color || "#FFA500",
        fallbackGrav: data?.gravidade || "medium",
      });

      const updates = {
        lastReportAt: serverTimestamp(),
        ...latest,
        lastReportSnapshot,
        // idempotence user + cap dur sur declarants
        ...(already
          ? {}
          : declarantsCount >= MAX_DECLARANTS
          ? {}
          : { reportsCount: increment(1), [`declarantsMap.${user.uid}`]: true }),
      };

      const cat = String(payload?.categoria || "").trim();
      if (cat) {
        const before = Array.isArray(data?.categoryAliases)
          ? data.categoryAliases
          : [];
        if (!before.includes(cat)) {
          const next = before.concat(cat);
          updates.categoryAliases = next.slice(-MAX_ALIASES);
        }
      }

      // UX: “reinforced” seulement si le user n’était pas déjà dedans
      wasAggregated = !already;

      log("TX: UPDATE merge", {
        span,
        id: effectiveId,
        alreadyDeclared: already,
        declarantsBefore: declarantsCount,
        willIncCount: !already && declarantsCount < MAX_DECLARANTS,
        newAliasesLen: Array.isArray(updates.categoryAliases)
          ? updates.categoryAliases.length
          : "unchanged",
        hasLatest: !!updates.descricaoLatest,
      });

      tx.set(ref, updates, { merge: true });
      log("TX: UPDATE done", { span });
      return;
    }

    // forceUnique=true ET l’ID généré “sibling” existe déjà (collision improbable)
    warn("forceUnique collision: sibling exists already", { span, effectiveId });
    const e = new Error("CONFLICT_SIBLING_EXISTS");
    e.code = "CONFLICT_SIBLING_EXISTS";
    throw e;
  });

  // ---- Action UX dérivée des flags
  // - created     → nouveau doc
  // - reinforced  → existant, mais 1er report de ce user
  // - already     → ce user avait déjà reporté ce doc
  let action = "created";
  if (!wasCreated && wasAggregated) action = "reinforced";
  if (!wasCreated && !wasAggregated && alreadyDeclared) action = "already";

  const dt = Date.now() - t0;
  log("✅ upsertPublicAlert: END", {
    span,
    id: effectiveId,
    ms: dt,
    flags: { wasCreated, wasAggregated, alreadyDeclared, action },
  });

  return {
    id: effectiveId,
    wasCreated,
    wasAggregated,
    alreadyDeclared,
    action,
  };
}
