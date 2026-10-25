#!/usr/bin/env bash
# Run before `cdktn destroy` (in the cdktn container: npm run before-destroy).
#
# Removes from the Terraform state the resources whose destroy is pointless
# and can fail, because they are deleted together with their parent:
#   azurerm_postgresql_flexible_server_configuration
#     Destroying a server parameter resets it on the server. Resetting
#     wal_level (logical) needs a restart, which fails with
#     InternalServerError while the database has logical replication slots
#     (a cluster), and the destroy stops with the Azure resources left.
# It also sets the build stage back to 1 (config/buildstage.ts) for the next
# build. Nothing is changed in the clouds. Safe to run again.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="$APP_DIR/cdktf.out/stacks/app"

if [[ ! -f "$STACK_DIR/cdk.tf.json" ]]; then
  (cd "$APP_DIR" && cdktn synth)
fi
cd "$STACK_DIR"
[[ -d .terraform ]] || terraform init -input=false > /dev/null

mapfile -t addresses < <(terraform state list | grep -E '^azurerm_postgresql_flexible_server_configuration\.' || true)
if [[ ${#addresses[@]} -eq 0 ]]; then
  echo "Nothing to remove from the state."
else
  terraform state rm "${addresses[@]}"
  echo "Removed ${#addresses[@]} resources from the state (deleted with their parent)."
fi

# The next build starts from the first deploy
bash "$APP_DIR/scripts/build-stage.sh" 1 > /dev/null
echo "Build stage set back to 1. Run cdktn destroy."
