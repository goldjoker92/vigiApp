#!/usr/bin/env bash
set -euo pipefail
echo "=== EAS PRE-INSTALL DEBUG ==="
echo "[PWD]"; pwd
echo "[Node/npm]"; node -v; npm -v

echo "[Lockfiles in repo]"
find . -maxdepth 4 \( -name "package-lock.json" -o -name "npm-shrinkwrap.json" \) -print | sort || true

if [ -f package-lock.json ]; then
  echo "[Root lock SHA256]"
  (sha256sum package-lock.json || shasum -a 256 package-lock.json)
  echo "[Root lock SIZE (bytes)]"
  (wc -c package-lock.json || stat -c "SIZE: %s" package-lock.json 2>/dev/null || true)
else
  echo "NO ROOT LOCKFILE!"
fi
echo "=== END PRE-INSTALL DEBUG ==="