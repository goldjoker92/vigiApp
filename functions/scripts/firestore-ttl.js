// functions/scripts/firestore-ttl.js
// Active la TTL sur la collection group `uploads_idem`, champ `expireAt`.
// - Ne PAS envoyer state: "ENABLED" (output only) -> juste ttl_config: {}
// - Attend l'operation jusqu'au "done"
// Requiert: google-auth-library, dotenv (déjà installés)

const { GoogleAuth } = require('google-auth-library');

const PROJECT_ID = process.env.PROJECT_ID;
if (!PROJECT_ID) {
  console.error('[TTL] PROJECT_ID manquant dans .env');
  process.exit(1);
}

const DB = '(default)';
const CG = 'uploads_idem';
const FIELD = 'expireAt'; // simple field name -> pas besoin d’échappement

const FIELD_NAME = `projects/${PROJECT_ID}/databases/${DB}/collectionGroups/${CG}/fields/${FIELD}`;
const PATCH_URL = `https://firestore.googleapis.com/v1/${FIELD_NAME}?updateMask=ttl_config`;
const OPS_BASE = 'https://firestore.googleapis.com/v1/';

async function main() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/datastore'],
  });
  const client = await auth.getClient();

  // 1) PATCH ttl_config: {}
  const body = { ttlConfig: {} }; // <-- le bon pattern (PAS de "state")
  console.log('[TTL] PATCH', { url: PATCH_URL, body });

  const res = await client.request({
    url: PATCH_URL,
    method: 'PATCH',
    data: body,
  });

  if (!res.data || !res.data.name) {
    console.error('[TTL] Réponse inattendue', res.data);
    process.exit(2);
  }

  const opName = res.data.name; // long-running operation
  console.log('[TTL] Operation démarrée', { opName });

  // 2) Poll jusqu'à done
  const started = Date.now();
  const timeoutMs = 60_000; // 60s
  const backoff = () => new Promise((r) => setTimeout(r, 1200));

  while (true) {
    const op = await client.request({ url: OPS_BASE + opName, method: 'GET' });
    const { done, error } = op.data || {};
    if (error) {
      console.error('[TTL] Operation error', error);
      process.exit(3);
    }
    if (done) {
      break;
    }
    if (Date.now() - started > timeoutMs) {
      console.warn('[TTL] Timeout d’attente, réessaie plus tard (l’op continue côté serveur)');
      break;
    }
    await backoff();
  }

  console.log('[TTL] ✅ TTL activée sur', { collectionGroup: CG, field: FIELD });
}

main().catch((e) => {
  console.error('[TTL] Échec', e?.response?.data || e?.message || e);
  process.exit(10);
});
