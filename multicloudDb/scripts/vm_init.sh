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
    while fuser /var/lib/dpkg/lock >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; do
        echo "Waiting for apt locks to be released..."
        sleep 5
    done
    echo "Apt locks are free. Proceeding with package management."
}

# set timezone and editor
timedatectl set-timezone Asia/Tokyo
update-alternatives --set editor /usr/bin/vim.basic

# wait for apt lock
wait_for_apt_lock

# wait for internet connection with curl instead of ping
wait_for_internet

# package update and installation
echo "Running system update and upgrade..."
apt update -y && apt upgrade -y
echo "Installing required clients..."
apt install -y mysql-client postgresql-client