#!/usr/bin/env bash
set -euo pipefail
echo "=== EAS PRE-INSTALL DEBUG ==="
echo "[PWD]"; pwd
echo "[GIT COMMIT] \
echo "[Node/npm]"; node -v; npm -v

echo "[LOCKFILES trouvés (max depth 4)]"
find . -maxdepth 4 \( -name "package-lock.json" -o -name "npm-shrinkwrap.json" \) -print | sort

if [ -f package-lock.json ]; then
  echo "[HASH lock racine]"; (sha256sum package-lock.json || shasum -a 256 package-lock.json)
  echo "[SIZE lock racine]"; (wc -c package-lock.json || stat -c "SIZE: %s" package-lock.json 2>/dev/null || true)
else
  echo "ATTENTION: pas de package-lock.json à la racine !"
fi

echo "[GREP package.json: react-dom / webpack ?]"
grep -E '"react-dom"|"webpack"' package.json || echo "OK: rien trouvé dans package.json"

echo "[npm config ignore-scripts ?]"
npm config get ignore-scripts || true
echo "=== END PRE-INSTALL DEBUG ==="
