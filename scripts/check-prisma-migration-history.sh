#!/usr/bin/env bash

set -euo pipefail

base_sha="${1:?Usage: check-prisma-migration-history.sh <base-sha> [head-sha]}"
head_sha="${2:-HEAD}"

migration_root() {
  local path="${1:-}"

  if [[ "$path" =~ ^(prisma/migrations/[0-9]+_[^/]+)(/|$) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  fi
}

git rev-parse --verify "${base_sha}^{commit}" >/dev/null
git rev-parse --verify "${head_sha}^{commit}" >/dev/null

if ! git merge-base --is-ancestor "$base_sha" "$head_sha"; then
  echo "The migration baseline must be an ancestor of the commit being validated." >&2
  exit 1
fi

violations=()

check_commit() {
  local parent_sha="$1"
  local commit_sha="$2"
  local status first_path second_path migration_dir

  while IFS= read -r -d '' status; do
    IFS= read -r -d '' first_path
    second_path=""

    if [[ "$status" == R* || "$status" == C* ]]; then
      IFS= read -r -d '' second_path
    fi

    case "$status" in
      A)
        if ! migration_dir="$(migration_root "$first_path")"; then
          continue
        fi

        if git cat-file -e "${parent_sha}:${migration_dir}" 2>/dev/null; then
          violations+=("${commit_sha:0:12}"$'\t'"${status}"$'\t'"${first_path}")
        fi
        ;;
      *)
        if migration_root "$first_path" >/dev/null || migration_root "$second_path" >/dev/null; then
          violations+=("${commit_sha:0:12}"$'\t'"${status}"$'\t'"${first_path}${second_path:+$'\t'${second_path}}")
        fi
        ;;
    esac
  done < <(git diff-tree --no-commit-id --name-status -r -z --find-renames "$parent_sha" "$commit_sha" -- prisma/migrations)
}

while IFS= read -r commit_sha; do
  check_commit "$(git rev-parse "${commit_sha}^")" "$commit_sha"
done < <(git rev-list --reverse --first-parent "${base_sha}..${head_sha}")

if ((${#violations[@]} == 0)); then
  echo "Prisma migration history is append-only."
  exit 0
fi

echo "Existing Prisma migration directories are immutable. Add a new migration instead of rewriting one:" >&2
printf '  %s\n' "${violations[@]}" >&2
exit 1
