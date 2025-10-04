// utils/deeplinks.js
// -------------------------------------------------------------
// Deeplinks robustes (WhatsApp perso prioritaire, Uber, Waze→Maps, News BR, Gmail)
// - Android: WhatsApp com.whatsapp → web (wa.me) → business
// - iOS: WhatsApp scheme → web (Apple choisit l’app)
// - Waze: waze:// → web → (échec) Alert pt-BR -> Google Maps
// - News BR: ouvre édition brésilienne (pt-BR)
// - HTTP(S): ouvre direct; fallback expo-web-browser si besoin
// -------------------------------------------------------------

import { Platform, Linking, Alert } from 'react-native';

// ---------------- Helpers ----------------
function enc(s) {
  return encodeURIComponent(String(s || ''));
}
function digits(s) {
  return String(s || '').replace(/[^\d]/g, '');
}

async function openUrl(url) {
  const isHttp = /^https?:\/\//i.test(url);
  try {
    if (isHttp) {
      return await Linking.openURL(url);
    }
    const can = await Linking.canOpenURL(url);
    if (!can) {
      throw new Error('cannot-open:' + url);
    }
    return await Linking.openURL(url);
  } catch (e) {
    if (isHttp) {
      try {
        const WebBrowser = await import('expo-web-browser');
        return await WebBrowser.openBrowserAsync(url);
      } catch {}
    }
    throw e;
  }
}

// ---------------- WhatsApp (perso prioritaire) ----------------
export async function openWhatsAppPersonal({ text = '', phone } = {}) {
  const msg = text || '';
  const phoneDigits = phone ? digits(phone) : null;

  try {
    if (Platform.OS === 'android') {
      // 1) perso
      try {
        const url = phoneDigits
          ? `https://wa.me/${phoneDigits}?text=${enc(msg)}`
          : `https://wa.me/?text=${enc(msg)}`;
        console.log('[WA] ANDROID → wa.me');
        await openUrl(url);
        return;
      } catch (e) {
        console.warn('[WA] perso KO, fallback web:', e?.message || e);
      }

      // 2) web (wa.me)
      try {
        const url = phoneDigits
          ? `https://wa.me/${phoneDigits}?text=${enc(msg)}`
          : `https://wa.me/?text=${enc(msg)}`;
        await openUrl(url);
        return;
      } catch (e2) {
        console.warn('[WA] web KO, fallback business:', e2?.message || e2);
      }

      // 3) business fallback (use wa.me again)
      try {
        const urlBusiness = phoneDigits
          ? `https://wa.me/${phoneDigits}?text=${enc(msg)}`
          : `https://wa.me/?text=${enc(msg)}`;
        console.log('[WA] ANDROID → wa.me (business fallback)');
        await openUrl(urlBusiness);
        return;
      } catch (e3) {
        console.warn('[WA] business KO:', e3?.message || e3);
      }
      return;
    }

    // iOS
    try {
      console.log('[WA] iOS → whatsapp://send');
      const iosUrl = phoneDigits
        ? `whatsapp://send?phone=${enc(phoneDigits)}&text=${enc(msg)}`
        : `whatsapp://send?text=${enc(msg)}`;
      await openUrl(iosUrl);
      return;
    } catch (e) {
      console.warn('[WA] iOS scheme KO, fallback web:', e?.message || e);
      const webUrl = phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${enc(msg)}`
        : `https://wa.me/?text=${enc(msg)}`;
      await openUrl(webUrl);
      return;
    }
  } catch (e) {
    console.warn('[WA] open fail:', e?.message || e);
  }
}

// ---------------- Uber ----------------
export async function openUber() {
  try {
    await openUrl('uber://');
  } catch {
    await openUrl('https://m.uber.com/ul/'); // UL plus robuste
  }
}

// ---------------- Waze (avec prompt pt-BR pour Google Maps) ----------------
export async function openWaze({ lat, lng } = {}) {
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const ll = hasCoords ? `${lat},${lng}` : '';

  // 1) App native
  const native = hasCoords ? `waze://?ll=${ll}&navigate=yes` : `waze://`;
  try {
    await openUrl(native);
    return;
  } catch (e) {
    console.warn('[Waze] native KO -> web', e?.message || e);
  }

  // 2) Web Waze
  const web = hasCoords
    ? `https://www.waze.com/ul?ll=${enc(lat)},${enc(lng)}&navigate=yes`
    : `https://www.waze.com/ul`;
  try {
    await openUrl(web);
    return;
  } catch (e2) {
    console.warn('[Waze] web KO -> prompt Google Maps', e2?.message || e2);
  }

  // 3) Prompt pt-BR pour basculer sur Google Maps
  Alert.alert(
    'Abrir no Google Maps?',
    'Não consegui conectar ao Waze agora. Quer abrir no Google Maps?',
    [
      {
        text: 'Cancelar',
        style: 'cancel',
      },
      {
        text: 'Abrir no Google Maps',
        onPress: async () => {
          const gmaps = hasCoords
            ? `https://maps.google.com/?q=${enc(lat)},${enc(lng)}`
            : `https://maps.google.com/`;
          try {
            await openUrl(gmaps);
          } catch (e3) {
            console.warn('[Maps] open fail:', e3?.message || e3);
          }
        },
      },
    ],
    { cancelable: true },
  );
}

// ---------------- Google News (Brasil) ----------------
export async function openGoogleNewsBR() {
  // Essayez le scheme si dispo, sinon édition BR PT
  try {
    await openUrl('googlenews://');
  } catch {
    // Edition Brésil, interface PT-BR
    await openUrl('https://news.google.com/?hl=pt-BR&gl=BR&ceid=BR:pt-419');
  }
}

// ---------------- Gmail ----------------
export async function openGmail({ to, subject, body } = {}) {
  const qs = [
    to ? `to=${enc(to)}` : '',
    subject ? `subject=${enc(subject)}` : '',
    body ? `body=${enc(body)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  try {
    await openUrl(`mailto:${to || ''}${qs ? `?${qs}` : ''}`);
  } catch {
    try {
      await openUrl('googlegmail://');
    } catch {
      await openUrl('https://mail.google.com/');
    }
  }
}
