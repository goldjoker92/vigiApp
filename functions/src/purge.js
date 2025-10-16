// Purge & archive — Scheduler (Cloud Scheduler → Plan Blaze)
const { onSchedule } = require('firebase-functions/v2/scheduler');

module.exports.purgeAndArchiveOldRequestsAndChats = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'America/Fortaleza', // cohérent avec ton fuseau
  },
  async () => {
    try {
      // TODO: archiver/purger Firestore / Storage, etc.
      // await purgeAndArchive();
      console.warn('[purge] OK');
    } catch (e) {
      console.error('[purge] error', e);
    }
  },
);
