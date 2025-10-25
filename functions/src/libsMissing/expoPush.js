// libsMissing/expoPush.js
// Expo Push (batch 100) — NS: [Missing][Expo]
const fetch = require('node-fetch');
const NS='[Missing][Expo]';
const EXPO_URL='https://exp.host/--/api/v2/push/send';

async function sendExpoBatch(messages=[]){
  if(!messages.length) return {requested:0, ok:0, ko:0};
  const chunks=[]; for(let i=0;i<messages.length;i+=100){chunks.push(messages.slice(i,i+100));}
  let ok=0,ko=0,req=0;
  for(const c of chunks){
    req+=c.length;
    try{
      const r=await fetch(EXPO_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});
      const j=await r.json().catch(()=>({data:[]}));
      const tickets=(j?.data||[]);
      tickets.forEach(t=>t?.status==='ok'?ok++:ko++);
      console.log(NS,'chunk',{len:c.length,status:r.status,ok,ko});
    }catch(e){ ko+=c.length; console.warn(NS,'chunk_err',e?.message||e); }
  }
  return {requested:req, ok, ko};
}

module.exports={ sendExpoBatch };
