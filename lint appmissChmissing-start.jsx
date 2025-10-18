[1mdiff --git a/app/missCh/missing-start.jsx b/app/missCh/missing-start.jsx[m
[1mindex fa9e5b8..040164c 100644[m
[1m--- a/app/missCh/missing-start.jsx[m
[1m+++ b/app/missCh/missing-start.jsx[m
[36m@@ -1,19 +1,30 @@[m
[32m+[m[32m// app/missing-start.jsx[m[41m[m
 // ============================================================================[m
[31m-// VigiApp — Flux unifié "Missing" (child/animal/object)[m
[31m-// SANS DRAFT — écriture directe dans /missingCases, validation heuristique locale,[m
[31m-// puis notification publique automatique (5 km enfant, 2 km animal/objet).[m
[32m+[m[32m// VigiApp — Flux "Missing" (child/animal/object)[m[41m[m
[32m+[m[32m// Version épurée + UX responsive + docs séparés (Responsável / Criança)[m[41m[m
[32m+[m[32m// Ajouts:[m[41m[m
[32m+[m[32m//  - Type de doc adulte: RG (F+V), Passaporte (1), RNE (F+V) [étrangers][m[41m[m
[32m+[m[32m//  - Type de doc enfant: Certidão (1), RG criança (F+V), Passaporte criança (1), RNE criança (F+V)[m[41m[m
[32m+[m[32m//  - Consent box: checkbox verte + contour + glow à l’activation[m[41m[m
[32m+[m[32m//  - Placeholders plus légers, espacements aérés, scroll/keyboard agréables[m[41m[m
[32m+[m[32m//  - Conservation de la logique (uploads id_front/id_back & link_front/link_back)[m[41m[m
 // ============================================================================[m
 [m
[31m-import React, { useEffect, useMemo, useRef, useReducer, useState, useCallback } from 'react';[m
[32m+[m[32mimport React, {[m[41m[m
[32m+[m[32m  useEffect, useMemo, useRef, useReducer, useState, useCallback,[m[41m[m
[32m+[m[32m} from 'react';[m[41m[m
 import {[m
   View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,[m
   Alert, Platform, KeyboardAvoidingView, Share, Linking,[m
 } from 'react-native';[m
 import * as Location from 'expo-location';[m
[32m+[m[32mimport * as ImagePicker from 'expo-image-picker';[m[41m[m
 import { useLocalSearchParams, useRouter } from 'expo-router';[m
 import { db, auth } from '../../firebase';[m
 import { doc, setDoc, Timestamp } from 'firebase/firestore';[m
[31m-import { TriangleAlert, User, FileCheck2, ImageIcon, ChevronLeft, Share2 } from 'lucide-react-native';[m
[32m+[m[32mimport {[m[41m[m
[32m+[m[32m  TriangleAlert, User, FileCheck2, ImageIcon, ChevronLeft, Share2, Check[m[41m[m
[32m+[m[32m} from 'lucide-react-native';[m[41m[m
 [m
 // Flux[m
 import { FLOW_RULES, getFlow } from '../../src/miss/lib/flowRules';[m
[36m@@ -33,15 +44,17 @@[m [mimport { validateClient } from '../../src/miss/lib/validations';[m
 // ---------------------------------------------------------------------------[m
 // Logger / Tracer[m
 // ---------------------------------------------------------------------------[m
[31m-const NS = '[MISSING/UNIFIED]';[m
[32m+[m[32mconst NS = '[MISSING/START]';[m[41m[m
 const nowTs = () => new Date().toISOString();[m
[31m-const newTraceId = (p = 'trace') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;[m
[32m+[m[32mconst newTraceId = (p = 'trace') =>[m[41m[m
[32m+[m[32m  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;[m[41m[m
 const msSince = (t0) => `${Math.max(0, Date.now() - t0)}ms`;[m
 const Log = {[m
   info: (...a) => console.log(NS, ...a),[m
   warn: (...a) => console.warn(NS, '⚠️', ...a),[m
   error: (...a) => console.error(NS, '❌', ...a),[m
[31m-  step: (traceId, step, extra = {}) => console.log(NS, 'STEP', step, { traceId, at: nowTs(), ...extra }),[m
[32m+[m[32m  step: (traceId, step, extra = {}) =>[m[41m[m
[32m+[m[32m    console.log(NS, 'STEP', step, { traceId, at: nowTs(), ...extra }),[m[41m[m
 };[m
 [m
 // ---------------------------------------------------------------------------[m
[36m@@ -51,7 +64,7 @@[m [mfunction useLiteToast() {[m
   const [msg, setMsg] = useState(null);[m
   const timer = useRef(null);[m
   const show = (text) => {[m
[31m-    if (timer.current) { clearTimeout(timer.current); } // reset timer[m
[32m+[m[32m    if (timer.current) { clearTimeout(timer.current); }[m[41m[m
     const s = String(text);[m
     Log.info('TOAST', s);[m
     setMsg(s);[m
[36m@@ -117,7 +130,7 @@[m [masync function cfFetch(url, opts = {}, { attempts = 2, baseDelay = 400 } = {}) {[m
     try {[m
       const resp = await fetch(url, opts);[m
       const json = await resp.json().catch(() => null);[m
[31m-      if (!resp.ok) { throw new Error(`HTTP_${resp.status}`); } // normalize errors[m
[32m+[m[32m      if (!resp.ok) { throw new Error(`HTTP_${resp.status}`); }[m[41m[m
       Log.info('CF/OK', { status: resp.status });[m
       return { ok: true, json, status: resp.status };[m
     } catch (e) {[m
[36m@@ -162,6 +175,19 @@[m [mconst isoToday = todayISO();[m
 const [Y, M, D] = isoToday.split('-');[m
 const initialDateBR = `${D}/${M}/${Y}`;[m
 [m
[32m+[m[32m// Types de documents (UX)[m[41m[m
[32m+[m[32mconst ADULT_ID_TYPES = [[m[41m[m
[32m+[m[32m  { key: 'rg', label: 'RG (frente + verso)' },[m[41m[m
[32m+[m[32m  { key: 'passport', label: 'Passaporte' },[m[41m[m
[32m+[m[32m  { key: 'rne', label: 'RNE (frente + verso)' }, // 💡 Étrangers au Brésil[m[41m[m
[32m+[m[32m];[m[41m[m
[32m+[m[32mconst CHILD_DOC_TYPES = [[m[41m[m
[32m+[m[32m  { key: 'certidao', label: 'Certidão de nascimento' },[m[41m[m
[32m+[m[32m  { key: 'rg_child', label: 'RG criança (frente + verso)' },[m[41m[m
[32m+[m[32m  { key: 'passport_child', label: 'Passaporte criança' },[m[41m[m
[32m+[m[32m  { key: 'rne_child', label: 'RNE criança (frente + verso)' }, // 💡 Étrangers[m[41m[m
[32m+[m[32m];[m[41m[m
[32m+[m[41m[m
 const initialForm = {[m
   // meta[m
   caseId: '',[m
[36m@@ -170,10 +196,20 @@[m [mconst initialForm = {[m
   // guardian / legal (child only)[m
   guardianName: '',[m
   cpfRaw: '',[m
[31m-  hasIdDoc: false,[m
[31m-  hasLinkDoc: false,[m
[31m-  idDocPath: '',[m
[31m-  linkDocPath: '',[m
[32m+[m[32m  adultIdType: 'rg',       // 'rg' | 'passport' | 'rne'[m[41m[m
[32m+[m[32m  childDocType: 'certidao', // 'certidao' | 'rg_child' | 'passport_child' | 'rne_child'[m[41m[m
[32m+[m[41m[m
[32m+[m[32m  // flags[m[41m[m
[32m+[m[32m  hasIdDocFront: false,[m[41m[m
[32m+[m[32m  hasIdDocBack: false,[m[41m[m
[32m+[m[32m  hasLinkDocFront: false,[m[41m[m
[32m+[m[32m  hasLinkDocBack: false,[m[41m[m
[32m+[m[41m[m
[32m+[m[32m  // paths[m[41m[m
[32m+[m[32m  idDocFrontPath: '',[m[41m[m
[32m+[m[32m  idDocBackPath: '',[m[41m[m
[32m+[m[32m  linkDocFrontPath: '',[m[41m[m
[32m+[m[32m  linkDocBackPath: '',[m[41m[m
 [m
   // entity (name differs by type)[m
   primaryName: '',[m
[36m@@ -222,7 +258,7 @@[m [mfunction makeCaseId() {[m
   return `mc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;[m
 }[m
 function ensureCaseId(currentId, dispatchRef) {[m
[31m-  if (currentId && String(currentId).trim()) { return String(currentId); } // keep provided id[m
[32m+[m[32m  if (currentId && String(currentId).trim()) { return String(currentId); }[m[41m[m
   const newId = makeCaseId();[m
   try { dispatchRef({ type: 'SET', key: 'caseId', value: newId }); } catch {}[m
   Log.info('CASE_ID/GENERATED', { newId });[m
[36m@@ -232,7 +268,8 @@[m [mfunction ensureCaseId(currentId, dispatchRef) {[m
 // ---------------------------------------------------------------------------[m
 // Validation heuristique + helpers[m
 // ---------------------------------------------------------------------------[m
[31m-// NOTE: screenTraceIdRef est utilisé ci-dessous ; défini plus bas puis injecté.[m
[32m+[m[32mlet screenTraceIdRef;[m[41m[m
[32m+[m[41m[m
 async function captureGeolocationOnce({ timeoutMs = 6000 } = {}) {[m
   const traceId = screenTraceIdRef.cu