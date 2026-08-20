#!/usr/bin/env bash

set -euo pipefail

base_sha="${1:?Usage: check-prisma-migration-history.sh <base-sha> [head-sha]}"
head_sha="${2:-HEAD}"

migration_root() {
  local path="${1:-}"

  if [[ "$path" =~ ^(prisma/migrations/[0-9]+_[^/]+)(/|$) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

git rev-parse --verify "${base_sha}^{commit}" >/dev/null
git rev-parse --verify "${head_sha}^{commit}" >/dev/null

if ! git merge-base --is-ancestor "$base_sha" "$head_sha"; then
  echo "The migration baseline must be an ancestor of the commit being validated." >&2
  exit 1
fi

violations=()

existed_at_baseline() {
  local migration_dir="$1"
  git cat-file -e "${base_sha}:${migration_dir}" 2>/dev/null
}

check_commit() {
  local commit_sha="$1"
  local parent_sha status first_path second_path migration_dir second_dir candidate

  parent_sha="$(git rev-parse "${commit_sha}^")"

  while IFS= read -r -d '' status; do
    IFS= read -r -d '' first_path
    second_path=""

    if [[ "$status" == R* || "$status" == C* ]]; then
      IFS= read -r -d '' second_path
    fi

    case "$status" in
      A)
        if migration_dir="$(migration_root "$first_path")" \
          && git cat-file -e "${parent_sha}:${migration_dir}" 2>/dev/null; then
          violations+=("${commit_sha:0:12}"$'\t'"${status}"$'\t'"${first_path}")
        fi
        ;;
      *)
        # Only a violation when the affected migration directory already existed at the
        # trusted deployment baseline. A migration created and then corrected within the
        # same not-yet-deployed window was never shipped, so editing it before it ships is
        # normal iteration, not a history rewrite -- the baseline, not the commit's parent,
        # is the line that must never move once something has crossed it.
        migration_dir=""
        second_dir=""
        if candidate="$(migration_root "$first_path")"; then
          migration_dir="$candidate"
        fi
        if [[ -n "$second_path" ]] && candidate="$(migration_root "$second_path")"; then
          second_dir="$candidate"
        fi

        if [[ -z "$migration_dir" && -z "$second_dir" ]]; then
          continue
        fi

        if { [[ -n "$migration_dir" ]] && existed_at_baseline "$migration_dir"; } \
          || { [[ -n "$second_dir" ]] && existed_at_baseline "$second_dir"; }; then
          violations+=("${commit_sha:0:12}"$'\t'"${status}"$'\t'"${first_path}${second_path:+$'\t'${second_path}}")
        fi
        ;;
    esac
  done < <(git diff-tree --no-commit-id --name-status -r -z --find-renames "$parent_sha" "$commit_sha" -- prisma/migrations)
}

while IFS= read -r commit_sha; do
  check_commit "$commit_sha"
done < <(git rev-list --reverse --first-parent "${base_sha}..${head_sha}")

if ((${#violations[@]} == 0)); then
  echo "Prisma migration history is append-only."
  exit 0
fi

echo "Existing Prisma migration directories are immutable. Add a new migration instead of rewriting one:" >&2
printf '  %s\n' "${violations[@]}" >&2
exit 1
