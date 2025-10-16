// src/miss/lib/flowRules.js
export const FLOW_RULES = {
  child: {
    key: 'child',
    title: 'Criança desaparecida',
    allowDraft: false, // sans draft
    require: { photo: true, description: true, extra: true, consent: true, legalDocs: true },
    consentLabel: "Confirmo que sou o responsável legal ou autorizado, agindo de boa fé.",
    sharePrefix: "🚨 ALERTA - Criança desaparecida",
    cf: { verify: "verifyGuardian", publish: "publishMissingChild" },
    auditTag: "MISSING_CHILD",
  },
  animal: {
    key: 'animal',
    title: 'Animal perdido',
    allowDraft: false,
    require: { photo: true, description: true, extra: true, consent: true },
    consentLabel: "Confirmo que as informações fornecidas sobre o animal são verdadeiras.",
    sharePrefix: "🐾 Animal perdido",
    cf: { verify: null, publish: "publishMissingAnimal" },
    auditTag: "MISSING_ANIMAL",
  },
  object: {
    key: 'object',
    title: 'Objeto perdido',
    allowDraft: false,
    require: { photo: true, description: true, extra: true, consent: true },
    consentLabel: "Confirmo que as informações fornecidas sobre o objeto são verdadeiras.",
    sharePrefix: "📦 Objeto perdido",
    cf: { verify: null, publish: "publishMissingObject" },
    auditTag: "MISSING_OBJECT",
  },
};

export const getFlow = (t) => FLOW_RULES[String(t || 'child')] || FLOW_RULES.child;
