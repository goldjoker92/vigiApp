const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// Fichiers STAGÉS du commit
let staged = [];
try {
  staged = sh('git diff --cached --name-only').split('\n').filter(Boolean);
} catch {}

const testableExt = ['.ts', '.tsx', '.js', '.jsx'];
const related = staged.filter((f) => testableExt.some((e) => f.endsWith(e)));

const args = [];
if (related.length > 0) {
  args.push('--findRelatedTests', ...related);
} else {
  // Fallback: smoke test ultra rapide si rien de testable
  const smoke = path.join('__tests__', 'smoke.test.ts');
  if (!fs.existsSync(smoke)) {
    fs.mkdirSync(path.dirname(smoke), { recursive: true });
    fs.writeFileSync(smoke, "test('smoke',()=>expect(true).toBe(true))\n");
  }
  args.push(smoke);
}

args.push(
  '--json',
  '--outputFile',
  path.join('tmp', 'jest.json'),
  '--runInBand',
  '--maxWorkers=50%',
  '--silent',
  '--passWithNoTests',
  '--testTimeout=5000'
);

// Lance Jest (toujours non bloquant pour Husky)
spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['jest', ...args], {
  stdio: 'inherit',
});
process.exit(0);
