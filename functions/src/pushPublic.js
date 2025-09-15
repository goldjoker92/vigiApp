// Public alert by CEP — HTTP
const { onRequest } = require('firebase-functions/v2/https');

module.exports.sendPublicAlertByCEP = onRequest(
  { timeoutSeconds: 30, cors: true },
  async (req, res) => {
    try {
      const body = req.method === 'POST' ? req.body : req.query;
      const cep = (body?.cep || '').toString().trim();
      const message = (body?.message || '').toString().trim();

      if (!cep || !message) {
        res.status(400).json({ ok: false, error: 'Params requis: cep, message' });
        return;
      }

      // TODO: lookup CEP → sélection des destinataires → push
      // await sendPublicPush(cep, message);

      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[sendPublicAlertByCEP] error', e);
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  },
);
