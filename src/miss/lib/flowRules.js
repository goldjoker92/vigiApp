// src/miss/lib/flowRules.js

export const FLOW_RULES = {
  child: {
    key: "child",
    title: "Missing — Criança",
    consentLabel: "Confirmo que sou o responsável legal e autorizo a divulgação.",
  },
  animal: {
    key: "animal",
    title: "Missing — Animal",
    consentLabel: "Confirmo a divulgação das informações para ajudar a encontrar.",
  },
  object: {
    key: "object",
    title: "Missing — Objeto",
    consentLabel: "Confirmo a divulgação das informações para ajudar a encontrar.",
  },
};

// Toujours retourner un flow valide
export function getFlow(kind) {
  const k = String(kind || "child").toLowerCase();
  return FLOW_RULES[k] || FLOW_RULES.child;
}
