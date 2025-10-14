// ============================================================================
// src/utils/logger.js
// Logs homogènes avec prefix + horodatage
// ============================================================================

const stamp = () => new Date().toISOString();

exports.log = (...args) => {
  console.log(`[${stamp()}][MISSING_CHILD][CF]`, ...args);
};

exports.warn = (...args) => {
  console.warn(`[${stamp()}][MISSING_CHILD][CF][WARN]`, ...args);
};

exports.err = (...args) => {
  console.error(`[${stamp()}][MISSING_CHILD][CF][ERR]`, ...args);
};
