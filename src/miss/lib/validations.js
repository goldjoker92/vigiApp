// src/miss/lib/validations.js
export function validateClient(payload, { ns }) {
  const reasons = [];

  // Règles globales
  if (!payload?.photoPath) {
    reasons.push('Foto obrigatória');
  }
  if (!payload?.consent) {
    reasons.push('Consentimento necessário');
  }

  // Nom principal (enfant / animal / objet)
  if (!payload?.childFirstName && !payload?.primaryName) {
    reasons.push('Nome / Identificação');
  }

  // Règles spécifiques pour "child"
  if (payload?.type === 'child') {
    if (!payload?.guardianName || !payload.guardianName.trim()) {
      reasons.push('Responsável (nome)');
    }
    // CPF facultatif au niveau UX → on ne bloque pas ici
  }

  return {
    ok: reasons.length === 0,
    reasons,
    msg: reasons.length ? 'Campos obrigatórios faltando' : 'ok',
    warnings: [], // tu gèreras ça plus tard si besoin
    ns,
  };
}
