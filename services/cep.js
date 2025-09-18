const cache = new Map();
const TIMEOUT_MS = 8000;

function fetchWithTimeout(url, ms = TIMEOUT_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
}

export async function lookupCep(cepDigits) {
  const cep = String(cepDigits);
  if (cache.has(cep)) {
    return cache.get(cep);
  }

  // 1) BrasilAPI
  try {
    const r = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    if (r.ok) {
      const j = await r.json();
      const result = {
        uf: j.state || '',
        cidade: j.city || '',
        logradouro: j.street || '',
        bairro: j.neighborhood || '',
      };
      cache.set(cep, result);
      return result;
    }
  } catch {}

  // 2) ViaCEP (fallback)
  try {
    const r2 = await fetchWithTimeout(`https://viacep.com.br/ws/${cep}/json/`);
    if (r2.ok) {
      const j2 = await r2.json();
      if (!j2.erro) {
        const result = {
          uf: j2.uf || '',
          cidade: j2.localidade || '',
          logradouro: j2.logradouro || '',
          bairro: j2.bairro || '',
        };
        cache.set(cep, result);
        return result;
      }
    }
  } catch {}

  throw new Error('CEP não encontrado');
}
