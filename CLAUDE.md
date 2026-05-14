# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Go 1.26+ proxy server providing OpenAI/Gemini/Claude/Codex compatible APIs with OAuth and round-robin load balancing. Custom web-panel in `web-panel/` for management UI.

**Primary work area:** `web-panel/` — vanilla JS SPA, no build step, no framework.

## Web Panel Architecture

- `index.html` — single entry point, loads all JS modules via `<script type="module">`
- `app.js` — entry: wires router, state, auth, registers views
- `core/router.js` — hash-based SPA router with view lifecycle (`register()`, `navigate()`)
- `core/api.js` — API client to `/v0/management/*` with caching, retry, auth headers
- `core/state.js` — reactive key-value store (`set`/`get`/`watch`/`persist`)
- `core/utils.js` — `h()` DOM helper, `icon()` SVG sprite helper, `debounce()`
- `core/i18n.js` — localization system
- `views/*.js` — page renderers, each exports `renderXxx(container)` returning optional cleanup fn
- `components/*.js` — shared UI: card, modal, table, toast
- `styles.css` — single stylesheet, CSS custom properties for theming
- `assets/icons.svg` — Tabler-style SVG sprite, accessed via `icon()` helper

### Web Panel Rules

- No build tools — edit files directly, refresh browser
- Use `icon()` from `utils.js` for SVG icons (reads from `assets/icons.svg` sprite)
- Do not add emoji as UI markers; use SVG icons
- Use `h()` for DOM construction, not innerHTML
- After Go API changes, update `core/api.js` to expose new endpoints

## Commands

```bash
# Web panel (Docker)
docker compose up -d --build cli-proxy-panel   # build & run on :3001

# Go backend (rare — see AGENTS.md for details)
gofmt -w .                                       # format
go build -o test-output ./cmd/server && rm test-output  # verify compile
go test ./...                                     # all tests
go test -v -run TestName ./path/to/pkg            # single test
```

## Key Ports

| Port | Service |
|------|---------|
| 3001 | Web panel (`web-panel/`) |
| 8317 | CLIProxyAPI (OpenAI-compatible API) |

## Conventions

- See AGENTS.md for full Go code conventions and architecture details
- UI strings use i18n system — add keys to `core/i18n.js`
- Comments in English only
- KISS — keep changes minimal and focused
