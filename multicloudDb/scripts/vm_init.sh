#!/bin/bash

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
apt install -y mysql-client postgresql-client
wait_for_apt_lock
# package upgrade
echo "Running system upgrade..."
apt upgrade -y
wait_for_apt_lock
