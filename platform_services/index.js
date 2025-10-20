// platform_services/observability/index.js
// Barrel file sans collisions d'exports

// Safe re-exports (pas de noms qui se chevauchent ici)
export * from './incidents';
export * from './incidents_features';
export * from './abuse_monitor';

// Conflit: `forbiddenTermSignals` existe dans guardrail **et** runtime_config.
// -> On renomme clairement à la source du barrel.
export {
  forbiddenTermSignals as guardrailForbiddenTermSignals,
  // expose aussi les autres exports de guardrail s'ils existent
  // (ajoute ici des exports nommés si besoin pour éviter d'écraser)
} from './guardrail';

export {
  forbiddenTermSignals as runtimeForbiddenTermSignals,
  // idem: ajoute explicitement d'autres exports si runtime_config en contient
} from './runtime_config';
