#!/bin/sh
set -e

# Seed CV files from /app/seed-cv into the volume-mounted /app/uploads/cv.
# Notes:
# - Uses "./" prefix to prevent filenames starting with "-" being parsed as flags
# - Overwrites 0-byte stub files from previous broken deploys
# - Skips files that already exist and have content
if [ -d /app/seed-cv ] && [ "$(ls -A /app/seed-cv 2>/dev/null)" ]; then
  echo "[entrypoint] Seeding CV files into /app/uploads/cv ..."
  mkdir -p /app/uploads/cv
  copied=0
  skipped=0
  for f in /app/seed-cv/*; do
    [ ! -f "$f" ] && continue
    base="$(basename "$f")"
    target="/app/uploads/cv/$base"
    # Copy if target doesn't exist OR target is empty (0 bytes)
    if [ ! -e "$target" ] || [ ! -s "$target" ]; then
      cp -- "$f" "$target"
      copied=$((copied + 1))
    else
      skipped=$((skipped + 1))
    fi
  done
  total=$(ls /app/uploads/cv | wc -l)
  echo "[entrypoint] CV seed complete. Copied=$copied, Skipped=$skipped, Total=$total files."
fi

# Hand off to the main command (e.g. node dist/main.js)
exec "$@"
