import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'node:util';
import { HASH_SCHEMES } from './securityConfig.js';
import * as functions from 'firebase-functions';

const scrypt = promisify(_scrypt);

// Récupère le pepper via functions.config() (déjà présent chez toi)
function getPepperFromConfig() {
  return functions.config()?.security?.pepper_v1;
}

function getPepper(saltId) {
  const key = HASH_SCHEMES[saltId]?.pepperParamKey;
  if (key !== 'security.pepper_v1') {
    throw new Error('Unknown saltId or pepper key');
  }
  const val = getPepperFromConfig();
  if (!val) {
    throw new Error('Missing pepper (firebase functions:config:set security.pepper_v1="...")');
  }
  return val;
}

// Hash pour stockage: scrypt(toHash, perUserSalt, 64) -> hex
export async function hashForStorageFromClientPrehash(clientPrehash, saltId) {
  const pepper = getPepper(saltId);
  const perUserSalt = randomBytes(16).toString('hex');
  const toHash = `${clientPrehash}:${pepper}:${perUserSalt}`;
  const key = await scrypt(toHash, Buffer.from(perUserSalt, 'hex'), 64);
  const storedHash = Buffer.from(key).toString('hex');
  return { storedHash, perUserSalt, hashVersion: saltId };
}

export async function verifyFromClientPrehash(clientPrehash, user) {
  const pepper = getPepper(user.hashVersion);
  const toVerify = `${clientPrehash}:${pepper}:${user.perUserSalt}`;
  const key = await scrypt(toVerify, Buffer.from(user.perUserSalt, 'hex'), 64);
  const calc = Buffer.from(key);
  const stored = Buffer.from(user.storedHash, 'hex');
  if (stored.length !== calc.length) {
    return false;
  }
  return timingSafeEqual(stored, calc);
}
