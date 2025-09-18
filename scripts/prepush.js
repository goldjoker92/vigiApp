const { execSync } = require('child_process');
const fs = require('fs');

function safeExec(cmd, input) {
  try {
    return execSync(cmd, { encoding: 'utf8', input });
  } catch (e) {
    const out = e && e.stdout ? e.stdout.toString() : '';
    const err = e && e.stderr ? e.stderr.toString() : '';
    return out + (out && err ? '\n' : '') + err;
  }
}

console.log('[husky] pre-push deps check (non-blocking)...');

// 1) Run expo check (non-blocking)
const raw = safeExec('npx --yes expo install --check --non-interactive');

// 2) Convert to advice (markdown with yarn/npm commands)
const advice = safeExec('node scripts/expo-check-to-advice.js', raw);

// 3) Minimal terminal summary (ASCII only)
const lines = (advice || '').split(/\r?\n/);
const count = lines.filter((l) => /^- [@\w.\-\/]+/.test(l)).length;

if (!advice.trim()) {
  console.log('[deps] (no diagnostic)');
} else if (count === 0) {
  console.log('[deps] OK - nothing to align');
} else {
  console.log('[deps] ' + count + ' package(s) to align');

  // Extract first yarn command block after a line that mentions "yarn"
  const idxY = lines.findIndex((l) => l.toLowerCase().includes('yarn') && l.includes('**'));
  if (idxY !== -1) {
    const codeStart = lines.indexOf('`ash', idxY);
    if (codeStart !== -1) {
      const codeEnd = lines.indexOf('`', codeStart + 1);
      const cmd = lines
        .slice(codeStart + 1, codeEnd > -1 ? codeEnd : undefined)
        .join('\n')
        .trim();
      if (cmd) {
        console.log('[deps] yarn command:');
        console.log(cmd);
      }
    }
  }

  // Extract first npm command block after a line that mentions "npm"
  const idxN = lines.findIndex((l) => l.toLowerCase().includes('npm') && l.includes('**'));
  if (idxN !== -1) {
    const codeStart = lines.indexOf('`ash', idxN);
    if (codeStart !== -1) {
      const codeEnd = lines.indexOf('`', codeStart + 1);
      const cmd = lines
        .slice(codeStart + 1, codeEnd > -1 ? codeEnd : undefined)
        .join('\n')
        .trim();
      if (cmd) {
        console.log('[deps] npm command:');
        console.log(cmd);
      }
    }
  }
}

// 4) Append full advice to husky_report.md (prepend via helper)
safeExec('node scripts/husky-report-single.js --hook pre-push', advice);

// Never block
process.exit(0);
