# Multi-Cloud Backend

Sample placement for building a backend in multiple clouds

# Description

Create a VPN connection between AWS, Google and Azure with a backend integration with CDKTF

# Operating environment

Ubuntu 24.04.3 LTS  
Docker version 28.5.1  
Docker Compose v2.40.1

# Usage

## Preparation of environment variables

1.Get AWS authentication information  
2.Get GoogleCloud serviceaccount information  
3.Get Azure Authentication Information  
4.Save the .env.sample file as .env after editing 5.Launch docker and run terraform in a container

## Docker startup for CDKTF

```
git clone https://github.com/Otazoman/cdktf_multicloud_backend.git
cd cdktf_multicloudbackend
docker build --build-arg NODE_VERSION=22 --build-arg TERRAFORM_VERSION=1.13.4 -t cdktf-docker .
docker compose up -d
docker compose exec cdktf-backend bash
```

## If you want to initialize

```
cdktf init --template=typescript --local
npm install @cdktn/provider-aws@latest
npm install @cdktn/provider-google@latest
npm install @cdktn/provider-azurerm@latest
npm install @cdktn/provider-tls@latest
```

## When you want to run a minute that has already been created

Volume of compose.yaml - ./app:/app in place of ./workdir:/app and replace it with

```
npm install
cdktf plan
cdktf deploy
```

If you want to delete a resource

```
cdktf destroy
```
