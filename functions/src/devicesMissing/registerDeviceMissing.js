// devicesMissing/registerDeviceMissing.js
// Endpoint HTTP — enregistre FCM + Expo pour le rail Missing (collections *_missing)
// NS: [Missing][Register]
const { onRequest } = require('firebase-functions/v2/https');
const admin=require('firebase-admin');
const db=admin.firestore();
const { tilesForRadius } = require('../libsMissing/geoTiles');
const NS='[Missing][Register]';

function isExpo(t){return !!t && /^ExponentPushToken\[[\w\-]+\]$/.test(t);}
function isFcm(t){return !!t && t.includes(':APA91') && t.length>80;}

exports.registerDeviceMissing = onRequest({ cors:true, region:'southamerica-east1' }, async (req,res)=>{
  if(req.method!=='POST') {return res.status(405).json({ok:false,error:'method_not_allowed'});}
  const { userId, deviceId, platform='unknown', fcmToken=null, expoToken=null, lat=null, lng=null, tiles=null } = req.body||{};
  if(!userId) {return res.status(400).json({ok:false,error:'userId_required'});}
  if(!deviceId) {return res.status(400).json({ok:false,error:'deviceId_required'});}

  const latN= Number.isFinite(+lat)? +lat : null;
  const lngN= Number.isFinite(+lng)? +lng : null;
  const tset = Array.isArray(tiles)&&tiles.length? tiles
              : (latN!==null&&lngN!==null? tilesForRadius(latN,lngN) : []);

  const payload={
    userId, deviceId, platform,
    fcmToken: isFcm(fcmToken)?fcmToken:null,
    expoToken: isExpo(expoToken)?expoToken:null,
    tiles: tset, lat: latN, lng: lngN,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    active:true, channels:{ publicAlerts:true, missing:true },
  };

  try{
    await db.collection('devices_missing').doc(deviceId).set(payload,{merge:true});
    await db.collection('users_missing').doc(userId).collection('devices').doc(deviceId).set(payload,{merge:true});
    console.log(NS,'upsert_ok',{deviceId,userId, tiles: tset.length});

    // Abonnement FCM aux topics de tuiles
    let subscribed=[];
    if(payload.fcmToken && tset.length){
      for(const tile of tset){
        const topic=`missing-geo:${tile}`;
        try{ await admin.messaging().subscribeToTopic(payload.fcmToken, topic); subscribed.push(topic); }
        catch(e){ console.warn(NS,'sub_fail',topic,e?.message||e); }
      }
    }

    return res.json({ ok:true, deviceId, userId, tiles:tset, subscribed });
  }catch(e){
    console.error(NS,'err',e?.message||e);
    return res.status(500).json({ ok:false, error:'internal_error' });
  }
});
