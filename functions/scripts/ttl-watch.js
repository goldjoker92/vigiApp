/**
 * scripts/ttl-watch.js
 * Watch TTL de la collection group `uploads_idem`.
 *
 * Sources possibles (combinables, ordre de priorité):
 *   1) --file=keys.txt        (une clé par ligne)
 *   2) --prefix=mc_ --limit=50 (scan par préfixe d'ID)
 *   3) --recent=20            (N derniers par createdAt desc)
 *   4) args pos (keys)        (fallback)
 *
 * Options générales :
 *   --interval=20   (sec, défaut 20)
 *   --collection=uploads_idem (défaut)
 *
 * Exemples :
 *   node -r dotenv/config scripts/ttl-watch.js --file=keys.txt --interval=10
 *   node -r dotenv/config scripts/ttl-watch.js --prefix=mc_ --limit=100
 *   node -r dotenv/config scripts/ttl-watch.js --recent=10
 *   node -r dotenv/config scripts/ttl-watch.js mc_key1 mc_key2
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const argv = process.argv.slice(2);
const getFlag = (name, def = null) => {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) { return def; }
  if (hit.includes('=')) { return hit.split('=').slice(1).join('='); }
  return true;
};
const getInt = (name, def) => {
  const v = getFlag(name, null);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const COLLECTION = String(getFlag('collection', 'uploads_idem'));
const INTERVAL_SEC = getInt('interval', 20);
const RECENT_N = getInt('recent', null);
const PREFIX = getFlag('prefix', null);
const LIMIT = getInt('limit', 50);
const FILEPATH = getFlag('file', null);

const positionalKeys = argv.filter(a => !a.startsWith('--'));

const pad2 = n => String(n).padStart(2, '0');
const fmtDuration = ms => {
  if (!Number.isFinite(ms)) {return '-';}
  const neg = ms < 0 ? '-' : '';
  const s = Math.floor(Math.abs(ms) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${neg}${m}:${pad2(r)}`;
};
const nowLocal = () => new Date().toLocaleString();

async function readLines(file) {
  const abs = path.resolve(process.cwd(), file);
  const raw = await fs.promises.readFile(abs, 'utf8');
  return raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

async function keysFromFile(file) {
  try {
    const lines = await readLines(file);
    console.log(`[TTL WATCH] Keys depuis fichier (${file}) : ${lines.length}`);
    return lines;
  } catch (e) {
    console.warn(`[TTL WATCH] Impossible de lire ${file}: ${e?.message || e}`);
    return [];
  }
}

async function keysFromPrefix(prefix, limit) {
  // Requête par ID de document : FieldPath.documentId()
  const FPID = admin.firestore.FieldPath.documentId();
  const upper = prefix + '\uf8ff';

  // On ne peut pas faire une query cross-subcollections *par défaut* sur un CG avec documentId()
  // → Ici on part du principe que `uploads_idem` est une collection RACINE (comme dans tes scripts).
  // Si c'est un *collection group*, remplace par:
  //   db.collectionGroup(COLLECTION)
  // (et garde la même where(FPID...)).
  const snap = await db
    .collection(COLLECTION)
    .where(FPID, '>=', prefix)
    .where(FPID, '<=', upper)
    .limit(limit)
    .get();

  const keys = snap.docs.map(d => d.id);
  console.log(`[TTL WATCH] Keys via prefix "${prefix}" (${keys.length}/${limit})`);
  return keys;
}

async function keysFromRecent(n) {
  const snap = await db
    .collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(n)
    .get();
  const keys = snap.docs.map(d => d.id);
  console.log(`[TTL WATCH] Keys récentes (createdAt desc) : ${keys.length}`);
  return keys;
}

function uniq(arr) {
  return [...new Set(arr)];
}

async function resolveKeys() {
  let keys = [];

  if (FILEPATH) {keys = keys.concat(await keysFromFile(FILEPATH));}
  if (PREFIX) {keys = keys.concat(await keysFromPrefix(PREFIX, LIMIT));}
  if (RECENT_N) {keys = keys.concat(await keysFromRecent(RECENT_N));}
  if (positionalKeys.length) {keys = keys.concat(positionalKeys);}

  keys = uniq(keys);

  if (!keys.length) {
    console.log('[TTL WATCH] Aucune clé fournie/trouvée.');
    console.log('Usage:');
    console.log('  node -r dotenv/config scripts/ttl-watch.js --file=keys.txt [--interval=10]');
    console.log('  node -r dotenv/config scripts/ttl-watch.js --prefix=mc_ --limit=50');
    console.log('  node -r dotenv/config scripts/ttl-watch.js --recent=10');
    console.log('  node -r dotenv/config scripts/ttl-watch.js key1 key2 ...');
    process.exit(1);
  }
  return keys;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {out.push(arr.slice(i, i + size));}
  return out;
}

async function readMany(keys) {
  // Regroupe en appels getAll() pour économiser les lectures / aller plus vite
  const CHUNK = 300;
  const chunks = chunk(keys, CHUNK);
  const results = new Map(); // id -> { exists, expireAt, createdAt }

  for (const ch of chunks) {
    const refs = ch.map(k => db.collection(COLLECTION).doc(k));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      const id = s.id;
      if (!s.exists) {
        results.set(id, { exists: false });
        continue;
      }
      const data = s.data() || {};
      const expireAt =
        data.expireAt?.toDate?.() ||
        (data.expireAt instanceof Date ? data.expireAt : null);
      const createdAt =
        data.createdAt?.toDate?.() ||
        (data.createdAt instanceof Date ? data.createdAt : null);
      results.set(id, { exists: true, expireAt, createdAt });
    }
  }
  return results;
}

async function main() {
  const keys = await resolveKeys();
  const alive = new Set(keys); // encore présents
  const intervalMs = Math.max(2, INTERVAL_SEC) * 1000;

  console.log(
    `[TTL WATCH] ${nowLocal()} • collection=${COLLECTION} • watch=${keys.length} keys • interval=${intervalMs / 1000}s`
  );

  async function tick() {
    const now = Date.now();
    const keysToCheck = [...alive];
    if (!keysToCheck.length) {
      console.log(`[TTL WATCH] ${nowLocal()} • Tous supprimés → stop.`);
      process.exit(0);
    }

    let results;
    try {
      results = await readMany(keysToCheck);
    } catch (e) {
      console.warn(`[TTL WATCH] Erreur readMany: ${e?.message || e}`);
      return; // on retentera au prochain tick
    }

    for (const id of keysToCheck) {
      const r = results.get(id);
      if (!r || r.exists === false) {
        if (alive.has(id)) {
          alive.delete(id);
          console.log(`[TTL] ${nowLocal()} • ${id} → supprimé ✅`);
        }
        continue;
      }
      const expMs = r.expireAt ? r.expireAt.getTime() : NaN;
      const eta = Number.isFinite(expMs) ? expMs - now : NaN;
      const expStr = r.expireAt ? r.expireAt.toISOString() : '-';
      const createdStr = r.createdAt ? r.createdAt.toISOString() : '-';
      console.log(
        `[TTL] ${nowLocal()} • ${id} → existe • expireAt(UTC)=${expStr} • ETA=${fmtDuration(eta)} • createdAt=${createdStr}`
      );
    }
  }

  await tick();
  const t = setInterval(tick, intervalMs);
  // Si process kill → clean interval
  process.on('SIGINT', () => {
    clearInterval(t);
    console.log('\n[TTL WATCH] Interrompu (CTRL+C).');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[TTL WATCH] Erreur fatale', err);
  process.exit(1);
});
