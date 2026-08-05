#!/bin/sh
set -e

# Seed CV files from /app/seed-cv into the volume-mounted /app/uploads/cv.
# On Alpine (BusyBox), cp does not support -n (no-clobber), so we check
# each file individually. Files that already exist AND are non-empty are
# skipped to preserve user-uploaded CVs. Empty stub files are overwritten.
if [ -d /app/seed-cv ] && [ "$(ls -A /app/seed-cv 2>/dev/null)" ]; then
  echo "[entrypoint] Seeding CV files into /app/uploads/cv ..."
  mkdir -p /app/uploads/cv
  cd /app/seed-cv
  copied=0
  skipped=0
  for f in *; do
    [ ! -f "$f" ] && continue
    target="/app/uploads/cv/$f"
    # Copy if target doesn't exist OR target is empty (0 bytes)
    if [ ! -e "$target" ] || [ ! -s "$target" ]; then
      cp "$f" "$target"
      copied=$((copied + 1))
    else
      skipped=$((skipped + 1))
    fi
  done
  cd /app
  total=$(ls /app/uploads/cv | wc -l)
  echo "[entrypoint] CV seed complete. Copied=$copied, Skipped=$skipped, Total=$total files."
fi

# Hand off to the main command (e.g. node dist/main.js)
exec "$@"
