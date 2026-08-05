#!/bin/sh
set -e

# Seed CV files from /app/seed-cv into the volume-mounted /app/uploads/cv
# Uses cp -n (no-clobber) so existing files in the volume are never overwritten.
if [ -d /app/seed-cv ] && [ "$(ls -A /app/seed-cv 2>/dev/null)" ]; then
  echo "[entrypoint] Seeding CV files into /app/uploads/cv ..."
  mkdir -p /app/uploads/cv
  cp -rn /app/seed-cv/* /app/uploads/cv/ 2>/dev/null || true
  echo "[entrypoint] CV seed complete. $(ls /app/uploads/cv | wc -l) files in uploads/cv."
fi

# Hand off to the main command (e.g. node dist/main.js)
exec "$@"
