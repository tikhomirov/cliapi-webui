import { fmtNumber, fmtDate, fmtRelative, fmtDuration, truncate, copyToClipboard, deepClone, uid, estimateTokens, h } from './utils.js';
import {
  fetchConfig,
  fetchConfigYAML,
  saveConfigYAML,
  saveConfig,
  fetchUsage,
  fetchLogs,
  fetchRequestLogs,
  clearCache,
  fetchAPIKeys,
  createAPIKey,
  deleteAPIKey,
  fetchProvidersCheck,
  fetchAuthFiles,
  fetchOAuthURL,
  fetchOAuthStatus,
  deleteAuthFile,
  OAUTH_PROVIDERS,
  syncProviderModels,
  fetchLiveModels,
  getClientApiKey,
  getApiKey,
} from './api.js';
import { get, set } from './state.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { toastError, toastOk } from '../components/toast.js';
import { getProvidersByType, API_KEY_PROVIDERS_CATALOG } from './providers-catalog.js';
import { enrichModels } from './modelEnrichment.js';

const CLI_PROVIDER_TYPES = [
  { configKey: 'gemini-api-key', label: 'Gemini CLI' },
  { configKey: 'claude-api-key', label: 'Claude CLI' },
  { configKey: 'codex-api-key', label: 'Codex CLI' },
  { configKey: 'vertex-api-key', label: 'Vertex CLI' },
];

const MODELS_STORAGE_KEY = 'cli-proxy-enabled-models';
const MODEL_PARAMS_KEY = 'cli-proxy-model-params';

function loadEnabledModels() {
  try {
    const stored = localStorage.getItem(MODELS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveEnabledModels(enabledModels) {
  localStorage.setItem(MODELS_STORAGE_KEY, JSON.stringify(enabledModels));
}

function loadModelParams() {
  try {
    return JSON.parse(localStorage.getItem(MODEL_PARAMS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveModelParams(params) {
  localStorage.setItem(MODEL_PARAMS_KEY, JSON.stringify(params));
}

function toDashboardData(config, usage) {
  const providersRaw = config?.['openai-compatibility'] || [];
  const providers = providersRaw.map(p => ({
    name: p.name || p['base-url'] || 'unnamed',
    url: p['base-url'] || '-',
    models: p.models?.length || 0,
  }));

  const models = providersRaw.reduce((sum, p) => sum + (p.models?.length || 0), 0);
  const totalRequests = usage?.usage?.total_requests || 0;
  const totalTokens = usage?.usage?.total_tokens || 0;

  const modelStats = [];
  if (usage?.usage?.apis) {
    for (const api of Object.values(usage.usage.apis)) {
      for (const [modelName, stats] of Object.entries(api.models || {})) {
        modelStats.push({
          model: modelName,
          requests: stats.total_requests || 0,
          tokens: stats.total_tokens || 0,
        });
      }
    }
  }
  modelStats.sort((a, b) => b.requests - a.requests);

  return {
    stats: {
      providers: providers.length,
      models,
      totalRequests: fmtNumber(totalRequests),
      totalTokens: fmtNumber(totalTokens),
    },
    providers,
    recent: modelStats.slice(0, 10).map(row => ({
      ...row,
      requests: fmtNumber(row.requests),
      tokens: fmtNumber(row.tokens),
    })),
  };
}

function createTrafficEmptyState(title, desc) {
  return `
    <div class="empty-state">
      <div class="empty-state-title">${title}</div>
      ${desc ? `<div class="empty-state-desc">${desc}</div>` : ''}
    </div>
  `;
}

function parseLogLines(lines) {
  return (lines || []).map(line => {
    const match = line.match(/^\[([^\]]+)\]\s*\[[^\]]*\]\s*\[([^\]]+)\]\s*(.*)$/);
    if (match) {
      return { timestamp: match[1].replace(' ', 'T'), level: match[2].trim(), message: match[3] };
    }
    return { timestamp: '', level: 'info', message: line };
  }).filter(line => line.message);
}

function buildTrafficRequests(usage, requestLogsData) {
  const requestLogs = requestLogsData?.logs || [];
  const requests = [];

  if (usage?.usage?.apis) {
    for (const api of Object.values(usage.usage.apis)) {
      for (const [modelName, modelStats] of Object.entries(api.models || {})) {
        for (const detail of modelStats.details || []) {
          requests.push({
            time: detail.timestamp,
            model: modelName,
            latency: detail.latency_ms,
            tokens: detail.tokens?.total_tokens,
            status: detail.failed ? 'error' : 'ok',
            source: detail.source || '',
          });
        }
      }
    }
  }

  if (!requests.length && requestLogs.length) {
    for (const log of requestLogs) {
      const estimatedTokens = Math.round((log.size || 0) / 4);
      requests.push({
        time: log.timestamp,
        model: log.model || 'unknown',
        latency: null,
        tokens: estimatedTokens > 0 ? `~${estimatedTokens}` : '-',
        status: 'ok',
        source: log.method && log.url ? `${log.method} ${log.url}` : '',
      });
    }
  }

  requests.sort((a, b) => new Date(b.time) - new Date(a.time));
  return requests;
}

function toTrafficData(usage, requestLogsData, logs) {
  const requests = buildTrafficRequests(usage, requestLogsData);
  const firstTime = requests[requests.length - 1]?.time || null;
  const lastTime = requests[0]?.time || null;

  return {
    requests,
    requestSummary: {
      total: requests.length,
      firstTime,
      lastTime,
      shown: Math.min(requests.length, 100),
    },
    parsedLogs: parseLogLines(logs?.lines || []).map(line => ({
      ...line,
      levelClass: ({ error: 'badge-error', warn: 'badge-warn', info: 'badge-info', debug: 'badge-accent' })[line.level] || 'badge-info',
      levelLabel: (line.level || 'info').toUpperCase(),
      timestampLabel: fmtDate(line.timestamp),
      messageShort: truncate(line.message, 120),
    })),
  };
}

function createDefaultConfigDraft(config) {
  return {
    proxyUrl: config?.['proxy-url'] || '',
    requestLog: config?.['request-log'] === true,
    loggingToFile: config?.['logging-to-file'] === true,
    logsMaxSizeMb: config?.['logs-max-total-size-mb'] || 100,
    errorLogsMaxFiles: config?.['error-logs-max-files'] || 10,
    routingStrategy: config?.routing?.strategy || 'round-robin',
    apiKeysJson: JSON.stringify(config?.['api-keys'] || [], null, 2),
  };
}

function applyConfigDraft(config, draft) {
  const next = deepClone(config || {});
  next['proxy-url'] = draft.proxyUrl || '';
  next['request-log'] = !!draft.requestLog;
  next['logging-to-file'] = !!draft.loggingToFile;
  next['logs-max-total-size-mb'] = Number.parseInt(draft.logsMaxSizeMb, 10) || 100;
  next['error-logs-max-files'] = Number.parseInt(draft.errorLogsMaxFiles, 10) || 10;
  next.routing = { strategy: draft.routingStrategy || 'round-robin' };
  next['api-keys'] = JSON.parse(draft.apiKeysJson || '[]');
  return next;
}

function normalizeAuthFiles(authFilesRaw) {
  if (Array.isArray(authFilesRaw)) {
    return authFilesRaw.map(file => {
      const provider = normalizeOAuthProviderKey(normalizeAuthFileProvider(file));
      const name = typeof file === 'object' && file
        ? (file.name || file.fileName || file.id || provider)
        : String(file || provider || '');
      return { name, provider, raw: file };
    }).filter(file => file.provider || file.name);
  }
  if (authFilesRaw && typeof authFilesRaw === 'object') {
    return Object.entries(authFilesRaw).map(([name, file]) => ({
      name,
      provider: normalizeOAuthProviderKey(normalizeAuthFileProvider(file) || name),
      raw: file,
    }));
  }
  return [];
}

function normalizeAuthFileProvider(file) {
  if (!file) return '';
  if (typeof file === 'string') return String(file).trim().toLowerCase();
  if (typeof file !== 'object') return '';
  const provider = file.provider || file.type || file.name || file.id || '';
  return String(provider).trim().toLowerCase();
}

function normalizeOAuthProviderKey(provider) {
  const value = String(provider || '').trim().toLowerCase();
  switch (value) {
    case 'claude':
    case 'anthropic':
      return 'anthropic';
    case 'openai':
    case 'codex':
      return 'codex';
    case 'google':
    case 'gemini':
    case 'gemini-cli':
      return 'gemini-cli';
    case 'anti-gravity':
    case 'antigravity':
      return 'antigravity';
    default:
      return value;
  }
}

function authFileProviderSet(authFilesRaw) {
  return new Set(normalizeAuthFiles(authFilesRaw).map(file => file.provider).filter(Boolean));
}

function parseOAuthState(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.searchParams.get('state') || '';
  } catch {
    return '';
  }
}

function openCenteredPopup(url, name = 'oauth', width = 860, height = 720) {
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
    'toolbar=no',
    'location=yes',
    'status=no',
  ].join(',');
  return window.open(url, name, features);
}

async function pollOAuthStatus(state, providerKey, onReady, onError) {
  if (!state) return;
  const startedAt = Date.now();
  const timeoutMs = 180000;
  const delayMs = 1500;
  while (Date.now() - startedAt < timeoutMs) {
    const status = await fetchOAuthStatus(state).catch(() => ({ status: 'ok' }));
    if (status?.status === 'error') {
      throw new Error(status.error || 'OAuth flow failed');
    }
    const authFiles = await fetchAuthFiles().catch(() => []);
    const connected = authFileProviderSet(authFiles).has(normalizeOAuthProviderKey(providerKey));
    if (connected) {
      onReady?.(authFiles);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  onError?.();
  throw new Error('OAuth flow timed out');
}

function createModalButton(label, className, onClick) {
  return h('button', { className, onClick }, [label]);
}

function createModalField(label, input, hint = '') {
  return h('div', { className: 'form-group' }, [
    h('label', { className: 'form-label' }, [label]),
    input,
    hint ? h('div', { className: 'form-hint' }, [hint]) : null,
  ]);
}

function createTextInput({ value = '', placeholder = '', type = 'text' } = {}) {
  return h('input', { className: 'form-input', type, value, placeholder });
}

function createSelect(options, value = '') {
  return h('select', { className: 'form-input', value }, options.map(option =>
    h('option', { value: option.value, selected: option.value === value }, [option.label])
  ));
}

function createModalFooter(buttons) {
  return buttons.map(button => createModalButton(button.label, button.className, button.onClick));
}

function createConfigViewModel() {
  return {
    mode: 'form',
    config: null,
    draft: createDefaultConfigDraft(null),
    yamlText: '',
    yamlLoaded: false,
    isBusy: false,
    init() {
      const savedMode = get('configEditorMode');
      if (savedMode === 'yaml' || savedMode === 'form') this.mode = savedMode;
      const existingConfig = get('config');
      if (existingConfig) {
        this.config = existingConfig;
        this.draft = createDefaultConfigDraft(existingConfig);
      }
      this.loadConfig();
      if (this.mode === 'yaml') this.loadYaml();
    },
    setMode(mode) {
      this.mode = mode;
      set('configEditorMode', mode);
      if (mode === 'yaml' && !this.yamlLoaded) this.loadYaml();
    },
    async loadConfig(showToast = false) {
      try {
        this.isBusy = true;
        const config = await fetchConfig();
        this.config = config;
        this.draft = createDefaultConfigDraft(config);
        set('config', config);
        set('configJson', JSON.stringify(config, null, 2));
        if (showToast) toastOk('Config reloaded');
      } catch (e) {
        toastError(e.message);
      } finally {
        this.isBusy = false;
      }
    },
    async loadYaml(showToast = false) {
      try {
        this.isBusy = true;
        this.yamlText = await fetchConfigYAML();
        this.yamlLoaded = true;
        if (showToast) toastOk('YAML loaded');
      } catch (e) {
        toastError(`Load failed: ${e.message}`);
      } finally {
        this.isBusy = false;
      }
    },
    async saveForm() {
      try {
        this.isBusy = true;
        const nextConfig = applyConfigDraft(this.config, this.draft);
        await saveConfig(nextConfig);
        this.config = nextConfig;
        set('config', nextConfig);
        set('configJson', JSON.stringify(nextConfig, null, 2));
        set('unsavedChanges', false);
        toastOk('Configuration saved');
      } catch (e) {
        toastError(e instanceof SyntaxError ? 'Invalid API keys JSON' : `Save failed: ${e.message}`);
      } finally {
        this.isBusy = false;
      }
    },
    async saveYaml() {
      try {
        this.isBusy = true;
        await saveConfigYAML(this.yamlText);
        const config = await fetchConfig();
        this.config = config;
        this.draft = createDefaultConfigDraft(config);
        set('config', config);
        set('configJson', JSON.stringify(config, null, 2));
        toastOk('Saved & reloaded');
      } catch (e) {
        toastError(`Save failed: ${e.message}`);
      } finally {
        this.isBusy = false;
      }
    },
  };
}

function createProvidersViewModel() {
  return {
    tab: 'connections',
    config: null,
    authFiles: [],
    authFileProviders: new Set(),
    oauthFlowState: '',
    oauthFlowProvider: '',
    oauthFlowBusy: false,
    providerCheckResults: null,
    providerSyncResults: null,
    init() {
      const savedTab = get('providerTab');
      if (savedTab) this.tab = savedTab;
      this.config = get('config') || null;
      this.authFiles = normalizeAuthFiles(get('authFiles'));
      this.authFileProviders = authFileProviderSet(get('authFiles'));
      this.providerCheckResults = get('providerCheckResults') || null;
      this.providerSyncResults = get('providerSyncResults') || null;
      this.reloadBaseData();
    },
    async reloadBaseData() {
      try {
        const [config, authFiles] = await Promise.all([
          fetchConfig(),
          fetchAuthFiles().catch(() => []),
        ]);
        this.config = config;
        this.authFiles = normalizeAuthFiles(authFiles);
        this.authFileProviders = authFileProviderSet(authFiles);
        set('config', config);
        set('authFiles', authFiles);
      } catch (e) {
        toastError(e.message);
      }
    },
    setTab(tab) {
      this.tab = tab;
      set('providerTab', tab);
    },
    get openaiProviders() {
      return (this.config?.['openai-compatibility'] || []).map(provider => ({
        name: provider.name || provider['base-url'] || 'unnamed',
        url: provider['base-url'] || 'no URL',
        keyCount: provider['api-key-entries']?.length || 0,
        modelsCount: provider.models?.length || 0,
        prefix: provider.prefix || '',
        disabled: !!provider.disabled,
        raw: provider,
      }));
    },
    get oauthProviders() {
      return OAUTH_PROVIDERS.map(provider => ({
        key: provider.key,
        label: provider.label,
        connected: this.authFileProviders?.has(provider.key) || false,
      }));
    },
    get connectedOAuthProvidersCount() {
      return this.oauthProviders.filter(provider => provider.connected).length;
    },
    get oauthFlowProviderLabel() {
      const provider = OAUTH_PROVIDERS.find(item => item.key === this.oauthFlowProvider);
      return provider?.label || this.oauthFlowProvider || 'provider';
    },
    get cliProviders() {
      const config = this.config || {};
      const rows = [];
      for (const providerType of CLI_PROVIDER_TYPES) {
        for (const entry of config[providerType.configKey] || []) {
          rows.push({
            label: providerType.label,
            configKey: providerType.configKey,
            displayKey: entry['api-key'] ? `${entry['api-key'].slice(0, 8)}...` : 'no key',
            modelsCount: entry.models?.length || 0,
            prefix: entry.prefix || '',
            baseUrl: entry['base-url'] || '',
            priority: entry.priority || 0,
            raw: entry,
          });
        }
      }
      return rows;
    },
    get apiKeyProviders() {
      const config = this.config || {};
      return Object.values(API_KEY_PROVIDERS_CATALOG).map(provider => {
        const configKey = provider.configKey || `${provider.id}-api-key`;
        const rawValue = config[configKey];
        const configured = Array.isArray(rawValue) ? rawValue.length > 0 : !!rawValue;
        return {
          id: provider.id,
          name: provider.name,
          description: provider.description,
          configured,
        };
      });
    },
    get providerCheckRows() {
      const providers = this.config?.['openai-compatibility'] || [];
      const results = this.providerCheckResults?.providers || [];
      const rows = providers.map(provider => {
        const result = results.find(item => item.name === provider.name);
        return {
          name: provider.name,
          url: provider['base-url'] || '-',
          status: result?.status === 'ok' ? 'OK' : (result?.error || 'PENDING'),
          ok: result?.status === 'ok',
          models: result?.models?.length || 0,
          latency: result?.latencyMs ? `${result.latencyMs}ms` : '-',
        };
      });
      if (this.providerCheckResults && this.authFileProviders.size > 0) {
        for (const providerKey of this.authFileProviders) {
          const provider = OAUTH_PROVIDERS.find(p => p.key === providerKey);
          if (provider) {
            rows.push({
              name: provider.label,
              url: 'OAuth',
              status: 'OK',
              ok: true,
              models: '-',
              latency: '-',
            });
          }
        }
      }
      return rows;
    },
    get providerCheckTotalModels() {
      return (this.providerCheckResults?.providers || []).reduce((sum, provider) => sum + (provider.models?.length || 0), 0);
    },
    get configuredModels() {
      const models = [];
      for (const provider of this.config?.['openai-compatibility'] || []) {
        for (const model of provider.models || []) {
          models.push({
            provider: provider.name,
            name: model.name,
            alias: model.alias || model.name,
          });
        }
      }
      return models;
    },
    get payloadOverrides() {
      return (this.config?.['model-overrides'] || []).map(rule => ({
        models: (rule.models || []).map(model => typeof model === 'string' ? model : model.name).join(', '),
        params: JSON.stringify(rule.params || {}, null, 2),
      }));
    },
    async saveFullConfig(nextConfig, okMessage) {
      await saveConfig(nextConfig);
      this.config = nextConfig;
      set('config', nextConfig);
      if (okMessage) toastOk(okMessage);
    },
    async checkProviders() {
      try {
        const results = await fetchProvidersCheck();
        this.providerCheckResults = results;
        set('providerCheckResults', results);
        toastOk('Check completed');
      } catch (e) {
        toastError(e.message);
      }
    },
    async syncModels() {
      try {
        const results = await syncProviderModels();
        this.providerSyncResults = results;
        set('providerSyncResults', results);
        const successCount = results.success || 0;
        const failedCount = results.failed || 0;
        toastOk(successCount > 0 ? `Sync completed: ${successCount} success, ${failedCount} failed` : 'Sync failed for all providers');
        if (successCount > 0) {
          await this.reloadBaseData();
        }
      } catch (e) {
        toastError(`Sync failed: ${e.message}`);
      }
    },
    openAddProviderModal(type) {
      if (type === 'openai-compatibility') {
        this.showOpenAICompatModal();
        return;
      }
      if (type === 'oauth') {
        this.showOAuthModal();
        return;
      }
      this.showAPIKeyModal();
    },
    showOpenAICompatModal() {
      const providers = getProvidersByType('openai-compatibility');
      const searchInput = document.createElement('input');
      searchInput.className = 'form-input';
      searchInput.placeholder = 'Search providers (e.g., openrouter, nvidia, groq)...';

      const providerList = document.createElement('div');
      providerList.className = 'provider-catalog-list';
      providerList.style.maxHeight = '400px';
      providerList.style.overflowY = 'auto';

      const renderProviderList = filter => {
        providerList.innerHTML = '';
        const filtered = providers.filter(provider =>
          provider.name.toLowerCase().includes(filter.toLowerCase()) ||
          provider.id.toLowerCase().includes(filter.toLowerCase())
        );

        if (!filtered.length) {
          const empty = document.createElement('div');
          empty.className = 'text-muted';
          empty.style.padding = '1rem';
          empty.style.textAlign = 'center';
          empty.textContent = 'No providers found';
          providerList.appendChild(empty);
          return;
        }

        for (const provider of filtered) {
          const item = document.createElement('div');
          item.className = 'provider-catalog-item';
          item.style.padding = '1rem';
          item.style.border = '1px solid var(--border-light)';
          item.style.borderRadius = 'var(--radius-md)';
          item.style.marginBottom = '0.5rem';

          const title = document.createElement('div');
          title.style.fontWeight = '600';
          title.style.fontSize = '1rem';
          title.textContent = provider.name;
          item.appendChild(title);

          const desc = document.createElement('div');
          desc.className = 'text-muted';
          desc.style.fontSize = '0.8rem';
          desc.textContent = provider.description;
          item.appendChild(desc);

          const actions = document.createElement('div');
          actions.style.marginTop = '0.75rem';
          const btn = document.createElement('button');
          btn.className = 'btn btn-sm btn-primary';
          btn.textContent = 'Select';
          btn.onclick = () => this.showProviderConfigForm(provider, () => renderProviderList(searchInput.value));
          actions.appendChild(btn);
          item.appendChild(actions);
          providerList.appendChild(item);
        }
      };

      searchInput.addEventListener('input', () => renderProviderList(searchInput.value));
      renderProviderList('');

      showModal({
        title: 'Add OpenAI-Compatibility Provider',
        size: 'lg',
        children: [searchInput, providerList],
        footer: [(() => {
          const btn = document.createElement('button');
          btn.className = 'btn btn-ghost';
          btn.textContent = 'Cancel';
          btn.onclick = () => closeModal();
          return btn;
        })()],
      });
    },
    showProviderConfigForm(provider, back) {
      const apiKeyInput = document.createElement('input');
      apiKeyInput.className = 'form-input';
      apiKeyInput.type = 'password';
      apiKeyInput.placeholder = 'API Key (optional)';

      const prefixInput = document.createElement('input');
      prefixInput.className = 'form-input';
      prefixInput.placeholder = 'Prefix (optional)';

      const nameInput = document.createElement('input');
      nameInput.className = 'form-input';
      nameInput.value = provider.id;

      const baseURLInput = document.createElement('input');
      baseURLInput.className = 'form-input';
      baseURLInput.value = provider.baseUrl;

      const makeGroup = (labelText, input) => {
        const group = document.createElement('div');
        group.className = 'form-group';
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = labelText;
        group.appendChild(label);
        group.appendChild(input);
        return group;
      };

      showModal({
        title: provider.name,
        size: 'lg',
        children: [
          makeGroup('Provider Name', nameInput),
          makeGroup('Base URL', baseURLInput),
          makeGroup('API Key', apiKeyInput),
          makeGroup('Prefix', prefixInput),
        ],
        footer: [
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-ghost';
            btn.textContent = 'Back';
            btn.onclick = () => {
              closeModal();
              back?.();
              this.showOpenAICompatModal();
            };
            return btn;
          })(),
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = 'Add Provider';
            btn.onclick = async () => {
              const name = nameInput.value.trim();
              const baseURL = baseURLInput.value.trim();
              if (!name || !baseURL) {
                toastError('Name and Base URL are required');
                return;
              }
              const cfg = deepClone(this.config || {});
              if (!cfg['openai-compatibility']) cfg['openai-compatibility'] = [];
              const newProvider = {
                name,
                'base-url': baseURL,
                disabled: false,
                prefix: prefixInput.value.trim() || undefined,
                'api-key-entries': apiKeyInput.value.trim() ? [{ 'api-key': apiKeyInput.value.trim() }] : [],
                models: provider.popularModels?.length ? provider.popularModels.map(model => ({ name: model.name, alias: model.alias })) : [],
              };
              cfg['openai-compatibility'].push(newProvider);
              try {
                await this.saveFullConfig(cfg, `Provider "${name}" added`);
                closeModal();
              } catch (e) {
                toastError(e.message);
              }
            };
            return btn;
          })(),
        ],
      });
    },
    showOAuthModal() {
      const select = createSelect(OAUTH_PROVIDERS.map(provider => ({
        value: provider.key,
        label: provider.label,
      })));
      showModal({
        title: 'Login via OAuth',
        children: [createModalField('Select Provider', select, 'Choose the provider you want to authenticate with')],
        footer: createModalFooter([
          { label: 'Cancel', className: 'btn btn-ghost', onClick: () => closeModal() },
          {
            label: 'Connect',
            className: 'btn btn-primary',
            onClick: () => {
              const providerKey = select.value;
              closeModal();
              void this.loginOAuth(providerKey);
            },
          },
        ]),
      });
    },
    showAPIKeyModal() {
      const providers = Object.values(API_KEY_PROVIDERS_CATALOG);
      const select = createSelect(providers.map(provider => ({
        value: provider.id,
        label: provider.name,
      })));
      const keyInput = createTextInput({ type: 'password', placeholder: 'Enter API key' });

      showModal({
        title: 'Add API Key',
        children: [
          createModalField('Select Provider', select),
          createModalField('API Key', keyInput),
        ],
        footer: createModalFooter([
          { label: 'Cancel', className: 'btn btn-ghost', onClick: () => closeModal() },
          {
            label: 'Add Key',
            className: 'btn btn-primary',
            onClick: async () => {
              const provider = API_KEY_PROVIDERS_CATALOG[select.value];
              const apiKey = keyInput.value.trim();
              if (!provider) {
                toastError('Please select a provider');
                return;
              }
              if (!apiKey) {
                toastError('API key is required');
                return;
              }
              const cfg = deepClone(this.config || {});
              cfg[provider.configKey || `${provider.id}-api-key`] = apiKey;
              try {
                await this.saveFullConfig(cfg, `API key for ${provider.name} added`);
                closeModal();
              } catch (e) {
                toastError(e.message);
              }
            },
          },
        ]),
      });
    },
    async editOpenAICompatProvider(providerName) {
      const provider = (this.config?.['openai-compatibility'] || []).find(item => item.name === providerName);
      if (!provider) {
        toastError('Provider not found');
        return;
      }
      const nameInput = document.createElement('input');
      nameInput.className = 'form-input';
      nameInput.value = provider.name;
      const baseURLInput = document.createElement('input');
      baseURLInput.className = 'form-input';
      baseURLInput.value = provider['base-url'];
      const prefixInput = document.createElement('input');
      prefixInput.className = 'form-input';
      prefixInput.value = provider.prefix || '';
      const disabledCheck = document.createElement('input');
      disabledCheck.type = 'checkbox';
      disabledCheck.checked = !!provider.disabled;

      showModal({
        title: 'Edit Provider',
        children: [
          ['Provider Name', nameInput],
          ['Base URL', baseURLInput],
          ['Prefix', prefixInput],
        ].map(([labelText, input]) => {
          const group = document.createElement('div');
          group.className = 'form-group';
          const label = document.createElement('label');
          label.className = 'form-label';
          label.textContent = labelText;
          group.append(label, input);
          return group;
        }).concat((() => {
          const group = document.createElement('div');
          group.className = 'form-group';
          const label = document.createElement('label');
          label.className = 'form-checkbox';
          label.append(disabledCheck, document.createTextNode('Disabled'));
          group.append(label);
          return group;
        })()),
        footer: [
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-ghost';
            btn.textContent = 'Cancel';
            btn.onclick = () => closeModal();
            return btn;
          })(),
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = 'Save';
            btn.onclick = async () => {
              const cfg = deepClone(this.config || {});
              const idx = cfg['openai-compatibility']?.findIndex(item => item.name === providerName);
              if (idx == null || idx < 0) {
                toastError('Provider not found');
                return;
              }
              cfg['openai-compatibility'][idx].name = nameInput.value.trim();
              cfg['openai-compatibility'][idx]['base-url'] = baseURLInput.value.trim();
              cfg['openai-compatibility'][idx].prefix = prefixInput.value.trim() || undefined;
              cfg['openai-compatibility'][idx].disabled = disabledCheck.checked;
              try {
                await this.saveFullConfig(cfg, 'Provider updated');
                closeModal();
              } catch (e) {
                toastError(e.message);
              }
            };
            return btn;
          })(),
        ],
      });
    },
    async editCLIProvider(configKey, rawKey) {
      const cfg = deepClone(this.config || {});
      const entries = cfg[configKey] || [];
      const idx = entries.findIndex(entry => entry['api-key'] === rawKey);
      if (idx < 0) {
        toastError('Provider not found');
        return;
      }
      const entry = entries[idx];
      const apiKeyInput = document.createElement('input');
      apiKeyInput.className = 'form-input';
      apiKeyInput.type = 'password';
      apiKeyInput.value = entry['api-key'] || '';
      const prefixInput = document.createElement('input');
      prefixInput.className = 'form-input';
      prefixInput.value = entry.prefix || '';
      const baseUrlInput = document.createElement('input');
      baseUrlInput.className = 'form-input';
      baseUrlInput.value = entry['base-url'] || '';
      const priorityInput = document.createElement('input');
      priorityInput.className = 'form-input';
      priorityInput.type = 'number';
      priorityInput.value = entry.priority || 0;

      showModal({
        title: 'Edit CLI Provider',
        children: [
          ['API Key', apiKeyInput],
          ['Prefix', prefixInput],
          ['Base URL', baseUrlInput],
          ['Priority', priorityInput],
        ].map(([labelText, input]) => {
          const group = document.createElement('div');
          group.className = 'form-group';
          const label = document.createElement('label');
          label.className = 'form-label';
          label.textContent = labelText;
          group.append(label, input);
          return group;
        }),
        footer: [
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-ghost';
            btn.textContent = 'Cancel';
            btn.onclick = () => closeModal();
            return btn;
          })(),
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = 'Save';
            btn.onclick = async () => {
              cfg[configKey][idx]['api-key'] = apiKeyInput.value.trim();
              cfg[configKey][idx].prefix = prefixInput.value.trim() || undefined;
              cfg[configKey][idx]['base-url'] = baseUrlInput.value.trim() || undefined;
              cfg[configKey][idx].priority = Number.parseInt(priorityInput.value, 10) || 0;
              try {
                await this.saveFullConfig(cfg, 'CLI provider updated');
                closeModal();
              } catch (e) {
                toastError(e.message);
              }
            };
            return btn;
          })(),
        ],
      });
    },
    async editAPIKey(providerId) {
      const provider = API_KEY_PROVIDERS_CATALOG[providerId];
      if (!provider) return;
      const configKey = provider.configKey || `${provider.id}-api-key`;
      const keyInput = document.createElement('input');
      keyInput.className = 'form-input';
      keyInput.type = 'password';
      keyInput.value = this.config?.[configKey] || '';

      showModal({
        title: `Edit API Key - ${provider.name}`,
        children: [(() => {
          const group = document.createElement('div');
          group.className = 'form-group';
          const label = document.createElement('label');
          label.className = 'form-label';
          label.textContent = 'API Key';
          const hint = document.createElement('div');
          hint.className = 'form-hint';
          hint.textContent = `Format: ${provider.keyFormat || 'API key'}`;
          group.append(label, keyInput, hint);
          return group;
        })()],
        footer: [
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-ghost';
            btn.textContent = 'Cancel';
            btn.onclick = () => closeModal();
            return btn;
          })(),
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = 'Save';
            btn.onclick = async () => {
              const cfg = deepClone(this.config || {});
              cfg[configKey] = keyInput.value.trim();
              try {
                await this.saveFullConfig(cfg, `API key for ${provider.name} updated`);
                closeModal();
              } catch (e) {
                toastError(e.message);
              }
            };
            return btn;
          })(),
        ],
      });
    },
    async deleteProvider(providerName) {
      const confirmed = await confirmModal({
        title: 'Delete Provider',
        message: `Are you sure you want to delete the provider "${providerName}"?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      const cfg = deepClone(this.config || {});
      cfg['openai-compatibility'] = (cfg['openai-compatibility'] || []).filter(provider => provider.name !== providerName);
      try {
        await this.saveFullConfig(cfg, `Provider "${providerName}" deleted`);
      } catch (e) {
        toastError(e.message);
      }
    },
    async deleteCLIProvider(configKey, rawKey, label) {
      const confirmed = await confirmModal({
        title: 'Delete CLI Provider',
        message: `Are you sure you want to delete this ${label} provider?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!confirmed) return;
      const cfg = deepClone(this.config || {});
      cfg[configKey] = (cfg[configKey] || []).filter(entry => entry['api-key'] !== rawKey);
      try {
        await this.saveFullConfig(cfg, `${label} provider deleted`);
      } catch (e) {
        toastError(e.message);
      }
    },
    async loginOAuth(providerKey) {
      const normalizedProvider = normalizeOAuthProviderKey(providerKey);
      let popup = null;
      try {
        const url = await fetchOAuthURL(providerKey);
        if (!url) {
          toastError('Failed to get OAuth URL');
          return;
        }
        const state = parseOAuthState(url);
        popup = openCenteredPopup(url, `oauth-${normalizedProvider}`);
        if (!popup) {
          toastError('Popup blocked. Please allow popups and try again.');
          return;
        }
        this.oauthFlowBusy = true;
        this.oauthFlowProvider = normalizedProvider;
        this.oauthFlowState = state;
        toastOk('OAuth window opened. Finish authorization there.');
        await pollOAuthStatus(state, normalizedProvider, async authFiles => {
          this.authFiles = normalizeAuthFiles(authFiles);
          this.authFileProviders = authFileProviderSet(authFiles);
          set('authFiles', authFiles);
          await this.reloadBaseData();
        });
        toastOk(`${providerKey} connected`);
      } catch (e) {
        toastError(e.message);
      } finally {
        try { popup?.close(); } catch (e) { void e; }
        this.oauthFlowBusy = false;
        this.oauthFlowProvider = '';
        this.oauthFlowState = '';
      }
    },
    async disconnectOAuth(providerKey) {
      const confirmed = await confirmModal({
        title: 'Disconnect OAuth',
        message: `Are you sure you want to disconnect ${providerKey}?`,
        confirmLabel: 'Disconnect',
        danger: true,
      });
      if (!confirmed) return;
      try {
        await deleteAuthFile(providerKey);
        const authFiles = await fetchAuthFiles();
        this.authFiles = normalizeAuthFiles(authFiles);
        this.authFileProviders = authFileProviderSet(authFiles);
        set('authFiles', authFiles);
        await this.reloadBaseData();
        toastOk(`${providerKey} disconnected`);
      } catch (e) {
        toastError(e.message);
      }
    },
    statusClass(ok) {
      return ok ? 'badge badge-ok' : 'badge badge-error';
    },
  };
}

function loadChatHistory() {
  try {
    const raw = localStorage.getItem('cli-proxy-chat-history');
    if (!raw) return { chats: [] };
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.chats)) return { chats: [] };
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    data.chats = data.chats.filter(chat => (chat.updatedAt || chat.createdAt) > cutoff);
    return data;
  } catch {
    return { chats: [] };
  }
}

function saveChatHistory(data) {
  try {
    localStorage.setItem('cli-proxy-chat-history', JSON.stringify(data));
  } catch {
    // ignore
  }
}

function saveCurrentChatEntry(chat) {
  if (!chat.messages || !chat.messages.length) return;
  const history = loadChatHistory();
  const idx = history.chats.findIndex(item => item.id === chat.id);
  const entry = { ...chat, updatedAt: Date.now(), messages: JSON.parse(JSON.stringify(chat.messages)) };
  if (idx >= 0) history.chats[idx] = entry;
  else history.chats.unshift(entry);
  if (history.chats.length > 200) history.chats = history.chats.slice(0, 200);
  saveChatHistory(history);
}

function generateChatTitle(messages) {
  const firstUser = messages.find(message => message.role === 'user');
  if (!firstUser) return 'New Chat';
  let text = '';
  if (typeof firstUser.content === 'string') text = firstUser.content;
  else if (Array.isArray(firstUser.content)) text = firstUser.content.find(part => part.type === 'text')?.text || '';
  text = text.replace(/\s+/g, ' ').trim();
  return text.slice(0, 60) + (text.length > 60 ? '…' : '') || 'New Chat';
}

function chatModelSupportsVision(modelId) {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return id.includes('gpt-4o') || id.includes('gpt-4-turbo') || id.startsWith('o1') || id.startsWith('o3') || id.includes('claude-3') || id.includes('claude-4') || id.includes('gemini') || id.includes('deepseek-vl') || id.includes('qwen-vl') || id.includes('qwen2-vl') || id.includes('qwen2.5-vl') || id.includes('pixtral') || id.includes('llama-3.2') || id.includes('grok-vision') || id.includes('grok-2-vision') || id.includes('phi-3-vision') || id.includes('phi-4-multimodal') || id.includes('yi-vision') || id.includes('internvl') || id.includes('cogvlm') || id.includes('llava') || id.includes('vision');
}

function contentToPlainText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(part => part && part.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
  }
  return String(content ?? '');
}

function loadPromptsStore() {
  try {
    const raw = localStorage.getItem('cli-proxy-system-prompts');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.prompts)) {
        return {
          activeId: parsed.activeId || localStorage.getItem('cli-proxy-system-prompts-active') || parsed.prompts[0]?.id || null,
          prompts: parsed.prompts,
        };
      }
    }
  } catch {
    // ignore
  }

  let legacy = '';
  try {
    legacy = localStorage.getItem('cli-proxy-chat-system-prompt') || '';
  } catch {
    // ignore
  }

  const initial = {
    activeId: 'default',
    prompts: [{ id: 'default', name: 'Default', text: legacy || '', updatedAt: Date.now() }],
  };

  try {
    localStorage.setItem('cli-proxy-system-prompts', JSON.stringify(initial));
    localStorage.setItem('cli-proxy-system-prompts-active', initial.activeId);
  } catch {
    // ignore
  }

  return initial;
}

function savePromptsStore(store) {
  try {
    localStorage.setItem('cli-proxy-system-prompts', JSON.stringify(store));
    if (store.activeId) localStorage.setItem('cli-proxy-system-prompts-active', store.activeId);
    const active = store.prompts.find(prompt => prompt.id === store.activeId);
    localStorage.setItem('cli-proxy-chat-system-prompt', active?.text || '');
  } catch {
    // ignore
  }
}

function getActivePrompt(store) {
  const activeId = store.activeId || localStorage.getItem('cli-proxy-system-prompts-active') || store.prompts[0]?.id || null;
  store.activeId = activeId;
  return store.prompts.find(prompt => prompt.id === activeId) || store.prompts[0] || { id: 'default', name: 'Default', text: '' };
}

function createChatViewModel() {
  return {
    chatId: uid(),
    messages: [],
    history: [],
    availableModels: [],
    selectedModel: localStorage.getItem('cli-proxy-chat-selected-model') || '',
    systemPrompt: '',
    systemPromptName: 'Default',
    pendingFiles: [],
    pendingImages: [],
    draft: '',
    sending: false,
    promptsStore: loadPromptsStore(),
    async init() {
      const activePrompt = getActivePrompt(this.promptsStore);
      this.systemPrompt = activePrompt.text || '';
      this.systemPromptName = activePrompt.name || 'Default';
      this.loadHistory();
      await this.loadModels();
      await this.ensureModelSummary();
    },
    loadHistory() {
      this.history = loadChatHistory().chats || [];
    },
    async loadModels() {
      try {
        const live = await fetchLiveModels();
        this.availableModels = live.map(model => ({
          id: model.id,
          provider: model.owned_by || 'unknown',
          vision: chatModelSupportsVision(model.id),
        }));
      } catch {
        const config = get('config') || {};
        const fallback = [];
        for (const provider of config['openai-compatibility'] || []) {
          for (const model of provider.models || []) {
            const id = typeof model === 'string' ? model : (model.alias || model.name);
            if (id) fallback.push({ id, provider: provider.name || provider['base-url'] || 'config', vision: chatModelSupportsVision(id) });
          }
        }
        this.availableModels = fallback;
      }

      if (!this.selectedModel && this.availableModels.length) {
        this.setSelectedModel(this.availableModels[0].id);
      }
    },
    setSelectedModel(modelId) {
      this.selectedModel = modelId;
      try {
        localStorage.setItem('cli-proxy-chat-selected-model', modelId);
      } catch {
        // ignore
      }
      this.ensureModelSummary();
    },
    get selectedModelMeta() {
      return this.availableModels.find(model => model.id === this.selectedModel) || null;
    },
    get chatMessages() {
      return this.messages;
    },
    get hasMessages() {
      return this.messages.length > 0;
    },
    get canAttachImages() {
      return chatModelSupportsVision(this.selectedModel);
    },
    get currentContextTokens() {
      let text = '';
      if (this.systemPrompt.trim()) text += this.systemPrompt.trim() + '\n\n';
      for (const message of this.messages) {
        text += `${message.role}: ${contentToPlainText(message.content)}\n\n`;
      }
      if (this.draft.trim()) text += `user(draft): ${this.draft.trim()}\n\n`;
      for (const file of this.pendingFiles) {
        text += `file:${file.name}\n${file.text}\n\n`;
      }
      return estimateTokens(text);
    },
    get historyEmpty() {
      return !this.history.length;
    },
    async ensureModelSummary() {
      if (Array.isArray(get('enrichedModels')) && get('enrichedModels').length) return;
      try {
        const live = await fetchLiveModels();
        const enrichedModels = await enrichModels(live, get('config') || {}, get('usage') || null);
        set('enrichedModels', enrichedModels);
      } catch {
        // ignore
      }
    },
    get modelSummary() {
      const entry = (get('enrichedModels') || []).find(model => model.id === this.selectedModel);
      return {
        provider: entry?.provider || this.selectedModelMeta?.provider || '',
        contextLength: entry?.contextLength || null,
        maxOutput: entry?.maxCompletionTokens || null,
        vision: entry?.hasVision ?? chatModelSupportsVision(this.selectedModel),
        source: entry?.dataSource === 'openrouter' ? 'verified' : entry ? '≈ estimated' : '',
      };
    },
    startNewChat() {
      this.persistCurrentChat();
      this.chatId = uid();
      this.messages = [];
      this.pendingFiles = [];
      this.pendingImages = [];
      this.draft = '';
    },
    persistCurrentChat() {
      saveCurrentChatEntry({
        id: this.chatId,
        messages: this.messages,
        model: this.selectedModel,
        systemPromptId: this.promptsStore.activeId,
        title: generateChatTitle(this.messages),
        createdAt: Date.now(),
      });
      this.loadHistory();
    },
    loadChat(chatId) {
      const chat = this.history.find(item => item.id === chatId);
      if (!chat) return;
      this.persistCurrentChat();
      this.chatId = chat.id;
      this.messages = chat.messages ? JSON.parse(JSON.stringify(chat.messages)) : [];
      if (chat.model) this.setSelectedModel(chat.model);
    },
    savePromptChanges() {
      const active = getActivePrompt(this.promptsStore);
      active.text = this.systemPrompt;
      active.updatedAt = Date.now();
      active.name = active.name || this.systemPromptName || 'Default';
      this.promptsStore.prompts = this.promptsStore.prompts.map(prompt => prompt.id === active.id ? active : prompt);
      savePromptsStore(this.promptsStore);
      this.systemPromptName = active.name;
    },
    resetContext() {
      this.messages = [];
      set('chatMessages', []);
    },
    async compressContext() {
      if (!this.messages.length || !this.selectedModel) return;
      const apiKey = (get('config') || {})['api-keys']?.[0] || getClientApiKey() || getApiKey() || '';
      if (!apiKey) {
        toastError('No API key available');
        return;
      }
      const toSummarize = this.messages.slice(0, Math.max(0, this.messages.length - 6));
      if (toSummarize.length < 4) {
        toastError('Nothing to compress: too few messages');
        return;
      }
      try {
        toastOk('Compressing context...');
        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: this.selectedModel,
            stream: false,
            messages: [
              { role: 'system', content: 'Summarize this conversation in 10-20 bullet points + important facts/preferences.' },
              ...toSummarize.map(message => ({ role: message.role, content: contentToPlainText(message.content) })),
            ],
          }),
        });
        const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
        if (!response.ok) throw new Error(body.error?.message || body.error || body.message || response.statusText);
        const summary = body.choices?.[0]?.message?.content ?? body.content ?? body.output_text ?? body.raw ?? '';
        const keepTail = this.messages.slice(-6);
        this.messages = [{ role: 'system', content: `Compressed context (summary):\n${summary}` }, ...keepTail];
        set('chatMessages', [...this.messages]);
        this.persistCurrentChat();
        toastOk('Context compressed');
      } catch (e) {
        toastError(e.message || String(e));
      }
    },
    async handleTextFiles(event) {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        if (file.size > 200 * 1024) {
          toastError(`File too large: ${file.name} (limit 200KB)`);
          continue;
        }
        try {
          const text = await file.text();
          this.pendingFiles.push({ name: file.name, text: String(text || '') });
        } catch {
          toastError(`Error reading file: ${file.name}`);
        }
      }
      event.target.value = '';
    },
    async handleImages(event) {
      if (!this.canAttachImages) {
        toastError('This model is not marked as vision (images disabled)');
        event.target.value = '';
        return;
      }
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          this.pendingImages.push({ name: file.name, dataUrl });
        } catch {
          toastError('Error reading image');
        }
      }
      event.target.value = '';
    },
    removePendingFile(index) {
      this.pendingFiles.splice(index, 1);
    },
    removePendingImage(index) {
      this.pendingImages.splice(index, 1);
    },
    async copyMessage(content) {
      const ok = await copyToClipboard(contentToPlainText(content));
      if (ok) toastOk('Copied');
      else toastError('Failed to copy');
    },
    async sendMessage() {
      const text = this.draft.trim();
      if (!text && !this.pendingFiles.length && !this.pendingImages.length) return;
      if (!this.selectedModel) {
        toastError('Select a model');
        return;
      }
      const apiKey = (get('config') || {})['api-keys']?.[0] || getClientApiKey() || getApiKey() || '';
      if (!apiKey) {
        toastError('No API key available');
        return;
      }

      let filesText = '';
      if (this.pendingFiles.length) {
        filesText = this.pendingFiles.map(file => `\n\n[File: ${file.name}]\n\n\
\`\`\`\n${String(file.text || '')}\n\`\`\``).join('');
      }

      let userContent;
      if (this.pendingImages.length > 0) {
        userContent = [{ type: 'text', text: (text || '') + filesText }];
        for (const image of this.pendingImages) {
          userContent.push({ type: 'image_url', image_url: { url: image.dataUrl } });
        }
      } else {
        userContent = (text || '') + filesText;
      }

      this.messages.push({ role: 'user', content: userContent });
      set('chatMessages', [...this.messages]);
      this.draft = '';
      this.pendingFiles = [];
      this.pendingImages = [];
      this.sending = true;

      try {
        const requestMessages = [];
        if (this.systemPrompt.trim()) requestMessages.push({ role: 'system', content: this.systemPrompt.trim() });
        requestMessages.push(...this.messages.map(message => ({ role: message.role, content: message.content })));

        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: this.selectedModel, messages: requestMessages, stream: false }),
        });
        const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
        if (!response.ok) throw new Error(body.error?.message || body.error || body.message || response.statusText);

        const answer = body.choices?.[0]?.message?.content ?? body.content ?? body.output_text ?? body.raw ?? 'Empty response';
        this.messages.push({ role: 'assistant', content: answer });
        set('chatMessages', [...this.messages]);
        if (body.usage) toastOk(`Tokens: ${body.usage.total_tokens ?? '?'}`);
        this.persistCurrentChat();
      } catch (e) {
        this.messages.push({ role: 'assistant', content: `Error: ${e.message}` });
        set('chatMessages', [...this.messages]);
        toastError(e.message);
        this.persistCurrentChat();
      } finally {
        this.sending = false;
      }
    },
  };
}

function createModelsViewModel() {
  return {
    models: [],
    search: '',
    filter: 'all',
    providerFilter: null,
    loading: true,
    init() {
      this.search = get('modelSearch') || '';
      this.filter = get('modelFilter') || 'all';
      this.providerFilter = get('modelProviderFilter') || null;
      this.load();
    },
    async load() {
      this.loading = true;
      try {
        const [config, liveModels, usage, providersData] = await Promise.race([
          Promise.all([
            fetchConfig().catch(() => null),
            fetchLiveModels().catch(() => []),
            fetchUsage().catch(() => null),
            fetchProvidersCheck().catch(() => ({ providers: [], allModels: [] })),
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Data loading timeout (30s)')), 30000)),
        ]);

        set('config', config);
        set('usage', usage);

        const allProviderModels = new Set();
        for (const provider of providersData.providers || []) {
          for (const modelId of provider.models || []) {
            allProviderModels.add(modelId);
          }
        }

        let enriched = [];
        if (config || liveModels.length) {
          enriched = await enrichModels(liveModels, config, usage);
        }

        const existingIds = new Set(enriched.map(model => model.id));
        for (const modelId of allProviderModels) {
          if (existingIds.has(modelId)) continue;
          let providerName = 'unknown';
          for (const provider of providersData.providers || []) {
            if (provider.models && provider.models.includes(modelId)) {
              providerName = provider.name;
              break;
            }
          }
          enriched.push({
            id: modelId,
            realId: modelId,
            provider: providerName,
            status: 'available',
            dataSource: 'provider',
            hasVision: false,
            hasAudio: false,
            hasVideo: false,
            hasReasoning: false,
            hasTools: false,
            contextLength: null,
            maxCompletionTokens: null,
            pricing: null,
            description: null,
            isAlias: false,
          });
        }

        this.models = enriched;
        set('enrichedModels', enriched);
      } catch (e) {
        toastError(`Error loading models: ${e.message}`);
      } finally {
        this.loading = false;
      }
    },
    setSearch(value) {
      this.search = value;
      set('modelSearch', value);
    },
    setFilter(value) {
      this.filter = value;
      set('modelFilter', value);
    },
    setProviderFilter(value) {
      this.providerFilter = value;
      set('modelProviderFilter', value);
    },
    refreshCache() {
      localStorage.removeItem('openrouter_models_v3');
      toastOk('Cache refreshing...');
      this.load();
    },
    toggleModel(modelId) {
      const enabledModels = loadEnabledModels();
      if (enabledModels[modelId]) delete enabledModels[modelId];
      else enabledModels[modelId] = true;
      saveEnabledModels(enabledModels);
      this.models = [...this.models];
      set('modelToggleTimestamp', Date.now());
    },
    isEnabled(modelId) {
      const enabledModels = loadEnabledModels();
      return !enabledModels[modelId];
    },
    get disabledCount() {
      return Object.keys(loadEnabledModels()).length;
    },
    get providerTabs() {
      return [...new Set(this.models.map(model => model.provider).filter(Boolean))].sort();
    },
    get filteredModels() {
      const search = this.search.toLowerCase().trim();
      const enabledModels = loadEnabledModels();
      return this.models.filter(model => {
        if (this.providerFilter && model.provider !== this.providerFilter) return false;
        const disabled = !!enabledModels[model.id];
        if (this.filter === 'disabled') {
          if (!disabled) return false;
        } else {
          if (disabled) return false;
          if (this.filter === 'available' && model.status !== 'available') return false;
          if (this.filter === 'unavailable' && model.status === 'available') return false;
          if (this.filter === 'vision' && !model.hasVision) return false;
          if (this.filter === 'reasoning' && !model.hasReasoning) return false;
        }
        if (!search) return true;
        const haystack = [model.id, model.realId, model.alias, model.provider, model.description].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      });
    },
    get groupedModels() {
      const groups = new Map();
      for (const model of this.filteredModels) {
        const provider = model.provider || 'unknown';
        if (!groups.has(provider)) groups.set(provider, []);
        groups.get(provider).push(model);
      }
      return [...groups.entries()]
        .sort((a, b) => {
          if (a[0] === 'openai') return -1;
          if (b[0] === 'openai') return 1;
          return a[0].localeCompare(b[0]);
        })
        .map(([provider, models]) => ({
          provider,
          models,
          availableCount: models.filter(model => model.status === 'available').length,
        }));
    },
    get stats() {
      return {
        total: this.models.length,
        available: this.filteredModels.length,
        off: this.disabledCount,
      };
    },
    formatContext(value) {
      if (!value) return '?';
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${Math.round(value / 1000)}K`;
      return String(value);
    },
    formatPrice(model) {
      return model.pricing
        ? `$${(model.pricing.input / 1_000_000).toFixed(2)}/$${(model.pricing.output / 1_000_000).toFixed(2)}`
        : '—';
    },
    sourceLabel(model) {
      return model.dataSource === 'openrouter' ? 'Verified' : '≈ Estimated';
    },
    sourceClass(model) {
      return model.dataSource === 'openrouter' ? 'tag tag-info' : 'tag tag-muted';
    },
    tags(model) {
      const tags = [];
      if (model.hasVision) tags.push('Vision');
      if (model.hasAudio) tags.push('Audio');
      if (model.hasVideo) tags.push('Video');
      if (model.hasReasoning) tags.push('Reasoning');
      if (model.hasTools) tags.push('Tools');
      return tags;
    },
    openCleanupModal() {
      showModal({
        title: 'Cleanup Models',
        children: [h('p', { className: 'text-muted' }, ['Cleanup action is still using the legacy implementation and will be migrated next.'])],
        footer: createModalFooter([
          { label: 'Close', className: 'btn btn-primary', onClick: () => closeModal() },
        ]),
      });
    },
    openDetails(model) {
      const content = document.createElement('div');
      content.className = 'flex flex-col gap-4';

      const addRow = (label, value) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.gap = '1rem';
        const left = document.createElement('strong');
        left.textContent = label;
        const right = document.createElement('span');
        right.textContent = value;
        row.append(left, right);
        content.appendChild(row);
      };

      addRow('Provider', model.provider || '-');
      addRow('Status', model.status || '-');
      addRow('Context', model.contextLength ? fmtNumber(model.contextLength) : '?');
      addRow('Max output', model.maxCompletionTokens ? fmtNumber(model.maxCompletionTokens) : '?');
      addRow('Data source', model.dataSource === 'openrouter' ? 'OpenRouter API' : 'Estimated');
      if (model.description) addRow('Description', model.description);
      if (model.payloadOverride) addRow('Payload override', JSON.stringify(model.payloadOverride));

      showModal({
        title: model.id,
        size: 'lg',
        children: [content],
        footer: [(() => {
          const btn = document.createElement('button');
          btn.className = 'btn btn-ghost';
          btn.textContent = 'Close';
          btn.onclick = () => closeModal();
          return btn;
        })()],
      });
    },
    openEdit(model) {
      const params = loadModelParams();
      const modelParams = params[model.id] || {};
      const aliasInput = document.createElement('input');
      aliasInput.className = 'form-input';
      aliasInput.value = modelParams.alias || model.alias || '';
      aliasInput.placeholder = 'E.g.: gpt-4-turbo';
      const payloadInput = document.createElement('textarea');
      payloadInput.className = 'form-input';
      payloadInput.style.minHeight = '120px';
      payloadInput.style.fontFamily = 'var(--font-mono, monospace)';
      payloadInput.style.fontSize = '0.85rem';
      payloadInput.placeholder = '{\n  "max_tokens": 4096\n}';
      if (modelParams.payloadOverride) payloadInput.value = JSON.stringify(modelParams.payloadOverride, null, 2);
      else if (model.payloadOverride) payloadInput.value = JSON.stringify(model.payloadOverride, null, 2);

      const group = (labelText, input, hintText) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-group';
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = labelText;
        wrapper.append(label, input);
        if (hintText) {
          const hint = document.createElement('div');
          hint.className = 'form-hint';
          hint.textContent = hintText;
          wrapper.appendChild(hint);
        }
        return wrapper;
      };

      showModal({
        title: `Edit: ${model.id}`,
        children: [
          group('Alias', aliasInput, 'Model name used in API requests'),
          group('Payload Overrides (JSON)', payloadInput, 'Additional parameters added to each request'),
        ],
        footer: [
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-error';
            btn.textContent = 'Reset';
            btn.onclick = () => {
              const allParams = loadModelParams();
              delete allParams[model.id];
              saveModelParams(allParams);
              closeModal();
              this.models = [...this.models];
              toastOk('Parameters reset');
            };
            return btn;
          })(),
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-ghost';
            btn.textContent = 'Cancel';
            btn.onclick = () => closeModal();
            return btn;
          })(),
          (() => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = 'Save';
            btn.onclick = () => {
              let payloadOverride = null;
              if (payloadInput.value.trim()) {
                try {
                  payloadOverride = JSON.parse(payloadInput.value.trim());
                } catch (e) {
                  toastError(`JSON error: ${e.message}`);
                  return;
                }
              }
              const allParams = loadModelParams();
              allParams[model.id] = {
                alias: aliasInput.value.trim() || null,
                payloadOverride,
              };
              saveModelParams(allParams);
              closeModal();
              this.models = [...this.models];
              toastOk(`Saved for ${model.id}`);
            };
            return btn;
          })(),
        ],
      });
    },
  };
}

export function setupAlpineBridge() {
  const start = () => {
    if (!window.Alpine) return;

    window.Alpine.data('dashboardView', () => ({
      stats: {
        providers: 0,
        models: 0,
        totalRequests: '0',
        totalTokens: '0',
      },
      providers: [],
      recent: [],
      async init() {
        await this.load();
      },
      async load() {
        set('isLoading', true);
        try {
          const [config, usage] = await Promise.all([
            fetchConfig().catch(() => null),
            fetchUsage().catch(() => null),
          ]);
          set('config', config);
          set('usage', usage);
          const mapped = toDashboardData(config, usage);
          this.stats = mapped.stats;
          this.providers = mapped.providers;
          this.recent = mapped.recent;
        } catch (e) {
          toastError(`Failed to load dashboard: ${e.message}`);
        } finally {
          set('isLoading', false);
        }
      },
      async refresh() {
        clearCache();
        await this.load();
        toastOk('Data refreshed');
      },
      goProviders() {
        window.location.hash = '#providers';
      },
      goModels() {
        window.location.hash = '#models';
      },
      goConfig() {
        window.location.hash = '#config';
      },
    }));

    window.Alpine.data('keysView', () => ({
      keys: [],
      get countLabel() {
        if (!this.keys.length) return 'No keys';
        return `${this.keys.length} keys configured`;
      },
      async init() {
        await this.load();
      },
      async load() {
        try {
          this.keys = await fetchAPIKeys();
          set('keys', this.keys);
        } catch (e) {
          toastError(e.message);
        }
      },
      maskKey(key) {
        if (!key || key.length <= 8) return '••••';
        return key.slice(0, 4) + '••••' + key.slice(-4);
      },
      async copyKey(key) {
        await copyToClipboard(key);
        toastOk('Copied');
      },
      async removeKey(key) {
        const confirmed = await confirmModal({ title: 'Delete Key?', message: 'This action cannot be undone.', danger: true });
        if (!confirmed) return;

        try {
          await deleteAPIKey(key);
          this.keys = this.keys.filter(k => k !== key);
          set('keys', this.keys);
          toastOk('Key deleted');
        } catch (e) {
          toastError(e.message);
        }
      },
      openAddKeyModal() {
        const input = createTextInput({ placeholder: 'sk-...' });

        showModal({
          title: 'Add API Key',
          children: [createModalField('Key', input)],
          footer: createModalFooter([
            { label: 'Cancel', className: 'btn btn-ghost', onClick: () => closeModal() },
            {
              label: 'Add',
              className: 'btn btn-primary',
              onClick: async () => {
                const key = input.value.trim();
                if (!key) {
                  toastError('Key is required');
                  return;
                }
                try {
                  await createAPIKey(key);
                  this.keys = [...this.keys, key];
                  set('keys', this.keys);
                  toastOk('Key added');
                  closeModal();
                } catch (e) {
                  toastError(e.message);
                }
              },
            },
          ]),
        });
      },
    }));

    window.Alpine.data('trafficView', () => ({
      tab: 'requests',
      requests: [],
      requestPage: 1,
      requestPageSize: 100,
      requestSummary: { total: 0, shown: 0, firstTime: null, lastTime: null },
      logs: [],
      async init() {
        const savedTab = get('trafficTab');
        if (savedTab === 'logs' || savedTab === 'requests') this.tab = savedTab;
        await this.refreshAll();
      },
      setTab(tab) {
        this.tab = tab;
        set('trafficTab', tab);
        if (tab === 'logs' && !this.logs.length) this.refreshLogs();
      },
      async refreshAll() {
        try {
          const [usage, requestLogs, rawLogs] = await Promise.all([
            fetchUsage().catch(() => null),
            fetchRequestLogs().catch(() => ({ logs: [] })),
            fetchLogs().catch(() => ({ lines: [] })),
          ]);
          set('usage', usage);
          set('requestLogs', requestLogs);
          set('logs', rawLogs);
          const mapped = toTrafficData(usage, requestLogs, rawLogs);
          this.requests = mapped.requests;
          this.requestSummary = mapped.requestSummary;
          this.logs = mapped.parsedLogs;
        } catch (e) {
          toastError(`Failed to load traffic: ${e.message}`);
        }
      },
      async refreshRequests() {
        try {
          const [usage, requestLogs] = await Promise.all([
            fetchUsage().catch(() => null),
            fetchRequestLogs().catch(() => ({ logs: [] })),
          ]);
          set('usage', usage);
          set('requestLogs', requestLogs);
          const mapped = toTrafficData(usage, requestLogs, { lines: [] });
          this.requests = mapped.requests;
          this.requestSummary = mapped.requestSummary;
        } catch (e) {
          toastError(`Failed to load requests: ${e.message}`);
        }
      },
      async refreshLogs() {
        try {
          const rawLogs = await fetchLogs();
          set('logs', rawLogs);
          this.logs = toTrafficData(null, null, rawLogs).parsedLogs;
        } catch (e) {
          toastError(`Failed to load logs: ${e.message}`);
        }
      },
      formatRelative(value) {
        return fmtRelative(value);
      },
      formatDate(value) {
        return fmtDate(value);
      },
      formatLatency(value) {
        return value != null ? fmtDuration(value) : '-';
      },
      requestStatusClass(status) {
        return status === 'ok' ? 'badge badge-ok' : 'badge badge-error';
      },
      requestStatusLabel(status) {
        return status === 'ok' ? 'OK' : 'ERR';
      },
      get requestsEmptyHtml() {
        return createTrafficEmptyState('No requests yet', 'Make requests through the proxy to see them here');
      },
      get logsEmptyHtml() {
        return createTrafficEmptyState('No logs yet', 'Please wait while loading server logs');
      },
      get paginatedRequests() {
        const start = (this.requestPage - 1) * this.requestPageSize;
        const end = start + this.requestPageSize;
        return this.requests.slice(start, end);
      },
      get totalPages() {
        return Math.ceil(this.requests.length / this.requestPageSize);
      },
      get requestPaginationInfo() {
        const start = (this.requestPage - 1) * this.requestPageSize + 1;
        const end = Math.min(this.requestPage * this.requestPageSize, this.requests.length);
        return this.requests.length > 0 ? `${start}-${end} of ${this.requests.length}` : '0-0 of 0';
      },
      nextPage() {
        if (this.requestPage < this.totalPages) this.requestPage++;
      },
      prevPage() {
        if (this.requestPage > 1) this.requestPage--;
      },
      goToPage(page) {
        if (page >= 1 && page <= this.totalPages) this.requestPage = page;
      },
    }));

    window.Alpine.data('configView', () => createConfigViewModel());
    window.Alpine.data('providersView', () => createProvidersViewModel());
    window.Alpine.data('modelsView', () => createModelsViewModel());
    window.Alpine.data('chatView', () => createChatViewModel());
  };

  if (window.Alpine) {
    start();
    return;
  }

  document.addEventListener('alpine:init', start, { once: true });
}
