#!/bin/bash
set -e
echo "---- DEBUG LOCKFILE ----"
ls -lah
ls -lah ..
ls -lah ./functions || true

if [ -f package-lock.json ]; then
  echo "Found lockfile:"
  sha256sum package-lock.json
  stat -c "SIZE: %s" package-lock.json
else
  echo "No package-lock.json found!"
fi
echo "------------------------"
