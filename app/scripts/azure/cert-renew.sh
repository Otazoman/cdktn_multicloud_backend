#!/bin/bash
# Let's Encrypt certificate of the Application Gateway, run by the renewal
# job (config/azure/certrenewal.ts) in the Container Apps environment.
#
# When the certificate is missing in the Key Vault or expires within
# RENEW_BEFORE_DAYS, request a new one with lego (DNS-01 on the Azure public
# zone) and import it into the Key Vault as a new version. Otherwise exit.
# No state is kept between runs (a new ACME account each time).
#
# Environment (set by cdktn): KEY_VAULT_URI (ends with /), CERT_NAME,
# DOMAINS (space-separated), ACME_SERVER, RENEW_BEFORE_DAYS, LEGO_VERSION,
# LEGO_SHA256, and for lego's azuredns provider AZURE_AUTH_METHOD=msi,
# AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, AZURE_ZONE_NAME. The managed
# identity endpoint (IDENTITY_ENDPOINT, IDENTITY_HEADER) comes from
# Container Apps.
set -euo pipefail

log() { echo "[cert-renew] $*"; }

KV_API="api-version=7.4"

# jq is in the Azure CLI image; install the other tools when missing, at once
packages=()
for tool in curl tar gzip sha256sum base64; do
  if ! command -v "$tool" >/dev/null; then
    case "$tool" in
      sha256sum | base64) package=coreutils ;;
      *) package=$tool ;;
    esac
    [[ " ${packages[*]} " == *" $package "* ]] || packages+=("$package")
  fi
done
if [ "${#packages[@]}" -gt 0 ]; then
  log "installing ${packages[*]}"
  tdnf install -y -q "${packages[@]}"
fi

# Access token for the Key Vault from the job's managed identity
kv_token() {
  curl -sS --fail-with-body -H "x-identity-header: ${IDENTITY_HEADER}" \
    "${IDENTITY_ENDPOINT}?resource=https://vault.azure.net&api-version=2019-08-01" |
    jq -r .access_token
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

token=$(kv_token)
status=$(curl -sS -o "$work/cert.json" -w '%{http_code}' \
  -H "Authorization: Bearer ${token}" \
  "${KEY_VAULT_URI}certificates/${CERT_NAME}?${KV_API}")
case "$status" in
  200)
    remaining=$(( ($(jq -r '.attributes.exp' "$work/cert.json") - $(date +%s)) / 86400 ))
    if [ "$remaining" -gt "$RENEW_BEFORE_DAYS" ]; then
      log "${CERT_NAME} is valid for ${remaining} more days: nothing to do"
      exit 0
    fi
    log "${CERT_NAME} expires in ${remaining} days: renewing"
    ;;
  404)
    log "${CERT_NAME} is not in the Key Vault: issuing"
    ;;
  *)
    log "Key Vault returned HTTP ${status}:"
    cat "$work/cert.json"
    exit 1
    ;;
esac

# lego, checked against the published SHA-256
archive="lego_${LEGO_VERSION}_linux_amd64.tar.gz"
curl -sS --fail-with-body -L -o "$work/${archive}" \
  "https://github.com/go-acme/lego/releases/download/${LEGO_VERSION}/${archive}"
echo "${LEGO_SHA256}  $work/${archive}" | sha256sum -c -
tar -xzf "$work/${archive}" -C "$work" lego

pfx_pass=$(head -c 24 /dev/urandom | base64 | tr -d '/+=')
domain_args=()
for domain in $DOMAINS; do
  domain_args+=(--domains "$domain")
done
"$work/lego" --accept-tos --server "$ACME_SERVER" --path "$work/data" \
  --dns azuredns "${domain_args[@]}" --key-type rsa2048 \
  --pfx --pfx.format SHA256 --pfx.pass "$pfx_pass" run

# lego names the files after the first domain ("*" becomes "_")
first_domain=${DOMAINS%% *}
pfx="$work/data/certificates/${first_domain//\*/_}.pfx"

jq -n --arg value "$(base64 -w0 "$pfx")" --arg pwd "$pfx_pass" \
  '{value: $value, pwd: $pwd, policy: {secret_props: {contentType: "application/x-pkcs12"}}}' \
  >"$work/import.json"
token=$(kv_token)
curl -sS --fail-with-body -X POST \
  -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
  --data-binary "@$work/import.json" \
  "${KEY_VAULT_URI}certificates/${CERT_NAME}/import?${KV_API}" |
  jq '{id, expires: (.attributes.exp | todate)}'
log "${CERT_NAME} imported"
