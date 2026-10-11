#!/bin/bash

# Note: on Google Cloud this runs as the startup script on every boot, so
# every step must be safe to run again.

log() {
    echo "[vm_init] $*"
}

# dpkg / apt lock files checked by wait_for_apt_lock
LOCK_FILES="/var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock /var/cache/apt/archives/lock"

# Function to wait for network connectivity using curl
wait_for_internet() {
    echo "Waiting for internet connection..."
    while ! curl -s -I -m 5 https://google.com >/dev/null; do
        echo "Connection not ready. Retrying in 5 seconds..."
        sleep 5
    done
    echo "Internet connection is ready. Starting package installation."
}

# wait for apt locks to be released (existing function)
wait_for_apt_lock() {
    log "Waiting for apt/dpkg locks to be released..."

    while true; do
        LOCK_HELD=0
        
        for LOCK in $LOCK_FILES; do
            if fuser $LOCK >/dev/null 2>&1; then
                LOCK_HELD=1
                break
            fi
        done

        if [ $LOCK_HELD -eq 0 ]; then
            log "Apt/dpkg locks are free. Proceeding."
            break
        fi

        log "Lock is held. Waiting 5 seconds..."
        sleep 5
    done
}

# set timezone and editor
echo "Settings TimeZone..."
timedatectl set-timezone Asia/Tokyo
update-alternatives --set editor /usr/bin/vim.basic

# wait for apt Connect
wait_for_internet

# package update
echo "Running apt-get update..."
apt purge -y nano
wait_for_apt_lock
apt update -y
wait_for_apt_lock

# install MySQL and PostgreSQL clients
echo "Installing required clients..."
apt install -y postgresql-common
wait_for_apt_lock
if [ -f /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh ]; then
  yes "" | /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
fi
apt install -y mysql-client postgresql-client nfs-common
wait_for_apt_lock

# install cloud CLIs (AWS CLI v2, Google Cloud CLI, Azure CLI): the latest
# version at install time. gcloud / az are updated by apt upgrade; the AWS CLI
# is updated by running this script again (docs/operations.md).
echo "Installing cloud CLIs..."
apt install -y ca-certificates curl gnupg lsb-release unzip
wait_for_apt_lock
mkdir -p /etc/apt/keyrings
# Google Cloud CLI (apt repository)
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
  | gpg --dearmor --yes -o /etc/apt/keyrings/cloud.google.gpg
echo "deb [signed-by=/etc/apt/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
  > /etc/apt/sources.list.d/google-cloud-sdk.list
# Azure CLI (apt repository)
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
  | gpg --dearmor --yes -o /etc/apt/keyrings/microsoft.gpg
chmod go+r /etc/apt/keyrings/cloud.google.gpg /etc/apt/keyrings/microsoft.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ $(lsb_release -cs) main" \
  > /etc/apt/sources.list.d/azure-cli.list
apt update -y
wait_for_apt_lock
apt install -y google-cloud-cli azure-cli
wait_for_apt_lock
# AWS CLI v2 (official installer; --update replaces an older version)
AWSCLI_TMP="$(mktemp -d)"
if curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$AWSCLI_TMP/awscliv2.zip" \
  && unzip -q "$AWSCLI_TMP/awscliv2.zip" -d "$AWSCLI_TMP"; then
  "$AWSCLI_TMP/aws/install" --update
else
  echo "AWS CLI download failed."
fi
rm -rf "$AWSCLI_TMP"
aws --version
gcloud --version | head -1
az version --output tsv --query '"azure-cli"'

# package upgrade
echo "Running system upgrade..."
apt upgrade -y
wait_for_apt_lock

# Disable SSH reverse DNS lookup (UseDNS) to prevent connection delays
# when Private DNS Zones are linked to the VNet (e.g. after Azure Files NFS deployment).
# By default sshd performs a reverse PTR lookup on the connecting client IP;
# if the lookup times out (common in cross-cloud VPN environments where
# 10.0.x.x / 10.1.x.x PTR records do not exist in Azure DNS), SSH connections
# from AWS and GCP stall for 20-60 seconds before the auth phase begins.
echo "Disabling SSH reverse DNS lookup (UseDNS=no)..."
if grep -q "^UseDNS" /etc/ssh/sshd_config; then
  sed -i 's/^UseDNS.*/UseDNS no/' /etc/ssh/sshd_config
else
  echo "UseDNS no" >> /etc/ssh/sshd_config
fi
systemctl restart ssh
echo "SSH UseDNS disabled."
