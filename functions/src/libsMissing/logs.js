// libsMissing/logs.js
// Logs Firestore isolés — NS: [Missing][Logs]
const admin=require('firebase-admin');
const db=admin.firestore(); const NS='[Missing][Logs]';

async function writeNotifLog(docId,payload){
  try{
    await db.collection('notifLogs_missing').doc('missing').collection('events').doc(docId)
      .set({...payload,at:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    console.log(NS,'ok',{docId});
  }catch(e){ console.error(NS,'ko',{docId,err:e?.message||e}); }
}

module.exports={ writeNotifLog };
