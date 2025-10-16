// ============================================================================
// src/uploads/redact.js
// Pixelisation légère (image) ; PDF → copie brute
// - Pas d'API externe; on fait simple et crédible
// ============================================================================

const sharp = require('sharp');
const { warn } = require('@/utils/logger');

const isImage = (mime) => mime && mime.startsWith('image/');
const isPDF = (mime) => mime === 'application/pdf';

/**
 * pixelate(buffer, mime) => Buffer
 * - Si image: downscale puis upscale (nearest) pour un effet pixel
 * - Si PDF: return buffer (pas de traitement)
 */
exports.pixelate = async (buffer, mime) => {
  try {
    if (isPDF(mime)) {
      // pas de traitement PDF pour V1
      return buffer;
    }
    if (!isImage(mime)) {
      // fallback: renvoie comme tel
      return buffer;
    }

    // lecture métadonnées pour calculer une taille "bloc"
    const img = sharp(buffer);
    const meta = await img.metadata();
    const w = meta.width || 800;
    const h = meta.height || 600;

    // blockSize approx → plus la valeur est grande, plus c'est pixelisé
    const block = Math.max(8, Math.floor(Math.min(w, h) / 40));

    const wSmall = Math.max(16, Math.floor(w / block));
    const hSmall = Math.max(16, Math.floor(h / block));

    const out = await sharp(buffer)
      .resize(wSmall, hSmall, { fit: 'fill' })
      .resize(w, h, { kernel: 'nearest' })
      .toBuffer();

    return out;
  } catch (e) {
    warn('pixelate error', e?.message || e);
    // retourne original si erreur de pixelisation
    return buffer;
  }
};
