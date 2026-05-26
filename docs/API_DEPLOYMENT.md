# API Deployment

`api.skkubot.xyz` and `staging-api.skkubot.xyz` -> `hyeonski.iptime.org` -> home server Docker Compose.

## Architecture

```text
Internet
  -> api.skkubot.xyz / staging-api.skkubot.xyz
  -> hyeonski.iptime.org
  -> router port forwarding 80/443
  -> Caddy container
  -> api-main / api-staging container :8000
  -> external MySQL
```

Only ports `80` and `443` should be exposed to the internet. Do not expose API port `8000` or MySQL `3306` from the router.

## Server Prerequisites

- Docker Engine + Docker Compose plugin
- `api.skkubot.xyz` CNAME points to `hyeonski.iptime.org`
- `staging-api.skkubot.xyz` CNAME points to `hyeonski.iptime.org`
- `hyeonski.iptime.org` resolves to the home server's public IP
- Router forwards WAN `80 -> home-server:80` and WAN `443 -> home-server:443`
- A reachable MySQL database for each environment

If the ISP uses CGNAT or blocks inbound 80/443, Caddy cannot issue normal Let's Encrypt certificates with this setup. Use a public reverse proxy, Cloudflare Tunnel, or DNS-01 certificate automation instead.

## Environment File

From the repo root on the home server:

```bash
cp .env.deploy.example .env
vi .env
```

Set strong values:

```env
API_MAIN_DOMAIN=api.skkubot.xyz
API_STAGING_DOMAIN=staging-api.skkubot.xyz

API_MAIN_IMAGE=skkubot-api:main
API_STAGING_IMAGE=skkubot-api:staging

DATABASE_URL_MAIN="mysql://user:password@db-host:3306/skku_reservation"
DATABASE_URL_STAGING="mysql://user:password@db-host:3306/skku_reservation_staging"

LLM_API_KEY=...
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_TIMEOUT_MS=20000
```

Use separate databases for main and staging so Prisma migrations and test data do not collide.

If MySQL runs directly on the Docker host, use the host's LAN IP in `DATABASE_URL_*`. On Docker Desktop, `host.docker.internal` works; on Linux Docker Engine, a real host IP is more predictable.

## Build Images

Build each branch into a distinct local image tag:

```bash
git checkout main
git pull
docker build -f server/Dockerfile --build-arg APP_ENV=main -t skkubot-api:main .

git checkout staging
git pull
docker build -f server/Dockerfile --build-arg APP_ENV=staging -t skkubot-api:staging .
```

## First Deploy

Start both API environments and Caddy:

```bash
docker compose up -d
```

The API containers run Prisma migrations on startup with `prisma migrate deploy`.

Check status:

```bash
docker compose ps
docker compose logs -f api-main
docker compose logs -f api-staging
docker compose logs -f caddy
```

Verify HTTPS:

```bash
curl -i https://api.skkubot.xyz/health
curl -i https://staging-api.skkubot.xyz/health
```

Expected response:

```json
{"ok":true}
```

## Updating

Staging:

```bash
git checkout staging
git pull
docker build -f server/Dockerfile --build-arg APP_ENV=staging -t skkubot-api:staging .
docker compose up -d api-staging
docker compose logs -f api-staging
```

Main:

```bash
git checkout main
git pull
docker build -f server/Dockerfile --build-arg APP_ENV=main -t skkubot-api:main .
docker compose up -d api-main
docker compose logs -f api-main
```

## Extension Builds

The extension API URL is baked into the build output, including the generated `host_permissions` in `manifest.json`.

Main:

```bash
cd extension
pnpm build:main
```

Staging:

```bash
cd extension
pnpm build:staging
```

Defaults live in:

- `extension/.env.main`
- `extension/.env.staging`
- `extension/.env.development`

Override them at build time when needed:

```bash
VITE_API_BASE_URL=https://custom-api.example.com pnpm build:staging
```

Before uploading to Chrome Web Store, confirm `extension/dist/manifest.json` contains the expected API host permission for the environment you built.
