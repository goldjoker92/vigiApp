/* PT/FR comments only; code PT/EN */

// --- Lexicons PT/FR
const LEX = {
  weapons: [
    "arma","arma branca","faca","facada","punhal","canivete","revolver","revólver",
    "pistola","machete","arma de fogo","tiros",
    "arme","arme blanche","couteau","coup de couteau","pistolet","revolver","tirs",
    "bastão","porrete","garrafa","bottle","baton"
  ],
  bareHands: [
    "soco","socos","mão","maos","empurrão","empurrao","murro","tapa",
    "poings","coups de poing","gifle","bousculade"
  ],
  robbery: [
    "assalto","roubo","furto","arrastão","celular roubado",
    "vol","braquage","arrachage","pickpocket"
  ],
  victims: {
    woman:["mulher","moça","garota","femme","dame","fille"],
    man:["homem","rapaz","garoto","homme"],
    child:["criança","crianca","menino","menina","enfant","garcon"],
    baby:["bebê","bebe","nourrisson","bébé"],
    elderly:["idoso","idosa","pessoa idosa","vieux","vieille","agé"],
    shop:["loja","lojas","comerciante","lojista","vendedor","commerce","commerçant"],
    animal:["cachorro","cão","cao","gato","animal","chien","chat"],
    property:["carro","veículo","veiculo","moto","bicicleta","bike","voiture","vélo","objet"]
  },
  highFootfallPlaces: [
    "mercado","feira","shopping","centro","terminal","rodoviaria","rodoviária",
    "estacao","estação","praça","praca","praia","beira mar","calcadao",
    "escola","universidade","estadio","igreja",
    "marché","centre","gare","place","plage"
  ],
  incidentAggression:["agressao","agressão","violencia","violência","briga","conflito","agression","violence"],
  incidentFire:["incendio","incêndio","fogo","queimando","queimada","incendie","feu"],
  traffic:["acidente","colisao","colisão","batida","choque","capotamento","capotagem","acidente de transito","trânsito","trafego","chauffard","motorista","alcoolizado","ultrapassagem","exceso de velocidade","velocidade"],
  drowning:["afogamento","afogado","noyade","se afogou","se afogando"],
  fractures:["perna quebrada","braço quebrado","perna fraturada","braço fraturado","fratura","osso quebrado","membro quebrado","jambe cassée","bras cassé","fracture"]
};

// --- Normalization utils
function norm(s=""){ return String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase(); }
function hasAny(t, arr){ const n=norm(t); return arr.some(k=>n.includes(norm(k))); }
function hasAnyRegex(t, arr){ const n=norm(t); return arr.some(k=>new RegExp(`\\b${norm(k)}\\b`,"i").test(n)); }

// --- Victim count parsing
function parseVictimCount(text=""){
  const n = norm(text);
  const m = n.match(/(\d{1,3})\s*(vitim|victim|vitimas|victimes|feridos?|pessoas?|personnes?)/i);
  if (m){ const c=parseInt(m[1],10); if(!Number.isNaN(c)) {return Math.max(0,c);} }
  const words = {"um":1,"uma":1,"dois":2,"duas":2,"tres":3,"três":3,"quatro":4,"cinco":5,"seis":6,"sete":7,"oito":8,"nove":9,"dez":10,"un":1,"une":1,"deux":2,"trois":3,"quatre":4,"cinq":5};
  for(const w in words){ if(new RegExp(`\\b${w}\\b\\s+(vitim|victim|vitimas|victimes|feridos?|pessoas?|personnes?)`).test(n)) {return words[w];} }
  return 0;
}

// --- Text features
export function extractTextFeatures(desc=""){
  const t = norm(desc);
  const hasWeapon = hasAny(t, LEX.weapons);
  const isBareHands = hasAny(t, LEX.bareHands);
  const isRobbery = hasAny(t, LEX.robbery);
  const isTraffic = hasAny(t, LEX.traffic);
  const isDrowning = hasAny(t, LEX.drowning);
  const isFracture = hasAny(t, LEX.fractures);

  let violence = 0;
  if (hasWeapon) {violence = /tiro|tiros|disparo|arma de fogo|tirs/.test(t) ? 3 : 2;}
  else if (isBareHands) {violence = 1;}

  const V = LEX.victims;
  const victim =
    hasAnyRegex(t,V.baby)    ? "baby" :
    hasAnyRegex(t,V.child)   ? "child" :
    hasAnyRegex(t,V.woman)   ? "woman" :
    hasAnyRegex(t,V.elderly) ? "elderly" :
    hasAnyRegex(t,V.man)     ? "man" :
    hasAnyRegex(t,V.animal)  ? "animal" :
    hasAnyRegex(t,V.property)? "property" :
    hasAnyRegex(t,V.shop)    ? "shop" : "generic";

  const highFootfall = hasAnyRegex(t, LEX.highFootfallPlaces);
  const isAggression = hasAnyRegex(t, LEX.incidentAggression);
  const isFire = hasAnyRegex(t, LEX.incidentFire);
  const isTrafficIncident = isTraffic;
  const victimCount = parseVictimCount(desc);

  return { hasWeapon, isBareHands, isRobbery, violence, victim, highFootfall, isAggression, isFire, isTrafficIncident, isDrowning, isFracture, victimCount, rawText: String(desc||"") };
}

// --- Time context
export function extractTimeContext(dateLike){
  const d = (!dateLike) ? new Date()
    : (dateLike instanceof Date) ? dateLike
    : (typeof dateLike?.toDate==="function") ? dateLike.toDate()
    : (typeof dateLike==="number") ? new Date(dateLike)
    : (typeof dateLike==="string") ? new Date(dateLike)
    : new Date();

  const h=d.getHours(), day=d.getDay();
  const dayPart = h<6 ? "night" : h<12 ? "morning" : h<18 ? "afternoon" : "evening";
  const isWeekend = (day===0||day===6);
  return { dayPart, isWeekend, isHoliday:false, isHolidayEve:false, isSchoolVacation:false, isElectionPeriod:false, isSocialUnrest:false };
}

// --- Location context
export function buildContextFeatures({ createdAt, highFrequencyZone=false, neighbourhoodRisk=0, overrides={} }={}){
  const timeCtx = extractTimeContext(createdAt);
  return { ...timeCtx, highFrequencyZone, neighbourhoodRisk, ...overrides };
}

// --- Feature similarity
export function featuresSimilarity(a,b){
  if(!a||!b) {return 0.5;}
  let s=0.5;
  if(a.hasWeapon===b.hasWeapon) {s+=0.18;} else {s-=0.25;}
  const dv=Math.abs((a.violence||0)-(b.violence||0)); s+= dv===0?0.12: dv===1?0.03:-0.10;
  const va=a.victimCount||0, vb=b.victimCount||0;
  if(va===vb && va>0) {s+=0.12;} else if(va>0||vb>0) {s+= (Math.abs(va-vb)===1)?0.03:-0.08;}
  if(a.victim===b.victim){ s+= (["baby","child","elderly","woman"].includes(a.victim)?0.16:0.09); }
  else { const clash=(x,y)=> (x==="shop"&&y==="woman")||(x==="woman"&&y==="shop"); s+= clash(a.victim,b.victim)?-0.15:-0.05; }
  if(a.isTrafficIncident&&b.isTrafficIncident){ s+=0.15; if(va+vb>=2) {s+=0.06;} } else if(a.isTrafficIncident!==b.isTrafficIncident){ s-=0.18; }
  if(a.isDrowning&&b.isDrowning) {s+=0.20;}
  if(a.isFracture&&b.isFracture) {s+=0.15;}
  if(a.highFootfall===b.highFootfall) {s+=0.06;} else {s-=0.03;}
  if(a.isAggression&&b.isAggression) {s+=0.10;}
  if(a.isFire&&b.isFire) {s+=0.16;}
  if((a.isAggression&&b.isFire)||(a.isFire&&b.isAggression)) {s-=0.30;}
  return Math.max(0,Math.min(1,s));
}

// --- Context similarity
export function contextSimilarity(aCtx,bCtx){
  if(!aCtx||!bCtx) {return 0.5;}
  let s=0.5;
  s += aCtx.dayPart===bCtx.dayPart ? 0.12 : -0.05;
  s += aCtx.isWeekend===bCtx.isWeekend ? 0.08 : -0.04;
  s += aCtx.highFrequencyZone===bCtx.highFrequencyZone ? 0.08 : -0.04;
  const keys=["isHoliday","isHolidayEve","isSchoolVacation","isElectionPeriod","isSocialUnrest"];
  for(const k of keys){ if(aCtx[k]&&bCtx[k]) {s+=0.06;} else if(aCtx[k]!==bCtx[k]) {s-=0.06;} }
  const diffRisk=Math.abs((aCtx.neighbourhoodRisk||0)-(bCtx.neighbourhoodRisk||0));
  s += diffRisk<0.15?0.05: diffRisk>0.5?-0.05:0;
  return Math.max(0,Math.min(1,s));
}

// --- Buckets spatio-temporels
export function timeBucketKey(date=new Date(), windowMin=60){
  const d=new Date(date); d.setMinutes(Math.floor(d.getMinutes()/windowMin)*windowMin,0,0);
  return `${d.getFullYear()}${(d.getMonth()+1+"").padStart(2,"0")}${(d.getDate()+"").padStart(2,"0")}${(d.getHours()+"").padStart(2,"0")}`;
}
export function spatialBucketKey(lat,lng,km=1){
  const DEG_PER_KM_LAT=1/110.574; const GRID_LAT=DEG_PER_KM_LAT*km;
  const GRID_LNG=GRID_LAT/Math.cos((lat*Math.PI)/180);
  const latBucket=Math.round(lat/GRID_LAT); const lngBucket=Math.round(lng/GRID_LNG);
  return `${latBucket}_${lngBucket}`;
}

// ====================== Forbidden (agressif) + Known-places mask + Anonymize ======================
const L33T_MAP={"0":"o","1":"i","2":"z","3":"e","4":"a","5":"s","6":"g","7":"t","8":"b","9":"g","$":"s","@":"a","!":"i","|":"i","€":"e","£":"l"};
const HOMO_MAP={"ß":"ss","ñ":"n","ø":"o","ð":"d","þ":"p","æ":"ae","œ":"oe"};
function normalizeAggressive(s=""){ let out=String(s||"").normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[^\S\r\n]+/g," ").toLowerCase(); out=out.replace(/./g,ch=>L33T_MAP[ch]??HOMO_MAP[ch]??ch); return out; }
function tightForm(s=""){ return normalizeAggressive(s).replace(/[^a-z0-9]+/g,"").replace(/([a-z0-9])\1{2,}/g,"$1$1"); }
function flexRegexFromWord(word){ const w=tightForm(word); const letters=w.split("").map(ch=>ch.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")); const body=letters.join("[^a-z0-9]{0,3}"); return new RegExp(body,"i"); }

const FORBIDDEN_BASES=["policia","polícia","policia civil","policia militar","policia federal","milicia","milícia","miliciano","milicianos","faccao","facção","faccoes","facções"];
const POLICE_ALIASES=["pm","pf","pc","bope","rota","choque","bop","gate","cotar","bpm","viatura","farda"];
const ORG_ALIASES=["pcc","comando vermelho","cv","terceiro comando","tcp","ada","amigos dos amigos"];
const SLANG_ALIASES=["gambe","gambé","cana","verme"];

function matchAnyForbidden(text="", extraAliases=[]){
  const ALL = [...FORBIDDEN_BASES, ...POLICE_ALIASES, ...ORG_ALIASES, ...SLANG_ALIASES, ...(Array.isArray(extraAliases)?extraAliases:[])];
  const nAgg=normalizeAggressive(text); const tight=tightForm(text);
  const matches=new Set();
  for(const raw of ALL){ const t=tightForm(raw); if(t && tight.includes(t)) {matches.add(raw);} }
  for(const raw of ALL){ const re=flexRegexFromWord(raw); if(re.test(nAgg)) {matches.add(raw);} }
  const tokens=normalizeAggressive(text).split(/[^a-z0-9]+/).filter(Boolean);
  const SHORTS=new Set(["cv","pc","pf","pm","pcc"]);
  tokens.forEach(tok=>{ if(tok.length<=4 && SHORTS.has(tok)) {matches.add(tok.toUpperCase());} });
  return [...matches];
}

export function forbiddenTermSignals(text="", extraAliases=[]){
  const hits = matchAnyForbidden(text, extraAliases);
  const hasForbidden = hits.length>0;
  return { hasForbidden, terms:hits, score: hasForbidden?1:0 };
}

export function maskKnownPlacesForForbidden(text="", places=[]){
  if(!text || !Array.isArray(places) || places.length===0) {return text;}
  let n=normalizeAggressive(text);
  const repl=" localconhecido ";
  for(const p of places){
    const needle=normalizeAggressive(String(p||"")).trim();
    if(!needle) {continue;}
    n = n.split(needle).join(repl);
  }
  return n;
}

// Placas BR (antigas e Mercosul)
const RE_PLATE = /\b([A-Z]{3}[- ]?\d{4}|[A-Z]{3}\d[A-Z]\d{2})\b/gi;

export function anonymize(text=""){
  let out=String(text||"");
  out=out.replace(/\b(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}[-.\s]?\d{4}\b/g,"[telefone]");
  out=out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,"[email]");
  out=out.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,"[cpf]");
  out=out.replace(RE_PLATE,"[placa]");
  return out;
}
