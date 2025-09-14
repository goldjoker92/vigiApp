// functions/src/test.js
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Envoi 1 token (notif "display") – simple et suffisant pour tester
exports.testFCM = onRequest(async (req, res) => {
  try {
    const token = req.query.token || req.body?.token;
    const title = req.query.title || req.body?.title || '🚨 Test VigiApp';
    const body = req.query.body || req.body?.body || 'FCM direct: ça marche ✅';

    if (!token) {
      return res.status(400).json({ ok: false, error: 'Fournis ?token=FCM_TOKEN ou body.token' });
    }

    const message = {
      token,
      notification: { title, body },
      // Tu peux ajouter des données pour ta navigation in-app:
      data: { screen: 'home', reason: 'test' },
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    };

    const resp = await admin.messaging().send(message);
    return res.json({ ok: true, messageId: resp });
  } catch (err) {
    console.error('[testFCM] error:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});
