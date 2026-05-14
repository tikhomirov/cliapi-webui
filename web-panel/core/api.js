/**
 * @fileoverview API client with caching, retry logic, and auth management.
 */

const BASE = '/v0/management';
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;

/** @type {Map<string, {data: any, ts: number, ttl: number}>} */
const cache = new Map();

let apiKey = '';
let clientApiKey = '';

export function setApiKey(key) {
  apiKey = key;
}

export function getApiKey() {
  return apiKey;
}

export function setClientApiKey(key) {
  clientApiKey = key;
}

export function getClientApiKey() {
  return clientApiKey;
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
  return h;
}

export async function request(method, endpoint, options = {}) {
  const { body, timeout = DEFAULT_TIMEOUT, noCache = false, cacheTtl = 0 } = options;
  const url = endpoint.startsWith('http') ? endpoint : `${BASE}${endpoint}`;
  const cacheKey = `${method}:${url}:${body ? JSON.stringify(body) : ''}`;

  if (method === 'GET' && !noCache && cacheTtl > 0) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < cached.ttl) {
      return cached.data;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new ApiError(res.status, errBody.error || errBody.message || res.statusText, errBody);
      }

      const data = res.status === 204 ? null : await res.json().catch(() => null);

      if (method === 'GET' && cacheTtl > 0) {
        cache.set(cacheKey, { data, ts: Date.now(), ttl: cacheTtl });
      }

      return data;
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') {
        throw new ApiError(408, 'Request timeout');
      }
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

export function get(endpoint, options) { return request('GET', endpoint, options); }
export function post(endpoint, body, options) { return request('POST', endpoint, { ...options, body }); }
export function put(endpoint, body, options) { return request('PUT', endpoint, { ...options, body }); }
export function del(endpoint, options) { return request('DELETE', endpoint, options); }

export async function fetchLiveModels() {
  const key = clientApiKey || apiKey;
  const res = await fetch('/v1/models', {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to fetch models');
  const data = await res.json();
  return data.data || [];
}

export async function fetchProvidersCheck() {
  const data = await get('/providers/check', { timeout: 60000, noCache: true });
  return {
    providers: data?.providers || [],
    allModels: data?.allModels || [],
  };
}

export async function syncProviderModels() {
  const data = await post('/providers/sync-models', {}, { timeout: 120000 });
  return data;
}

/* ── OAuth helpers ── */

const OAUTH_PROVIDERS = [
  { key: 'codex', label: 'OpenAI (ChatGPT/Codex)', authUrl: '/codex-auth-url' },
  { key: 'anthropic', label: 'Anthropic (Claude)', authUrl: '/anthropic-auth-url' },
  { key: 'gemini-cli', label: 'Google (Gemini CLI)', authUrl: '/gemini-cli-auth-url' },
  { key: 'antigravity', label: 'Antigravity', authUrl: '/antigravity-auth-url' },
  { key: 'qwen', label: 'Qwen (Alibaba)', authUrl: '/qwen-auth-url' },
  { key: 'kimi', label: 'Kimi (Moonshot)', authUrl: '/kimi-auth-url' },
  { key: 'iflow', label: 'iFlow', authUrl: '/iflow-auth-url' },
];

export { OAUTH_PROVIDERS };

export async function fetchOAuthURL(providerKey) {
  const prov = OAUTH_PROVIDERS.find(p => p.key === providerKey);
  if (!prov) throw new Error(`Unknown OAuth provider: ${providerKey}`);
  const data = await get(prov.authUrl, { noCache: true });
  return data?.url || data?.auth_url || '';
}

export function fetchOAuthStatus(state) {
  if (!state) return Promise.resolve({ status: 'ok' });
  return get(`/get-auth-status?state=${encodeURIComponent(state)}`, { noCache: true });
}

export async function fetchAuthFiles() {
  const data = await get('/auth-files');
  return data?.files || [];
}

export async function deleteAuthFile(providerKey) {
  await del('/auth-files', { body: { provider: providerKey } });
}

export function fetchConfig() {
  return get('/config');
}

export async function fetchConfigYAML() {
  const res = await fetch(`${BASE}/config.yaml`, {
    headers: { 'Authorization': apiKey ? `Bearer ${apiKey}` : '' },
  });
  if (!res.ok) throw new ApiError(res.status, 'Failed to fetch config YAML');
  return res.text();
}

export async function saveConfigYAML(yamlText) {
  const res = await fetch(`${BASE}/config.yaml`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Authorization': apiKey ? `Bearer ${apiKey}` : '',
    },
    body: yamlText,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errBody.error || errBody.message || res.statusText, errBody);
  }
  return res.json().catch(() => null);
}

export function fetchHealth() {
  return get('/config', { cacheTtl: 30000 });
}

export function saveConfig(config) {
  return put('/config', config);
}

export function fetchUsage() {
  return get('/usage');
}

export function fetchLogs() {
  return get('/logs', { cacheTtl: 30000 });
}

export function fetchRequestLogs() {
  return get('/request-logs', { cacheTtl: 30000 });
}

export async function fetchAPIKeys() {
  const data = await get('/api-keys');
  return data?.['api-keys'] || [];
}

export function createAPIKey(key) {
  return put('/api-keys', { 'api-keys': [key] });
}

export function deleteAPIKey(key) {
  return del('/api-keys', { body: { 'api-keys': [key] } });
}

export async function fetchDebug() {
  const data = await get('/debug');
  return data?.debug ?? false;
}

export function saveDebug(value) {
  return put('/debug', { value });
}

export async function fetchLoggingToFile() {
  const data = await get('/logging-to-file');
  return data?.['logging-to-file'] ?? false;
}

export function saveLoggingToFile(value) {
  return put('/logging-to-file', { value });
}

export async function fetchRequestRetry() {
  const data = await get('/request-retry');
  return data?.['request-retry'] ?? 0;
}

export function saveRequestRetry(value) {
  return put('/request-retry', { value });
}

export function clearCache() {
  cache.clear();
}

class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'ApiError';
  }
}

function isRetryable(err) {
  if (err instanceof ApiError) {
    return err.status >= 500 || err.status === 429 || err.status === 408;
  }
  return err.name === 'TypeError' || err.name === 'NetworkError';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export { ApiError };
