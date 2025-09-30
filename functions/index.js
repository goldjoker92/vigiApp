// functions/index.js
// -------------------------------------------------------------
// VigiApp — API (Users + Public Alerts)
// - Logs [API] cohérents (suivi clair en prod)
// - Variables de simulation charge (désactivées par défaut)
// - Zéro régression en prod
// -------------------------------------------------------------

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const express = require('express');
const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { HASH_SCHEMES } = require('./securityConfig.js');
const {
  hashForStorageFromClientPrehash,
  verifyFromClientPrehash,
} = require('./passwordService.js');

// ---------- INIT
initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'southamerica-east1', cors: true });

const app = express();
app.use(express.json());

// ---------- SIMULATION (désactivée par défaut)
const SIMULATION_ENABLED = false; // ⚠️ mettre true seulement en test
const MAX_CONCURRENT_USERS_SIMULATED = 1000; // valeur par défaut si simulation activée

// ---------- HELPERS
function sha256HexServerPrefixed(plain) {
  const buf = crypto
    .createHash('sha256')
    .update('v1::' + plain, 'utf8')
    .digest();
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const usersCol = () => db.collection('users');

// ⚠️ Ligne qui branche l’endpoint “par adresse”
exports.sendPublicAlertByAddress =
  require('./src/sendPublicAlertByAddress').sendPublicAlertByAddress;

// ---------- ROUTES
app.get('/health', (req, res) => {
  console.log('[API][HEALTH] checked');
  res.json({ ok: true, service: 'api', region: 'southamerica-east1' });
});

app.post('/signup', async (req, res) => {
  try {
    const { email, prehash, saltId } = req.body ?? {};
    console.log('[API][SIGNUP] attempt', { email, saltId });

    if (!email || !prehash || !saltId) {
      return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });
    }
    if (!Object.hasOwn(HASH_SCHEMES, saltId)) {
      return res.status(400).json({ ok: false, code: 'UNSUPPORTED_SALT_ID' });
    }

    const userRef = usersCol().doc(email);
    const snap = await userRef.get();
    if (snap.exists) {
      console.warn('[API][SIGNUP] already exists', { email });
      return res.status(409).json({ ok: false, code: 'ALREADY_EXISTS' });
    }

    const rec = await hashForStorageFromClientPrehash(prehash, saltId);
    await userRef.set({
      email,
      storedHash: rec.storedHash,
      perUserSalt: rec.perUserSalt,
      hashVersion: rec.hashVersion,
      createdAt: new Date().toISOString(),
    });

    console.log('[API][SIGNUP] success', { email });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[API][SIGNUP] error', e);
    return res.status(500).json({ ok: false });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, prehash, saltId, password } = req.body ?? {};
    console.log('[API][LOGIN] attempt', { email });

    if (!email) {
      return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });
    }

    let effectivePrehash;
    if (prehash && saltId && Object.hasOwn(HASH_SCHEMES, saltId)) {
      effectivePrehash = prehash;
    } else if (typeof password === 'string') {
      effectivePrehash = sha256HexServerPrefixed(password); // fallback legacy
    } else {
      return res.status(400).json({ ok: false, code: 'MISSING_CREDENTIALS' });
    }

    const userRef = usersCol().doc(email);
    const snap = await userRef.get();
    if (!snap.exists) {
      console.warn('[API][LOGIN] no such user', { email });
      return res.status(401).json({ ok: false });
    }

    const user = snap.data();
    const ok = await verifyFromClientPrehash(effectivePrehash, {
      storedHash: user.storedHash,
      perUserSalt: user.perUserSalt,
      hashVersion: user.hashVersion,
    });

    if (!ok) {
      console.warn('[API][LOGIN] bad password', { email });
      return res.status(401).json({ ok: false });
    }

    console.log('[API][LOGIN] success', { email });
    return res.json({
      ok: true,
      token: 'FAKE_JWT_FOR_TEST',
      ...(SIMULATION_ENABLED ? { simulatedUsers: MAX_CONCURRENT_USERS_SIMULATED } : {}),
    });
  } catch (e) {
    console.error('[API][LOGIN] error', e);
    return res.status(500).json({ ok: false });
  }
});

// ---------- EXPORT
exports.api = onRequest(app);

exports.api = onRequest(app);
exports.sendPublicAlertByAddress =
  require('./src/sendPublicAlertByAddress').sendPublicAlertByAddress;
