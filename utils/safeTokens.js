/* =============================================================
 Utils
 - maskSensitive : clair en dev, masqué en prod
 - retryAsync    : retry + backoff
 - Tous logs commentés
============================================================= */

export function maskSensitive(value, label = 'token') {
  if (!value) {
    return value;
  }
  const s = String(value);

  if (__DEV__ || process.env.EXPO_PUBLIC_ENV === 'preview') {
    // console.log(`[maskSensitive] ${label} clair en dev/preview:`, s);
    return `${label}:${s}`;
  }

  const masked = `${label}:${s.slice(0, 6)}…(${s.length})`;
  // console.log(`[maskSensitive] ${label} masqué en prod:`, masked);
  return masked;
}

export async function retryAsync(fn, { retries = 3, delay = 1000 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt > retries) {
        // console.error(`[retryAsync] échec après ${attempt} tentatives`, e);
        throw e;
      }
      // console.warn(`[retryAsync] tentative ${attempt}, retry dans ${delay}ms`);
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2; // backoff
    }
  }
}
// ============================================================
