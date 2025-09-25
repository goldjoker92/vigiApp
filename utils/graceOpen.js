// utils/graceOpen.js
// -----------------------------------------------------------------------------
// openWithGrace: affiche l’overlay, attend un délai "doux", puis ouvre l’app.
// Corrige l’erreur "openWithGrace is not a function" → export nommé OK.
// -----------------------------------------------------------------------------

export function openWithGrace({ appLabel, setOverlay, openFn, delayMs = 2000 }) {
  try {
    if (typeof setOverlay === 'function') {
      setOverlay(appLabel || 'app');
      console.log('[GraceOpen] overlay show', appLabel);
    }
    setTimeout(async () => {
      try {
        await Promise.resolve(openFn?.());
        console.log('[GraceOpen] open done', appLabel);
      } catch (e) {
        console.warn('[GraceOpen] open error', e?.message || String(e));
        // fallback très basique : si openFn absent, ouvre rien
      } finally {
        if (typeof setOverlay === 'function') {
          setOverlay(null);
          console.log('[GraceOpen] overlay hide', appLabel);
        }
      }
    }, delayMs);
  } catch (e) {
    console.warn('[GraceOpen] error', e?.message || String(e));
    try {
      setOverlay?.(null);
    } catch {}
  }
}
