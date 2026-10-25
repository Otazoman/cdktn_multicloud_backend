#!/usr/bin/env bash
# Shows or sets the build stage of the environment (DEPLOY_ENV), in the cdktn
# container: npm run build-stage [-- 1|2|3]. See config/buildstage.ts and
# docs/operations.md ("Build an environment"). Takes effect at the next
# cdktn diff / deploy. The stage is kept in state/<env>/build-stage.json.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DEPLOY_ENV:?Set DEPLOY_ENV (dev, stg or prod)}"
FILE="$APP_DIR/state/$DEPLOY_ENV/build-stage.json"

describe() {
  case "$1" in
    1) echo "1: first deploy (azureSecretReady, readinessProbe, journalPrune off)" ;;
    2) echo "2: after the secrets (azureSecretReady on)" ;;
    3) echo "3: after CI/CD deployed the API (azureSecretReady, readinessProbe, journalPrune on)" ;;
  esac
}

current() {
  if [[ -f "$FILE" ]]; then
    sed -nE 's/.*"stage"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$FILE"
  else
    echo 1
  fi
}

stage="${1:-}"
if [[ -z "$stage" ]]; then
  echo "$DEPLOY_ENV build stage $(describe "$(current)")"
  exit 0
fi
case "$stage" in
  1 | 2 | 3) ;;
  *)
    echo "Usage: npm run build-stage [-- 1|2|3]" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$FILE")"
printf '{ "stage": %s }\n' "$stage" > "$FILE"
echo "$DEPLOY_ENV build stage $(describe "$stage")"
echo "Next: cdktn diff, then cdktn deploy"
