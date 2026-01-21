# Local HTTPS proxy (no ports) for `*.lvh.me`

This folder contains a Traefik reverse proxy that serves the local apps over HTTPS without exposing app ports.

## Prerequisites

- Docker Desktop
- mkcert

Install mkcert (macOS):

```bash
brew install mkcert nss
mkcert -install
```

## Generate local wildcard certs

From the repo root:

```bash
mkdir -p local-certs
mkcert -cert-file ./local-certs/lvh.me.pem -key-file ./local-certs/lvh.me-key.pem "*.lvh.me" lvh.me
```

Note: `local-certs/` is intentionally local-only. If you don’t want it to show as untracked, add it to `.git/info/exclude` or your global gitignore.

## Start the proxy

You must point the proxy at your deployed dev API Gateway URL:

```bash
export DEV_API_ORIGIN="https://YOUR_DEV_EXECUTE_API_ID.execute-api.eu-west-1.amazonaws.com"
docker compose -f docker/local/compose.yml up
```

## Run the apps

Run each Next app on its default port:

- dashboard: `3000`
- gallery: `3001`
- landing: `3002`

Important: the dev servers must be reachable from Docker. If you see 502s, run Next with `-H 0.0.0.0`.

## Local URLs

- Dashboard: `https://dashboard.lvh.me`
- Landing: `https://photocloud.lvh.me`
- Gallery (tenant): `https://michalphotography.lvh.me/<galleryId>`
- Same-origin API from any host: `https://<any-host>/api/*` → `${DEV_API_ORIGIN}/*`
- Direct API host: `https://api.lvh.me/*` → `${DEV_API_ORIGIN}/*`

