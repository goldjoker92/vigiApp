/**
 * server/securityConfig.js
 * Schémas de hachage supportés.
 */
export const HASH_SCHEMES = {
  'build-v1': {
    kdf: 'argon2id',
    pepperEnvVar: 'PEPPER_V1',
    versionPrefix: 'v1::',
  },
};
