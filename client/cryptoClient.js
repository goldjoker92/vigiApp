/**
 * client/cryptoClient.js
 * Pré-hash léger côté client et helpers signup/login utilitaires.
 * Node 18+ supporte fetch et Web Crypto.
 */
const _SALT_ID = 'build-v1';

export function getBuildSaltId() {
  return _SALT_ID;
}

export async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode('v1::' + input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// utilitaires de test (signup/login)
export async function signup(baseUrl, email, password) {
  const prehash = await sha256Hex(password);
  const res = await fetch(`${baseUrl}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, prehash, saltId: getBuildSaltId() }),
  });
  return res.json();
}

export async function clientPrehash(password) {
  return sha256Hex(password);
}

export { login } from './loginAdapter.js';
