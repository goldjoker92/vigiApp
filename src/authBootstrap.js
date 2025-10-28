// authBootstrap.js
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase';

export function ensureAuthOnBoot() {
  onAuthStateChanged(auth, async (u) => {
    console.log('[AUTH] onAuthStateChanged', u?.uid || '(null)');
    if (!u) {
      try {
        await signInAnonymously(auth);
        console.log('[AUTH] signed-in anonymously ✅');
      } catch (e) {
        console.warn('[AUTH] anon FAIL ❌', e.code, e.message);
      }
    }
  });
}
