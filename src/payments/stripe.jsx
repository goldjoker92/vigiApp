/**
 * src/payments/stripe.jsx
 * ============================================================================
 * Stripe module — LOG/DEBUG
 * - <StripeBootstrap> : Provider avec publishableKey depuis l'env
 * - usePaymentSheet(fetchParams) : init + present du Payment Sheet avec logs
 * - Sécurisé: aucun secret géré côté client (fetchParams côté serveur requis)
 * ============================================================================
 */

import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

// -------------------------
// Helpers de logs formatés
// -------------------------
const L = {
  scope(scope) {
    return (msg, ...args) => console.log(`[STRIPE:${scope}] ${msg}`, ...args);
  },
  warn(scope) {
    return (msg, ...args) => console.warn(`[STRIPE:${scope}] ⚠️ ${msg}`, ...args);
  },
  err(scope) {
    return (msg, ...args) => console.error(`[STRIPE:${scope}] ❌ ${msg}`, ...args);
  },
};
const logBOOT = L.scope('BOOT');
const logSHEET = L.scope('SHEET');
const warnBOOT = L.warn('BOOT');
const warnSHEET = L.warn('SHEET');
const errSHEET = L.err('SHEET');

// ----------------------------------------------------------------------------
// <StripeBootstrap> — monte StripeProvider avec la clé publishable
// - Lis depuis process.env.STRIPE_PUBLISHABLE_KEY (que tu as déjà dans .env)
// - urlScheme : adapte si tu as un scheme custom (expo-linking / app.json)
// - merchantIdentifier : requis iOS pour Apple Pay (ok si tu n’utilises pas Apple Pay)
// ----------------------------------------------------------------------------
export function StripeBootstrap({ children }) {
  const publishableKey = process?.env?.STRIPE_PUBLISHABLE_KEY ?? '';

  useEffect(() => {
    console.groupCollapsed('[STRIPE:BOOT] ▶ Provider');
    if (!publishableKey) {
      warnBOOT(
        'Aucune STRIPE_PUBLISHABLE_KEY trouvée dans process.env — le SDK initialisera mais toute tentative de paiement échouera. Ajoute ta clé test Stripe.',
      );
    } else {
      logBOOT('Publishable key détectée (length=%d) ✅', publishableKey.length);
    }
    console.groupEnd();
  }, [publishableKey]);

  const urlScheme = useMemo(() => {
    // Change si tu as défini un scheme custom (app.json/app.config)
    return Platform.select({ ios: 'vigiapp', android: 'vigiapp' });
  }, []);

  return (
    <StripeProvider
      publishableKey={publishableKey}
      // Apple Pay (iOS uniquement). Laisse une valeur par défaut, non bloquant si non utilisé.
      merchantIdentifier="merchant.com.vigiapp.placeholder"
      // Pour 3DS / deep links (si tu fais des confirmations redirigées)
      urlScheme={urlScheme}
      // Options de debug utiles
      setUrlSchemeOnAndroid={true}
      threeDSecureParams={{ timeout: 5 * 60 }}
    >
      {children}
    </StripeProvider>
  );
}

// ----------------------------------------------------------------------------
// Hook usePaymentSheet(fetchParams)
// - fetchParams: fonction asynchrone fournie par TON backend qui renvoie:
//   { paymentIntentClientSecret, customerId?, customerEphemeralKeySecret?,
//     setupIntentClientSecret?, merchantDisplayName?, allowsDelayedPaymentMethods? }
// - Le hook gère : initPaymentSheet → presentPaymentSheet → reset, avec logs.
// ----------------------------------------------------------------------------
export function usePaymentSheet(fetchParams) {
  const { initPaymentSheet, presentPaymentSheet, resetPaymentSheet } = useStripe();

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const init = useCallback(async () => {
    console.groupCollapsed('[STRIPE:SHEET] ▶ init');
    console.time('[STRIPE:SHEET] init');
    try {
      if (typeof fetchParams !== 'function') {
        throw new Error(
          'fetchParams (function) est requis: appelle ton API serveur pour créer/retourner un PaymentIntent + ephemeral key.',
        );
      }

      // 1) Récupère les secrets côté serveur (JAMAIS côté app)
      const params = await fetchParams();
      logSHEET('params reçus du serveur =', {
        hasPI: !!params?.paymentIntentClientSecret,
        hasSI: !!params?.setupIntentClientSecret,
        hasEphemeralKey: !!params?.customerEphemeralKeySecret,
        hasCustomer: !!params?.customerId,
      });

      if (!params?.paymentIntentClientSecret && !params?.setupIntentClientSecret) {
        throw new Error(
          'Aucun client secret fourni (paymentIntentClientSecret / setupIntentClientSecret).',
        );
      }

      // 2) init du Payment Sheet
      const {
        paymentIntentClientSecret,
        setupIntentClientSecret,
        customerId,
        customerEphemeralKeySecret,
        merchantDisplayName = 'VigiApp',
        allowsDelayedPaymentMethods = false,
      } = params;

      const initRes = await initPaymentSheet({
        merchantDisplayName,
        paymentIntentClientSecret,
        setupIntentClientSecret,
        customerId,
        customerEphemeralKeySecret,
        allowsDelayedPaymentMethods,
        defaultBillingDetails: { name: 'Vigi User' }, // facultatif
        style: 'automatic',
      });

      if (initRes.error) {
        errSHEET('initPaymentSheet error:', initRes.error);
        setReady(false);
        return { ok: false, error: initRes.error };
      }

      logSHEET('initPaymentSheet OK ✅');
      setReady(true);
      return { ok: true };
    } catch (e) {
      errSHEET('init failed:', e?.message || e);
      setReady(false);
      return { ok: false, error: e };
    } finally {
      console.timeEnd('[STRIPE:SHEET] init');
      console.groupEnd();
    }
  }, [fetchParams, initPaymentSheet]);

  const open = useCallback(async () => {
    console.groupCollapsed('[STRIPE:SHEET] ▶ present');
    console.time('[STRIPE:SHEET] present');
    if (!ready) {
      warnSHEET('present ignoré: sheet non prêt (appelle init() avant).');
      console.groupEnd();
      return { ok: false, error: 'NOT_READY' };
    }
    if (busy) {
      warnSHEET('present ignoré: déjà en cours.');
      console.groupEnd();
      return { ok: false, error: 'BUSY' };
    }

    setBusy(true);
    try {
      const res = await presentPaymentSheet();
      if (res.error) {
        // L’utilisateur peut avoir annulé; ce n’est pas un crash.
        warnSHEET('presentPaymentSheet error:', res.error);
        return { ok: false, error: res.error };
      }
      logSHEET('Payment confirmé ✅');
      return { ok: true };
    } catch (e) {
      errSHEET('present failed:', e?.message || e);
      return { ok: false, error: e };
    } finally {
      console.timeEnd('[STRIPE:SHEET] present');
      console.groupEnd();
      setBusy(false);
    }
  }, [presentPaymentSheet, ready, busy]);

  const reset = useCallback(() => {
    try {
      resetPaymentSheet();
      setReady(false);
      logSHEET('resetPaymentSheet() → done');
    } catch (e) {
      warnSHEET('resetPaymentSheet error:', e?.message || e);
    }
  }, [resetPaymentSheet]);

  return { ready, busy, init, open, reset };
}

// ----------------------------------------------------------------------------
// Exemple d’usage (dans un écran):
//
// const { ready, init, open } = usePaymentSheet(async () => {
//   // ⚠️ FAIS ÇA CÔTÉ SERVEUR !
//   // return await fetch(`${API}/payments/create-intent`, { method:'POST', ... }).then(r => r.json());
//   return {
//     paymentIntentClientSecret: 'pi_XXX_secret_YYY',
//     customerId: 'cus_XXX',
//     customerEphemeralKeySecret: 'ek_test_XXX',
//     merchantDisplayName: 'VigiApp (Test)'
//   };
// });
//
// useEffect(() => { init(); }, []);
// <Button title="Payer" disabled={!ready} onPress={open} />
// ----------------------------------------------------------------------------
