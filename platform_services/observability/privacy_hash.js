/**
 * SHA-256 + salt par build. A remplacer par une implémentation crypto
 * plus robuste si besoin; suffisant côté client pour anonymisation.
 */
const _SALT_ID = 'build-v1'; // identifiant du salt; la valeur du sel réel reste côté build/serveur.

export function getBuildSaltId() {
  return _SALT_ID;
}

export async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode('v1::' + input); // préfixe versionné
  const buf = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}
