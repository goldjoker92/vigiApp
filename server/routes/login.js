/**
 * server/routes/login.js
 * Routes /signup et /login.
 * - Accepte { prehash, saltId } (nouveau client)
 * - OU { password } (ancien client) : on pré-hash côté serveur pour compat
 *
 * NOTE: Remplace la Map "users" par ton DB (mongodb, pg, etc.) en prod.
 */
import express from 'express';
import crypto from 'node:crypto';
import { hashForStorageFromClientPrehash, verifyFromClientPrehash } from '../passwordService.js';
import { HASH_SCHEMES } from '../securityConfig.js';

const router = express.Router();
// Map en mémoire pour tests rapides (email -> { storedHash, perUserSalt, hashVersion })
const users = new Map();

/** utilitaire : sha256 hex avec prefix "v1::" identique au client */
function sha256HexServerPrefixed(plain) {
  const buf = crypto
    .createHash('sha256')
    .update('v1::' + plain, 'utf8')
    .digest();
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Signup lit { email, prehash, saltId } (nouveau flow) */
router.post('/signup', async (req, res) => {
  try {
    const { email, prehash, saltId } = req.body ?? {};
    if (!email || !prehash || !saltId) {
      return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });
    }
    if (!Object.hasOwn(HASH_SCHEMES, saltId)) {
      return res.status(400).json({ ok: false, code: 'UNSUPPORTED_SALT_ID' });
    }
    if (users.has(email)) {
      return res.status(409).json({ ok: false, code: 'ALREADY_EXISTS' });
    }

    const rec = await hashForStorageFromClientPrehash(prehash, saltId);
    users.set(email, rec);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
});

/** Login : accepte ancien et nouveau format */
router.post('/login', async (req, res) => {
  try {
    const { email, prehash, saltId, password } = req.body ?? {};
    if (!email) {
      return res.status(400).json({ ok: false, code: 'BAD_REQUEST' });
    }

    let effectivePrehash, effectiveSaltId;

    if (prehash && saltId && Object.hasOwn(HASH_SCHEMES, saltId)) {
      // nouveau client déjà branché
      effectivePrehash = prehash;
      effectiveSaltId = saltId;
    } else if (typeof password === 'string') {
      // ancien client : on calcule le pré-hash serveur-side (fallback)
      effectivePrehash = sha256HexServerPrefixed(password);
    } else {
      return res.status(400).json({ ok: false, code: 'MISSING_CREDENTIALS' });
    }

    // récupère l'utilisateur (ici Map, remplace par DB en prod)
    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ ok: false });
    }

    // vérification avec passwordService
    const ok = await verifyFromClientPrehash(effectivePrehash, {
      storedHash: user.storedHash,
      perUserSalt: user.perUserSalt,
      hashVersion: user.hashVersion,
    });

    if (!ok) {
      return res.status(401).json({ ok: false });
    }

    // succès : génère token réel ici (JWT) ; renvoi fake pour test
    return res.json({ ok: true, saltId: effectiveSaltId, prehash: effectivePrehash });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
});

export default router;
