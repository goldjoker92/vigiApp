// ============================================================================
// /app/missing-child/lib/validations.js
// Logique de validation centralisée (responsável + criança + adresse)
// Commentaires MIX (FR + EN)
// ============================================================================

import { calcAgeFromDateBR, isValidUF, onlyDigits } from './helpers';

// ---------------------------------------------------------------------------
// Validation principale du brouillon (client-side pré-envoi)
// ---------------------------------------------------------------------------

/**
 * validateDraftClient(data)
 * data = {
 *   guardianName, cpfRaw,
 *   childFirstName, childDobBR, childSex,
 *   lastRua, lastNumero, lastCidade, lastUF,
 *   contextDesc, extraInfo
 * }
 * Retour: { ok: boolean, msg?: string }
 */
export function validateDraftClient(data) {
  // --- 1) RESPONSÁVEL ---
  if (!data?.guardianName?.trim()) {
    return { ok: false, msg: 'Nome completo do responsável é obrigatório.' };
  }

  const cpfDigits = onlyDigits(data?.cpfRaw);
  if (!cpfDigits || cpfDigits.length !== 11) {
    return { ok: false, msg: 'CPF inválido (11 dígitos).' };
  }

  // --- 2) ENFANT ---
  if (!data?.childFirstName?.trim()) {
    return { ok: false, msg: 'Primeiro nome da criança é obrigatório.' };
  }

  if (!data?.childDobBR) {
    return { ok: false, msg: 'Data de nascimento é obrigatória.' };
  }

  const age = calcAgeFromDateBR(data.childDobBR);
  // => <= 12 ou tolérance "12.9" si 13 non révolus dans l'année
  if (age === null) {
    return { ok: false, msg: 'Data de nascimento inválida.' };
  }
  if (age > 13) {
    return { ok: false, msg: 'Apenas crianças de até 12 anos (tolerância até fim do ano dos 13).' };
  }

  if (!data?.childSex || !['M', 'F'].includes(data.childSex)) {
    return { ok: false, msg: 'Selecione o sexo da criança.' };
  }

  // --- 3) ADRESSE DERNIER ENDROIT VU ---
  // Rua facultative, cidade & estado obligatoires
  if (!data?.lastCidade?.trim()) {
    return { ok: false, msg: 'Cidade é obrigatória.' };
  }
  if (!data?.lastUF || !isValidUF(data.lastUF)) {
    return { ok: false, msg: 'UF inválido ou ausente (ex: CE).' };
  }

  // --- 4) CONTEXTE DE DESAPARECIMENTO (obligatoire) ---
  if (!data?.contextDesc?.trim()) {
    return { ok: false, msg: 'Descreva o contexto da desaparição (campo obrigatório).' };
  }

  // extraInfo (infos complémentaires) est optionnel

  return { ok: true };
}

function _str() {
  // ...function body...
}
