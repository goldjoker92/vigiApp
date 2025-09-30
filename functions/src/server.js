// functions/server.js
// -------------------------------------------------------------
// Cloud Run entrypoint (Express)
// - Monte la route /sendPublicAlertByAddress sur le handler existant
// - Healthcheck /healthz
// - Écoute sur process.env.PORT (8080 par défaut Cloud Run)
// -------------------------------------------------------------

const express = require('express');

// ⚠️ On importe le handler "pur" si dispo, sinon le wrapper onRequest
// Dans la version que je t’ai donnée, j’expose les deux.
// Si tu n’as que `module.exports.sendPublicAlertByAddress = onRequest(...)`,
// on va quand même pouvoir l’appeler : c’est un (req, res) handler.
let handler = null;
try {
  // Si tu as exporté un handler interne :
  ({ _sendPublicAlertByAddressHandler: handler } = require('./sendPublicAlertByAddress'));
} catch {}

if (!handler) {
  // Fallback: prends l’export onRequest (c’est aussi (req,res) => Promise)
  ({ sendPublicAlertByAddress: handler } = require('./sendPublicAlertByAddress'));
}

const app = express();
app.use(express.json());

// Healthcheck
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Ta route HTTP publique (même nom, lisible)
app.all('/sendPublicAlertByAddress', (req, res) => {
  // on laisse le handler gérer CORS/logs/etc.
  return handler(req, res);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[RUN] sendpublicalertbyaddress listening on :${PORT}`);
});
