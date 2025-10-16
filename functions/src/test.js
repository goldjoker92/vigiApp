// functions/src/test.js
// =============================================================
// Test FCM — 1 device (token)
// - Force l’usage du canal Android 'alerts-high'
// - Heads-up + son + visibilité publique
// - Données data pour navigation in-app
// =============================================================
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

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

      // Données (inoffensif) pour ton routing in-app
      data: { screen: 'home', reason: 'test' },

      // ✅ Android: rattache à 'alerts-high' + heads-up
      android: {
        priority: 'high',
        notification: {
          channelId: 'alerts-high', // DOIT exister côté app
          sound: 'default',
          color: '#FF3B30',
          visibility: 'PUBLIC',
          notificationPriority: 'PRIORITY_MAX',
          defaultVibrateTimings: true,
          defaultLightSettings: true,
          // imageUrl: 'https://picsum.photos/800/400', // option: bannière étendue
        },
      },

      // iOS (sans effet sur Android mais OK à garder)
      apns: { headers: { 'apns-priority': '10' } },
    };

    const resp = await admin.messaging().send(message);
    return res.json({ ok: true, messageId: resp });
  } catch (err) {
    console.error('[testFCM] error:', err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});
