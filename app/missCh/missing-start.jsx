// ============================================================================
// MissingStart — flux "Missing": logs complets + read-after-write robuste (serveur confirmé)
// ============================================================================

import React, { useEffect, useMemo, useRef, useReducer, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Platform,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth, db } from '../../firebase';
import { Timestamp } from 'firebase/firestore';
import { TriangleAlert, ChevronLeft, Check, X, ChevronDown, ImageIcon, FileCheck2 } from 'lucide-react-native';

import { FLOW_RULES, getFlow } from '../../src/miss/lib/flowRules';
import { todayISO, onlyDigits } from '../../src/miss/lib/helpers';
import {
  uploadIdFront, uploadIdBack, uploadLinkFront, uploadLinkBack,
  uploadChildPhoto as uploadMainPhoto
} from '../../src/miss/lib/uploaders';
import { useSubmitGuard } from '../../src/miss/lib/useSubmitGuard';
import AgePolicyNotice from '../../src/miss/age/AgePolicyNotice';
import SubmitDisabledOverlay from '../../src/miss/lib/SubmitDisabledOverlay';
import { maskCPF } from '../../src/miss/lib/masks';
import { validateClient } from '../../src/miss/lib/validations';
import PlaygroundMini from '../../src/miss/lib/dev/PlaygroundMini';
import { writeMissingCaseOnce } from '../../src/miss/lib/firestoreWrite';
import { waitForServerCommit } from '../../src/miss/lib/helpers/firestoreWait'; // ★ nouveau

// ---------------------------------------------------------------------------
// LOG utils
// ---------------------------------------------------------------------------
const NS = '[MissingStart]';
const nowIso = () => new Date().toISOString();
const newTrace = (p='ms') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
const msSince = t0 => `${Math.max(0, Date.now()-t0)}ms`;
const L = {
  i: (...a)=>console.log(NS, ...a),
  w: (...a)=>console.warn(NS, '⚠', ...a),
  e: (...a)=>console.error(NS, '❌', ...a),
  step: (tid, step, extra={}) => console.log(NS, 'STEP', step, { traceId: tid, at: nowIso(), ...extra }),
};

// ---------------------------------------------------------------------------
// Dates helpers
// ---------------------------------------------------------------------------
const pad2 = n=>String(n).padStart(2,'0');
const isoToday = todayISO();
const [Y,M,D] = isoToday.split('-');
const initialDateShort = `${pad2(+D)}-${pad2(+M)}-${String(Y).slice(2)}`;

function maskDateShort(input){
  const d=String(input||'').replace(/[^\d]/g,'').slice(0,6);
  const a=d.slice(0,2), b=d.slice(2,4), c=d.slice(4,6);
  if(d.length<=2) {return a;}
  if(d.length<=4) {return `${a}-${b}`;}
  return `${a}-${b}-${c}`;
}
function normalizeDateShort(s){
  const m=/^(\d{1,2})-(\d{1,2})-(\d{2})$/.exec(s?.trim()||'');
  if(!m) {return s;}
  return `${pad2(+m[1])}-${pad2(+m[2])}-${m[3]}`;
}
function shortToISO(s, time='00:00'){
  const m=/^(\d{2})-(\d{2})-(\d{2})$/.exec(s?.trim()||''); if(!m) {return null;}
  const [_,dd,MM,yy]=m; const yyyy=Number(yy)<=79?`20${yy}`:`19${yy}`;
  return `${yyyy}-${MM}-${dd}T${time}:00.000Z`;
}
function maskDateBR(input){
  const d=String(input||'').replace(/[^\d]/g,'').slice(0,8);
  const a=d.slice(0,2), b=d.slice(2,4), c=d.slice(4,8);
  if(d.length<=2) {return a;}
  if(d.length<=4) {return `${a}/${b}`;}
  return `${a}/${b}/${c}`;
}
function normalizeDateBR(s){
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s||'').trim()); if(!m) {return s;}
  const p=n=>String(n).padStart(2,'0'); return `${p(+m[1])}/${p(+m[2])}/${m[3]}`;
}
function brDateToISO(d){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec((d||'').trim()); if(!m) {return null;}
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
}

// ---------------------------------------------------------------------------
// Lite toast
// ---------------------------------------------------------------------------
function useLiteToast(){
  const [msg,setMsg]=useState(null); const t=useRef(null);
  const show = s=>{
    if(t.current) {clearTimeout(t.current);}
    const text = String(s);
    L.i('TOAST', text);
    setMsg(text);
    t.current=setTimeout(()=>setMsg(null), 8000);
  };
  useEffect(()=>()=>t.current&&clearTimeout(t.current),[]);
  const Toast = !msg?null:(
    <View style={styles.toast}><Text style={styles.toastTxt}>{msg}</Text></View>
  );
  return {show, Toast};
}

// ---------------------------------------------------------------------------
// OSM autocomplete (Brésil focus + logs)
// ---------------------------------------------------------------------------
function useOSMStreetAutocomplete(traceId){
  const [qRua,setQRua]=useState(''); const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(false); const [locked,setLocked]=useState(false);
  const deb=useRef(null);

  useEffect(()=>{
    const txt=(qRua||'').trim();
    const should = (!locked && txt.length>=4) || (locked && txt.length>=7);
    if(!should){ setItems([]); return; }
    if(deb.current) {clearTimeout(deb.current);}
    deb.current=setTimeout(async()=>{
      setLoading(true);
      const url=`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=br&q=${encodeURIComponent(txt)}`;
      try{
        L.step(traceId,'OSM/FETCH',{q:txt});
        const resp = await fetch(url,{headers:{'Accept-Language':'pt-BR','User-Agent':'VigiApp/OSM'}});
        const json = await resp.json().catch(()=>[]);
        const mapped = (json||[]).map(r=>({
          id:r.place_id, label:r.display_name, addr:r.address||{}, lat:r.lat, lon:r.lon
        }));
        const nice = mapped.map(m=>{
          const a=m.addr||{};
          const rua=a.road||a.pedestrian||a.footway||a.cycleway||a.path||'';
          const cidade=a.city||a.town||a.village||a.municipality||'';
          const uf=(a.state_code||a.state||'').toString().slice(0,2).toUpperCase();
          return {...m, labelShort:[rua,[cidade,uf].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')};
        });
        setItems(nice);
        L.i('OSM/OK', {count:nice.length});
      }catch(e){
        L.w('OSM/ERR', e?.message||e);
        setItems([]);
      }finally{ setLoading(false); }
    }, 350);
    return ()=>deb.current&&clearTimeout(deb.current);
  },[qRua,locked,traceId]);

  const onPick=(it,dispatch)=>{
    const a=it.addr||{};
    dispatch({type:'BULK_SET', payload:{
      lastRua:a.road||a.pedestrian||a.footway||a.cycleway||a.path||'',
      lastNumero:a.house_number||'',
      lastCidade:a.city||a.town||a.village||a.municipality||'',
      lastUF:(a.state_code||a.state||'').toString().slice(0,2).toUpperCase(),
      lastCEP:a.postcode||'',
    }});
    setQRua(a.road||a.pedestrian||a.footway||a.cycleway||a.path||it.labelShort||'');
    setLocked(true); setItems([]);
    L.step(traceId,'OSM/PICK',{picked:it.labelShort||it.label});
  };

  const onEdit = txt=>{
    setQRua(txt);
    if(locked && txt.length<7) {return;}
    if(locked && txt.length>=7) {setLocked(false);}
  };

  return { qRua, setQRua:onEdit, items, loading, locked, setLocked, onPick };
}

// ---------------------------------------------------------------------------
// Form reducer
// ---------------------------------------------------------------------------
const initialForm = {
  caseId:'', type:'child',
  guardianName:'', cpfRaw:'', adultIdType:'rg', childDocType:'certidao',
  hasIdDocFront:false, hasIdDocBack:false, hasLinkDocFront:false, hasLinkDocBack:false,
  idDocFrontPath:'', idDocBackPath:'', linkDocFrontPath:'', linkDocBackPath:'',
  primaryName:'', childDobBR:'', childSex:'',
  lastSeenDateBR:initialDateShort, lastSeenTime:'',
  lastRua:'', lastNumero:'', lastCidade:'', lastUF:'', lastCEP:'',
  photoPath:'', description:'', extraInfo:'', consent:false,
};
function formReducer(state, action){
  switch(action.type){
    case 'SET': return {...state, [action.key]: action.value};
    case 'BULK_SET': return {...state, ...action.payload};
    default: return state;
  }
}
const makeCaseId = ()=>`mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const ensureCaseId = (id, dispatch)=>{
  if(id && String(id).trim()) {return String(id);}
  const nid = makeCaseId();
  try{ dispatch({type:'SET', key:'caseId', value:nid}); }catch{}
  return nid;
};

// ---------------------------------------------------------------------------
// GEO best-effort
// ---------------------------------------------------------------------------
async function captureGeolocationOnce(tid,{timeoutMs=6000}={}){
  L.step(tid,'GEO/BEGIN');
  try{
    const {status}=await Location.requestForegroundPermissionsAsync();
    if(status!=='granted'){ L.w('GEO/NO_PERMISSION'); return null; }
    const withTimeout=(p,ms)=>Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error('GEO_TIMEOUT')),ms))]);
    try{
      const pos=await withTimeout(Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}), timeoutMs);
      const g={lat:pos.coords.latitude,lng:pos.coords.longitude,t:Date.now()};
      L.step(tid,'GEO/OK', g); return g;
    }catch{
      const last=await Location.getLastKnownPositionAsync({maxAge:300000});
      if(last?.coords){
        const g={lat:last.coords.latitude,lng:last.coords.longitude,t:Date.now(),lastKnown:true};
        L.step(tid,'GEO/LAST_KNOWN', g); return g;
      }
      L.w('GEO/NONE'); return null;
    }
  }catch(e){ L.w('GEO/ERR', e?.message||e); return null; }
}

// ---------------------------------------------------------------------------
// Dropdown simple
// ---------------------------------------------------------------------------
const DocDropdown = ({label, valueKey, options, onSelect})=>{
  const [open,setOpen]=useState(false);
  const current=options.find(o=>o.key===valueKey);
  return (
    <View style={{marginTop:10}}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity onPress={()=>setOpen(o=>!o)} style={styles.dropdown}>
        <Text style={styles.dropdownTxt}>{current?.label||'Selecione'}</Text>
        <ChevronDown size={16} color="#cfd3db" />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownMenu}>
          {options.map(opt=>(
            <TouchableOpacity key={opt.key} style={styles.dropdownItem}
              onPress={()=>{ onSelect(opt.key); setOpen(false); }}>
              <Text style={styles.dropdownItemTxt}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const ADULT_ID_TYPES=[{key:'rg',label:'RG (F+V)'},{key:'passport',label:'Passaporte'},{key:'rne',label:'RNE (F+V)'}];
const CHILD_DOC_TYPES=[{key:'certidao',label:'Certidão'},{key:'rg_child',label:'RG criança (F+V)'},{key:'passport_child',label:'Passaporte criança'},{key:'rne_child',label:'RNE criança (F+V)'}];

// ============================================================================
// Component
// ============================================================================
export default function MissingStart(){
  const traceIdRef = useRef(newTrace('submit'));
  const mountTsRef = useRef(Date.now());

  const router=useRouter();
  const params=useLocalSearchParams();
  const routeType=String(params?.type||'child').toLowerCase();
  const type=['child','animal','object'].includes(routeType)?routeType:'child';
  const flow=getFlow(type);

  const [{caseId,...form}, dispatch]=useReducer(formReducer, {...initialForm, type, caseId:String(params?.caseId||'')});
  const { guard, running, withBackoff } = useSubmitGuard({ cooldownMs: 1000, maxParallel: 1 });
  const { show, Toast } = useLiteToast();

  // uploads
  const [uploadPct,setUploadPct]=useState({photo:0,id_front:0,id_back:0,link_front:0,link_back:0});
  const [uploading,setUploading]=useState({photo:false,id_front:false,id_back:false,link_front:false,link_back:false});
  const aborters=useRef({photo:null,id_front:null,id_back:null,link_front:null,link_back:null});

  useEffect(()=>{
    L.i('MOUNT', {traceId:traceIdRef.current, type, caseId:caseId||'(none)'});
    return ()=>L.w('UNMOUNT', {alive:msSince(mountTsRef.current)});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // OSM
  const streetAuto=useOSMStreetAutocomplete(traceIdRef.current);
  useEffect(()=>{ if(!streetAuto.locked && form.lastRua && streetAuto.qRua!==form.lastRua) streetAuto.setQRua(form.lastRua); },[form.lastRua]); // eslint-disable-line

  // pick/upload
  const setPct=(k,v)=>setUploadPct(s=>({...s,[k]:Math.max(0,Math.min(100,v||0))}));
  const setBusy=(k,v)=>setUploading(s=>({...s,[k]:!!v}));
  const cancelUpload=k=>{
    try{ aborters.current[k]?.abort(); aborters.current[k]=null; setBusy(k,false); setPct(k,0); show('Upload cancelado.'); L.w('UPLOAD/CANCEL',{k}); }catch{}
  };
  async function pickFromLibrary(kind){
    try{
      const perm=await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if(perm && !perm.granted){ show('Sem permissão para galeria'); return null; }
      const res=await ImagePicker.launchImageLibraryAsync({mediaTypes:ImagePicker.MediaTypeOptions.Images,quality:0.9,exif:false,selectionLimit:1});
      if(res?.canceled || !res?.assets?.length) {return null;}
      const a=res.assets[0]; const uri=a.uri;
      const fileName=a.fileName||a.filename||`upload_${Date.now()}.jpg`;
      const lower=(uri||'').toLowerCase();
      let mime=a.mimeType||(a.type==='image'?'image/jpeg':'application/octet-stream');
      if(lower.endsWith('.png')) {mime='image/png';}
      else if(lower.endsWith('.webp')) {mime='image/webp';}
      L.step(traceIdRef.current,'UPLOAD/PICK',{kind, fileName, mime});
      return {uri,fileName,mime,kind};
    }catch(e){ L.w('UPLOAD/PICK_ERR', e?.message||e); show('Falha ao acessar a galeria.'); return null; }
  }
  async function onUpload(kind){
    if(uploading[kind]) {return cancelUpload(kind);}
    const picked=await pickFromLibrary(kind); if(!picked) {return;}
    const ensuredId=ensureCaseId(caseId, dispatch);
    const ctrl=new AbortController(); aborters.current[kind]=ctrl; setPct(kind,0); setBusy(kind,true);
    try{
      const common={...picked, caseId:String(ensuredId), onProgress:p=>setPct(kind,p), signal:ctrl.signal};
      let out;
      if(kind==='photo') {out=await uploadMainPhoto(common);}
      else if(kind==='id_front') {out=await uploadIdFront(common);}
      else if(kind==='id_back') {out=await uploadIdBack(common);}
      else if(kind==='link_front') {out=await uploadLinkFront(common);}
      else if(kind==='link_back') {out=await uploadLinkBack(common);}
      if(!out?.url){ L.w('UPLOAD/NO_URL',{kind}); show('Falha no upload.'); return; }
      L.step(traceIdRef.current,'UPLOAD/OK',{kind, path:out.path});
      // set form
      if(kind==='photo') {dispatch({type:'BULK_SET', payload:{photoPath:out.url, photoStoragePath:out.path, caseId:ensuredId}});}
      if(kind==='id_front') {dispatch({type:'BULK_SET', payload:{hasIdDocFront:true,idDocFrontPath:out.url, caseId:ensuredId}});}
      if(kind==='id_back') {dispatch({type:'BULK_SET', payload:{hasIdDocBack:true,idDocBackPath:out.url, caseId:ensuredId}});}
      if(kind==='link_front') {dispatch({type:'BULK_SET', payload:{hasLinkDocFront:true,linkDocFrontPath:out.url, caseId:ensuredId}});}
      if(kind==='link_back') {dispatch({type:'BULK_SET', payload:{hasLinkDocBack:true,linkDocBackPath:out.url, caseId:ensuredId}});}
      setPct(kind,100);
    }catch(e){ if(e?.name!=='AbortError'){ L.e('UPLOAD/ERR',{kind, err:e?.message||e}); show('Erro no upload.'); } }
    finally{
      setBusy(kind,false); aborters.current[kind]=null;
      setTimeout(()=>{ if(uploadPct[kind]===100) {setPct(kind,0);} },800);
    }
  }

  // validation state
  const buildPayload = useCallback(()=>{
    const p = {
      type,
      guardianName: form.guardianName, cpfRaw: form.cpfRaw,
      childFirstName: form.primaryName, childDobBR: form.childDobBR, childSex: form.childSex,
      lastCidade: form.lastCidade, lastUF: String(form.lastUF||'').toUpperCase(),
      contextDesc: form.description, extraInfo: form.extraInfo,
      hasIdDoc: !!(form.hasIdDocFront||form.hasIdDocBack||form.idDocFrontPath||form.idDocBackPath),
      hasLinkDoc: !!(form.hasLinkDocFront||form.hasLinkDocBack||form.linkDocFrontPath||form.linkDocBackPath),
      photoPath: form.photoPath, consent: form.consent,
    };
    return p;
  },[type,form]);
  const payload = useMemo(()=>buildPayload(),[buildPayload]);
  const diag = useMemo(()=>validateClient(payload,{ns:'btn_state'}),[payload]);
  const canSubmit = diag.ok;

  // submit
  const onSubmit = useCallback(async ()=>{
    const tid=traceIdRef.current;
    L.step(tid,'SUBMIT/BEGIN',{type, user: auth.currentUser?.uid||'(anon)'});
    const v = validateClient(payload,{ns:'submit_click'});
    if(!v.ok){ L.w('SUBMIT/VALIDATE_KO', v); Alert.alert('Rejeitado', v.msg||'Dados insuficientes.'); return; }

    // uploads en cours ?
    if(Object.values(uploading).some(Boolean)){ L.w('SUBMIT/WAIT_UPLOAD'); Alert.alert('Aguarde','Upload em andamento.'); return; }

    try{
      const ensuredId=ensureCaseId(caseId, dispatch);
      L.step(tid,'SUBMIT/CASE_ID',{ensuredId});
      const geo=await captureGeolocationOnce(tid); // best-effort

      const lastSeenISO = form.lastSeenDateBR ? shortToISO(normalizeDateShort(form.lastSeenDateBR), form.lastSeenTime||'00:00') : null;
      const childDobISO = form.childDobBR ? brDateToISO(normalizeDateBR(form.childDobBR)) : null;

      const validated = {
        kind:type,
        ownerId: auth.currentUser?.uid || 'anon',
        media: { photoRedacted: form.photoPath||'', photoStoragePath: form.photoStoragePath||'' },
        primary: { name: form.primaryName||'' },
        lastSeenAt: lastSeenISO,
        lastKnownAddress: {
          rua: form.lastRua||'', numero: form.lastNumero||'',
          cidade: form.lastCidade||'', uf:String(form.lastUF||'').toUpperCase(),
          cep: form.lastCEP||'',
        },
        context: { description: form.description||'', extraInfo: form.extraInfo||'' },
        guardian: type==='child' ? {
          fullName: form.guardianName?.trim()||'',
          cpfRaw: onlyDigits(form.cpfRaw),
          idType: form.adultIdType, childDocType: form.childDocType,
          childDobISO,
          docs:{
            idDocFrontRedacted: form.idDocFrontPath||'',
            idDocBackRedacted: form.idDocBackPath||'',
            linkDocFrontRedacted: form.linkDocFrontPath||'',
            linkDocBackRedacted: form.linkDocBackPath||'',
          }
        } : undefined,
        consent: !!form.consent,
        status:'validated', statusReasons:[], statusWarnings:v.warnings||[],
        submitMeta:{ geo: geo||null, submittedAt: Timestamp.now() }, updatedAt: Timestamp.now(),
      };

      // WRITE (transaction idempotente)
      L.step(tid,'WRITE/BEGIN',{doc:`missingCases/${ensuredId}`});
      const res = await writeMissingCaseOnce(ensuredId, validated);
      L.step(tid,'WRITE/OK', res);

      // READ-AFTER-WRITE ROBUSTE: attendre confirmation serveur
      L.step(tid,'VERIFY/WAIT_SERVER',{id: ensuredId});
      const data = await waitForServerCommit(ensuredId, 5000);
      L.step(tid,'VERIFY/OK',{ownerId:data?.ownerId, kind:data?.kind, city:data?.lastKnownAddress?.cidade});

      if(Array.isArray(v.warnings) && v.warnings.length){
        show(`Validado com avisos (${v.warnings.length}).`);
      }else{
        show('Validado ✅ — salvo na base.');
      }

      L.step(tid,'SUBMIT/DONE');
      setTimeout(()=>router.replace({pathname:'/(tabs)/home'}), 500);

    }catch(e){
      L.e('SUBMIT/ERR', e?.message||e);
      Alert.alert('Erro','Falha ao enviar. Veja logs.');
    }
  },[payload,type,form,caseId,uploading,router,show]);

  // UI bits
  const needsAdultBack = ['rg','rne'].includes(form.adultIdType);
  const needsChildBack = ['rg_child','rne_child'].includes(form.childDocType);
  const needsChildFront = ['certidao','rg_child','passport_child','rne_child'].includes(form.childDocType);

  const ProgressInline = ({kind})=>{
    const pct=uploadPct[kind]||0, up=uploading[kind];
    if(!up && pct===0) {return null;}
    return (
      <View style={styles.pWrap}>
        <View style={[styles.pBar,{width:`${pct}%`}]} />
        <Text style={styles.pTxt}>{pct}%</Text>
        {up ? <TouchableOpacity onPress={()=>cancelUpload(kind)} style={styles.pCancel}><X size={14} color="#e5e7eb"/></TouchableOpacity> : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.select({ios:'padding',android:undefined})} style={{flex:1}}>
      <View style={styles.page}>
        <View style={{position:'absolute',top:0,left:0,right:0}}>{Toast}</View>

        <View style={styles.topbar}>
          <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}>
            <ChevronLeft color="#fff" size={22}/><Text style={styles.backTxt}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>{FLOW_RULES[type]?.title||'Missing'}</Text>
          <View style={{width:60}}/>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.alertCard}>
            <TriangleAlert color="#111827" size={18} style={{marginRight:8}}/>
            <Text style={styles.alertMsg}>Uso responsável. Boa fé. VigiApp não substitui autoridades.</Text>
          </View>

          {/* ADULTE */}
          {type==='child' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Documentos do responsável</Text>
              <Text style={styles.cardSubtitle}>Para RG/RNE: frente e verso.</Text>

              <DocDropdown label="Tipo (adulto)" valueKey={form.adultIdType} options={ADULT_ID_TYPES}
                onSelect={k=>dispatch({type:'SET', key:'adultIdType', value:k})}/>

              <View style={{marginTop:10}}>
                <TextInput style={styles.input} placeholder="Nome completo do responsável" placeholderTextColor="#9aa0a6"
                  value={form.guardianName} onChangeText={v=>dispatch({type:'SET', key:'guardianName', value:v})} autoCapitalize="words"/>
              </View>
              <View style={{marginTop:10}}>
                <TextInput style={styles.input} placeholder="CPF (somente números)" placeholderTextColor="#9aa0a6" keyboardType="number-pad"
                  value={form.cpfRaw} maxLength={14}
                  onChangeText={t=>dispatch({type:'SET', key:'cpfRaw', value:maskCPF(t)})}
                  onBlur={()=>dispatch({type:'SET', key:'cpfRaw', value:maskCPF(form.cpfRaw)})}/>
              </View>

              <AgePolicyNotice dobBR={form.childDobBR}/>

              <View style={{marginTop:10}}>
                <TouchableOpacity style={[styles.btnGhost, form.hasIdDocFront&&styles.btnOk, uploading.id_front&&styles.btnBusy]} onPress={()=>onUpload('id_front')}>
                  <FileCheck2 color={form.hasIdDocFront?'#22C55E':'#7dd3fc'} size={16}/><Text style={styles.btnTxt}>Documento (frente)</Text>
                </TouchableOpacity>
                <ProgressInline kind="id_front"/>
                {needsAdultBack && (
                  <>
                    <TouchableOpacity style={[styles.btnGhost, form.hasIdDocBack&&styles.btnOk, uploading.id_back&&styles.btnBusy]} onPress={()=>onUpload('id_back')}>
                      <FileCheck2 color={form.hasIdDocBack?'#22C55E':'#7dd3fc'} size={16}/><Text style={styles.btnTxt}>Documento (verso)</Text>
                    </TouchableOpacity>
                    <ProgressInline kind="id_back"/>
                  </>
                )}
              </View>
            </View>
          )}

          {/* ENFANT */}
          {type==='child' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Documento da criança (vínculo)</Text>
              <Text style={styles.cardSubtitle}>Certidão/Passaporte (1) ou RG/RNE (F+V)</Text>

              <DocDropdown label="Tipo (criança)" valueKey={form.childDocType} options={CHILD_DOC_TYPES}
                onSelect={k=>dispatch({type:'SET', key:'childDocType', value:k})}/>

              {needsChildFront && (
                <>
                  <TouchableOpacity style={[styles.btnGhost, form.hasLinkDocFront&&styles.btnOk, uploading.link_front&&styles.btnBusy]} onPress={()=>onUpload('link_front')}>
                    <FileCheck2 color={form.hasLinkDocFront?'#22C55E':'#7dd3fc'} size={16}/><Text style={styles.btnTxt}>Peça (frente)</Text>
                  </TouchableOpacity>
                  <ProgressInline kind="link_front"/>
                </>
              )}
              {needsChildBack && (
                <>
                  <TouchableOpacity style={[styles.btnGhost, form.hasLinkDocBack&&styles.btnOk, uploading.link_back&&styles.btnBusy]} onPress={()=>onUpload('link_back')}>
                    <FileCheck2 color={form.hasLinkDocBack?'#22C55E':'#7dd3fc'} size={16}/><Text style={styles.btnTxt}>Peça (verso)</Text>
                  </TouchableOpacity>
                  <ProgressInline kind="link_back"/>
                </>
              )}
            </View>
          )}

          {/* IDENTITÉ */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{type==='animal'?'Animal':type==='object'?'Objeto':'Criança'}</Text>
            <Text style={styles.cardSubtitle}>
              {type==='animal'?'Nome e sinais ajudam.':type==='object'?'Ex.: iPhone 13, mochila preta…':'Primeiro nome ajuda a circulação.'}
            </Text>

            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder={type==='animal'?'Nome do animal':type==='object'?'Objeto':'Primeiro nome da criança'}
                placeholderTextColor="#9aa0a6" value={form.primaryName}
                onChangeText={v=>dispatch({type:'SET', key:'primaryName', value:v})} autoCapitalize="words"/>
            </View>

            {type==='child' && (
              <>
                <View style={{marginTop:10}}>
                  <TextInput style={styles.input} placeholder="Data de nascimento (dd/MM/aaaa)" placeholderTextColor="#9aa0a6"
                    keyboardType="number-pad" value={form.childDobBR} maxLength={10}
                    onChangeText={v=>dispatch({type:'SET', key:'childDobBR', value:maskDateBR(v)})}
                    onBlur={()=>dispatch({type:'SET', key:'childDobBR', value:normalizeDateBR(form.childDobBR||'')})}/>
                </View>
                <View style={styles.sexoRow}>
                  {['F','M'].map(s=>(
                    <TouchableOpacity key={s} style={[styles.chip, s==='F'?styles.chipF:styles.chipM, form.childSex===s && (s==='F'?styles.chipFOn:styles.chipMOn)]}
                      onPress={()=>dispatch({type:'SET', key:'childSex', value:s})}>
                      <Text style={styles.chipTxt}>{s==='M'?'Menino':'Menina'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>

          {/* OÙ/QUAND */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Onde e quando</Text>
            <Text style={styles.cardSubtitle}>Preencha o que souber.</Text>

            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder="Data (dd-MM-aa)" placeholderTextColor="#9aa0a6"
                value={form.lastSeenDateBR}
                onChangeText={v=>dispatch({type:'SET', key:'lastSeenDateBR', value:maskDateShort(v)})}
                onBlur={()=>dispatch({type:'SET', key:'lastSeenDateBR', value:normalizeDateShort(form.lastSeenDateBR||'')})}
                maxLength={8} keyboardType="number-pad"/>
            </View>
            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder="Hora (HH:mm)" placeholderTextColor="#9aa0a6"
                value={form.lastSeenTime} onChangeText={v=>dispatch({type:'SET', key:'lastSeenTime', value:v})}
                maxLength={5} keyboardType="number-pad"/>
            </View>

            {/* Rua + OSM */}
            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder="Rua" placeholderTextColor="#9aa0a6"
                value={streetAuto.qRua}
                onChangeText={txt=>{ streetAuto.setQRua(txt); dispatch({type:'SET', key:'lastRua', value:txt}); }}/>
              {streetAuto.loading ? (
                <View style={styles.osmRow}><ActivityIndicator/><Text style={{color:'#cfd3db'}}>Buscando…</Text></View>
              ):null}
              {streetAuto.items.length>0 && (
                <View style={styles.dropdownMenu}>
                  {streetAuto.items.map(it=>(
                    <TouchableOpacity key={it.id} style={styles.dropdownItem} onPress={()=>streetAuto.onPick(it, dispatch)}>
                      <Text style={styles.dropdownItemTxt}>{it.labelShort}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder="Número" placeholderTextColor="#9aa0a6"
                value={form.lastNumero} onChangeText={v=>dispatch({type:'SET', key:'lastNumero', value:v})}
                keyboardType="number-pad"/>
            </View>
            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder="Cidade" placeholderTextColor="#9aa0a6"
                value={form.lastCidade} onChangeText={v=>dispatch({type:'SET', key:'lastCidade', value:v})} autoCapitalize="words"/>
            </View>
            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder="UF" placeholderTextColor="#9aa0a6"
                value={form.lastUF} onChangeText={v=>dispatch({type:'SET', key:'lastUF', value:String(v).toUpperCase()})}
                autoCapitalize="characters" maxLength={2}/>
            </View>
            <View style={{marginTop:10}}>
              <TextInput style={styles.input} placeholder="CEP" placeholderTextColor="#9aa0a6"
                value={form.lastCEP} onChangeText={v=>dispatch({type:'SET', key:'lastCEP', value:v})}
                keyboardType="number-pad"/>
            </View>
          </View>

          {/* PHOTO */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Foto</Text>
            <Text style={styles.cardSubtitle}>De preferência recente e nítida.</Text>

            <View style={{marginTop:10}}>
              <TouchableOpacity style={[styles.btnGhost, form.photoPath&&styles.btnOk, uploading.photo&&styles.btnBusy]} onPress={()=>onUpload('photo')}>
                <ImageIcon color={form.photoPath?'#22C55E':'#9aa0a6'} size={16}/><Text style={styles.btnTxt}>{form.photoPath?'Foto anexada ✅':'Anexar foto'}</Text>
              </TouchableOpacity>
              <ProgressInline kind="photo"/>
            </View>
          </View>

          {/* DÉTAILS */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Detalhes</Text>
            <Text style={styles.cardSubtitle}>Ajude quem vê a reconhecer.</Text>

            <View style={{marginTop:10}}>
              <TextInput style={[styles.input,styles.multiline]} placeholder="Descrição…" placeholderTextColor="#9aa0a6"
                value={form.description} onChangeText={v=>dispatch({type:'SET', key:'description', value:v})} multiline/>
            </View>
            <View style={{marginTop:10}}>
              <TextInput style={[styles.input,styles.multiline]} placeholder="Informações complementares…" placeholderTextColor="#9aa0a6"
                value={form.extraInfo} onChangeText={v=>dispatch({type:'SET', key:'extraInfo', value:v})} multiline/>
            </View>
          </View>

          {/* CONSENT */}
          <TouchableOpacity activeOpacity={0.9}
            style={[styles.consent, form.consent&&styles.consentOn]}
            onPress={()=>dispatch({type:'SET', key:'consent', value:!form.consent})}>
            <View style={[styles.checkbox, form.consent&&styles.checkboxOn]}>{form.consent?<Check size={16} color="#0f172a"/>:null}</View>
            <Text style={styles.consentTxt}>{flow.consentLabel}</Text>
          </TouchableOpacity>

          {/* CTA */}
          <View style={{position:'relative'}}>
            <TouchableOpacity style={[styles.primaryBtn,{backgroundColor:canSubmit?'#22C55E':'#374151'}]}
              onPress={guard('submit',()=>withBackoff(onSubmit,{attempts:2, baseDelay:600}))}
              disabled={!canSubmit || running('submit') || Object.values(uploading).some(Boolean)}>
              <Text style={styles.primaryTxt}>{running('submit')?'Enviando…':'Enviar'}</Text>
            </TouchableOpacity>
            <SubmitDisabledOverlay disabled={!canSubmit || running('submit') || Object.values(uploading).some(Boolean)}
              onExplain={()=>{
                const v=validateClient(buildPayload(),{ns:'explain'});
                if(v.reasons?.length){
                  const txt=`🚫 Campos obrigatórios:\n• ${v.reasons.join('\n• ')}`; show(txt); L.i('VALIDATE/KO', v.reasons);
                }
              }}/>
          </View>

          <View style={{height:24}}/>
          {__DEV__ && <PlaygroundMini/>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  page:{flex:1, backgroundColor:'#0b0f14'},
  topbar:{paddingTop:Platform.select({ios:14,android:10,default:12}), paddingHorizontal:14, paddingBottom:8, flexDirection:'row', alignItems:'center', borderBottomColor:'#111827', borderBottomWidth:StyleSheet.hairlineWidth},
  backBtn:{flexDirection:'row', alignItems:'center', paddingVertical:6, paddingRight:8}, backTxt:{color:'#e5e7eb', marginLeft:4, fontSize:15},
  topTitle:{color:'#e5e7eb', fontSize:16, fontWeight:'700', flex:1, textAlign:'center'},
  scroll:{padding:16, paddingBottom:40},
  alertCard:{flexDirection:'row', backgroundColor:'#fef3c7', padding:10, borderRadius:12, alignItems:'center', marginBottom:10},
  alertMsg:{color:'#111827', fontSize:13},
  card:{backgroundColor:'#0e141b', borderRadius:14, padding:14, borderWidth:1, borderColor:'#17202a', marginBottom:12},
  cardTitle:{color:'#f3f4f6', fontSize:15, fontWeight:'800'}, cardSubtitle:{color:'#9aa0a6', fontSize:12, marginTop:2},
  input:{borderWidth:1, borderColor:'#1f2a35', backgroundColor:'#0b1117', color:'#e5e7eb', paddingVertical:11, paddingHorizontal:12, borderRadius:12},
  multiline:{height:96, textAlignVertical:'top'},
  label:{color:'#cfd3db', fontSize:13, marginBottom:6},
  sexoRow:{flexDirection:'row', gap:10, marginTop:10}, chip:{borderRadius:18, paddingVertical:8, paddingHorizontal:12},
  chipF:{backgroundColor:'#241b24', borderWidth:2, borderColor:'#f472b6'}, chipFOn:{backgroundColor:'#f472b6', borderColor:'#f472b6'},
  chipM:{backgroundColor:'#231a1a', borderWidth:2, borderColor:'#ef4444'}, chipMOn:{backgroundColor:'#ef4444', borderColor:'#ef4444'},
  chipTxt:{color:'#fff', fontWeight:'700'},

  dropdown:{flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderWidth:1, borderColor:'#1f2a35', backgroundColor:'#0b1117', borderRadius:12, paddingVertical:12, paddingHorizontal:12},
  dropdownTxt:{color:'#cfd3db', fontWeight:'600'},
  dropdownMenu:{marginTop:6, backgroundColor:'#0b1117', borderWidth:1, borderColor:'#1f2a35', borderRadius:12, overflow:'hidden'},
  dropdownItem:{paddingVertical:10, paddingHorizontal:12, borderTopColor:'#15202b', borderTopWidth:StyleSheet.hairlineWidth},
  dropdownItemTxt:{color:'#cfd3db'},

  btnGhost:{backgroundColor:'#0b1117', borderWidth:1, borderColor:'#1f2a35', borderRadius:12, paddingVertical:10, paddingHorizontal:12, flexDirection:'row', alignItems:'center', gap:8, justifyContent:'center'},
  btnOk:{borderColor:'#22C55E'}, btnBusy:{opacity:0.9, borderColor:'#3b82f6'}, btnTxt:{color:'#cfd3db', fontWeight:'600'},

  pWrap:{position:'relative', marginTop:6, height:14, borderRadius:10, backgroundColor:'#0b1117', borderWidth:1, borderColor:'#1f2a35', overflow:'hidden'},
  pBar:{position:'absolute', left:0, top:0, bottom:0, backgroundColor:'#22C55E'},
  pTxt:{textAlign:'center', color:'#e5e7eb', fontSize:11, lineHeight:14, fontWeight:'700'}, pCancel:{position:'absolute', right:6, top:-12, padding:6},

  consent:{marginTop:4, marginBottom:8, backgroundColor:'#0b1117', borderColor:'#233244', borderWidth:1, borderRadius:14, padding:12, flexDirection:'row', gap:10, alignItems:'center'},
  consentOn:{borderColor:'#22C55E', shadowColor:'#22C55E', shadowOpacity:0.4, shadowRadius:6},
  checkbox:{width:20, height:20, borderRadius:6, borderWidth:2, borderColor:'#6b7280', alignItems:'center', justifyContent:'center'},
  checkboxOn:{borderColor:'#16a34a', backgroundColor:'#22C55E'}, consentTxt:{color:'#cfd3db', flex:1, fontSize:13, lineHeight:18},

  primaryBtn:{marginTop:10, borderRadius:12, paddingVertical:14, alignItems:'center'}, primaryTxt:{color:'#0b0f14', fontWeight:'800', fontSize:16},

  toast:{position:'absolute', top:Platform.select({ios:66,android:48,default:56}), left:10,right:10, backgroundColor:'#0e141b', borderColor:'#17202a', borderWidth:1, paddingVertical:10, paddingHorizontal:12, borderRadius:12, zIndex:999},
  toastTxt:{color:'#fff', textAlign:'center', fontWeight:'700'},

  osmRow:{flexDirection:'row', alignItems:'center', gap:8, paddingVertical:6},
});
