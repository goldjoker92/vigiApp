/**
 * server/passwordService.js
 * Hash/verify server-side avec Argon2id + pepper + per-user salt.
 */
import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { HASH_SCHEMES } from './securityConfig.js';

const ENV_MAP = {
  API_KEY: process.env.API_KEY,
  DB_URL: process.env.DB_URL,
  // Add other known env vars here
};

function getPepper(saltId) {
  const env = HASH_SCHEMES[saltId]?.pepperEnvVar;
  if (!env) {
    throw new Error('Unknown saltId');
  }
  const val = ENV_MAP[env]; // env must be a key in ENV_MAP
  if (!val) {
    throw new Error(`Missing pepper env: ${env}`);
  }
  return val;
}

export async function hashForStorageFromClientPrehash(clientPrehash, saltId) {
  const pepper = getPepper(saltId);
  const perUserSalt = randomBytes(16).toString('hex');
  const toHash = `${clientPrehash}:${pepper}:${perUserSalt}`;
  const stored = await argon2.hash(toHash, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  return { storedHash: stored, perUserSalt, hashVersion: saltId };
}

export async function verifyFromClientPrehash(clientPrehash, user) {
  const pepper = getPepper(user.hashVersion);
  const toVerify = `${clientPrehash}:${pepper}:${user.perUserSalt}`;
  return argon2.verify(user.storedHash, toVerify);
}
