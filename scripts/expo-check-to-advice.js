// scripts/expo-check-to-advice.js
// Transforme la sortie de `expo install --check` en conseils Yarn/NPM concis.

const fs = require('fs');

const DEV_DEPS = new Set(['jest', 'jest-expo', 'expo-build-properties']);

function parse(lines) {
  // Format typique: "  expo-device@8.0.7 - expected version: ~7.1.4"
  const re =
    /^\s*([@a-zA-Z0-9._\/-]+)@([~^]?\d[\w.+-]*)\s+-\s+expected version:\s+([~^]?\d[\w.+-]*)\s*$/;
  const found = [];
  for (const line of lines) {
    const m = line.match(re);
    if (m) {
      const name = m[1],
        current = m[2],
        expected = m[3];
      found.push({ name, current, expected });
    }
  }
  return found;
}

function buildCommands(pkgs) {
  const deps = [],
    devs = [];
  for (const { name, expected } of pkgs) {
    (DEV_DEPS.has(name) ? devs : deps).push(`${name}@${expected}`);
  }
  const cmds = { yarn: [], npm: [] };
  if (deps.length) {
    cmds.yarn.push(`yarn add ${deps.join(' ')}`);
    cmds.npm.push(`npm install ${deps.join(' ')}`);
  }
  if (devs.length) {
    cmds.yarn.push(`yarn add -D ${devs.join(' ')}`);
    cmds.npm.push(`npm install -D ${devs.join(' ')}`);
  }
  return {
    yarn: cmds.yarn.join(' && '),
    npm: cmds.npm.join(' && '),
  };
}

const input = fs.readFileSync(0, 'utf8');
const lines = input.split(/\r?\n/);
const pkgs = parse(lines);

if (pkgs.length === 0) {
  console.log(
    `### Dépendances — cohérence OK\n\nAucun paquet à réaligner d’après \`expo install --check\`.\n`
  );
  process.exit(0);
}

console.log(`### Dépendances non alignées (info-only)\n`);
for (const { name, current, expected } of pkgs) {
  console.log(`- \`${name}\`: installé \`${current}\` → attendu \`${expected}\``);
}

const cmds = buildCommands(pkgs);

if (cmds.yarn) {
  console.log(`\n**Commande yarn (conseillée)**\n`);
  console.log('```bash');
  console.log(cmds.yarn);
  console.log('```');
}
if (cmds.npm) {
  console.log(`\n**Équivalent npm**\n`);
  console.log('```bash');
  console.log(cmds.npm);
  console.log('```');
}

console.log(`\n_(non bloquant · pre-push)_\n`);
