// utils/logger.js
const isProd = process.env.NODE_ENV === 'production';

export const log = (...args) => {
  if (!isProd) console.log('[LOG]', ...args);
};
export const warn = (...args) => console.warn('[WARN]', ...args);
export const error = (...args) => console.error('[ERROR]', ...args);
