# CLIProxyAPI

CLIProxyAPI is a Go proxy server that provides OpenAI/Gemini/Claude/Codex-compatible APIs, with OAuth support and round-robin load balancing.

It also ships with a lightweight management Web UI (served by `web-panel/`) that talks to the Management API (`/v0/management/*`) and can act as a simple chat client.

## Quick start (Docker)

1. Create a local config:

   - Copy `config.example.yaml` → `config.yaml`
   - Add at least one client API key:
     
     ```yaml
     api-keys:
       - "sk-your-client-key"
     ```

2. Create `.env` (optional, for the management UI login):

   ```env
   MANAGEMENT_PASSWORD=change-me-to-a-strong-password
   CLI_PROXY_PANEL_PORT=3001
   ```

3. Start the stack:

   ```bash
   # Web UI only
   docker compose up -d --build cli-proxy-panel

   # Proxy + Web UI
   docker compose --profile api up -d --build
   ```

4. Open:

   - Proxy API: http://127.0.0.1:8317
   - Web UI: http://127.0.0.1:3001

## Authentication model

There are two different keys:

- **Management key** (for `/v0/management/*` and logging into the Web UI)
  - `MANAGEMENT_PASSWORD` (recommended)
  - or `remote-management.secret-key` in `config.yaml`

- **Client API key** (for `/v1/*` OpenAI-compatible endpoints)
  - `api-keys` in `config.yaml`

## Management API

The Management API is mounted under:

- `http://127.0.0.1:8317/v0/management/*`

A few handy endpoints:

- `GET /v0/management/models/stale` — find configured models that no longer exist upstream
- `POST /v0/management/models/cleanup` — remove stale models from config

## Development

```bash
go test ./...
go build -o cli-proxy-api ./cmd/server
```

## Documentation

- `AGENTS.md` — project architecture & contributor notes
- `docs/` — SDK docs
- `web-panel/README.md` — Web UI details
