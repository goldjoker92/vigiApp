const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

let _init = false;
function ensureInit() {
  if (_init) {return;}
  try { admin.app(); } catch { admin.initializeApp(); }
  _init = true;
}

// ✅ bouton d’arrêt d’urgence si jamais ça repart en vrille
const ENABLED = true;

const REGION = "southamerica-east1";
const db = () => admin.firestore();
const { tilesForRadius } = require("../libsMissing/geoTiles");

// -------- Helpers ultra light --------
function pickLatLng(d) {
  const lat = +d?.lat || +d?.geo?.lat || null;
  const lng = +d?.lng || +d?.geo?.lng || null;
  if (!lat || !lng) {return null;}
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {return null;}
  return { lat, lng };
}

function state(d) {
  const pos = pickLatLng(d);
  return {
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    fcm: d?.fcmToken ?? d?.fcm ?? null,
    expo: d?.expoPushToken ?? d?.expo ?? null,
    missingOn: d?.channels?.missingAlerts !== false,
    active: d?.active !== false
  };
}

function stable(s) {
  return JSON.stringify(Object.keys(s).sort().reduce((o,k)=> (o[k]=s[k],o),{}));
}

function diff(a=[], b=[]) {
  const A=new Set(a), B=new Set(b);
  return {
    toSub: [...A].filter(x=>!B.has(x)),
    toUnsub: [...B].filter(x=>!A.has(x)),
  };
}

async function sub(token, tiles) {
  for (const t of tiles) {
    try { await admin.messaging().subscribeToTopic([token], `missing_geo_${t}`); }
    catch(_) {}
  }
}

async function unsub(token, tiles) {
  for (const t of tiles) {
    try { await admin.messaging().unsubscribeFromTopic([token], `missing_geo_${t}`); }
    catch(_) {}
  }
}

// =================================================================================
// ✅ Version ÉCO : même nom export → pas de casse pour ton dev ni ton codebase
// =================================================================================
exports.onWriteDevice = onDocumentUpdated(
  { region: REGION, document: "devices/{deviceId}" },
  async (event) => {
    ensureInit();
    if (!ENABLED) {return;}  // emergency brake

    const before = event.data.before.data() || {};
    const after  = event.data.after.data() || {};
    const deviceId = event.params.deviceId;

    // ✅ Récupération état simple pour détecter si ça change vraiment
    const Sbefore = state(before);
    const Safter  = state(after);

    // 🧠 Rien d'utile n’a changé → on sort direct (économie maximum)
    if (stable(Sbefore) === stable(Safter)) {
      console.debug("NOOP device tiles", deviceId);
      return;
    }

    // ❌ Pas de FCM/ inactive / no location → reset miroir + exit
    if (!Safter.active || !Safter.missingOn || !Safter.fcm || Safter.lat === null || Safter.lng === null) {
      await db().collection("devices_missing").doc(deviceId).set({
        userId: after.userId ?? null,
        fcmToken: Safter.fcm ?? null,
        expoToken: Safter.expo ?? null,
        tiles: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.debug("Device inactive/reset tiles", deviceId);
      return;
    }

    // ✅ Calcul tuiles
    let newTiles = [];
    try {
      newTiles = tilesForRadius(Safter.lat, Safter.lng) || [];
      if (!newTiles.length) {return;}
    } catch {
      return;
    }

    const oldTiles = Array.isArray(before.tiles) ? before.tiles : [];
    const sameTiles = newTiles.length === oldTiles.length && newTiles.every((t,i)=>t===oldTiles[i]);

    // 🔁 Token changé = unsubscribe all + subscribe all
    if (Sbefore.fcm && Safter.fcm && Sbefore.fcm !== Safter.fcm) {
      if (oldTiles.length) {await unsub(Sbefore.fcm, oldTiles);}
      await sub(Safter.fcm, newTiles);
    } 
    // ➕➖ Sinon seulement diff
    else if (!sameTiles) {
      const { toSub, toUnsub } = diff(newTiles, oldTiles);
      if (toUnsub.length) {await unsub(Safter.fcm, toUnsub);}
      if (toSub.length)   {await sub(Safter.fcm, toSub);}
    }

    // ✍️ Update minimal Firestore uniquement si nécessaire
    const writes = [];

    if (!sameTiles) {
      writes.push(
        db().collection("devices").doc(deviceId).set({
          tiles: newTiles,
          tilesUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
      );
    }

    writes.push(
      db().collection("devices_missing").doc(deviceId).set({
        userId: after.userId ?? null,
        fcmToken: Safter.fcm ?? null,
        expoToken: Safter.expo ?? null,
        tiles: newTiles,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
    );

    if (writes.length) {await Promise.all(writes);}

    console.debug("Tiles updated OK", deviceId);
  }
);
