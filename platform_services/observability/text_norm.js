/**
 * Normalisation simple + détection “weird” (leet/obfus / hors lexique commun).
 * Ici heuristique légère pour embarqué.
 */
export function normalizeToken(t="") {
  return String(t).normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
}
export function isWeirdToken(n="") {
  // Rejette tokens trop courts/longs, ou trop “normaux”.
  if (n.length < 3 || n.length > 24) {return false;}
  // Contient des chiffres mêlés aux lettres (leet)
  if (/[a-z]\d|\d[a-z]/i.test(n)) {return true;}
  // Beaucoup de consonnes d'affilée ou tirets internes
  if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(n)) {return true;}
  if (/_|-/.test(n)) {return true;}
  // Mots courants: ignorer
  const common = new Set(["de","da","do","que","com","para","uma","uma","pra","dos","das","nos","nas","sem","mais","muito","pouco","a","o","e","ou","em","no","na"]);
  if (common.has(n)) {return false;}
  // Par défaut: considérer pas weird
  return false;
}
