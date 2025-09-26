// functions/index.js
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import express from 'express';
import crypto from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { HASH_SCHEMES } from './securityConfig.js';
import { hashForStorageFromClientPrehash, verifyFromClientPrehash } from './passwordService.js';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'southamerica-east1', cors: true });

const app = express();
app.use(express.json());

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

app.get('/health', (req, res) =>
  res.json({ ok: true, service: 'api', region: 'southamerica-east1' }),
);

app.post('/signup', async (req, res) => {
  try {
    const { email, prehash, saltId } = req.body ?? {};
    if (!email || !prehash || !saltId)
      return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });
    if (!Object.hasOwn(HASH_SCHEMES, saltId))
      return res.status(400).json({ ok: false, code: 'UNSUPPORTED_SALT_ID' });

    const userRef = usersCol().doc(email);
    const snap = await userRef.get();
    if (snap.exists) return res.status(409).json({ ok: false, code: 'ALREADY_EXISTS' });

    const rec = await hashForStorageFromClientPrehash(prehash, saltId);
    await userRef.set({
      email,
      storedHash: rec.storedHash,
      perUserSalt: rec.perUserSalt,
      hashVersion: rec.hashVersion,
      createdAt: new Date().toISOString(),
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, prehash, saltId, password } = req.body ?? {};
    if (!email) return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });

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
    if (!snap.exists) return res.status(401).json({ ok: false });

    const user = snap.data();
    const ok = await verifyFromClientPrehash(effectivePrehash, {
      storedHash: user.storedHash,
      perUserSalt: user.perUserSalt,
      hashVersion: user.hashVersion,
    });

    if (!ok) return res.status(401).json({ ok: false });
    return res.json({ ok: true, token: 'FAKE_JWT_FOR_TEST' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
});

export const api = onRequest(app);
