// utils/logger.ts
type Level = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';

let GLOBAL_LEVEL: Level = __DEV__ ? 'info' : 'warn'; // prod plus calme

export function setLogLevel(l: Level) {
  GLOBAL_LEVEL = l;
}

const levelRank: Record<Level, number> = {
  silent: 99,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

const lastMsgAt = new Map<string, number>(); // pour throttle
const lastHash = new Map<string, string>(); // pour dedupe

export function createLogger(ns: string, opts?: { level?: Level; throttleMs?: number }) {
  const level = opts?.level ?? GLOBAL_LEVEL;
  const throttleMs = opts?.throttleMs ?? 800; // 0.8s

  function shouldLog(l: Level) {
    return levelRank[l] <= levelRank[level];
  }

  function hash(parts: any[]) {
    try {
      return JSON.stringify(parts);
    } catch {
      return String(parts);
    }
  }

  function log(l: Level, ...args: any[]) {
    if (!shouldLog(l)) {
      return;
    }

    const key = ns + ':' + l;
    const now = Date.now();
    const h = hash(args);

    // DEDUPE: si même payload que la dernière fois, on ignore
    if (lastHash.get(key) === h) {
      return;
    }

    // THROTTLE: pas plus d'1 log par fenêtre pour ce ns/level
    const prev = lastMsgAt.get(key) ?? 0;
    if (now - prev < throttleMs) {
      return;
    }

    lastHash.set(key, h);
    lastMsgAt.set(key, now);

    const tag = `[${ns}]`;
    if (l === 'error') {
      console.error(tag, ...args);
    } else if (l === 'warn') {
      console.warn(tag, ...args);
    } else {
      console.log(tag, ...args);
    }
  }

  return {
    error: (...a: any[]) => log('error', ...a),
    warn: (...a: any[]) => log('warn', ...a),
    info: (...a: any[]) => log('info', ...a),
    debug: (...a: any[]) => log('debug', ...a),
    verbose: (...a: any[]) => log('verbose', ...a),
  };
}
