// Private alert by group — HTTP
const { onRequest } = require('firebase-functions/v2/https');

module.exports.sendPrivateAlertByGroup = onRequest(
  { timeoutSeconds: 30, cors: true },
  async (req, res) => {
    try {
      const body = req.method === 'POST' ? req.body : req.query;
      const groupId = (body?.groupId || '').toString().trim();
      const message = (body?.message || '').toString().trim();

      if (!groupId || !message) {
        res.status(400).json({ ok: false, error: 'Params requis: groupId, message' });
        return;
      }

      // TODO: récupérer membres du groupe → push ciblé
      // await sendPrivatePush(groupId, message);

      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[sendPrivateAlertByGroup] error', e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  }
);
