// ============================================================================
// /app/missing-child/lib/validations.js
// Validation centrale (child / animal / object) — avec warnings UX non bloquants
// ============================================================================

import { calcAgeFromDateBR, isValidUF, onlyDigits } from './helpers';

/**
 * validateClient(data)
 * @returns {{
 *   ok: boolean,
 *   status: 'validated'|'rejected',
 *   msg?: string,
 *   reasons?: string[],
 *   warnings?: string[]
 * }}
 */
export function validateClient(data) {
  const t = String(data?.type || '').toLowerCase();
  if (t === 'child') {
    return validateChild(data);
  }
  if (t === 'animal') {
    return validateAnimal(data);
  }
  if (t === 'object') {
    return validateObject(data);
  }
  return { ok: false, status: 'rejected', msg: 'Tipo inválido.', reasons: ['tipo desconhecido'] };
}

// ---------------------------------------------------------------------------
// CHILD — règles dures (identique à avant, + photo et 2 pièces obligatoires)
// ---------------------------------------------------------------------------
function validateChild(d) {
  const reasons = [];

  // 1) Responsável
  if (!str(d?.guardianName)) {
    reasons.push('Nome completo do responsável é obrigatório.');
  }
  const cpfDigits = onlyDigits(d?.cpfRaw);
  if (!cpfDigits || cpfDigits.length !== 11) {
    reasons.push('CPF inválido (11 dígitos).');
  }

  // 2) Criança
  if (!str(d?.childFirstName)) {
    reasons.push('Primeiro nome da criança é obrigatório.');
  }
  if (!str(d?.childDobBR)) {
    reasons.push('Data de nascimento é obrigatória.');
  } else {
    const age = calcAgeFromDateBR(d.childDobBR);
    if (age === null) {
      reasons.push('Data de nascimento inválida.');
    } else if (age > 13) {
      reasons.push('Apenas crianças de até 12 anos (tolerância até fim do ano dos 13).');
    }
  }
  if (!d?.childSex || !['M', 'F'].includes(d.childSex)) {
    reasons.push('Selecione o sexo da criança.');
  }

  // 3) Local
  if (!str(d?.lastCidade)) {
    reasons.push('Cidade é obrigatória.');
  }
  if (!d?.lastUF || !isValidUF(d.lastUF)) {
    reasons.push('UF inválido ou ausente (ex.: CE).');
  }

  // 4) Contexto
  if (!str(d?.contextDesc)) {
    reasons.push('Descreva o contexto da desaparição (campo obrigatório).');
  }

  // 5) Provas obrigatórias
  if (!d?.hasIdDoc) {
    reasons.push('Documento de identidade do responsável é obrigatório.');
  }
  if (!d?.hasLinkDoc) {
    reasons.push('Documento que comprove o vínculo com a criança é obrigatório.');
  }
  if (!hasPhoto(d)) {
    reasons.push('Foto é obrigatória.');
  }

  if (reasons.length) {
    return { ok: false, status: 'rejected', msg: reasons[0], reasons };
  }
  return { ok: true, status: 'validated', warnings: [] };
}

// ---------------------------------------------------------------------------
// ANIMAL — photo = blocante ; reste = warnings UX (non bloquants)
// ---------------------------------------------------------------------------
function validateAnimal(d) {
  if (!hasPhoto(d)) {
    return {
      ok: false,
      status: 'rejected',
      msg: 'Foto do animal é obrigatória.',
      reasons: ['foto ausente'],
    };
  }

  const warnings = [];
  if (!str(d?.contextDesc)) {
    warnings.push('Sem descrição — detalhe raça/porte, coleira, comportamento, último local.');
  }
  if (!str(d?.lastCidade)) {
    warnings.push('Cidade ausente — informe para direcionar melhor o alerta.');
  }
  if (!d?.lastUF || !isValidUF(d.lastUF)) {
    warnings.push('UF ausente/ inválido — ex.: CE.');
  }
  if (!str(d?.primaryName)) {
    warnings.push('Nome do animal ausente — opcional, mas ajuda na identificação.');
  }
  if (!str(d?.extraInfo)) {
    warnings.push('Infos complementares vazias — sinais, microchip, necessidades especiais, etc.');
  }

  return { ok: true, status: 'validated', warnings };
}

// ---------------------------------------------------------------------------
// OBJECT — photo = blocante ; reste = warnings UX (non bloquants)
// ---------------------------------------------------------------------------
function validateObject(d) {
  if (!hasPhoto(d)) {
    return {
      ok: false,
      status: 'rejected',
      msg: 'Foto do objeto é obrigatória.',
      reasons: ['foto ausente'],
    };
  }

  const warnings = [];
  if (!str(d?.contextDesc)) {
    warnings.push('Sem descrição — inclua marca/modelo/cor e onde foi visto/perdido.');
  }
  if (!str(d?.lastCidade)) {
    warnings.push('Cidade ausente — informe para melhorar o alcance.');
  }
  if (!d?.lastUF || !isValidUF(d.lastUF)) {
    warnings.push('UF ausente/ inválido — ex.: CE.');
  }
  if (!str(d?.primaryName)) {
    warnings.push('Identificação do objeto vazia — ex.: “iPhone 13, mochila preta”.');
  }
  if (!str(d?.extraInfo)) {
    warnings.push('Infos complementares vazias — IMEI, adesivos, acessórios, etc.');
  }

  return { ok: true, status: 'validated', warnings };
}

// Utils
function hasPhoto(d) {
  return !!String(d?.photoPath || '').trim();
}
function str(v) {
  return String(v || '').trim();
}
