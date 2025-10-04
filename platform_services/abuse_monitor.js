// platform_services/observability/abuse_monitor.js
// -------------------------------------------------------------
// Validação de conteúdo do relatório (neutro, sem detalhar o motivo)
// - Bloqueia nomes próprios/PII óbvios (CPF/placa/telefone/e-mail)
// - Bloqueia gírias/insultos e nomes de facções/polícia/milícia
// - Anonimiza placas visíveis (mas aqui apenas bloqueamos se vier explícito)
// - Integra strikes/bloqueio por 6h (3 tentativas inválidas)
// -------------------------------------------------------------

import { abuseState } from "../platform_services/observability/abuse_strikes";

// (opcional) Use seu dicionário de aliases se existir
// try { var { isForbiddenAlias } = await import("../lexicon/forbidden_aliases.js"); } catch {}

function norm(s = "") {
  return String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// --- Regex simples para PII brasileiras
const RE = {
  cpf: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  cnpj: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  phoneBr: /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})-?\d{4}\b/,
  email: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  placa: /\b([A-Z]{3}\s?-?\s?\d[A-Z0-9]\d{2})\b/i, // ABC1D23 (Mercosul) e variações
  // nomes próprios muito simplificado (apenas pega “Fulano da Silva” capitalizado)
  properName: /\b[A-ZÁÃÂÀÉÊÍÓÔÕÚÇ][a-záãâàéêíóôõúç]+(?:\s+[A-ZÁÃÂÀÉÊÍÓÔÕÚÇ][a-záãâàéêíóôõúç]+)+\b/,
};

// --- Lista base de termos proibidos (slurs/insultos leves + famílias)
const BAD_WORDS = [
  // insultos comuns (PT) — manter curto (lista real deve ficar no servidor/remote config)
  "otario","otária","idiota","burro","burra","imbecil",
  // sexual/racial/religioso → bloquear neutro
  "viado","bicha","traveco","macaco","porca","vagabunda","vagabundo",
];

const FORBIDDEN_FAMILIES = [
  // família "facções/polícia/milícia" — inclui variações/argot
  "facção","faccao","faccoes","cv","c.v.","comando vermelho",
  "pcc","p.c.c.","primeiro comando",
  "fdn","família do norte","familia do norte",
  "milícia","milicia","miliciano",
  "polícia","policia","pm","bpchoque","choque","rotam","bope", // nomes institucionais
];

// Testa se token contém família proibida (pode ser substituído por isForbiddenAlias)
function hitsForbiddenFamilies(text) {
  const t = norm(text);
  return FORBIDDEN_FAMILIES.some(w => t.includes(norm(w)));
}

function hasBadWords(text) {
  const t = norm(text);
  return BAD_WORDS.some(w => t.includes(norm(w)));
}

function hasPII(text) {
  const s = String(text || "");
  return (
    RE.cpf.test(s) ||
    RE.cnpj.test(s) ||
    RE.phoneBr.test(s) ||
    RE.email.test(s) ||
    RE.placa.test(s) ||
    RE.properName.test(s)
  );
}

/**
 * Checagem principal.
 * @returns { ok:boolean, msg?:string }
 */
export function checkReportAcceptable(desc, userId) {
  // 1) bloqueio ativo?
  if (abuseState.isBlocked(userId)) {
    return { ok: false, msg: "Não foi possível enviar agora. Tente novamente mais tarde." };
  }

  const text = String(desc || "");

  // 2) Conteúdo proibido?
  const bad =
    hasPII(text) ||
    hasBadWords(text) ||
    hitsForbiddenFamilies(text);
    // || (isForbiddenAlias?.(text) ?? false); // se você integrar seu dicionário avançado

  if (bad) {
    abuseState.addStrike(userId);
    return { ok: false, msg: "Mensagem não pôde ser enviada. Por favor, reformule." };
  }

  // 3) OK
  return { ok: true };
}
