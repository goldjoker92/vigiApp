// functions/src/verifyguardian.js
// ============================================================================
// VigiApp — HTTP handler pur (CommonJS)
// - index.js enveloppe avec onRequest({ cors:true }, verifyGuardian)
// - Verbes: OPTIONS=204, GET=200 "ok", POST=logique
// ============================================================================
const admin = require('firebase-admin');

let _init = false;
function ensureInit() {
  if (_init) {
    return;
  }
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
  _init = true;
}

function jsonErr(res, code, error) {
  return res.status(code).json({ ok: false, error });
}

async function verifyGuardian(req, res) {
  ensureInit();

  // Préflight & healthcheck
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  if (req.method === 'GET') {
    return res.status(200).send('ok');
  }
  if (req.method !== 'POST') {
    return jsonErr(res, 405, 'method_not_allowed');
  }

  try {
    // payload attendu: { caseId, payload: {...} }
    const { caseId, payload: _payload } = req.body || {};
    if (!caseId) {
      return jsonErr(res, 400, 'missing_caseId');
    }

    // TODO: logique réelle de vérification (ACL, token, schéma, etc.)
    // const db = admin.firestore(); ...

    return res.status(200).json({ ok: true, caseId, checked: true });
  } catch (e) {
    console.error('[verifyGuardian]', e?.message || e);
    return jsonErr(res, 500, 'internal_error');
  }
}

module.exports = { verifyGuardian };
