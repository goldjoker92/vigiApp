// scripts/husky-report-single.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}
function pad(n) {
  return String(n).padStart(2, '0');
}
function now() {
  const d = new Date();
  return {
    y: d.getFullYear(),
    m: pad(d.getMonth() + 1),
    d: pad(d.getDate()),
    hh: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
}
function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

const hook = process.argv.includes('--hook')
  ? process.argv[process.argv.indexOf('--hook') + 1]
  : 'pre-commit';
const staged = sh('git diff --cached --name-only').split('\n').filter(Boolean);
const jest = readJSON(path.join('tmp', 'jest.json')) || {};
const results = Array.isArray(jest.testResults) ? jest.testResults : [];
let pass = 0,
  fail = 0,
  failed = [];
for (const f of results) {
  for (const a of f.assertionResults || []) {
    if (a.status === 'passed') {
      pass++;
    } else if (a.status === 'failed') {
      fail++;
      failed.push(`- ${a.fullName || a.title}\n  ↳ ${f.name}`);
    }
  }
}
const { y, m, d, hh, mm, ss } = now();
const emoji = fail > 0 ? '🟧' : '✅';
const msg = sh('git log -1 --pretty=%s');

const block = [
  `## ${emoji} ${hook} — ${y}-${m}-${d} ${hh}:${mm}:${ss}`,
  `**Message:** ${msg}\n`,
  `**Passés:** ${pass} • **Échoués:** ${fail}\n`,
  staged.length
    ? `**Fichiers stagés (${staged.length})**:\n${staged.map((f) => `- ${f}`).join('\n')}\n`
    : '',
  fail ? `**Échecs**:\n${failed.join('\n')}\n` : `*(Aucun échec)*\n`,
  `---\n`,
].join('\n');

const report = path.join(process.cwd(), 'husky_report.md');
const marker = '# Rapport Husky (pré-commit)\n\n';
let old = fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '';
let entries = old
  .replace(marker, '')
  .split('## ')
  .filter(Boolean)
  .map((e) => '## ' + e);

entries.unshift(block.trim());
entries = entries.slice(0, 30);

fs.writeFileSync(report, marker + entries.join('\n\n'), 'utf8');

console.log(
  fail
    ? `\x1b[33m[husky] Tests partiels: ${pass} passés, ${fail} échoués (rapport mis à jour, max 30)\x1b[0m`
    : `\x1b[32m[husky] Tests OK: ${pass} passés (rapport mis à jour, max 30)\x1b[0m`,
);
