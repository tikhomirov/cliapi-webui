# CLI API + WebUI

<p align="center">
  <img src="https://raw.githubusercontent.com/tikhomirov/cliapi-webui/main/assets/logo.svg" alt="CLI API WebUI" width="120">
</p>

<p align="center">
  <b>Универсальный AI-прокси с веб-интерфейсом управления</b><br>
  OpenAI-совместимый API · Мульти-провайдерная маршрутизация · OAuth-авторизация · Мониторинг
</p>

<p align="center">
  <a href="https://github.com/tikhomirov/cliapi-webui/releases"><img src="https://img.shields.io/github/v/release/tikhomirov/cliapi-webui?style=flat-square&color=blue" alt="Release"></a>
  <a href="https://github.com/tikhomirov/cliapi-webui/blob/main/LICENSE"><img src="https://img.shields.io/github/license/tikhomirov/cliapi-webui?style=flat-square&color=green" alt="License"></a>
  <a href="https://github.com/tikhomirov/cliapi-webui/actions"><img src="https://img.shields.io/github/actions/workflow/status/tikhomirov/cliapi-webui/docker-image.yml?style=flat-square&color=orange" alt="Build"></a>
  <a href="#docker"><img src="https://img.shields.io/badge/docker-ready-blue?style=flat-square&logo=docker" alt="Docker"></a>
</p>

<p align="center">
  <a href="README.md">🇬🇧 English version</a>
</p>

---

## 🚀 Быстрый старт

```bash
# Клонируем репозиторий
git clone https://github.com/tikhomirov/cliapi-webui.git
cd cliapi-webui

# Запускаем полный стек (Прокси + WebUI)
docker compose --profile api up -d --build

# Или только WebUI (если прокси уже запущен)
docker compose up -d --build cli-proxy-panel
```

Открываем http://localhost:3001 — WebUI готов к работе.

## ✨ Возможности

### 🔌 Универсальная совместимость
- **OpenAI-compatible** `/v1/chat/completions` и `/v1/models`
- **Claude API** через протокол Anthropic
- **Google Gemini** интеграция (REST и CLI)
- **Codex** (OpenAI) с поддержкой WebSocket
- **Кастомные провайдеры** через настраиваемые трансляторы

### 🎛️ Веб-интерфейс управления
| Функция | Описание |
|---------|----------|
| 📊 **Дашборд** | Статистика использования, метрики запросов, здоровье провайдеров |
| 🔑 **API-ключи** | Управление клиентскими ключами, квоты, ротация |
| 🌐 **Провайдеры** | Настройка OpenAI, Claude, Gemini, Codex, кастомные эндпоинты |
| 🤖 **Модели** | Просмотр доступных моделей, тестирование подключений, алиасы |
| 💬 **Чат** | Встроенный чат для тестирования моделей |
| ⚙️ **Конфиг** | Редактирование конфигурации с hot-reload |
| 📈 **Трафик** | Логи запросов и анализ трафика |

### 🔐 OAuth и аутентификация
- **Автоматические OAuth-потоки** для Claude, OpenAI, Gemini, Codex
- **Управление auth-файлами** с безопасным хранением токенов
- **Поддержка нескольких аккаунтов** для каждого провайдера
- **Автообновление** токенов

### ⚡ Продвинутые возможности
- **Балансировка нагрузки** по нескольким API-ключам (round-robin)
- **Кэширование запросов** с дедупликацией по сигнатуре
- **Трекинг использования** по ключу, модели, провайдеру
- **Поддержка reasoning** (Claude thinking, Codex reasoning)
- **Проксирование генерации изображений**
- **WebSocket relay** для real-time функций

## 📸 Скриншоты

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Дашборд" width="45%">
  &nbsp;
  <img src="docs/screenshots/providers.png" alt="Провайдеры" width="45%">
</p>

<p align="center">
  <img src="docs/screenshots/chat.png" alt="Чат" width="45%">
  &nbsp;
  <img src="docs/screenshots/models.png" alt="Модели" width="45%">
</p>

> 💡 *Пути к скриншотам — заглушки. Замените на реальные скриншоты в директории `docs/screenshots/`.*

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                        WebUI (Nginx)                        │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ Дашборд  │Провайдеры│  Модели  │   Чат    │ Настройки│  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │ Single Origin (без CORS)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     CLIProxyAPI Core                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Роутер    │  │ Трансляторы │  │  Auth Conductor     │ │
│  │             │──│  OpenAI↔    │──│  (OAuth + Ключи)    │ │
│  │ /v1/models  │  │  Claude↔    │  │                     │ │
│  │ /v1/chat    │  │  Gemini↔    │  │ · Обновление токенов│ │
│  │ /v1/images  │  │  Codex↔     │  │ · Ротация ключей    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ OpenAI  │ │ Claude  │ │ Gemini  │
   └─────────┘ └─────────┘ └─────────┘
```

## 📋 Конфигурация

### Минимальный `config.yaml`

```yaml
server:
  listen: ":8317"
  management:
    password: "your-secure-password"  # или через env MANAGEMENT_PASSWORD

providers:
  openai:
    base_url: "https://api.openai.com/v1"
    api_key: "sk-..."  # или OAuth

  anthropic:
    base_url: "https://api.anthropic.com"
    api_key: "sk-ant-..."

api_keys:
  client-keys:
    - "sk-client-1"
    - "sk-client-2"
```

### Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `MANAGEMENT_PASSWORD` | Пароль для WebUI/API | — |
| `NO_MANAGEMENT_AUTH` | Отключить авторизацию (только для разработки) | `false` |
| `CLI_PROXY_PANEL_PORT` | Порт WebUI | `3001` |
| `CLI_PROXY_CONFIG_PATH` | Путь к конфигу | `config.yaml` |

## 🛠️ Разработка

```bash
# Сборка локально
go build -o cli-proxy-api ./cmd/server

# Запуск с hot-reload
go run ./cmd/server --config config.yaml

# Сборка только WebUI (статические файлы)
cd web-panel && docker build -t cli-proxy-panel .
```

## 🐳 Docker Compose стеки

### Продакшен-стек
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

## 📚 Документация

- [SDK Access Guide](docs/sdk-access.md) — Встраивание прокси в Go-приложения
- [SDK Usage Guide](docs/sdk-usage.md) — Аутентификация и обработка запросов
- [SDK Advanced](docs/sdk-advanced.md) — Watcher-паттерны и кастомные провайдеры
- [SDK Watcher](docs/sdk-watcher.md) — Обновления конфигурации в реальном времени

## 🤝 Участие в проекте

Мы приветствуем вклад в проект! Пожалуйста, ознакомьтесь с [Руководством по участию](CONTRIBUTING.md).

## 📄 Лицензия

Этот проект распространяется под лицензией MIT — см. файл [LICENSE](LICENSE).

## 🙏 Благодарности

- Построен на базе [Gin](https://github.com/gin-gonic/gin) web framework
- Вдохновлен различными решениями для проксирования AI API
- Вклад сообщества и обратная связь

---

<p align="center">
  Сделано с ❤️ для сообщества AI-разработчиков
</p>