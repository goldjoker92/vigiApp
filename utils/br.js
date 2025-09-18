// utils de base pour formats BR
export const onlyDigits = (s = '') => String(s).replace(/\D+/g, '');

export function isValidCEP(cepDigits) {
  return /^\d{8}$/.test(onlyDigits(cepDigits));
}

export function isValidCPF(cpf) {
  const digits = onlyDigits(cpf);
  if (!/^\d{11}$/.test(digits)) {return false;}
  if (/^(\d)\1{10}$/.test(digits)) {return false;} // 000..., 111..., etc.

  const calcCheck = (base, factor) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {sum += parseInt(base[i], 10) * (factor - i);}
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcCheck(digits.slice(0, 9), 10);
  const d2 = calcCheck(digits.slice(0, 10), 11);
  return d1 === parseInt(digits[9], 10) && d2 === parseInt(digits[10], 10);
}

export function isValidPhoneBR(phone) {
  const d = onlyDigits(phone);
  return d.length === 10 || d.length === 11;
}

export function phoneToE164BR(phone) {
  const d = onlyDigits(phone);
  if (!isValidPhoneBR(d)) {return null;}
  return `+55${d}`;
}

export function parseBRDateToISO(ddmmyyyy) {
  const v = String(ddmmyyyy);
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) {return null;}
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  // vérifs basiques : mois 1-12, jour cohérent
  if (d.getUTCFullYear() !== +yyyy || d.getUTCMonth() + 1 !== +mm || d.getUTCDate() !== +dd)
    {return null;}
  if (d > new Date()) {return null;} // pas dans le futur
  return `${yyyy}-${mm}-${dd}`;
}

export function ageFromISO(iso) {
  if (!iso) {return null;}
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  const beforeBDay = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  if (beforeBDay) {age--;}
  return age;
}

export function isAdultFromISO(iso) {
  const age = ageFromISO(iso);
  return typeof age === 'number' && age >= 18;
}
