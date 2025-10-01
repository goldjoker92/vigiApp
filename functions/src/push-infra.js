// ============================================================================
// VigiApp — Push Infra (sélection destinataires + fallbacks tolérants)
// Priorité: GEO (lat/lng) → widen progressif → CEP (optionnel) → city sample
// Filtre devices inactifs/obsolètes, dédup tokens, cap global, logs détaillés.
// ============================================================================

const admin = require('firebase-admin');

const STALE_DEVICE_DAYS = 30;    // ignore devices non mis à jour depuis > 30j
const MAX_RECIPIENTS = 10000;    // garde-fou
const WIDEN_FACTOR = 1.3;
const MAX_WIDEN_STEPS = 2;
const CITY_SAMPLE_LIMIT = 1000;

function toRad(x){ return (x * Math.PI) / 180; }
function haversineMeters(lat1,lng1,lat2,lng2){
  const R=6371000, dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function metersToDegLat(m){ return m/111320; }
function metersToDegLng(m,lat){ return m/(111320*Math.cos((lat*Math.PI)/180)); }

function isFresh(updatedAt){
  if(!updatedAt) {return false;}
  const t = updatedAt.toMillis ? updatedAt.toMillis() : new Date(updatedAt).getTime();
  if(!Number.isFinite(t)) {return false;}
  return ((Date.now()-t)/86400000) <= STALE_DEVICE_DAYS;
}
function dedupeTokens(list){
  const seen=new Set(); const out=[];
  for(const r of list){
    if(!r?.token) {continue;}
    if(seen.has(r.token)) {continue;}
    seen.add(r.token); out.push(r);
    if(out.length>=MAX_RECIPIENTS) {break;}
  }
  return out;
}

// -----------------------------
// Normalize token extraction
// tolère fcmToken, fcmDeviceToken, fcmTokens[] (compatibilité)
// -----------------------------
function normalizeDeviceToken(d) {
  if (!d) { return null; }
  if (typeof d.fcmToken === 'string' && d.fcmToken) { return d.fcmToken; }
  if (typeof d.fcmDeviceToken === 'string' && d.fcmDeviceToken) { return d.fcmDeviceToken; }
  if (Array.isArray(d.fcmTokens) && d.fcmTokens.length) { return d.fcmTokens[0]; }
  return null;
}

async function queryGeoWindow({ lat, lng, radiusM }){
  const db = admin.firestore();
  const col = db.collection('devices');

  const dLat=metersToDegLat(radiusM), dLng=metersToDegLng(radiusM,lat);
  const minLat=lat-dLat, maxLat=lat+dLat, minLng=lng-dLng, maxLng=lng+dLng;
  console.log('[PUSH_INFRA][GEO] window', { minLat, maxLat, minLng, maxLng });

  const snap = await col
    .where('active','==',true)
    .where('lat','>=',minLat)
    .where('lat','<=',maxLat)
    .get();

  const candidates=[];
  snap.forEach(doc=>{
    const d = doc.data();
    const token = normalizeDeviceToken(d);
    if(!token) { return; }
    if(typeof d?.lat!=='number' || typeof d?.lng!=='number') { return; }
    if(!isFresh(d.updatedAt)) { return; }
    if(d.lng<minLng || d.lng>maxLng) { return; }

    // on ne pousse que les champs utiles pour la passe suivante
    candidates.push({
      id: doc.id,
      token,
      lat: d.lat,
      lng: d.lng,
      updatedAt: d.updatedAt,
    });
  });

  console.log('[PUSH_INFRA][GEO] candidates', candidates.length);

  const recipients=[];
  for(const c of candidates){
    const dist = haversineMeters(lat,lng,c.lat,c.lng);
    if(dist<=radiusM) {recipients.push({ token: c.token, distance_m: Math.round(dist) });}
  }
  const unique = dedupeTokens(recipients);
  console.log('[PUSH_INFRA][GEO] unique', unique.length);
  return unique;
}

async function selectRecipientsGeohash({ lat, lng, radiusM }){
  console.log('[PUSH_INFRA][GEO] START', { lat, lng, radiusM });
  let r = await queryGeoWindow({ lat, lng, radiusM });
  console.log('[PUSH_INFRA][GEO] pass0', { count: r.length });

  let steps=0, current=radiusM;
  while(r.length===0 && steps<MAX_WIDEN_STEPS){
    current = Math.floor(current*WIDEN_FACTOR);
    steps += 1;
    console.warn('[PUSH_INFRA][GEO] widen', { step:steps, radiusM:current });
    r = await queryGeoWindow({ lat, lng, radiusM: current });
    console.log('[PUSH_INFRA][GEO] pass'+steps, { count: r.length });
  }
  console.log('[PUSH_INFRA][GEO] DONE', { count: r.length, steps });
  return r;
}

async function selectRecipientsFallbackScan({ lat, lng, radiusM, cep }){
  if(!cep){ console.log('[PUSH_INFRA][CEP] no CEP → skip'); return []; }
  const db = admin.firestore();
  const col = db.collection('devices');

  const snap = await col.where('active','==',true).where('cep','==',String(cep)).get();
  const out=[];
  snap.forEach(doc=>{
    const d = doc.data();
    const token = normalizeDeviceToken(d);
    if(!token) { return; }
    if(!isFresh(d.updatedAt)) { return; }
    if(typeof d.lat==='number' && typeof d.lng==='number'){
      const dist=haversineMeters(lat,lng,d.lat,d.lng);
      if(dist<=radiusM) {out.push({ token, distance_m:Math.round(dist) });}
    } else {
      // fallback “soft” si pas de coords
      out.push({ token });
    }
  });

  const unique=dedupeTokens(out);
  console.log('[PUSH_INFRA][CEP] unique', { cep, count: unique.length });
  return unique;
}

async function selectRecipientsCitySample({ city }){
  if(!city) {return [];}
  const db=admin.firestore();
  const col=db.collection('devices');

  const snap = await col.where('active','==',true).where('city','==',String(city)).limit(CITY_SAMPLE_LIMIT).get();
  const out=[];
  snap.forEach(doc=>{
    const d = doc.data();
    const token = normalizeDeviceToken(d);
    if(!token) { return; }
    if(!isFresh(d.updatedAt)) { return; }
    out.push({ token });
  });
  const unique=dedupeTokens(out);
  console.warn('[PUSH_INFRA][CITY] sample', { city, count: unique.length });
  return unique;
}

// Hooks optionnels
async function auditPushBlastResult(payload){
  console.log('[PUSH_INFRA][AUDIT]', payload);
}
async function enqueueDLQ({ kind, alertId, token, reason }){
  console.warn('[PUSH_INFRA][DLQ]', { kind, alertId, token: token ? token.slice(0,6)+'…'+token.slice(-4) : '(empty)', reason });
  // Optionnel: Firestore cleanup list
  try{
    await admin.firestore().collection('deadTokens').add({
      kind, alertId, token, reason, ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  }catch{}
}

module.exports = {
  selectRecipientsGeohash,
  selectRecipientsFallbackScan,
  selectRecipientsCitySample,
  auditPushBlastResult,
  enqueueDLQ,
};
