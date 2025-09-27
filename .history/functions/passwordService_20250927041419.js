// functions/passwordService.js
const argon2 = require('argon2');
const { randomBytes } = require('crypto');
const { defineString } = require('firebase-functions/params');
const { HASH_SCHEMES } = require('./securityConfig.js');

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

async function hashForStorageFromClientPrehash(clientPrehash, saltId) {
  const pepper = getPepper(saltId);
  if (!pepper) throw new Error('Missing pepper - set functions config');
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

async function verifyFromClientPrehash(clientPrehash, user) {
  const pepper = getPepper(user.hashVersion);
  if (!pepper) throw new Error('Missing pepper - set functions config');
  const toVerify = `${clientPrehash}:${pepper}:${user.perUserSalt}`;
  return argon2.verify(user.storedHash, toVerify);
}

module.exports = {
  hashForStorageFromClientPrehash,
  verifyFromClientPrehash,
};
