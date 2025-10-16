// functions_api/passwordService.js (ESM)
// KDF: argon2id + pepper via params (Gen2)

import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { defineString } from 'firebase-functions/params';
import { HASH_SCHEMES } from './securityConfig.js';

const PEPPER_V1 = defineString('security.pepper_v1');

function getPepper(saltId) {
  const key = HASH_SCHEMES[saltId]?.pepperParamKey;
  if (!key) {
    throw new Error('Unknown saltId');
  }
  if (key === 'security.pepper_v1') {
    return PEPPER_V1.value();
  }
  throw new Error('Pepper key not handled: ' + key);
}

export async function hashForStorageFromClientPrehash(clientPrehash, saltId) {
  const pepper = getPepper(saltId);
  if (!pepper) {
    throw new Error('Missing pepper - set functions params');
  }
  const perUserSalt = randomBytes(16).toString('hex');
  const toHash = `${clientPrehash}:${pepper}:${perUserSalt}`;
  const storedHash = await argon2.hash(toHash, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  return { storedHash, perUserSalt, hashVersion: saltId };
}

export async function verifyFromClientPrehash(clientPrehash, user) {
  const pepper = getPepper(user.hashVersion);
  if (!pepper) {
    throw new Error('Missing pepper - set functions params');
  }
  const toVerify = `${clientPrehash}:${pepper}:${user.perUserSalt}`;
  return argon2.verify(user.storedHash, toVerify);
}
