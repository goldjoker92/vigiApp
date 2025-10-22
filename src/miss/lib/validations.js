// src/miss/lib/validations.js
// ----------------------------------------------------------------------------
// VigiApp — Validations centrales (JS / MVP tenable) + TRACING
//
// Règles V1 :
//  - Photo: OBRIGATÓRIA (todos os tipos)
//  - Localização mínima: Cidade + UF obrigatórios (rua/nº/CEP opcionais)
//  - CHILD:
//      * DOB obrigatória + política de idade com tolerância civil:
//          <12 → OK ; 12 → OK ; 13 no ano corrente → OK até 31/12 ; senão → KO
//      * Consent OBRIGATÓRIO
//      * Documentos OBRIGATÓRIOS: responsável (ID) **e** criança (vínculo) — verso opcional
//  - ANIMAL/OBJECT: foto + cidade/UF blocantes ; le reste = warnings UX
//
// Intègre computeAgeEligibility(dobBR) et trace chaque étape (NS, traceId, timings).
// ----------------------------------------------------------------------------

import { computeAgeEligibility } from '../age/agePolicy';

// ---------------------------------------------------------------------------
// Logger / Tracer lightweight (console)
// ---------------------------------------------------------------------------
const NS = '[VALIDATE]';
const nowIso = () => new Date().toISOString();
const newTraceId = (p = 'val') =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const msSince = (t0) => Math.max(0, Date.now() - t0);

const Log = {
  info: (...a) => console.log(NS, ...a),
  warn: (...a) => console.warn(NS, '⚠️', ...a),
  error: (...a) => console.error(NS, '❌', ...a),
  step: (traceId, step, extra = {}) =>
    console.log(NS, 'STEP', step, { traceId, at: nowIso(), ...extra }),
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const onlyDigits = (s = '') => String(s).replace(/\D/g, '');
const hasText = (s) => !!String(s || '').trim();
const isUF2 = (s) => /^[A-Za-z]{2}$/.test(String(s || '').trim());

// Masque CPF dans les logs (ne garde que 2 derniers chiffres)
function maskCpfForLog(s = '') {
  const d = onlyDigits(s);
  if (!d) {
    return '';
  }
  if (d.length <= 2) {
    return `***********${d}`;
  }
  return `***********${d.slice(-2)}`;
}

// Fallback: si l’app ne fournit pas explicitement hasIdDoc / hasLinkDoc,
// on dérive depuis la présence de paths (frente/verso).
function deriveHasDocBooleans(input) {
  const hasIdDoc =
    !!input?.hasIdDoc ||
    !!input?.hasIdDocFront ||
    !!input?.hasIdDocBack ||
    !!input?.idDocFrontPath ||
    !!input?.idDocBackPath;

  const hasLinkDoc =
    !!input?.hasLinkDoc ||
    !!input?.hasLinkDocFront ||
    !!input?.hasLinkDocBack ||
    !!input?.linkDocFrontPath ||
    !!input?.linkDocBackPath;

  return { hasIdDoc, hasLinkDoc };
}

// ---------------------------------------------------------------------------
// Messages (PT-BR normalisés)
// ---------------------------------------------------------------------------
const TR = {
  NEED_PHOTO: '⚠️ Foto é obrigatória.',
  NEED_CITY_UF: '⚠️ Preencha cidade e UF.',
  // CHILD
  NEED_DESC_CHILD: '⚠️ Descreva o contexto da desaparição.',
  NEED_NAME_CHILD: '⚠️ Primeiro nome da criança é obrigatório.',
  NEED_GUARDIAN_NAME: '⚠️ Nome completo do responsável é obrigatório.',
  BAD_CPF: '⚠️ CPF inválido (11 dígitos).',
  NEED_SEX: '⚠️ Selecione o sexo da criança.',
  NEED_DOB: '⚠️ Informe a data de nascimento.',
  BAD_DOB: '⚠️ Data de nascimento inválida (DD/MM/AAAA).',
  AGE_OVER: '🚫 Elegível: até 12 anos; 13 no ano corrente até 31/12.',
  NEED_CONSENT: '⚠️ Confirme o consentimento para prosseguir.',
  DOCS_BOTH_MISSING: '⚠️ Anexe os documentos do responsável e da criança.',
  DOC_RESP_MISSING: '⚠️ Documento do responsável ausente.',
  DOC_CHILD_MISSING: '⚠️ Documento de vínculo da criança ausente.',
  // Warnings genéricos (animal/objeto)
  WARN_NAME_GENERIC: 'ℹ️ Informe um nome (ajuda o reconhecimento).',
  WARN_DESC_GENERIC: 'ℹ️ Inclua uma descrição para melhorar o alcance.',
};

// ---------------------------------------------------------------------------
// API publique
// validateClient(input, opts?)
// - input: payload à valider (cf. champs utilisés ci-dessous)
// - opts: { trace?: boolean, traceId?: string, ns?: string }
// Retourne: { ok, status, msg, reasons, warnings, meta: { traceId, tookMs } }
// ---------------------------------------------------------------------------
export function validateClient(input, opts = {}) {
  const t0 = Date.now();
  const trace = opts.trace !== false; // par défaut: on trace en dev
  const traceId = opts.traceId || newTraceId('val');
  const ns = opts.ns || 'root';

  try {
    if (trace) {
      Log.step(traceId, 'BEGIN', {
        ns,
        type: String(input?.type || '').toLowerCase(),
        // On log de façon safe les champs sensibles
        guardianName: !!input?.guardianName ? '(present)' : '(empty)',
        cpfMasked: maskCpfForLog(input?.cpfRaw || ''),
        hasIdDoc: Boolean(input?.hasIdDoc),
        hasLinkDoc: Boolean(input?.hasLinkDoc),
      });
    }

    const type = String(input?.type || '').toLowerCase();
    let res;
    if (type === 'child') {
      res = validateChild(input, { trace, traceId });
    } else if (type === 'animal') {
      res = validateAnimal(input, { trace, traceId });
    } else if (type === 'object') {
      res = validateObject(input, { trace, traceId });
    } else {
      res = {
        ok: false,
        status: 'rejected',
        msg: 'Tipo inválido.',
        reasons: ['tipo desconhecido'],
        warnings: [],
      };
    }

    const meta = { traceId, tookMs: msSince(t0) };
    if (trace) {
      Log.step(traceId, 'END', { ns, status: res.status, ok: res.ok, tookMs: meta.tookMs });
    }
    return { ...res, meta };
  } catch (e) {
    if (trace) {
      Log.error('UNCAUGHT', e?.message || String(e), { traceId });
    }
    return {
      ok: false,
      status: 'rejected',
      msg: 'Erro de validação.',
      reasons: ['exception'],
      warnings: [],
      meta: { traceId, tookMs: msSince(t0) },
    };
  }
}

// ---------------------------------------------------------------------------
// CHILD — blocages forts + tolérance civile + consent + docs (responsável + criança)
// ---------------------------------------------------------------------------
function validateChild(d, { trace, traceId }) {
  const reasons = [];
  const warnings = [];

  // Photo (bloquant)
  if (!hasText(d?.photoPath)) {
    reasons.push(TR.NEED_PHOTO);
  }

  // Localisation minimale (bloquant)
  if (!hasText(d?.lastCidade) || !isUF2(d?.lastUF)) {
    reasons.push(TR.NEED_CITY_UF);
  }

  // Responsável
  if (!hasText(d?.guardianName)) {
    reasons.push(TR.NEED_GUARDIAN_NAME);
  }
  const cpfDigits = onlyDigits(d?.cpfRaw);
  if (!cpfDigits || cpfDigits.length !== 11) {
    reasons.push(TR.BAD_CPF);
  }

  // Criança
  if (!hasText(d?.childFirstName)) {
    reasons.push(TR.NEED_NAME_CHILD);
  }

  if (!hasText(d?.childDobBR)) {
    reasons.push(TR.NEED_DOB);
  } else {
    const age = computeAgeEligibility(d.childDobBR);
    // age = { ok: boolean, status: 'OK'|'INVALID'|'MISSING'|'OVER_LIMIT', ... }
    if (!age.ok) {
      if (age.status === 'INVALID') {
        reasons.push(TR.BAD_DOB);
      } else if (age.status === 'MISSING') {
        reasons.push(TR.NEED_DOB);
      } else if (age.status === 'OVER_LIMIT') {
        reasons.push(TR.AGE_OVER);
      }
    }
    if (trace) {
      Log.step(traceId, 'AGE_CHECK', { status: age?.status || 'NA', ok: !!age?.ok });
    }
  }

  if (!d?.childSex || !['M', 'F'].includes(d.childSex)) {
    reasons.push(TR.NEED_SEX);
  }

  // Contexte (bloquant — tu l’as demandé strict)
  if (!hasText(d?.contextDesc)) {
    reasons.push(TR.NEED_DESC_CHILD);
  }

  // Consent (bloquant)
  if (!d?.consent) {
    reasons.push(TR.NEED_CONSENT);
  }

  // Documents — les deux obligatoires
  const derived = deriveHasDocBooleans(d);
  const hasIdDoc = d?.hasIdDoc ?? derived.hasIdDoc; // responsável
  const hasLinkDoc = d?.hasLinkDoc ?? derived.hasLinkDoc; // criança (vínculo)

  if (!hasIdDoc && !hasLinkDoc) {
    reasons.push(TR.DOCS_BOTH_MISSING);
  } else {
    if (!hasIdDoc) {
      reasons.push(TR.DOC_RESP_MISSING);
    }
    if (!hasLinkDoc) {
      reasons.push(TR.DOC_CHILD_MISSING);
    }
  }

  const ok = reasons.length === 0;
  if (trace) {
    Log.step(traceId, 'CHILD_DONE', {
      ok,
      reasonsCount: reasons.length,
      warningsCount: warnings.length,
    });
  }

  return {
    ok,
    status: ok ? 'validated' : 'rejected',
    msg: ok ? 'OK' : 'Dados insuficientes.',
    reasons,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// ANIMAL — photo + cidade/UF = blocants ; le reste en warnings
// ---------------------------------------------------------------------------
function validateAnimal(d, { trace, traceId }) {
  const reasons = [];
  const warnings = [];

  if (!hasText(d?.photoPath)) {
    reasons.push(TR.NEED_PHOTO);
  }
  if (!hasText(d?.lastCidade) || !isUF2(d?.lastUF)) {
    reasons.push(TR.NEED_CITY_UF);
  }

  if (!hasText(d?.primaryName)) {
    warnings.push(TR.WARN_NAME_GENERIC);
  }
  if (!hasText(d?.contextDesc)) {
    warnings.push(TR.WARN_DESC_GENERIC);
  }

  const ok = reasons.length === 0;
  if (trace) {
    Log.step(traceId, 'ANIMAL_DONE', {
      ok,
      reasonsCount: reasons.length,
      warningsCount: warnings.length,
    });
  }

  return {
    ok,
    status: ok ? 'validated' : 'rejected',
    msg: ok ? 'OK' : 'Dados insuficientes.',
    reasons,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// OBJECT — photo + cidade/UF = blocants ; le reste en warnings
// ---------------------------------------------------------------------------
function validateObject(d, { trace, traceId }) {
  const reasons = [];
  const warnings = [];

  if (!hasText(d?.photoPath)) {
    reasons.push(TR.NEED_PHOTO);
  }
  if (!hasText(d?.lastCidade) || !isUF2(d?.lastUF)) {
    reasons.push(TR.NEED_CITY_UF);
  }

  if (!hasText(d?.primaryName)) {
    warnings.push(TR.WARN_NAME_GENERIC);
  }
  if (!hasText(d?.contextDesc)) {
    warnings.push(TR.WARN_DESC_GENERIC);
  }

  const ok = reasons.length === 0;
  if (trace) {
    Log.step(traceId, 'OBJECT_DONE', {
      ok,
      reasonsCount: reasons.length,
      warningsCount: warnings.length,
    });
  }

  return {
    ok,
    status: ok ? 'validated' : 'rejected',
    msg: ok ? 'OK' : 'Dados insuficientes.',
    reasons,
    warnings,
  };
}
