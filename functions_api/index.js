// ============================================================================
// VigiApp — Functions "authapi" (Express API: /health, /signup, /login)
// ============================================================================

import { setGlobalOptions } from 'firebase-functions/v2/options';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

import { HASH_SCHEMES } from './securityConfig.js';
import { hashForStorageFromClientPrehash, verifyFromClientPrehash } from './passwordService.js';

import crypto from 'node:crypto';

// ▸ Options globales (mêmes perfs que le codebase "default")
setGlobalOptions({
  region: 'southamerica-east1',
  cors: true,
  timeoutSeconds: 60,
  memory: '256MiB',
  concurrency: 40,
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin + DB (ce codebase est indépendant : on initialise ici aussi)
initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// Logging util centralisé (format uniforme)
function log(level, msg, extra = {}) {
  const line = {
    ts: new Date().toISOString(),
    service: 'functions-authapi',
    level,
    msg,
    ...extra,
  };
  const text = JSON.stringify(line);
  if (level === 'error') {console.error(text);}
  else if (level === 'warn') {console.warn(text);}
  else {console.log(text);}
}

log('info', 'Loaded codebase: authapi');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers & middlewares
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function sha256HexServerPrefixed(plain) {
  const buf = crypto
    .createHash('sha256')
    .update('v1::' + plain, 'utf8')
    .digest();
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// Request tracing minimal : reqId + timing
app.use((req, _res, next) => {
  req._reqId = crypto.randomUUID();
  req._t0 = Date.now();
  log('info', 'REQ', { id: req._reqId, method: req.method, path: req.path });
  next();
});

// CORS preflight explicite (même si setGlobalOptions.cors=true)
app.options('*', (_req, res) => res.status(204).end());

const usersCol = () => db.collection('users');

// ─────────────────────────────────────────────────────────────────────────────
// Routes

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'api', region: 'southamerica-east1' });
});

app.post('/signup', async (req, res) => {
  const reqId = req._reqId;
  try {
    const { email, prehash, saltId } = req.body ?? {};
    log('info', 'SIGNUP_ATTEMPT', { id: reqId, email, saltId });

    if (!email || !prehash || !saltId) {
      log('warn', 'SIGNUP_BAD_REQUEST', { id: reqId });
      return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });
    }
    if (!hasOwn(HASH_SCHEMES, saltId)) {
      log('warn', 'SIGNUP_UNSUPPORTED_SALT', { id: reqId, saltId });
      return res.status(400).json({ ok: false, code: 'UNSUPPORTED_SALT_ID' });
    }

    const ref = usersCol().doc(email);
    const snap = await ref.get();
    if (snap.exists) {
      log('warn', 'SIGNUP_ALREADY_EXISTS', { id: reqId, email });
      return res.status(409).json({ ok: false, code: 'ALREADY_EXISTS' });
    }

    const rec = await hashForStorageFromClientPrehash(prehash, saltId);
    await ref.set({
      email,
      storedHash: rec.storedHash,
      perUserSalt: rec.perUserSalt,
      hashVersion: rec.hashVersion,
      createdAt: FieldValue.serverTimestamp(),
    });

    log('info', 'SIGNUP_SUCCESS', { id: reqId, email });
    return res.json({ ok: true });
  } catch (e) {
    log('error', 'SIGNUP_ERROR', { id: reqId, error: String(e?.message || e) });
    return res.status(500).json({ ok: false, code: 'INTERNAL' });
  } finally {
    log('info', 'REQ_DONE', { id: reqId, ms: Date.now() - req._t0 });
  }
});

app.post('/login', async (req, res) => {
  const reqId = req._reqId;
  try {
    const { email, prehash, saltId, password } = req.body ?? {};
    log('info', 'LOGIN_ATTEMPT', { id: reqId, email });

    if (!email) {
      log('warn', 'LOGIN_BAD_REQUEST', { id: reqId });
      return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });
    }

    let effectivePrehash;
    if (prehash && saltId && hasOwn(HASH_SCHEMES, saltId)) {
      effectivePrehash = prehash;
    } else if (typeof password === 'string') {
      effectivePrehash = sha256HexServerPrefixed(password);
    } else {
      log('warn', 'LOGIN_MISSING_CREDS', { id: reqId });
      return res.status(400).json({ ok: false, code: 'MISSING_CREDENTIALS' });
    }

    const ref = usersCol().doc(email);
    const snap = await ref.get();
    if (!snap.exists) {
      log('warn', 'LOGIN_NO_USER', { id: reqId, email });
      return res.status(401).json({ ok: false });
    }

    const user = snap.data();
    const ok = await verifyFromClientPrehash(effectivePrehash, {
      storedHash: user.storedHash,
      perUserSalt: user.perUserSalt,
      hashVersion: user.hashVersion,
    });
    if (!ok) {
      log('warn', 'LOGIN_BAD_PASSWORD', { id: reqId, email });
      return res.status(401).json({ ok: false });
    }

    log('info', 'LOGIN_SUCCESS', { id: reqId, email });
    return res.json({ ok: true, token: 'FAKE_JWT_FOR_TEST' });
  } catch (e) {
    log('error', 'LOGIN_ERROR', { id: reqId, error: String(e?.message || e) });
    return res.status(500).json({ ok: false, code: 'INTERNAL' });
  } finally {
    log('info', 'REQ_DONE', { id: reqId, ms: Date.now() - req._t0 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Export Cloud Function HTTPS (nom unique dans ce codebase)
export const api = onRequest(app);
