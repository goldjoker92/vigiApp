import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

let _functions;
try {
  _functions = getFunctions(getApp());
} catch (e) {
  throw new Error("[observability/firebase_functions] Firebase app not initialized: " + e?.message);
}
export { _functions as functions, httpsCallable };
