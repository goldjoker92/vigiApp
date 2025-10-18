/**
 * scripts/gcs-lifecycle.js
 * Applique une Lifecycle Policy GCS :
 *   - Delete objets sous "missing/" après 30 jours (Age >= 30).
 *
 * Prend le bucket dans, par ordre :
 *   --bucket=...  |  env UPLOAD_BUCKET  |  env PROJECT_ID => "<PROJECT_ID>.appspot.com"
 *
 * Usage:
 *   node -r dotenv/config scripts/gcs-lifecycle.js
 *   node -r dotenv/config scripts/gcs-lifecycle.js --bucket=vigiapp-c7108.appspot.com
 */

const { Storage } = require('@google-cloud/storage');

const argv = process.argv.slice(2);
const getFlag = (name, def = null) => {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) {
    return def;
  }
  if (hit.includes('=')) {
    return hit.split('=').slice(1).join('=');
  }
  return true;
};

(async () => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID;
  const bucketName =
    getFlag('bucket', process.env.UPLOAD_BUCKET || (projectId ? `${projectId}.appspot.com` : null));
  const days = 30;                 // ✅ rétention fixée à 30 jours
  const prefix = 'missing/';       // ✅ ne touche que les objets sous this prefix

  if (!bucketName) {
    console.error('[LIFECYCLE][ERR] Missing bucket (set --bucket or UPLOAD_BUCKET or PROJECT_ID)');
    process.exit(1);
  }

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  console.log('[LIFECYCLE] Bucket =', bucketName);
  console.log('[LIFECYCLE] Rule  = Delete if age >=', days, 'days, prefix =', prefix);

  // Lire config actuelle (pour log)
  const [metaBefore] = await bucket.getMetadata().catch(() => [{}]);
  const beforeRules = metaBefore?.lifecycle?.rule || [];
  console.log('[LIFECYCLE] Current rules:', JSON.stringify(beforeRules, null, 2));

  // Règles nouvelles (remplace les existantes pour faire simple & déterministe)
  const newRules = [
    { action: { type: 'Delete' }, condition: { age: days, matchesPrefix: [prefix] } },
  ];

  await bucket.setMetadata({ lifecycle: { rule: newRules } });
  const [metaAfter] = await bucket.getMetadata();
  const afterRules = metaAfter?.lifecycle?.rule || [];
  console.log('[LIFECYCLE] New rules:', JSON.stringify(afterRules, null, 2));
  console.log('[LIFECYCLE] ✅ Applied.');
})().catch(err => {
  console.error('[LIFECYCLE][ERR]', err?.stack || err?.message || err);
  process.exit(1);
});
