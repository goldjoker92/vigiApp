// functions/mod_signals.ts (pseudo)
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

exports.modSignals_ingest = onCall((_ctx) => {
  /* validate + write raw */
});

exports.modSignals_rollupHour = onSchedule('every 60 minutes', async () => {
  // 1) read raw events for last hour
  // 2) aggregate by hash h (+scope uf/city)
  // 3) compute EWMA/z-score vs. trailing 24h
  // 4) write candidates with {h, uf, city, count, z, catHint}
});
