// scripts/husky-report-single.js
// Usage: node scripts/husky-report-single.js --hook pre-commit
// Lit stdin (optionnel), prepend une entrée, garde 30 max, newest on top.

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const hook = (args.find((a) => a.startsWith('--hook')) || '').split('=')[1] || 'unknown';
const REPORT_FILE = path.resolve(process.cwd(), 'husky_report.md');
const MAX_ENTRIES = 30;

// Helper: split entries by separator
function splitEntries(md) {
  const parts = md
    .split('\n---\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
}

// Helper: render one entry
function renderEntry({ hook, body }) {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').replace('Z', ' UTC');
  return `## ${hook.toUpperCase()} — ${ts}

${body || '_no details_'}`;
}

// Read stdin (non-blocking, timeout 200ms)
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(data), 200);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

(async () => {
  const body = (await readStdin())?.trim() || '';
  const newEntry = renderEntry({ hook, body });

  let existing = '';
  try {
    existing = fs.readFileSync(REPORT_FILE, 'utf8');
  } catch {
    /* ignore */
  }

  const entries = existing ? splitEntries(existing) : [];

  // Prepend new, trim to MAX_ENTRIES
  const updated = [newEntry, ...entries].slice(0, MAX_ENTRIES).join('\n\n---\n\n') + '\n';

  fs.writeFileSync(REPORT_FILE, updated, 'utf8');

  // Log small summary to console (for hook logs)
  console.log(
    `[husky] report updated (${hook}); entries=${Math.min(entries.length + 1, MAX_ENTRIES)}`,
  );
})();
