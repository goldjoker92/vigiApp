const HASH_SCHEMES = {
  'build-v1': {
    kdf: 'argon2id',
    pepperParamKey: 'SECURITY_PEPPER_V1',
    versionPrefix: 'v1::',
  },
};
module.exports = { HASH_SCHEMES };
