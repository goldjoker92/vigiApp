// client/loginAdapter.js

import { sha256Hex, getBuildSaltId } from './cryptoClient.js';
import config from '../src/config/config.js'; // ajuste si ton chemin diffère

export async function login(email, password) {
  const prehash = await sha256Hex(password);
  const payload = { email, prehash, saltId: getBuildSaltId() };

  const res = await fetch(`${config.BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return res.json();
}
