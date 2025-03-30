# Cloud to Cloud VPN Connection

Building a cloud-to-cloud VPN with CDK for Terraform

# Description

Sample for building VPN connection between AWS, Azure and GoogleCloud with CDK for Terraform

# Operating environment

Ubuntu 24.04.1 LTS  
Docker version 27.3.1

# Usage

## Preparation of environment variables

1.Get AWS authentication information  
2.Get GoogleCloud serviceaccount information  
3.Get Azure Authentication Information  
4.Save the .env.sample file as .env after editing 5.Launch docker and run terraform in a container

## Docker startup for CDKTF

```
git clone https://github.com/Otazoman/cdktf_multicloudvpn.git
cd cdktf_multicloudvpn
docker build --build-arg NODE_VERSION=22 --build-arg TERRAFORM_VERSION=1.9.8 -t cdktf-docker .
docker compose up -d
docker compose exec cdktf-vpn bash
```

## If you want to initialize

```
cdktf init --template=typescript --local
npm install @cdktf/provider-aws@latest
npm install @cdktf/provider-google@latest
npm install @cdktf/provider-azurerm@latest
npm install @cdktf/provider-tls@latest
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
