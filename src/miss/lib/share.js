// src/miss/lib/share.js
// ============================================================================
// VigiApp — Helpers de partage pour "missingCases"
// - Lien public: https://vigi.app/missing-public-alerts/[id]
// - Deep link app: vigiapp://missing-public-alerts/[id]
// - buildMissingShareMessage(...) pour composer le texte
// - shareNative(...) et shareWhatsApp(...) (avec fallback natif)
// Logs sobres et cohérents
// ============================================================================

import { Share, Linking } from 'react-native';

const NS = '[MISS/SHARE]';
const Log = {
  info: (...a) => console.log(NS, ...a),
  warn: (...a) => console.warn(NS, '⚠️', ...a),
  error: (...a) => console.error(NS, '❌', ...a),
};

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------
export function missingPublicWebLink(caseId) {
  return `https://vigi.app/missing-public-alerts/${caseId || ''}`;
}
export function missingPublicDeepLink(caseId) {
  return `vigiapp://missing-public-alerts/${caseId || ''}`;
}

// ---------------------------------------------------------------------------
// Message builder
// ---------------------------------------------------------------------------
/**
 * buildMissingShareMessage({ type, caseId, name, cidade, uf, dateBR, time })
 * type: 'child' | 'animal' | 'object'
 */
export function buildMissingShareMessage({ type, caseId, name, cidade, uf, dateBR, time }) {
  const web = missingPublicWebLink(caseId);

  let prefix = '🚨 ALERTA - Caso missing';
  const t = String(type || '').toLowerCase();
  if (t === 'child') {
    prefix = '🚨 ALERTA - Criança desaparecida';
  } else if (t === 'animal') {
    prefix = '🐾 ALERTA - Animal perdido';
  } else if (t === 'object') {
    prefix = '🧳 ALERTA - Objeto perdido';
  }

  // Rappel UX: aidez + lien
  return (
    `${prefix}\n\n` +
    `Nome: ${name || 'N/I'}\n` +
    `Local: ${cidade || 'N/I'}${uf ? ` (${String(uf).toUpperCase()})` : ''}\n` +
    `Data: ${dateBR || 'N/I'}${time ? ` às ${time}` : ''}\n\n` +
    `Ajude agora:\n${web}\n\n` +
    `ℹ️ Fotos públicas são protegidas (desfoque). Abra no app VigiApp para ver mais.`
  );
}

// ---------------------------------------------------------------------------
// Share actions
// ---------------------------------------------------------------------------
export async function shareNative(message) {
  try {
    Log.info('NATIVE', { len: message?.length || 0 });
    await Share.share({ message });
  } catch (e) {
    Log.warn('NATIVE_ERR', e?.message || String(e));
  }
}

export async function shareWhatsApp(message) {
  try {
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const ok = await Linking.canOpenURL(url);
    Log.info('WA/canOpenURL', ok);
    if (ok) {
      await Linking.openURL(url);
    } else {
      // fallback natif si WA non dispo
      await Share.share({ message });
    }
  } catch (e) {
    Log.warn('WA/fallback', e?.message || String(e));
    try {
      await Share.share({ message });
    } catch {}
  }
}

/**
 * Option utilitaire: envoie via WA si dispo, sinon natif.
 */
export async function shareSmart(message) {
  try {
    const url = 'whatsapp://send';
    const hasWA = await Linking.canOpenURL(url);
    if (hasWA) {
      return shareWhatsApp(message);
    }
    return shareNative(message);
  } catch {
    return shareNative(message);
  }
}
