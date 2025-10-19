/* =============================================================================
   VigiApp — Uploads client (multipart) — robuste & traçable (NO REGRESSION)
   - Logs structurés + traceId/spanId
   - Fallback multi-endpoints (CF v2 / Cloud Run) + circuit-breaker léger
   - Backoff exponentiel avec jitter
   - Garde-fous MIME/EXT/TAILLE + métadonnées (dims, client, geo)
   - ⚠️ FormData reconstruit à CHAQUE tentative (évite "Unexpected end of form")
   - ⚠️ NE JAMAIS fixer 'Content-Type' (laisse RN/Fetch générer le boundary)
   ============================================================================= */

import { Platform, Image } from 'react-native';

/* =============================================================================
   CONFIG
   ============================================================================= */

/** Bases d’upload (ordre = priorité) */
export const UPLOAD_BASES = [
  // Cloud Functions v2 (Express monté derrière /api)
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/api',
  // Cloud Run (service HTTP direct, pas de /api)
  'https://api-pfdobxp2na-rj.a.run.app',
];

/** Routes d’upload par “kind” (miroir server) */
export const UPLOAD_PATHS = {
  id: ['upload/id'],
  photo: ['upload/id'],
  linkDoc: ['upload/id'],
};

/** Limites & stratégies réseau */
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const REQUEST_TIMEOUT_MS = 25_000;      // timeout total par tentative
const MAX_RESPONSE_PREVIEW = 300;       // logs: bornage du texte
const MAX_JSON_BYTES = 512 * 1024;      // sécurité réponses JSON

/** Backoff exponentiel (ms) + jitter */
const BACKOFF_MS = [0, 600, 1400];
const JITTER_MS = 250;

/** Circuit breaker (mémoire) */
const CB_WINDOW_MS = 60_000;        // fenêtre glissante d’échecs
const CB_TRIP_THRESHOLD = 3;        // nb d’échecs pour “ouvrir”
const CB_COOLDOWN_MS = 60_000;      // temps d’ouverture

/* =============================================================================
   LOGGING / TRACE
   ============================================================================= */

const rand = () => Math.floor(Math.random() * 1e9).toString(16);

export function newTraceId(prefix = 'upl') {
  return `${prefix}_${Date.now()}_${rand()}`;
}
function newSpanId() {
  return `${Date.now().toString(36)}_${rand()}`;
}
function nowIso() {
  return new Date().toISOString();
}
function log(level, msg, extra = {}) {
  const line = { ts: nowIso(), level, msg, ...extra };
  if (level === 'error') {console.error(line);}
  else if (level === 'warn') {console.warn(line);}
  else {console.log(line);}
}

/* =============================================================================
   HELPERS
   ============================================================================= */

function withJitter(ms) {
  const delta = Math.floor(Math.random() * 2 * JITTER_MS - JITTER_MS);
  return Math.max(0, ms + delta);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
const isMimeAllowed = (m) => !!m && (m.startsWith('image/') || m === 'application/pdf');
const isExtAllowed = (n) =>
  ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'heif', 'webp']
    .includes(String(n || '').split('.').pop()?.toLowerCase() || '');

function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

/** getImageDimensions — best-effort (évite crash si l’URI n’est pas image locale) */
async function getImageDimensions(uri) {
  if (!uri) {return null;}
  return new Promise((resolve) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), () => resolve(null));
  });
}

/** Catégorisation légère, utile côté analytics/logs */
function guessDocKind({ mime = '', name = '', dims = null }) {
  const reasons = [];
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  if (mime) {reasons.push(`mime:${mime}`);}
  if (ext) {reasons.push(`ext:${ext}`);}
  if (dims && dims.width && dims.height) {
    const ratio = dims.width / dims.height;
    reasons.push(`ratio:${ratio.toFixed(2)}`);
    if (ratio >= 1.35 && ratio <= 1.85 && dims.width >= 400) {
      return { kind: 'id_card_like', confidence: 0.8, reasons };
    }
    if (ratio < 0.9) {
      return { kind: 'portrait_photo', confidence: 0.75, reasons };
    }
    if (ratio >= 1.9) {
      return { kind: 'landscape_scan_or_photo', confidence: 0.6, reasons };
    }
    return { kind: 'document_like', confidence: 0.55, reasons };
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { kind: 'pdf_document', confidence: 0.9, reasons };
  }
  return { kind: 'unknown', confidence: 0.3, reasons };
}

/** Idempotency key stable (hash simple, suffisant côté client) */
export function makeIdempotencyKey({ caseId, userId, name, size }) {
  const base = `${caseId || 'X'}:${userId || 'anon'}:${name || 'file'}:${size || '0'}:${Date.now()}`;
  let h = 0;
  for (let i = 0; i < base.length; i += 1) { h = (h << 5) - h + base.charCodeAt(i); h |= 0; }
  return `mc_${Math.abs(h)}`;
}

/** fetchWithTimeout — coupe net au-delà du délai spécifié */
function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

/* =============================================================================
   CIRCUIT BREAKER (mémoire)
   ============================================================================= */

const cbState = new Map(); // base => { fails:number[], openUntil:number }

function cbIsOpen(base) {
  const s = cbState.get(base);
  return !!(s && s.openUntil && s.openUntil > Date.now());
}
function cbReportFailure(base) {
  const now = Date.now();
  const s = cbState.get(base) || { fails: [], openUntil: 0 };
  s.fails = s.fails.filter((t) => now - t < CB_WINDOW_MS);
  s.fails.push(now);
  if (s.fails.length >= CB_TRIP_THRESHOLD) {
    s.openUntil = now + CB_COOLDOWN_MS;
    log('warn', 'CB open (cooldown)', { base, openUntil: new Date(s.openUntil).toISOString() });
  }
  cbState.set(base, s);
}
function cbReportSuccess(base) {
  cbState.set(base, { fails: [], openUntil: 0 });
}

/* =============================================================================
   CANDIDATS (bases × paths)
   ============================================================================= */

function buildUploadCandidates(kind) {
  const paths = UPLOAD_PATHS[kind] || [];
  const urls = [];
  for (const base of UPLOAD_BASES) {
    if (cbIsOpen(base)) {
      log('warn', 'CB skip base (cooldown)', { base });
      continue;
    }
    for (const p of paths) {urls.push(joinUrl(base, p));}
  }
  return [...new Set(urls)]; // unique
}

/* =============================================================================
   UPLOAD PRINCIPAL (multipart) — AVEC RETRIES & FALLBACKS
   ============================================================================= */

/**
 * @param {Object} options
 * @param {string} options.uri            - file:// URI (Expo ImagePicker / RN FS)
 * @param {string} [options.name]         - nom de fichier (avec extension si possible)
 * @param {string} [options.mime]         - mime (ex: image/jpeg)
 * @param {number} [options.size]         - taille (si connue)
 * @param {string} options.caseId         - id de dossier
 * @param {'id'|'photo'|'linkDoc'} options.kind - type de doc
 * @param {string} [options.userId]
 * @param {string} [options.cpfRaw]
 * @param {string} [options.idempotencyKey]
 * @param {{lat:number,lng:number}} [options.geo]
 */
export async function uploadDocMultipart(options = {}) {
  const {
    uri, name, mime, size, caseId, kind, userId, cpfRaw, idempotencyKey, geo,
  } = options || {};

  const traceId = newTraceId('upl');
  log('info', '[UPLOAD] start', { traceId, hasUri: !!uri, name, mime, size, caseId, kind, userId });

  /* Gardes d’entrée — messages côté UI “clairs” */
  if (!uri || !caseId || !kind) {
    return { ok: false, reason: 'Parâmetros insuficientes (uri/caseId/kind).', traceId };
  }
  if (size && size > MAX_FILE_SIZE) {
    return { ok: false, reason: 'Arquivo muito grande (limite ~15MB).', traceId };
  }
  if (mime && !isMimeAllowed(mime)) {
    return { ok: false, reason: 'Formato não suportado (mime).', traceId };
  }
  if (name && !isExtAllowed(name)) {
    return { ok: false, reason: 'Extensão de arquivo não suportada.', traceId };
  }

  /* Dims best-effort */
  let dims = null;
  try {
    if (mime && mime.startsWith('image/')) {
      dims = await getImageDimensions(uri);
    }
  } catch (e) {
    log('warn', '[UPLOAD] dims error', { traceId, error: e && (e.message || String(e)) });
  }

  const guessed = guessDocKind({ mime: mime || '', name: name || '', dims });
  const idem = idempotencyKey || makeIdempotencyKey({ caseId, userId, name, size });

  /* Builder — ⚠️ NOUVEAU FormData À CHAQUE TENTATIVE */
  const buildForm = () => {
    const f = new FormData();

    // Nom sûr (avec extension si possible)
    const safeName =
      name && /\./.test(name)
        ? name
        : (mime && mime.startsWith('image/'))
          ? `upload_${Date.now()}.jpg`
          : `upload_${Date.now()}.bin`;

    f.append('caseId', String(caseId));
    f.append('kind', String(kind));             // "photo" | "id" | "linkDoc"
    f.append('userId', String(userId || ''));
    f.append('cpfDigits', String(cpfRaw || ''));
    f.append('client', JSON.stringify({
      platform: Platform.OS, version: Platform.Version, dims, guessed,
    }));
    if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
      f.append('geo', JSON.stringify({ lat: geo.lat, lng: geo.lng }));
    }
    // Champ fichier attendu côté serveur: 'file'
    f.append('file', {
      uri,
      name: safeName,
      type: mime || 'application/octet-stream',
    });

    return f;
  };

  const candidates = buildUploadCandidates(kind);
  if (candidates.length === 0) {
    log('error', '[UPLOAD] no candidate URL', { traceId });
    return { ok: false, reason: 'Nenhum endpoint disponível.', traceId };
  }

  /* Boucle de tentatives (backoff + CB) */
  for (const url of candidates) {
    const base = url.split('/').slice(0, 3).join('/');

    for (let attempt = 0; attempt < BACKOFF_MS.length; attempt += 1) {
      const spanId = newSpanId();

      const waitMs = withJitter(BACKOFF_MS[attempt]);
      if (waitMs) {await sleep(waitMs);}

      try {
        log('info', '[UPLOAD] POST', { traceId, spanId, url, attempt });

        // ⚠️ FormData reconstruit à chaque POST (critique)
        const form = buildForm();

        const res = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            body: form,
            headers: {
              Accept: 'application/json',
              'X-Idempotency-Key': idem,
              'X-Trace-Id': traceId,
              'X-Span-Id': spanId,
              // ⚠️ NE PAS fixer 'Content-Type' → boundary auto
            },
          },
          REQUEST_TIMEOUT_MS,
        );

        if (!res.ok) {
          // Lecture courte pour logs
          let preview = '';
          try { preview = (await res.text()).slice(0, MAX_RESPONSE_PREVIEW); } catch {}

          log('warn', '[UPLOAD] http error', { traceId, spanId, status: res.status, url, preview });

          if (res.status === 404) { cbReportFailure(base); break; }          // inutile d’insister sur cette base
          if (res.status === 409) {return { ok: false, reason: 'Requisição duplicada (idempotência).', traceId };}
          if (res.status >= 400 && res.status < 500) { cbReportFailure(base); break; }

          cbReportFailure(base); // 5xx -> on retente attempt suivant
          continue;
        }

        // Réponse OK → on contrôle la taille via Content-Length si dispo
        const cl = Number(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
        if (cl && cl > MAX_JSON_BYTES) {
          log('error', '[UPLOAD] json too large by header', { traceId, spanId, size: cl });
          cbReportFailure(base);
          continue;
        }

        // Parse JSON (on passe par text() pour pouvoir borner)
        let text = '';
        try {
          text = await res.text();
          if (text.length > MAX_JSON_BYTES) {
            log('error', '[UPLOAD] json too large by text', { traceId, spanId, size: text.length });
            cbReportFailure(base);
            continue;
          }
        } catch (e) {
          log('warn', '[UPLOAD] read error', { traceId, spanId, error: e && (e.message || String(e)) });
          cbReportFailure(base);
          continue;
        }

        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          log('warn', '[UPLOAD] bad json', { traceId, spanId, error: e && (e.message || String(e)) });
          cbReportFailure(base);
          continue;
        }

        if (!json || !json.ok) {
          log('warn', '[UPLOAD] json not ok', {
            traceId, spanId, url, jsonPreview: JSON.stringify(json || {}).slice(0, MAX_RESPONSE_PREVIEW),
          });
          cbReportFailure(base);
          continue;
        }

        // Succès
        cbReportSuccess(base);
        log('info', '[UPLOAD] ok', {
          traceId, spanId, url, storedAt: json && json.storedAt, redactedPath: json && json.redactedPath,
        });

        return {
          ok: true,
          traceId,
          redactedUrl: json.redactedUrl,
          meta: {
            originalPath: json.originalPath,
            redactedPath: json.redactedPath,
            mimeServer: json.mime,
            extServer: json.ext,
            storedAt: json.storedAt,
            guessed,
          },
        };
      } catch (e) {
        const msg = e && e.name === 'AbortError' ? 'timeout' : (e && (e.message || String(e)));
        log('warn', '[UPLOAD] exception', { traceId, spanId, url, attempt, error: msg });
        cbReportFailure(base);
        continue;
      }
    }

    log('warn', '[UPLOAD] trying next candidate', { traceId, next: true, url });
  }

  log('error', '[UPLOAD] all candidates failed', { traceId });
  return { ok: false, reason: 'Falha no upload (endpoint indisponível / 404).', traceId };
}

/* =============================================================================
   WRAPPERS (ergonomie)
   ============================================================================= */

export const uploadIdDocument   = (p) => uploadDocMultipart({ ...p, kind: 'id' });
export const uploadLinkDocument = (p) => uploadDocMultipart({ ...p, kind: 'linkDoc' });
export const uploadChildPhoto   = (p) => uploadDocMultipart({ ...p, kind: 'photo' });
