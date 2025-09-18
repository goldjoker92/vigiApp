// utils/weather.js
// -------------------------------------------------------------
// Google Weather + Geocoding (clé EXPO_PUBLIC_GOOGLE_WEATHER_KEY) avec
// fallback OpenWeather. Fournit aussi une bascule ville→capitale d'État.
// -------------------------------------------------------------
import Constants from 'expo-constants';
import * as Location from 'expo-location';

const GOOGLE_WEATHER_KEY = Constants?.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_WEATHER_KEY || '';
const OPENWEATHER_KEY = Constants?.expoConfig?.extra?.OPENWEATHER_API_KEY || '';

const WX_BASE = 'https://weather.googleapis.com/v1';
const WX_COMMON = `languageCode=pt-BR&unitsSystem=METRIC&key=${GOOGLE_WEATHER_KEY}`;
const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

// --- Capitals (UF -> {city, coords})
// Coords approximatives de capitales brésiliennes (OK pour météo/city label).
const UF_CAPITALS = {
  AC: { city: 'Rio Branco', coords: { latitude: -9.97499, longitude: -67.8243 } },
  AL: { city: 'Maceió', coords: { latitude: -9.64985, longitude: -35.70895 } },
  AP: { city: 'Macapá', coords: { latitude: 0.034934, longitude: -51.0694 } },
  AM: { city: 'Manaus', coords: { latitude: -3.11903, longitude: -60.02173 } },
  BA: { city: 'Salvador', coords: { latitude: -12.97775, longitude: -38.50163 } },
  CE: { city: 'Fortaleza', coords: { latitude: -3.71722, longitude: -38.54306 } },
  DF: { city: 'Brasília', coords: { latitude: -15.7934, longitude: -47.8823 } },
  ES: { city: 'Vitória', coords: { latitude: -20.3155, longitude: -40.3128 } },
  GO: { city: 'Goiânia', coords: { latitude: -16.6864, longitude: -49.2643 } },
  MA: { city: 'São Luís', coords: { latitude: -2.53911, longitude: -44.2825 } },
  MT: { city: 'Cuiabá', coords: { latitude: -15.601, longitude: -56.0974 } },
  MS: { city: 'Campo Grande', coords: { latitude: -20.4697, longitude: -54.6201 } },
  MG: { city: 'Belo Horizonte', coords: { latitude: -19.9167, longitude: -43.9345 } },
  PA: { city: 'Belém', coords: { latitude: -1.45583, longitude: -48.5044 } },
  PB: { city: 'João Pessoa', coords: { latitude: -7.11509, longitude: -34.8641 } },
  PR: { city: 'Curitiba', coords: { latitude: -25.4284, longitude: -49.2733 } },
  PE: { city: 'Recife', coords: { latitude: -8.05428, longitude: -34.8813 } },
  PI: { city: 'Teresina', coords: { latitude: -5.08921, longitude: -42.8016 } },
  RJ: { city: 'Rio de Janeiro', coords: { latitude: -22.9068, longitude: -43.1729 } },
  RN: { city: 'Natal', coords: { latitude: -5.79448, longitude: -35.211 } },
  RS: { city: 'Porto Alegre', coords: { latitude: -30.033, longitude: -51.23 } },
  RO: { city: 'Porto Velho', coords: { latitude: -8.76077, longitude: -63.8999 } },
  RR: { city: 'Boa Vista', coords: { latitude: 2.82384, longitude: -60.6753 } },
  SC: { city: 'Florianópolis', coords: { latitude: -27.5954, longitude: -48.548 } },
  SP: { city: 'São Paulo', coords: { latitude: -23.5505, longitude: -46.6333 } },
  SE: { city: 'Aracaju', coords: { latitude: -10.9111, longitude: -37.0717 } },
  TO: { city: 'Palmas', coords: { latitude: -10.184, longitude: -48.3336 } },
};

export function normalizeUf(ufRaw) {
  if (!ufRaw) return '';
  return String(ufRaw).trim().slice(0, 2).toUpperCase();
}
function extractCityUfFromAddressComponents(components = []) {
  let city = '', uf = '';
  for (const c of components) {
    if (c.types.includes('administrative_area_level_2') && !city) city = c.long_name; // município
    if (c.types.includes('administrative_area_level_1') && !uf) uf = c.short_name;   // UF
    if (c.types.includes('locality') && !city) city = c.long_name;
  }
  return { city, uf };
}
export function mapConditionToEmojiLabel(code, desc) {
  const t = (desc || code || '').toLowerCase();
  if (t.includes('trovoada') || t.includes('thunder') || t.includes('tempest')) return '⛈️ Trovoada';
  if (t.includes('chuva') || t.includes('rain') || t.includes('shower')) return '🌧️ Chuva';
  if (t.includes('garoa') || t.includes('drizzle')) return '🌦️ Garoa';
  if (t.includes('nublado') || t.includes('cloud')) return '☁️ Nublado';
  if (t.includes('neblina') || t.includes('fog') || t.includes('mist')) return '🌫️ Neblina';
  if (t.includes('limpo') || t.includes('clear') || t.includes('sun')) return '☀️ Limpo';
  return '🌤️ Tempo';
}

// ---------------- Geocoding ----------------
export async function reverseGeocodeCityUf({ latitude, longitude }) {
  const url = `${GEOCODE_BASE}?latlng=${latitude},${longitude}&key=${GOOGLE_WEATHER_KEY}&language=pt-BR`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Geocode reverse HTTP ${resp.status}`);
  const json = await resp.json();
  const best = json.results?.[0];
  if (!best) return { city: '', uf: '' };
  const { city, uf } = extractCityUfFromAddressComponents(best.address_components || []);
  return { city, uf: normalizeUf(uf) };
}

export async function geocodeCepToCoords(cep) {
  const digits = String(cep || '').replace(/\D/g, '');
  if (!digits) return null;
  const query = `${digits}, Brazil`;
  const url = `${GEOCODE_BASE}?address=${encodeURIComponent(query)}&key=${GOOGLE_WEATHER_KEY}&language=pt-BR`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Geocode CEP HTTP ${resp.status}`);
  const json = await resp.json();
  const best = json.results?.[0];
  if (!best) return null;
  const { lat, lng } = best.geometry?.location || {};
  const { city, uf } = extractCityUfFromAddressComponents(best.address_components || []);
  return { coords: { latitude: lat, longitude: lng }, city, uf: normalizeUf(uf) };
}

// ---------------- Weather (Google) ----------------
async function googleCurrent({ latitude, longitude }) {
  const url = `${WX_BASE}/currentConditions:lookup?${WX_COMMON}&location.latitude=${latitude}&location.longitude=${longitude}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = new Error(`Weather currentConditions HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const json = await resp.json();
  return {
    tempC: json?.temperature?.value ?? null,
    code: json?.weatherCondition?.code || '',
    text: json?.weatherCondition?.description || '',
    provider: 'google',
  };
}

// ---------------- Weather (OpenWeather fallback) ----------------
async function openWeatherCurrent({ latitude, longitude }) {
  if (!OPENWEATHER_KEY) throw new Error('OPENWEATHER_API_KEY ausente');
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_KEY}&units=metric&lang=pt_br`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`OpenWeather HTTP ${resp.status}`);
  const j = await resp.json();
  return {
    tempC: j?.main?.temp ?? null,
    code: j?.weather?.[0]?.main || '',
    text: j?.weather?.[0]?.description || '',
    provider: 'openweather',
  };
}

// ---------------- Coord source: GPS > CEP > Capital UF > Brasília ----------------
export async function resolveCoordsAndLabel({ cep }) {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const label = await reverseGeocodeCityUf(coords);
      console.log('[WEATHER] geoloc=GPS', { coords, label });
      return { coords, ...label, source: 'gps' };
    }
  } catch (_) { /* silent */ }

  if (cep) {
    const got = await geocodeCepToCoords(cep);
    if (got?.coords) {
      console.log('[WEATHER] geoloc=CEP', got);
      return { ...got, source: 'cep' };
    }
  }

  // Sans CEP ni GPS → Brasília (neutre)
  console.log('[WEATHER] geoloc=FALLBACK', { city: 'Brasília', uf: 'DF' });
  return { coords: UF_CAPITALS.DF.coords, city: 'Brasília', uf: 'DF', source: 'fallback' };
}

// Si ville manquante mais UF connue → on bascule sur la capitale de l’État
export function ensureCityFromCapitalIfMissing({ city, uf, coords }) {
  const U = normalizeUf(uf);
  if (city && U) return { city, uf: U, coords, used: 'as-is' };
  if (U && UF_CAPITALS[U]) {
    console.log('[WEATHER] city missing → using state capital', { uf: U, capital: UF_CAPITALS[U].city });
    return { city: UF_CAPITALS[U].city, uf: U, coords: UF_CAPITALS[U].coords, used: 'state-capital' };
  }
  console.log('[WEATHER] city+uf missing → Brasília, DF');
  return { city: 'Brasília', uf: 'DF', coords: UF_CAPITALS.DF.coords, used: 'federal-capital' };
}

// ---------------- API publique pour la Card ----------------
export async function getWeatherNowWithFallback(coords) {
  try {
    const res = await googleCurrent(coords);
    console.log('[WEATHER] provider=google ✔', res);
    return res;
  } catch (e) {
    if (e?.status === 401 || e?.status === 403) {
      console.log('[WEATHER] Google 401/403 → fallback OpenWeather');
      const ow = await openWeatherCurrent(coords);
      console.log('[WEATHER] provider=openweather ✔', ow);
      return ow;
    }
    console.log('[WEATHER] google error', e?.message || e);
    throw e;
  }
}
