import fs from 'fs';
import path from 'path';

const API_KEY = process.env.FB_API_KEY || 'REPLACE_ME';
const SESSION_PATH = path.resolve('./client/.session.json');

function readSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  } catch {
    return null;
  }
}
function writeSession(s) {
  fs.writeFileSync(SESSION_PATH, JSON.stringify(s, null, 2), 'utf8');
}
function deleteSession() {
  try {
    fs.unlinkSync(SESSION_PATH);
  } catch {}
}
function base64UrlToJson(b64url) {
  const s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(s, 'base64').toString('utf8');
  return JSON.parse(json);
}
function decodeJwt(token) {
  const [, payload] = String(token || '').split('.');
  if (!payload) {
    return null;
  }
  try {
    return base64UrlToJson(payload);
  } catch {
    return null;
  }
}
function epochSeconds() {
  return Math.floor(Date.now() / 1000);
}

/** Login email/password -> enregistre session (refreshToken + idToken + exp) */
export async function login(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await r.json();
  if (!r.ok) {
    return { ok: false, status: r.status, error: body?.error?.message || 'LOGIN_FAILED' };
  }

  const { idToken, refreshToken, localId } = body;
  const payload = decodeJwt(idToken) || {};
  const exp = Number(payload?.exp || 0);
  writeSession({ email, localId, refreshToken, idToken, idTokenExp: exp });
  return { ok: true, localId, email, idTokenExp: exp };
}

/** Rafraîchir via refresh_token (securetoken) et mettre à jour la session */
async function refreshWithToken(refreshToken) {
  const url = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;
  const form = new URLSearchParams();
  form.append('grant_type', 'refresh_token');
  form.append('refresh_token', refreshToken);

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await r.json();
  if (!r.ok) {
    throw new Error(body?.error?.message || 'REFRESH_FAILED');
  }

  const newId = body?.id_token;
  const newRefresh = body?.refresh_token || refreshToken;
  const payload = decodeJwt(newId) || {};
  const exp = Number(payload?.exp || 0);

  const sess = readSession() || {};
  const updated = { ...sess, idToken: newId, idTokenExp: exp, refreshToken: newRefresh };
  writeSession(updated);
  return newId;
}

/** Retourne un idToken valide (refresh si expiré ou < 60s d’expiration) */
export async function getValidIdToken() {
  const sess = readSession();
  if (!sess?.refreshToken) {
    throw new Error('NO_SESSION');
  }
  const now = epochSeconds();
  const exp = Number(sess?.idTokenExp || 0);
  const margin = 60; // secondes
  if (sess?.idToken && exp > now + margin) {
    return sess.idToken;
  }
  return await refreshWithToken(sess.refreshToken);
}

/** Infos basiques depuis le token */
export async function whoami() {
  const token = await getValidIdToken();
  const p = decodeJwt(token) || {};
  return {
    uid: p?.user_id || p?.sub || null,
    email: p?.email || null,
    exp: p?.exp || null,
    iat: p?.iat || null,
  };
}

/** Appel d’une API protégée (exemple) */
export async function callProtected(url, method = 'GET', body = null) {
  const token = await getValidIdToken();
  const r = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : null,
  });
  return { status: r.status, body: await r.text() };
}

/** Déconnexion: supprime la session locale */
export async function logout() {
  deleteSession();
  return { ok: true };
}

/** Supprimer définitivement le compte (⚠️ irréversible) */
export async function deleteAccount() {
  const idToken = await getValidIdToken();
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const body = await r.json();
  if (!r.ok) {
    return { ok: false, status: r.status, error: body?.error?.message || 'DELETE_FAILED' };
  }
  deleteSession();
  return { ok: true };
}

/** Utilitaire: voir la session brute (pour debug local) */
export function readSessionFile() {
  return readSession();
}
