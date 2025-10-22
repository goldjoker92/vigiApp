// src/miss/lib/useReadyToast.js
// ---------------------------------------------------------------------------
// Affiche un toast *une seule fois* quand le formulaire devient "prêt à envoyer".
// - canSubmit: boolean (true si le bouton "Enviar" devrait être actif)
// - show: fn(string) => affiche ton toast (ex: useLiteToast().show)
// - options: { durationMs?: number, text?: string, ns?: string }
//
// Par défaut: 6000ms, texte avec indication explicite "vous pouvez appuyer sur Enviar".
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react';

export function useReadyToast(canSubmit, show, options = {}) {
  const shownRef = useRef(false);
  const {
    durationMs = 6000,
    text = '✅ Pronto para enviar — você já pode tocar em Enviar.',
    ns = '[READY_TOAST]',
  } = options;

  useEffect(() => {
    if (canSubmit && !shownRef.current) {
      try {
        // Log minimal sans dépendre d’un logger global
        console.log(ns, 'show', { durationMs, at: new Date().toISOString() });
        // Affiche le toast (ton hook interne gère la durée)
        show(text);
        shownRef.current = true;
      } catch (e) {
        console.warn(ns, 'show_error', e?.message || String(e));
      }
    }
  }, [canSubmit, show, durationMs, text, ns]);

  // Optionnel: reset quand canSubmit retombe à false (si tu veux réafficher plus tard)
  // Décommente si nécessaire.
  // useEffect(() => {
  //   if (!canSubmit) shownRef.current = false;
  // }, [canSubmit]);
}

export default useReadyToast;
