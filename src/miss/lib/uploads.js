// ============================================================================
// /app/missing-child/lib/uploads.js
// Upload multipart/form-data vers HTTP Cloud Function (prod-ready, pas de mock)
// - Envoi réel de fichiers (uri mobile) via FormData + fetch()
// - Idempotency key + retries (exponential backoff)
// - Heuristiques light côté client (mime/ext/ratio) pour logs/toasts
// - Renommage logique côté CF (caseId/timestamp/type.ext) -> CF renvoie redactedUrl
// MIX FR + EN
// ============================================================================

import { Platform, Image } from 'react-native';

import { onlyDigits } from './helpers';

// ----------------------------------------------------------------------------
// CONFIG — à adapter à ton projet
// ----------------------------------------------------------------------------
/**
 * HTTP Cloud Function endpoint (multipart/form-data)
 * Ex: https://REGION-PROJECT.cloudfunctions.net/mcUpload
 * -> remplace par ton endpoint réel
 */
export const CF_UPLOAD_ENDPOINT =
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/mcUpload';

/**
 * Taille max (en octets) acceptée côté client avant envoi (guard rail UX)
 * 15 Mo par défaut — ajuste selon ton besoin
 */
const MAX_FILE_SIZE = 15 * 1024 * 1024;

// ----------------------------------------------------------------------------
// Utils (client-side) — no external deps
// ----------------------------------------------------------------------------

/**
 * Retourne { width, height } pour une image (si possible), sinon null
 * Compatible file://, content://, https://
 */
async function getImageDimensions(uri) {
  if (!uri) {
    return null;
  }
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => resolve({ width: w, height: h }),
      () => resolve(null),
    );
  });
}

/**
 * Heuristiques légères pour typer le fichier (pour logs/UX uniquement)
 * - Basé sur mime/extension + ratio
 */
function guessDocKind({ mime = '', name = '', dims = null }) {
  const reasons = [];
  const ext =
    String(name || '')
      .split('.')
      .pop()
      ?.toLowerCase() || '';

  if (mime) {
    reasons.push(`mime:${mime}`);
  }
  if (ext) {
    reasons.push(`ext:${ext}`);
  }

  // Images
  if (dims && dims.width && dims.height) {
    const ratio = dims.width / dims.height;
    reasons.push(`ratio:${ratio.toFixed(2)}`);

    // Carte d'identité souvent ~1.6 (paysage)
    if (ratio >= 1.35 && ratio <= 1.85 && dims.width >= 400) {
      return { kind: 'id_card_like', confidence: 0.8, reasons };
    }
    // Portrait probable (photo enfant)
    if (ratio < 0.9) {
      return { kind: 'portrait_photo', confidence: 0.75, reasons };
    }
    // Document scanné ou paysage très large
    if (ratio >= 1.9) {
      return { kind: 'landscape_scan_or_photo', confidence: 0.6, reasons };
    }
    // Zone moyenne → doc mixte
    return { kind: 'document_like', confidence: 0.55, reasons };
  }

  // PDF
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { kind: 'pdf_document', confidence: 0.9, reasons };
  }

  // Fallback
  return { kind: 'unknown', confidence: 0.3, reasons };
}

/**
 * Génère une idempotency key stable par tentative d’upload (côté client)
 * Tu peux la lier à caseId + userId + nom + taille pour éviter doublons serveurs.
 */
export function makeIdempotencyKey({ caseId, userId, name, size }) {
  const base = `${caseId || 'X'}:${userId || 'anon'}:${name || 'file'}:${size || '0'}:${Date.now()}`;
  // hash light
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (h << 5) - h + base.charCodeAt(i);
    h |= 0;
  }
  return `mc_${Math.abs(h)}`;
}

/**
 * Backoff util
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------
// Validation côté client (avant upload)
// ----------------------------------------------------------------------------

function isMimeAllowed(mime) {
  // Autorise images + pdf pour V1 (ajuste selon ton besoin)
  return mime?.startsWith('image/') || mime === 'application/pdf';
}

function isExtAllowed(name) {
  const ext = String(name || '')
    .split('.')
    .pop()
    ?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'webp'].includes(ext);
}

// ----------------------------------------------------------------------------
// Upload principal (multipart/form-data)
// ----------------------------------------------------------------------------

/**
 * uploadDocMultipart(options)
 *
 * @param {Object} options
 * - uri (string)            : file:// or content:// or https://
 * - name (string)           : original name hint (client side)
 * - mime (string)           : mime type (image/jpeg, application/pdf, ...)
 * - size (number)           : file size in bytes (si connu)
 * - caseId (string)         : id du cas (obligatoire pour rangement serveur)
 * - kind (string)           : "photo" | "id" | "linkDoc"
 * - userId (string)         : id utilisateur (optionnel, utile pour logs/idempotency)
 * - cpfRaw (string)         : CPF (non stocké en clair, juste pour CF cross-check if needed)
 * - idempotencyKey (string) : clé idempotente (si non fournie, on en génère une)
 * - geo (object)            : { lat, lng } (optionnel)
 *
 * Retourne:
 * {
 *   ok: boolean,
 *   redactedUrl?: string,
 *   meta?: {...},          // meta renvoyées par CF (mime/ext/ratio/kind/...)
 *   reason?: string,       // message erreur
 * }
 */
export async function uploadDocMultipart(options = {}) {
  const {
    uri,
    name,
    mime,
    size,
    caseId,
    kind, // "photo" | "id" | "linkDoc"
    userId,
    cpfRaw,
    idempotencyKey,
    geo,
  } = options;

  // Logs homogènes
  console.log('[MISSING_CHILD][UPLOAD] start', {
    uri: !!uri,
    name,
    mime,
    size,
    caseId,
    kind,
    userId,
  });

  if (!uri || !caseId || !kind) {
    return { ok: false, reason: 'Parâmetros insuficientes (uri/caseId/kind).' };
  }

  // Guards basiques côté client
  if (size && size > MAX_FILE_SIZE) {
    return { ok: false, reason: 'Arquivo muito grande (limite ~15MB).' };
  }
  if (mime && !isMimeAllowed(mime)) {
    return { ok: false, reason: 'Formato não suportado (mime).' };
  }
  if (name && !isExtAllowed(name)) {
    return { ok: false, reason: 'Extensão de arquivo não suportada.' };
  }

  // Heuristiques locales (dimensions si image)
  let dims = null;
  try {
    if (mime?.startsWith('image/')) {
      dims = await getImageDimensions(uri);
    }
  } catch {
    // ignore
  }
  const guessed = guessDocKind({ mime, name, dims });

  // Idempotency
  const idem = idempotencyKey || makeIdempotencyKey({ caseId, userId, name, size });

  // Construit FormData
  // RN/Expo requiert un objet { uri, name, type }
  const form = new FormData();
  form.append('caseId', String(caseId));
  form.append('kind', String(kind)); // "photo" | "id" | "linkDoc"
  form.append('userId', String(userId || ''));
  form.append('cpfDigits', cpfRaw ? onlyDigits(cpfRaw) : '');
  form.append(
    'client',
    JSON.stringify({
      platform: Platform.OS,
      version: Platform.Version,
      dims,
      guessed,
    }),
  );
  if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
    form.append('geo', JSON.stringify({ lat: geo.lat, lng: geo.lng }));
  }
  form.append('file', {
    uri,
    name: name || `upload_${Date.now()}`,
    type: mime || 'application/octet-stream',
  });

  // Tentatives avec backoff
  const attempts = [0, 750, 2000]; // ms delay (3 tentatives)
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) {
      await sleep(attempts[i]);
    }

    try {
      const res = await fetch(CF_UPLOAD_ENDPOINT, {
        method: 'POST',
        body: form,
        headers: {
          Accept: 'application/json',
          'X-Idempotency-Key': idem,
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[MISSING_CHILD][UPLOAD] http error', res.status, text);
        // 409 idempotent déjà traité côté serveur ? on tente pas forcément plus
        if (res.status === 409) {
          return { ok: false, reason: 'Requisição duplicada (idempotência).' };
        }
        // 4xx -> évite de spam retry inutile
        if (res.status >= 400 && res.status < 500) {
          return { ok: false, reason: `Falha no upload (${res.status}).` };
        }
        // sinon -> retry
        continue;
      }

      const json = await res.json().catch(() => null);
      if (!json || !json.ok) {
        console.warn('[MISSING_CHILD][UPLOAD] bad json', json);
        continue; // retry
      }

      console.log('[MISSING_CHILD][UPLOAD] ok', json);
      return {
        ok: true,
        redactedUrl: json.redactedUrl,
        meta: {
          // propagent des infos utiles renvoyées par la CF
          originalPath: json.originalPath,
          redactedPath: json.redactedPath,
          mimeServer: json.mime,
          extServer: json.ext,
          storedAt: json.storedAt,
          guessed, // client guess baked in
        },
      };
    } catch (e) {
      console.warn('[MISSING_CHILD][UPLOAD] exception', e?.message || e);
      // essaye encore si tentative restante
      continue;
    }
  }

  return { ok: false, reason: 'Não foi possível enviar o arquivo (rede/servidor).' };
}

// ----------------------------------------------------------------------------
// Helpers spécialisés — enveloppes pratiques pour le front
// ----------------------------------------------------------------------------

/**
 * uploadIdDocument(...)
 * -> pour Doc d'identité (responsável)
 */
export const uploadIdDocument = (p) => uploadDocMultipart({ ...p, kind: 'id' });

/**
 * uploadLinkDocument(...)
 * -> pour Doc de vínculo (responsável ↔ criança)
 */
export const uploadLinkDocument = (p) => uploadDocMultipart({ ...p, kind: 'linkDoc' });

/**
 * uploadChildPhoto(...)
 * -> pour Photo recente (criança)
 */
export const uploadChildPhoto = (p) => uploadDocMultipart({ ...p, kind: 'photo' });
