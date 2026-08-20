#!/usr/bin/env bash

set -euo pipefail

deployment_branch="${1:?Usage: get-last-successful-deployment-sha.sh <main|dev>}"

case "$deployment_branch" in
  main | dev) ;;
  *)
    echo "Deployment branch must be main or dev." >&2
    exit 1
    ;;
esac

for command in curl node; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 1
  fi
done

repository="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
api_url="${GITHUB_API_URL:-https://api.github.com}"

curl_args=(
  --fail
  --location
  --silent
  --show-error
  --retry 3
  --retry-delay 2
  -H 'Accept: application/vnd.github+json'
  -H 'X-GitHub-Api-Version: 2022-11-28'
)

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_args+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

baseline_sha="$(
  curl "${curl_args[@]}" "${api_url}/repos/${repository}/actions/workflows/docker-publish.yml/runs?branch=${deployment_branch}&event=push&status=success&per_page=100" \
    | DEPLOYMENT_BRANCH="$deployment_branch" node -e '
      let response = "";

      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        response += chunk;
      });
      process.stdin.on("end", () => {
        let workflowRuns;

        try {
          workflowRuns = JSON.parse(response).workflow_runs;
        } catch (error) {
          console.error(`Unable to parse the workflow-runs response: ${error.message}`);
          process.exitCode = 1;
          return;
        }

        const baseline = Array.isArray(workflowRuns)
          ? workflowRuns.find(
              (run) =>
                run.head_branch === process.env.DEPLOYMENT_BRANCH &&
                run.event === "push" &&
                run.conclusion === "success",
            )
          : undefined;

        if (baseline) {
          process.stdout.write(baseline.head_sha);
        }
      });
    '
)"

if [[ ! "$baseline_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "No successful deployment baseline was found for ${deployment_branch}." >&2
  exit 1
fi

printf '%s\n' "${baseline_sha,,}"
