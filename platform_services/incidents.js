import { db } from "../firebase";
import { doc, runTransaction, serverTimestamp, Timestamp, increment } from "firebase/firestore";
import { getRuntimeConfig } from "./runtime_config";
import {
  timeBucketKey, spatialBucketKey,
  forbiddenTermSignals, anonymize, maskKnownPlacesForForbidden
} from "./incidents_features";

const INCIDENT_WINDOW_MIN = 60;
const GRID_KM = 1;

function buildGroupId(lat, lng, date = new Date()) {
  return `${timeBucketKey(date, INCIDENT_WINDOW_MIN)}__${spatialBucketKey(lat, lng, GRID_KM)}`;
}

/**
 * upsertPublicAlert
 * - FIRST-WRITE-WINS: le premier doc reste canonique; suivants incrémentent seulement.
 * - Hard-block si forbidden (polícia/milícia/facção & co) — message neutre + suggestion anonymisée.
 * - Anti double-compte par user via declarantsMap.{uid}.
 */
export async function upsertPublicAlert({ user, coords, payload, ttlDays = 90 }) {
  if (!user?.uid) {throw new Error("AUTH_REQUIRED");}
  if (!coords?.latitude || !coords?.longitude) {throw new Error("COORDS_REQUIRED");}

  const cfg = await getRuntimeConfig();
  const desc = String(payload?.descricao || payload?.description || "");

  // Masque des lieux connus pour l'étape forbidden
  const masked = maskKnownPlacesForForbidden(desc, cfg.knownPlaces);
  const forb = forbiddenTermSignals(masked, cfg.forbiddenAliases);
  if (forb.hasForbidden) {
    const e = new Error("Conteúdo não permitido. Reformule sua descrição.");
    e.code = "PRIVACY_BLOCKED";
    e.meta = { suggestedDescription: anonymize(desc) };
    throw e;
  }

  // Dédup transactionnel
  const now = new Date();
  const alertId = buildGroupId(coords.latitude, coords.longitude, now);
  const ref = doc(db, "publicAlerts", alertId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (!snap.exists()) {
      const expires = new Date(Date.now() + ttlDays * 24 * 3600 * 1000);
      const canonical = {
        ...payload,
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: payload.location?.accuracy ?? null,
          heading: payload.location?.heading ?? null,
          altitudeAccuracy: payload.location?.altitudeAccuracy ?? null,
          speed: payload.location?.speed ?? null,
        },
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expires),
        reportsCount: 1,
        declarantsMap: { [user.uid]: true },
        lastReportAt: serverTimestamp(),
        grouping: {
          timeKey: timeBucketKey(now, INCIDENT_WINDOW_MIN),
          gridKm: GRID_KM,
          windowMin: INCIDENT_WINDOW_MIN,
        },
      };
      tx.set(ref, canonical, { merge: false });
      return;
    }

    const data = snap.data();
    const already = !!data?.declarantsMap?.[user.uid];

    const updates = {
      lastReportAt: serverTimestamp(),
      ...(already ? {} : { reportsCount: increment(1), [`declarantsMap.${user.uid}`]: true }),
    };

    const cat = (payload?.categoria || "").trim();
    if (cat && Array.isArray(data?.categoryAliases)) {
      if (!data.categoryAliases.includes(cat)) {
        updates.categoryAliases = data.categoryAliases.concat(cat).slice(-20);
      }
    } else if (cat) {
      updates.categoryAliases = [cat];
    }

    tx.set(ref, updates, { merge: true });
  });

  return { id: alertId };
}
