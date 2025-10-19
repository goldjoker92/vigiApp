// =============================================================================
// VigiApp — Cloud Functions v2 (HTTP) — index.js (ULTRA-LOG VERBOSE)
// =============================================================================

/* Boot tolérant */
try { require('module-alias/register'); } catch {}
try { require('./bootstrap-config'); } catch {}

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const express = require('express');
const { setGlobalOptions } = require('firebase-functions/v2/options');
const { onRequest } = require('firebase-functions/v2/https');

setGlobalOptions({
  region: process.env.HTTP_REGION || 'southamerica-east1',
  cors: true,
  timeoutSeconds: 60,
  memory: '256MiB',
  concurrency: 40,
});

/* Logger JSON */
function log(level, msg, extra = {}) {
  const line = { ts: new Date().toISOString(), service: 'api', level, msg, ...extra };
  const text = JSON.stringify(line);
  if (level === 'error') {console.error(text);}
  else if (level === 'warn') {console.warn(text);}
  else {console.log(text);}
}
log('info', 'Loaded codebase');

/* Helpers */
const list = (p) => (fs.existsSync(p) ? fs.readdirSync(p) : []);
const statInfo = (p) => {
  try {
    const st = fs.statSync(p);
    return { path: p, exists: true, isFile: st.isFile(), isDir: st.isDirectory(), size: st.size };
  } catch {
    return { path: p, exists: false };
  }
};

/** IMPORTANT: on cherche d’abord dans functions/uploads (prod), puis dans src/uploads (dev) */
const pathCandidates = () => [
  path.join(__dirname, 'uploads', 'handleUpload'),        // PROD / chemin prioritaire
  path.join(__dirname, 'src', 'uploads', 'handleUpload'), // DEV / fallback
  path.join(process.cwd(), 'uploads', 'handleUpload'),     // extra tolérance
  path.join(process.cwd(), 'src', 'uploads', 'handleUpload'),
];

/* Boot sanity */
try {
  log('info', 'BOOT/LIST', {
    __dirname,
    cwd: process.cwd(),
    node: process.version,
    rootFiles: list(__dirname),
    uploadsRootFiles: list(path.join(__dirname, 'uploads')),
    srcRootFiles: list(path.join(__dirname, 'src')),
    uploadsFiles_src: list(path.join(__dirname, 'src', 'uploads')),
    uploadsFiles_prod: list(path.join(__dirname, 'uploads')),
  });
  log('info', 'SANITY', {
    exists_prod: fs.existsSync(path.join(__dirname, 'uploads', 'handleUpload.js')),
    exists_src: fs.existsSync(path.join(__dirname, 'src', 'uploads', 'handleUpload.js')),
    candidates: pathCandidates().map((c) => statInfo(c + '.js')),
  });
} catch {}

/* Require tolérant */
function tryRequire(paths, exportName = null) {
  let lastErr = null;
  for (const p of paths) {
    try {
      let resolved = null;
      try { resolved = require.resolve(p); } catch {}
      log('info', 'MODULE/RESOLVE_ATTEMPT', { candidate: p, resolved });

      const m = require(p);
      const mod = exportName ? m?.[exportName] : m;
      if (!mod) {throw new Error(`Export "${exportName}" introuvable dans ${p}`);}

      const keys = (mod && typeof mod === 'object') ? Object.keys(mod) : [];
      const defKeys = (mod && mod.default && typeof mod.default === 'object') ? Object.keys(mod.default) : [];
      log('info', 'MODULE/LOADED', { path: p, typeofMod: typeof mod, keys, defKeys, exportName: exportName || '(module)' });
      return mod;
    } catch (e) {
      lastErr = e;
      log('warn', 'MODULE/LOAD_FAILED_NEXT', {
        pathTried: p, error: String(e?.message || e), fileStat: statInfo(p + '.js'),
      });
    }
  }
  return { __error: lastErr || new Error('Module not found') };
}

/* Fallback HTTP */
function makeFallbackHttp(name) {
  return onRequest((req, res) => {
    log('error', 'FALLBACK_INVOKED', { fn: name, path: req.path, method: req.method });
    res.status(503).json({ ok: false, error: 'module_unavailable', function: name, hint: 'module missing or bad export' });
  });
}

/* Exports directs (v2) */
{
  const mod = tryRequire(['./src/sendPublicAlertByAddress', './sendPublicAlertByAddress'], 'sendPublicAlertByAddress');
  if (mod.__error) {
    log('warn', 'EXPORT_FALLBACK_ENABLED', { fn: 'sendPublicAlertByAddress', err: String(mod.__error?.message || mod.__error) });
    exports.sendPublicAlertByAddress = makeFallbackHttp('sendPublicAlertByAddress');
  } else {
    exports.sendPublicAlertByAddress = mod;
    log('info', 'EXPORT_OK', { fn: 'sendPublicAlertByAddress' });
  }
}
{
  const mod = tryRequire(['./src/ackPublicAlert', './ackPublicAlert'], 'ackPublicAlertReceipt');
  if (mod.__error) {
    log('warn', 'EXPORT_FALLBACK_ENABLED', { fn: 'ackPublicAlertReceipt', err: String(mod.__error?.message || mod.__error) });
    exports.ackPublicAlertReceipt = makeFallbackHttp('ackPublicAlertReceipt');
  } else {
    exports.ackPublicAlertReceipt = mod;
    log('info', 'EXPORT_OK', { fn: 'ackPublicAlertReceipt' });
  }
}

/* Express app */
const app = express();
app.disable('x-powered-by');

/* --- Middleware ULTRA-VERBOSE: requestId + log entrée + log sortie --- */
app.use((req, res, next) => {
  const rid = `req_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  req._rid = rid;
  req._t0 = process.hrtime.bigint();

  log('info', 'REQ/IN', {
    rid,
    method: req.method,
    path: req.originalUrl || req.url,
    httpVersion: req.httpVersion,
    ip: req.ip,
    ips: req.ips,
    remoteAddress: req.socket?.remoteAddress,
    length: req.headers['content-length'],
    headers: req.headers,
    userAgent: req.headers['user-agent'],
    idempotency: req.headers['x-idempotency-key'],
    contentType: req.headers['content-type'],
    query: req.query,
  });

  const origEnd = res.end;
  let bytesOut = 0;
  res.end = function (chunk, encoding, cb) {
    try {
      if (chunk) {bytesOut += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), encoding || 'utf8');}
    } catch {}
    return origEnd.call(this, chunk, encoding, cb);
  };
  res.on('finish', () => {
    const t1 = process.hrtime.bigint();
    const ms = Number(t1 - req._t0) / 1e6;
    log('info', 'RES/OUT', {
      rid,
      status: res.statusCode,
      bytes: bytesOut,
      duration_ms: Math.round(ms),
    });
  });

  next();
});

/* Body-parser JSON/URL-encoded seulement si pas multipart */
app.use((req, res, next) => {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (ct.startsWith('application/json')) {return express.json({ limit: '10mb' })(req, res, next);}
  if (ct.startsWith('application/x-www-form-urlencoded')) {return express.urlencoded({ extended: true, limit: '2mb' })(req, res, next);}
  return next();
});

/* Préflight global */
app.options('*', (_req, res) => res.status(204).end());

/* Santé */
app.get('/_health', (_req, res) => res.status(200).json({ ok: true, service: 'api', ts: new Date().toISOString() }));
app.get('/_ready', (_req, res) => res.status(200).send('ok'));

/* Introspection */
const EXPOSE_INTROSPECTION = (process.env.EXPOSE_INTROSPECTION || 'true') === 'true';
if (EXPOSE_INTROSPECTION) {
  app.get('/__routes', (_req, res) => {
    // @ts-ignore
    const stack = app._router?.stack || [];
    const routes = stack.filter((l) => l.route?.path).map((l) => ({
      method: Object.keys(l.route.methods)[0]?.toUpperCase(), path: l.route.path,
    }));
    res.json({ routes });
  });

  app.get('/__diag', (_req, res) => {
    const candidates = pathCandidates();
    const files = [
      statInfo(path.join(__dirname, 'uploads')),
      statInfo(path.join(__dirname, 'uploads', 'handleUpload.js')),
      statInfo(path.join(__dirname, 'src')),
      statInfo(path.join(__dirname, 'src', 'uploads')),
      statInfo(path.join(__dirname, 'src', 'uploads', 'handleUpload.js')),
    ];
    const resolves = candidates.map((c) => {
      try { return { candidate: c, resolved: require.resolve(c) }; }
      catch (e) { return { candidate: c, resolved: null, err: String(e?.message || e) }; }
    });
    res.json({
      ok: true,
      env: {
        cwd: process.cwd(),
        __dirname,
        HTTP_REGION: process.env.HTTP_REGION || 'southamerica-east1',
        REQUIRE_UPLOAD_IDEM: process.env.REQUIRE_UPLOAD_IDEM || 'true',
        REQUIRE_UPLOAD_AUTH: process.env.REQUIRE_UPLOAD_AUTH || 'false',
      },
      files, resolves,
      sanity: {
        exists_prod: fs.existsSync(path.join(__dirname, 'uploads', 'handleUpload.js')),
        exists_src: fs.existsSync(path.join(__dirname, 'src', 'uploads', 'handleUpload.js')),
      },
    });
  });
}

/* Guard Idempotency */
const REQUIRE_IDEM = (process.env.REQUIRE_UPLOAD_IDEM || 'true') === 'true';
function requireIdempotencyKey(req, res, next) {
  if (req.method !== 'POST' || (req.path !== '/upload/id' && req.path !== '/api/upload/id')) {return next();}
  const key = String(req.get('x-idempotency-key') || '').trim();
  if (REQUIRE_IDEM && !key) {
    log('warn', 'IDEMPOTENCY/MISSING_STRICT', { rid: req._rid, path: req.path, method: req.method });
    return res.status(400).json({ ok: false, error: 'missing_idempotency_key', msg: 'Header X-Idempotency-Key is required for /upload/id' });
  }
  if (!REQUIRE_IDEM && !key) {
    const gen = `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    req.headers['x-idempotency-key'] = gen;
    res.set('X-Idempotency-Key', gen);
    log('warn', 'IDEMPOTENCY/AUTO_GENERATED_DEV', { rid: req._rid, generated: gen, path: req.path });
  } else {
    log('info', 'IDEMPOTENCY/OK', { rid: req._rid, key });
  }
  next();
}

/* Loader d’upload tolérant */
let uploadHandlerFn = null;
async function getUploadHandler() {
  if (uploadHandlerFn) {return uploadHandlerFn;}

  const candidates = pathCandidates();
  log('info', 'UPLOAD_LOADER/CANDIDATES', {
    candidates, exists: candidates.map((c) => statInfo(c + '.js')),
  });

  const mod = tryRequire(candidates, null);

  let picked = null;
  if (typeof mod === 'function') {picked = { kind: 'cjs_function', fn: mod };}
  else if (mod?.uploadMissingChildDoc) {picked = { kind: 'cjs_named_uploadMissingChildDoc', fn: mod.uploadMissingChildDoc };}
  else if (mod?.uploadId) {picked = { kind: 'cjs_named_uploadId', fn: mod.uploadId };}
  else if (mod?.default && typeof mod.default === 'function') {picked = { kind: 'esm_default_function', fn: mod.default };}
  else if (mod?.default?.uploadMissingChildDoc) {picked = { kind: 'esm_default_named_uploadMissingChildDoc', fn: mod.default.uploadMissingChildDoc };}
  else if (mod?.default?.uploadId) {picked = { kind: 'esm_default_named_uploadId', fn: mod.default.uploadId };}

  if (!picked) {
    log('error', 'UPLOAD_LOADER/UNAVAILABLE', {
      err: String(mod.__error?.message || mod.__error || 'bad export'),
      expects: 'function OR { uploadMissingChildDoc } OR { uploadId } OR default variants',
      note: 'Chemin attendu: functions/uploads/handleUpload.js (ou src/uploads en fallback)',
    });
    uploadHandlerFn = async (_req, res) => res.status(503).json({ ok: false, error: 'upload_handler_missing', hint: 'check uploads/handleUpload.js' });
  } else {
    uploadHandlerFn = picked.fn;
    log('info', 'UPLOAD_LOADER/READY', { picked: picked.kind, name: picked.fn.name || '(anonymous)' });
  }
  return uploadHandlerFn;
}

/* ROUTE DIRECTE /upload/id — ultra verbose */
app.post('/upload/id', requireIdempotencyKey, async (req, res) => {
  log('info', 'UPLOAD/ENTRY', {
    rid: req._rid,
    path: req.path,
    method: req.method,
    idem: req.get('x-idempotency-key'),
    ctype: req.headers['content-type'],
    length: req.headers['content-length'],
  });
  try {
    const fn = await getUploadHandler();
    await fn(req, res);
  } catch (err) {
    log('error', 'UPLOAD/THREW (direct)', { rid: req._rid, error: String(err?.message || err) });
    if (!res.headersSent) {res.status(500).json({ ok: false, error: 'internal_error' });}
  }
});

/* Préfixe /api (miroir) — mêmes logs */
if ((process.env.MOUNT_API_PREFIX || 'true') === 'true') {
  const router = express.Router();

  router.get('/_health', (_req, res) =>
    res.status(200).json({ ok: true, service: 'api', base: '/api', ts: new Date().toISOString() }),
  );
  router.get('/_ready', (_req, res) => res.status(200).send('ok'));

  if (EXPOSE_INTROSPECTION) {
    router.get('/__routes', (_req, res) => {
      // @ts-ignore
      const stack = app._router?.stack || [];
      const routes = stack.filter((l) => l.route?.path).map((l) => ({
        method: Object.keys(l.route.methods)[0]?.toUpperCase(), path: l.route.path,
      }));
      res.json({ routes, base: '/api' });
    });

    router.get('/__diag', (_req, res) => {
      const candidates = pathCandidates();
      const files = [
        statInfo(path.join(__dirname, 'uploads')),
        statInfo(path.join(__dirname, 'uploads', 'handleUpload.js')),
        statInfo(path.join(__dirname, 'src')),
        statInfo(path.join(__dirname, 'src', 'uploads')),
        statInfo(path.join(__dirname, 'src', 'uploads', 'handleUpload.js')),
      ];
      const resolves = candidates.map((c) => {
        try { return { candidate: c, resolved: require.resolve(c) }; }
        catch (e) { return { candidate: c, resolved: null, err: String(e?.message || e) }; }
      });
      res.json({
        ok: true,
        env: {
          cwd: process.cwd(),
          __dirname,
          HTTP_REGION: process.env.HTTP_REGION || 'southamerica-east1',
          REQUIRE_UPLOAD_IDEM: process.env.REQUIRE_UPLOAD_IDEM || 'true',
          REQUIRE_UPLOAD_AUTH: process.env.REQUIRE_UPLOAD_AUTH || 'false',
        },
        files, resolves,
        sanity: {
          exists_prod: fs.existsSync(path.join(__dirname, 'uploads', 'handleUpload.js')),
          exists_src: fs.existsSync(path.join(__dirname, 'src', 'uploads', 'handleUpload.js')),
        },
      });
    });
  }

  router.post('/upload/id', (req, res, next) =>
    requireIdempotencyKey(req, res, async () => {
      log('info', 'UPLOAD/ENTRY (api)', {
        rid: req._rid,
        path: req.path,
        method: req.method,
        idem: req.get('x-idempotency-key'),
        ctype: req.headers['content-type'],
        length: req.headers['content-length'],
      });
      try {
        const fn = await getUploadHandler();
        await fn(req, res);
      } catch (e) {
        log('error', 'UPLOAD/THREW (api)', { rid: req._rid, error: String(e?.message || e) });
        next(e);
      }
    }),
  );

  app.use('/api', router);
  log('info', 'API_PREFIX/MOUNTED', { base: '/api', routes: ['GET /_health', 'POST /upload/id'] });
}

/* 404 */
app.use((req, res) => {
  log('warn', 'ROUTE/NOT_FOUND', { method: req.method, path: req.path });
  res.status(404).json({ ok: false, error: 'not_found', path: req.path });
});

/* Export principal */
exports.api = onRequest(app);
log('info', 'FUNCTION/EXPORTED', { fn: 'api', routes: ['GET /_health', 'POST /upload/id'] });
