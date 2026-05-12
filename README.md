# CLI API + WebUI

<p align="center">
  <img src="https://raw.githubusercontent.com/tikhomirov/cliapi-webui/main/assets/logo.svg" alt="CLI API WebUI" width="120">
</p>

<p align="center">
  <b>Universal AI Proxy with Integrated Web Management Interface</b><br>
  OpenAI-compatible API · Multi-provider routing · OAuth management · Real-time monitoring
</p>

<p align="center">
  <a href="https://github.com/tikhomirov/cliapi-webui/releases"><img src="https://img.shields.io/github/v/release/tikhomirov/cliapi-webui?style=flat-square&color=blue" alt="Release"></a>
  <a href="https://github.com/tikhomirov/cliapi-webui/blob/main/LICENSE"><img src="https://img.shields.io/github/license/tikhomirov/cliapi-webui?style=flat-square&color=green" alt="License"></a>
  <a href="https://github.com/tikhomirov/cliapi-webui/actions"><img src="https://img.shields.io/github/actions/workflow/status/tikhomirov/cliapi-webui/docker-image.yml?style=flat-square&color=orange" alt="Build"></a>
  <a href="#docker"><img src="https://img.shields.io/badge/docker-ready-blue?style=flat-square&logo=docker" alt="Docker"></a>
</p>

<p align="center">
  <a href="README_RU.md">🇷🇺 Русская версия</a>
</p>

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/tikhomirov/cliapi-webui.git
cd cliapi-webui

# Start the complete stack (Proxy + WebUI)
docker compose --profile api up -d --build

# Or start only WebUI (if proxy is already running)
docker compose up -d --build cli-proxy-panel
```

Open http://localhost:3001 — the WebUI is ready.

## ✨ Features

### 🔌 Universal API Compatibility
- **OpenAI-compatible** `/v1/chat/completions` and `/v1/models`
- **Claude API** support via Anthropic protocol
- **Google Gemini** integration (REST and CLI)
- **Codex** (OpenAI) with WebSocket support
- **Custom providers** via configurable translators

### 🎛️ Web Management Interface
| Feature | Description |
|---------|-------------|
| 📊 **Dashboard** | Real-time usage statistics, request metrics, provider health |
| 🔑 **API Keys** | Manage client keys, view usage quotas, rotate credentials |
| 🌐 **Providers** | Configure OpenAI, Claude, Gemini, Codex, custom endpoints |
| 🤖 **Models** | Browse available models, test connections, manage aliases |
| 💬 **Chat** | Built-in chat interface for testing models |
| ⚙️ **Config** | Live configuration editing with hot-reload |
| 📈 **Traffic** | Request logs and traffic analysis |

### 🔐 OAuth & Authentication
- **Automatic OAuth flows** for Claude, OpenAI, Gemini, Codex
- **Auth file management** with secure token storage
- **Multi-account support** for each provider
- **Token refresh** automation

### ⚡ Advanced Capabilities
- **Load balancing** across multiple API keys (round-robin)
- **Request caching** with signature-based deduplication
- **Usage tracking** per key, per model, per provider
- **Thinking/reasoning** support (Claude thinking, Codex reasoning)
- **Image generation** proxy support
- **WebSocket relay** for real-time features

## 📸 Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="45%">
  &nbsp;
  <img src="docs/screenshots/providers.png" alt="Providers" width="45%">
</p>

<p align="center">
  <img src="docs/screenshots/chat.png" alt="Chat Interface" width="45%">
  &nbsp;
  <img src="docs/screenshots/models.png" alt="Models" width="45%">
</p>

> 💡 *Screenshots are placeholder paths. Replace with actual screenshots in `docs/screenshots/` directory.*

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        WebUI (Nginx)                        │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ Dashboard│ Providers│  Models  │   Chat   │ Settings │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ Single Origin (CORS-free)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     CLIProxyAPI Core                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Router    │  │ Translators │  │  Auth Conductor     │ │
│  │             │──│  OpenAI↔    │──│  (OAuth + Keys)     │ │
│  │ /v1/models  │  │  Claude↔    │  │                     │ │
│  │ /v1/chat    │  │  Gemini↔    │  │ · Token refresh     │ │
│  │ /v1/images  │  │  Codex↔     │  │ · Key rotation      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ OpenAI  │ │ Claude  │ │ Gemini  │
   └─────────┘ └─────────┘ └─────────┘
```

## 📋 Configuration

### Minimal `config.yaml`

```yaml
server:
  listen: ":8317"
  management:
    password: "your-secure-password"  # or use env MANAGEMENT_PASSWORD

providers:
  openai:
    base_url: "https://api.openai.com/v1"
    api_key: "sk-..."  # or use OAuth

  anthropic:
    base_url: "https://api.anthropic.com"
    api_key: "sk-ant-..."

api_keys:
  client-keys:
    - "sk-client-1"
    - "sk-client-2"
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MANAGEMENT_PASSWORD` | WebUI/API password | — |
| `NO_MANAGEMENT_AUTH` | Disable auth (dev only) | `false` |
| `CLI_PROXY_PANEL_PORT` | WebUI port | `3001` |
| `CLI_PROXY_CONFIG_PATH` | Config file path | `config.yaml` |

## 🛠️ Development

```bash
# Build locally
go build -o cli-proxy-api ./cmd/server

# Run with hot-reload (requires entr or similar)
go run ./cmd/server --config config.yaml

# Build WebUI only (static files)
cd web-panel && docker build -t cli-proxy-panel .
```

## 🐳 Docker Compose Stacks

### Production Stack
```yaml
# docker-compose.yml
services:
  cli-proxy-api:
    image: ghcr.io/tikhomirov/cliapi-webui:latest
    ports:
      - "127.0.0.1:8317:8317"
    volumes:
      - ./config.yaml:/CLIProxyAPI/config.yaml:ro
      - ./auths:/root/.cli-proxy-api
    environment:
      - MANAGEMENT_PASSWORD=${MANAGEMENT_PASSWORD}

  cli-proxy-panel:
    image: ghcr.io/tikhomirov/cliapi-webui:panel-latest
    ports:
      - "127.0.0.1:3001:3001"
    environment:
      - CLI_PROXY_UPSTREAM=http://cli-proxy-api:8317
```

## 📚 Documentation

- [SDK Access Guide](docs/sdk-access.md) — Embedding the proxy in Go applications
- [SDK Usage Guide](docs/sdk-usage.md) — Authentication and request handling
- [SDK Advanced](docs/sdk-advanced.md) — Watcher patterns and custom providers
- [SDK Watcher](docs/sdk-watcher.md) — Real-time configuration updates

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- Built on top of [Gin](https://github.com/gin-gonic/gin) web framework
- Inspired by various AI API proxy solutions
- Community contributions and feedback

---

<p align="center">
  Made with ❤️ for the AI developer community
</p>