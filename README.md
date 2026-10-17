# Multi-Cloud Backend

[日本語](README.ja.md)

Infrastructure as code for a backend that spans **AWS, Google Cloud and Azure**,
built with [CDK Terrain (cdktn)](https://github.com/open-constructs/cdk-terrain) and TypeScript.

- Site-to-site VPN between the clouds (full mesh, or hub-and-spoke through one cloud)
- Per-cloud networking, VMs, managed databases, file storage, managed containers,
  load balancers, public/private DNS and CI/CD — each switchable by a flag
- Separate environments (`dev`, `stg`, `prod`) in separate cloud accounts, selected with `DEPLOY_ENV`
- Single-tunnel and HA (BGP) VPN modes

## Repository layout

| Path                         | Description                                                                 |
| ---------------------------- | --------------------------------------------------------------------------- |
| `app/`                       | The cdktn application (source of truth). See [app/README.md](app/README.md) |
| `Dockerfile`, `compose.yaml` | Container with Node.js, cdktn CLI, Terraform and OpenTofu                   |
| `.env.sample`                | Template for the tool versions (`.env`)                                     |
| `.env.ENV.sample`            | Template for the credentials and secrets of one environment (`.env.<env>`)  |

## Quick start

Requirements: Docker and Docker Compose, plus accounts for the clouds you deploy to.

```bash
git clone https://github.com/Otazoman/cdktn_multicloud_backend.git
cd cdktn_multicloud_backend

cp .env.sample .env            # tool versions
cp .env.ENV.sample .env.dev    # credentials and secrets of the dev environment
DEPLOY_ENV=dev docker compose -p cdktn-dev up -d --build
docker compose -p cdktn-dev exec cdktn-backend bash

# inside the container (working directory: /app)
npm install
cdktn diff                     # review the plan
cdktn deploy                   # create resources
```

Before the first deploy, complete the cloud-side preparation (required APIs,
IAM permissions, certificates and keys) described in
[app/docs/getting-started.md](app/docs/getting-started.md).

To delete everything, run `cdktn destroy`. Some services need extra steps or a
second run; see [app/docs/operations.md](app/docs/operations.md).

## Documentation

- [Getting started](app/docs/getting-started.md) — prerequisites, credentials, configuration, first deploy
- [Operations](app/docs/operations.md) — deploy / destroy procedures and known issues per service
- [Architecture](app/docs/architecture.md) — layers, flow, design rules
- [VPN](app/docs/networking/vpn.md) — topologies, BGP / APIPA design
- [Adding a cloud](app/docs/adding-a-cloud.md) — step-by-step guide
- [Application overview](app/README.md) — directory structure and development commands

## License

[MIT](LICENSE)
