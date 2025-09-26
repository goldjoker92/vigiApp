// functions/securityConfig.js
export const HASH_SCHEMES = {
  "build-v1": {
    kdf: "argon2id",
    pepperParamKey: "security.pepper_v1",
    versionPrefix: "v1::"
  }
};
