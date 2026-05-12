# CLIProxyAPI (RU)

CLIProxyAPI — локальный прокси с API, совместимым с OpenAI / Gemini / Claude / Codex.

В этой сборке используется минимальный локальный стек:

- Proxy API: `http://127.0.0.1:8317`
- Web UI: `http://127.0.0.1:3001`

## Быстрый старт (Docker)

1. Подготовь `config.yaml` (можно взять за основу `config.example.yaml`) и добавь client API key:

```yaml
api-keys:
  - "sk-your-client-key"
```

2. (Опционально) создай `.env` для входа в панель:

```env
MANAGEMENT_PASSWORD=your-strong-password
CLI_PROXY_PANEL_PORT=3001
```

3. Запусти:

```bash
# Только UI
docker compose up -d --build cli-proxy-panel

# Proxy + UI
docker compose --profile api up -d --build
```

## Важно про ключи

- **management key** — нужен для входа в Web UI и вызовов `/v0/management/*`
  - `MANAGEMENT_PASSWORD` или `remote-management.secret-key`
- **client API key** — нужен для вызовов `/v1/*` (чат, модели и т.д.)
  - `api-keys` в `config.yaml`

## Очистка устаревших моделей

```bash
curl -s http://127.0.0.1:8317/v0/management/models/stale
curl -s -X POST http://127.0.0.1:8317/v0/management/models/cleanup
```
