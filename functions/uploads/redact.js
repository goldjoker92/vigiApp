// ============================================================================
// functions/src/uploads/redact.js
// Redaction / Pixelisation légère et tolérante pour images
// - PDF / non-image : passthrough
// - Images : downscale -> upscale (nearest) = pixelisation
// - Tolérance : logger facultatif, sharp facultatif (fallback no-op)
// ============================================================================

// ---------- Logger tolérant (fallback console JSON) --------------------------
let _log, _err;
(() => {
  try {
    const { log, err } = require('../utils/logger');
    _log = log; _err = err;
  } catch {
    const nowIso = () => new Date().toISOString();
    const out = (lvl, msg, extra = {}) => {
      const line = JSON.stringify({ ts: nowIso(), lvl, mod: 'redact', msg, ...extra });
      if (lvl === 'error') {console.error(line);}
      else if (lvl === 'warn') {console.warn(line);}
      else {console.log(line);}
    };
    _log = (msg, extra) => out('info', msg, extra);
    _err = (msg, extra) => out('error', msg, extra);
  }
})();

// ---------- sharp facultatif -------------------------------------------------
let sharp = null;
(() => {
  try {
    sharp = require('sharp');
    // Un peu de discipline mémoire côté Cloud Functions
    try {
      sharp.cache({ files: 64, items: 512, memory: 128 }); // MB
      sharp.concurrency(Math.max(1, parseInt(process.env.SHARP_CONCURRENCY || '1', 10) || 1));
    } catch {}
  } catch (e) {
    sharp = null;
    _err('sharp_unavailable_fallback_noop', { error: String(e?.message || e) });
  }
})();

// ---------- Helpers MIME -----------------------------------------------------
const isImage = (mime = '') => typeof mime === 'string' && mime.startsWith('image/');
const isPDF   = (mime = '') => mime === 'application/pdf';

// ---------- Tuning par ENV ---------------------------------------------------
const BLOCK_DIVISOR = Math.max(10, parseInt(process.env.REDACT_BLOCK_DIVISOR || '40', 10) || 40);
// Taille minimale des blocs (en px) → plus grand = plus pixelisé
const MIN_BLOCK     = Math.max(6, parseInt(process.env.REDACT_MIN_BLOCK || '8', 10) || 8);
// Limites de sécurité pour éviter des dimensions délirantes
const MAX_BASE_W    = Math.max(640, parseInt(process.env.REDACT_MAX_BASE_W || '2000', 10) || 2000);
const MAX_BASE_H    = Math.max(480, parseInt(process.env.REDACT_MAX_BASE_H || '2000', 10) || 2000);

// ----------------------------------------------------------------------------
// pixelate(buffer, mime, traceData?) => Buffer
// ----------------------------------------------------------------------------
exports.pixelate = async (buffer, mime, traceData = {}) => {
  const { traceId = null, spanId = null } = traceData || {};
  const ctx = { traceId, spanId, mime };

  try {
    // Pas d’image → bypass
    if (isPDF(mime)) {
      _log('pixelate_bypass_pdf', ctx);
      return buffer;
    }
    if (!isImage(mime)) {
      _log('pixelate_bypass_non_image', ctx);
      return buffer;
    }

    // sharp indisponible → bypass
    if (!sharp) {
      _err('pixelate_no_sharp_passthrough', ctx);
      return buffer;
    }

    _log('pixelate_start', { ...ctx, inSize: buffer?.length || null });

    // Lire métadonnées (honorer EXIF orientation)
    const s = sharp(buffer, { failOn: false, sequentialRead: true });
    const meta = await s.metadata().catch(() => ({}));
    const w0 = Math.min(meta.width || 800, MAX_BASE_W);
    const h0 = Math.min(meta.height || 600, MAX_BASE_H);

    // Calcul d’un bloc raisonnable
    const block = Math.max(MIN_BLOCK, Math.floor(Math.min(w0, h0) / BLOCK_DIVISOR));
    const wSmall = Math.max(16, Math.floor(w0 / block));
    const hSmall = Math.max(16, Math.floor(h0 / block));

    // Pipeline :
    // 1) rotate() : respecter EXIF
    // 2) resize -> petit (gaussien par défaut)
    // 3) resize -> grand avec kernel nearest (pixelisation)
    // 4) strip metadata
    const out = await sharp(buffer, { failOn: false, sequentialRead: true })
      .rotate() // EXIF
      .resize(wSmall, hSmall, { fit: 'fill' })
      .resize(w0, h0, { kernel: 'nearest' })
      .withMetadata({ exif: undefined, icc: undefined, orientation: undefined }) // strip
      .toBuffer();

    _log('pixelate_done', {
      ...ctx,
      orig: { w: meta.width || null, h: meta.height || null },
      used: { w: w0, h: h0, block, wSmall, hSmall },
      outSize: out?.length || null,
    });

    return out;
  } catch (e) {
    _err('pixelate_error_passthrough', { ...ctx, error: String(e?.message || e) });
    // Fallback : on renvoie l’original (mieux vaut livrer que casser l’upload)
    return buffer;
  }
};
