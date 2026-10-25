#!/usr/bin/env bash
# Shows or sets the build stage of the environment (DEPLOY_ENV), in the cdktn
# container:
#   npm run build-stage                               show it
#   npm run build-stage -- 1|2|3                      set it
#   npm run build-stage -- 2 --azure-db-ip <ip>       ...and record the Azure
#       database's private IP (a cluster without the private DNS, hostZones
#       off; kept at stage 3, cleared at stage 1)
# See config/buildstage.ts and docs/operations.md ("Build an environment").
# Takes effect at the next cdktn diff / deploy. Kept in
# state/<env>/build-stage.json.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DEPLOY_ENV:?Set DEPLOY_ENV (dev, stg or prod)}"
FILE="$APP_DIR/state/$DEPLOY_ENV/build-stage.json"

usage() {
  echo "Usage: npm run build-stage [-- 1|2|3 [--azure-db-ip <ip>]]" >&2
  exit 1
}

describe() {
  case "$1" in
    1) echo "1: first deploy (azureSecretReady, readinessProbe, journalPrune off)" ;;
    2) echo "2: after the secrets (azureSecretReady on)" ;;
    3) echo "3: after CI/CD deployed the API (azureSecretReady, readinessProbe, journalPrune on)" ;;
  esac
}

field() {
  [[ -f "$FILE" ]] && sed -nE "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"?([^\",} ]+)\"?.*/\1/p" "$FILE" || true
}

show() {
  local stage ip
  stage="$(field stage)"
  ip="$(field azureDbPrivateIp)"
  echo "$DEPLOY_ENV build stage $(describe "${stage:-1}")"
  [[ -z "$ip" ]] || echo "Azure database private IP: $ip"
}

stage="${1:-}"
if [[ -z "$stage" ]]; then
  show
  exit 0
fi
case "$stage" in
  1 | 2 | 3) ;;
  *) usage ;;
esac
shift

ip="$(field azureDbPrivateIp)"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --azure-db-ip)
      ip="${2:-}"
      [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || {
        echo "--azure-db-ip needs an IPv4 address" >&2
        exit 1
      }
      shift 2
      ;;
    *) usage ;;
  esac
done
# A new build creates a new database (a new address)
[[ "$stage" != 1 ]] || ip=""

mkdir -p "$(dirname "$FILE")"
if [[ -n "$ip" ]]; then
  printf '{ "stage": %s, "azureDbPrivateIp": "%s" }\n' "$stage" "$ip" > "$FILE"
else
  printf '{ "stage": %s }\n' "$stage" > "$FILE"
fi
show
# A cluster without the private DNS needs the Azure database's IP from stage 2
if [[ "$stage" != 1 && -z "$ip" ]] &&
  grep -qE '^export const hostZones: boolean = false;' "$APP_DIR/config/commonsettings.ts"; then
  echo "Note: hostZones is off. A cluster without the private DNS needs the Azure database's" >&2
  echo "      private IP: npm run build-stage -- $stage --azure-db-ip <ip>" >&2
  echo "      (docs/operations.md, \"A cluster without the private DNS\")" >&2
fi
echo "Next: cdktn diff, then cdktn deploy"
