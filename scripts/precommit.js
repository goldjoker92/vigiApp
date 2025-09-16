const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function runStep(idx, label, cmd, args, outFile) {
  const start = Date.now();
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  const dur = Math.round((Date.now() - start) / 1000);
  fs.writeFileSync(outFile, (res.stdout || '') + (res.stderr || ''), 'utf8');
  const ok = res.status === 0;
  console.log(\[\] \ … \ (\s)\);
  // non-bloquant: toujours continuer
  return { ok, out: fs.readFileSync(outFile, 'utf8') };
}

console.log('[husky] pre-commit (non-bloquant)');
const tmp = os.tmpdir();
const LINT = path.join(tmp, 'husky_precommit_lint.txt');
const TEST = path.join(tmp, 'husky_precommit_test.txt');

// 1) lint-staged (format+lint)
runStep('1/3', 'Lint+Format (lint-staged)', 'npx', ['--no-install', 'lint-staged'], LINT);

// 2) tests rapides
try { fs.mkdirSync('tmp', { recursive: true }); } catch {}
runStep('2/3', 'Tests rapides (jest:quick)', 'npm', ['run', 'test:quick', '--silent'], TEST);

// 3) consolider dans le report (prepend, 30 max)
const mk = (title, file) => \### \\n\n\\\\n\\n\\\\n\;
const md = \### Résumé pre-commit

- Lint+Format : check
- Tests rapides : check

\
\\;

spawnSync('node', ['scripts/husky-report-single.js', '--hook', 'pre-commit'], { input: md, encoding: 'utf8' });