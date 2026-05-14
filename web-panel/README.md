# CLIProxyAPI Web Panel

A lightweight, dependency-free management UI shipped as a static site served by Nginx.

The container:

- serves the UI on `http://127.0.0.1:${CLI_PROXY_PANEL_PORT:-3001}`
- reverse-proxies `/v0/management/*` and `/v1/*` to the CLIProxyAPI upstream (so the browser talks to a single origin)

## Run (docker compose)

From the repository root:

```bash
# Web UI only
docker compose up -d --build cli-proxy-panel

# Proxy + Web UI
docker compose --profile api up -d --build
```

Then open:

- http://127.0.0.1:3001

## Auth

The panel needs a **management key** (same as the Management API):

- `MANAGEMENT_PASSWORD` (recommended)
- or `remote-management.secret-key`

For `/v1/*` OpenAI-compatible calls (models/chat), the UI uses a **client API key** from `config.yaml` (`api-keys`).

## Features

- view/edit server config via `/v0/management/config`
- unified provider management in one Connections view (OpenAI-compatible, OAuth, and API-key providers)
- pre-configured provider catalog with endpoints and auth methods
- auth files overview and OAuth flow helpers
- models list and upstream checks
- basic chat client
