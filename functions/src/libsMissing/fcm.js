// libsMissing/fcm.js
// FCM: topics + multicast — NS: [Missing][FCM]
const admin=require('firebase-admin');
const NS='[Missing][FCM]';
const TTL_CREATED=3600, TTL_RESOLVED=1800;

function android(ttl){return{priority:'high',ttl:ttl*1000,notification:{channelId:'missing_alerts'}};}
function apns(ttl){return{headers:{'apns-expiration':String(Math.floor(Date.now()/1000)+ttl)},payload:{aps:{category:'missing_alerts',sound:'default'}}};}

async function sendToTopic(topic,payload,{ttl=TTL_CREATED}={}){
  const msg={topic,data:payload.data||{},notification:payload.notification||undefined,android:android(ttl),apns:apns(ttl)};
  const id=await admin.messaging().send(msg); console.log(NS,'topic_ok',{topic,id}); return id;
}
async function sendMulticast(tokens,payload,{ttl=TTL_CREATED}={}){
  if(!tokens?.length) {return {successCount:0,failureCount:0};}
  const res=await admin.messaging().sendEachForMulticast({tokens,data:payload.data||{},notification:payload.notification||undefined,android:android(ttl),apns:apns(ttl)});
  console.log(NS,'mcast',{count:tokens.length,success:res.successCount,failure:res.failureCount}); return res;
}

module.exports={ sendToTopic, sendMulticast, TTL_CREATED, TTL_RESOLVED };
