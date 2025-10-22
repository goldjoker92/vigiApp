// functions/src/verifyGuardian.js
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }
    // payload attendu: { caseId, payload: {...} }
    const { caseId, payload: _payload } = req.body || {};
    if (!caseId) {
      return res.status(400).json({ ok: false, error: 'missing_caseId' });
    }
    // TODO: ta logique réelle de vérification
    return res.status(200).json({ ok: true, caseId, checked: true });
  } catch (e) {
    console.error('[verifyGuardian] ', e?.message || e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
