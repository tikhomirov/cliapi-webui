# AGENTS.md

Go 1.26+ proxy server providing OpenAI/Gemini/Claude/Codex compatible APIs with OAuth and round-robin load balancing.

## Local Setup (Alex's Environment)

### Ports
- **3001** — Custom web-panel (web-panel/)
- **8317** — CLIProxyAPI (OpenAI-compatible)
- **3000** — Open WebUI (external)
- **8081** — llama.cpp server (external)

### Running the Web Panel

The custom web-panel is in `web-panel/` directory. To build and run:

```bash
# Build Docker image
cd /home/alex/Projects/CLIProxyAPI/web-panel
docker build -t cli-proxy-panel .

# Run on port 3001, connecting to API at 8317
docker run -d --name cli-proxy-panel -p 3001:80 \
  -e CLI_PROXY_UPSTREAM=http://<host-ip>:8317 \
  cli-proxy-panel

# Or use docker-compose from project root:
docker compose up -d --build cli-proxy-panel
```

Access the panel at: http://127.0.0.1:3001/

### Model Cleanup API

Sometimes models in config become stale - the provider removes them from upstream, but they remain in config. This causes errors when calling unavailable models.

**Check stale models:**
```bash
curl -s http://127.0.0.1:8317/v0/management/models/stale
```

Response shows:
- `configured` — models in config
- `upstream` — models available from provider
- `stale` — models in config but NOT in upstream
- `totalStale` — total count of stale models

**Automatically remove stale models:**
```bash
curl -s -X POST http://127.0.0.1:8317/v0/management/models/cleanup
```

Response shows:
- `status` — "ok" on success
- `removed` — list of removed models
- `total` — count of removed models

These endpoints can be used in the web-panel to add a "Cleanup Models" button.

## Repository
- GitHub: https://github.com/router-for-me/CLIProxyAPI

## Commands
```bash
gofmt -w . # Format (required after Go changes)
go build -o cli-proxy-api ./cmd/server # Build
go run ./cmd/server # Run dev server
go test ./... # Run all tests
go test -v -run TestName ./path/to/pkg # Run single test
go build -o test-output ./cmd/server && rm test-output # Verify compile (REQUIRED after changes)
```
- Common flags: `--config <path>`, `--tui`, `--standalone`, `--local-model`, `--no-browser`, `--oauth-callback-port <port>`

## Config
- Default config: `config.yaml` (template: `config.example.yaml`)
- `.env` is auto-loaded from the working directory
- Auth material defaults under `auths/`
- Storage backends: file-based default; optional Postgres/git/object store (`PGSTORE_*`, `GITSTORE_*`, `OBJECTSTORE_*`)

## Architecture
- `cmd/server/` — Server entrypoint
- `internal/api/` — Gin HTTP API (routes, middleware, modules)
- `internal/api/modules/amp/` — Amp integration (Amp-style routes + reverse proxy)
- `internal/thinking/` — Main thinking/reasoning pipeline. `ApplyThinking()` (apply.go) parses suffixes (`suffix.go`, suffix overrides body), normalizes config to canonical `ThinkingConfig` (`types.go`), normalizes and validates centrally (`validate.go`/`convert.go`), then applies provider-specific output via `ProviderApplier`. Do not break this "canonical representation → per-provider translation" architecture.
- `internal/runtime/executor/` — Per-provider runtime executors (incl. Codex WebSocket)
- `internal/translator/` — Provider protocol translators (and shared `common`)
- `internal/registry/` — Model registry + remote updater (`StartModelsUpdater`); `--local-model` disables remote updates
- `internal/store/` — Storage implementations and secret resolution
- `internal/managementasset/` — Config snapshots and management assets
- `internal/cache/` — Request signature caching
- `internal/watcher/` — Config hot-reload and watchers
- `internal/wsrelay/` — WebSocket relay sessions
- `internal/usage/` — Usage and token accounting
- `internal/tui/` — Bubbletea terminal UI (`--tui`, `--standalone`)
- `sdk/cliproxy/` — Embeddable SDK entry (service/builder/watchers/pipeline)
- `test/` — Cross-module integration tests

## Code Conventions
- Keep changes small and simple (KISS)
- Comments in English only
- If editing code that already contains non-English comments, translate them to English (don’t add new non-English comments)
- For user-visible strings, keep the existing language used in that file/area
- New Markdown docs should be in English unless the file is explicitly language-specific (e.g. `README_CN.md`)
- As a rule, do not make standalone changes to `internal/translator/`. You may modify it only as part of broader changes elsewhere.
- If a task requires changing only `internal/translator/`, run `gh repo view --json viewerPermission -q .viewerPermission` to confirm you have `WRITE`, `MAINTAIN`, or `ADMIN`. If you do, you may proceed; otherwise, file a GitHub issue including the goal, rationale, and the intended implementation code, then stop further work.
- `internal/runtime/executor/` should contain executors and their unit tests only. Place any helper/supporting files under `internal/runtime/executor/helps/`.
- Follow `gofmt`; keep imports goimports-style; wrap errors with context where helpful
- Do not use `log.Fatal`/`log.Fatalf` (terminates the process); prefer returning errors and logging via logrus
- Shadowed variables: use method suffix (`errStart := server.Start()`)
- Wrap defer errors: `defer func() { if err := f.Close(); err != nil { log.Errorf(...) } }()`
- Use logrus structured logging; avoid leaking secrets/tokens in logs
- Avoid panics in HTTP handlers; prefer logged errors and meaningful HTTP status codes
- Timeouts are allowed only during credential acquisition; after an upstream connection is established, do not set timeouts for any subsequent network behavior. Intentional exceptions that must remain allowed are the Codex websocket liveness deadlines in `internal/runtime/executor/codex_websockets_executor.go`, the wsrelay session deadlines in `internal/wsrelay/session.go`, the management APICall timeout in `internal/api/handlers/management/api_tools.go`, and the `cmd/fetch_antigravity_models` utility timeouts

## Web Panel UI Rules
- Do not overwrite or revert unrelated parallel changes; only touch the exact files/blocks required by the task.
- Replace emoji UI markers with shared SVG icons only.
- Prefer a shared icon package only if it is explicitly approved for the project.
- Otherwise use the shared Tabler-style SVG sprite at `web-panel/assets/icons.svg` via the `icon()` helper and reuse it across the web-panel.
