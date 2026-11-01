#!/bin/bash
# Run by `cdktn deploy` (local-exec, constructs/container/azurecertjob.ts):
# starts the certificate renewal job once and waits until it succeeds, so
# that the certificate is in the Key Vault before the Application Gateway
# that references it is created. Uses the ARM REST API with curl and jq
# (the cdktn container has no Azure CLI) and the service principal of
# ARM_TENANT_ID / ARM_CLIENT_ID / ARM_CLIENT_SECRET.
#
# Environment (set by cdktn): SUBSCRIPTION_ID, RESOURCE_GROUP, JOB_NAME,
# TIMEOUT_SECONDS.
set -euo pipefail

API="api-version=2025-01-01"
BASE="https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.App/jobs/${JOB_NAME}"
MAX_ATTEMPTS=3

log() { echo "[cert-job-wait] $*"; }

arm_token() {
  curl -sS --fail-with-body -X POST \
    "https://login.microsoftonline.com/${ARM_TENANT_ID}/oauth2/v2.0/token" \
    -d grant_type=client_credentials \
    --data-urlencode "client_id=${ARM_CLIENT_ID}" \
    --data-urlencode "client_secret=${ARM_CLIENT_SECRET}" \
    -d scope=https://management.azure.com/.default |
    jq -r .access_token
}

deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
check_deadline() {
  if [ "$(date +%s)" -gt "$deadline" ]; then
    log "timed out after ${TIMEOUT_SECONDS} s"
    hint
    exit 1
  fi
}
hint() {
  log "Logs of the job (Log Analytics): ContainerAppConsoleLogs_CL | where ContainerJobName_s == \"${JOB_NAME}\""
  log "Executions: az containerapp job execution list -n ${JOB_NAME} -g ${RESOURCE_GROUP} -o table"
  log "Run cdktn deploy again after fixing the cause (DNS delegation of the zone, role assignments)."
}

headers=$(mktemp)
trap 'rm -f "$headers"' EXIT

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  token=$(arm_token)
  response=$(curl -sS -D "$headers" -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
    -d '{}' "${BASE}/start?${API}")
  code=${response##*$'\n'}
  body=${response%$'\n'*}
  case "$code" in
    200)
      execution=$(jq -r .name <<<"$body")
      ;;
    202)
      # The execution name is returned when the operation completes
      location=$(grep -i '^location:' "$headers" | cut -d' ' -f2 | tr -d '\r')
      execution=""
      while [ -z "$execution" ]; do
        check_deadline
        sleep 5
        execution=$(curl -sS -H "Authorization: Bearer ${token}" "$location" | jq -r '.name // empty')
      done
      ;;
    *)
      log "starting ${JOB_NAME} failed: HTTP ${code} ${body}"
      exit 1
      ;;
  esac
  log "started ${execution} (attempt ${attempt}/${MAX_ATTEMPTS})"

  status=""
  while true; do
    check_deadline
    sleep 20
    status=$(curl -sS -H "Authorization: Bearer $(arm_token)" \
      "${BASE}/executions/${execution}?${API}" | jq -r '.properties.status // "Unknown"')
    log "${execution}: ${status}"
    case "$status" in
      Succeeded) exit 0 ;;
      Failed | Stopped | Degraded) break ;;
    esac
  done

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    # Right after the deploy, the role assignments of the job's identity or
    # the NS records of the zone may still be propagating
    log "${execution} ended with ${status}: retrying in 60 s"
    sleep 60
  fi
done

log "${JOB_NAME} did not succeed in ${MAX_ATTEMPTS} attempts"
hint
exit 1
