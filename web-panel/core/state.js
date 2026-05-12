/**
 * @fileoverview Reactive state management without frameworks.
 * Supports deep paths, computed values, and localStorage persistence.
 */

/** @type {Map<string, Function[]>} */
const listeners = new Map();

/** @type {Map<string, any>} */
const computedCache = new Map();

/** @type {Set<string>} */
const computedDeps = new Set();

const state = {
  // Navigation
  activeView: 'dashboard',
  sidebarCollapsed: false,

  // Data
  config: null,
  providers: [],
  models: [],
  usage: null,
  logs: null,
  auth: null,
  settings: null,
  serverInfo: null,
  keys: [],
  channels: [],

  // UI state
  isLoading: false,
  lastError: null,
  unsavedChanges: false,
  searchQuery: '',
  toasts: [],

  // Provider sub-tabs
  providerTab: 'connections',
  providerEditId: null,
  providerAddOpen: false,

  // Models
  modelFilter: 'all',
  modelSearch: '',
  modelSort: 'name',
  selectedModels: new Set(),
  benchmarkOpen: false,
  benchmarkResults: [],

  // Traffic
  trafficTab: 'requests',
  trafficFilter: '',
  trafficPage: 1,
  trafficPageSize: 50,

  // Keys
  keysTab: 'keys',

  // Config
  configEditorMode: 'form', // 'form' | 'json'
  configJson: '',

  // Enrichment
  enrichedModels: [],
  openRouterModels: null,
  modelDefinitions: new Map(),
};

/**
 * Get a value from state (supports dot paths).
 * @param {string} key
 * @returns {any}
 */
export function get(key) {
  const parts = key.split('.');
  let val = state;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val;
}

/**
 * Set a value in state (supports dot paths).
 * @param {string} key
 * @param {any} value
 */
export function set(key, value) {
  const parts = key.split('.');
  let target = state;
  for (let i = 0; i < parts.length - 1; i++) {
    target = target[parts[i]];
  }
  const last = parts[parts.length - 1];
  const old = target[last];
  if (old === value) return;
  target[last] = value;
  notify(key, value, old);
  // Also notify parent paths
  let path = '';
  for (const p of parts) {
    path = path ? `${path}.${p}` : p;
    notify(path, get(path), null);
  }
}

/**
 * Merge an object into state at a key.
 * @param {string} key
 * @param {object} obj
 */
export function merge(key, obj) {
  const current = get(key) || {};
  set(key, { ...current, ...obj });
}

/**
 * Subscribe to state changes.
 * @param {string} key
 * @param {Function} fn
 * @returns {Function} unsubscribe
 */
export function watch(key, fn) {
  if (!listeners.has(key)) listeners.set(key, []);
  const list = listeners.get(key);
  list.push(fn);
  // Immediately call with current value
  fn(get(key), undefined);
  return () => {
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  };
}

/**
 * Watch multiple keys at once.
 * @param {string[]} keys
 * @param {Function} fn
 */
export function watchMany(keys, fn) {
  const values = () => keys.map(k => get(k));
  let last = values();
  const unsubscribers = keys.map(k =>
    watch(k, () => {
      const cur = values();
      if (JSON.stringify(cur) !== JSON.stringify(last)) {
        last = cur;
        fn(cur);
      }
    })
  );
  return () => unsubscribers.forEach(u => u());
}

function notify(key, value, oldValue) {
  const list = listeners.get(key);
  if (list) list.forEach(fn => fn(value, oldValue));
}

/**
 * Create a computed value that auto-updates when deps change.
 * @param {string} name
 * @param {string[]} deps
 * @param {Function} compute
 */
export function computed(name, deps, compute) {
  function update() {
    const vals = deps.map(d => get(d));
    const result = compute(...vals);
    computedCache.set(name, result);
    notify(name, result, undefined);
  }
  deps.forEach(d => watch(d, update));
  update();
}

/**
 * Persist specific keys to localStorage.
 * @param {string[]} keys
 * @param {string} namespace
 */
export function persist(keys, namespace = 'cli-proxy') {
  // Restore
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(`${namespace}.${key}`);
      if (raw != null) {
        const val = JSON.parse(raw);
        set(key, val);
      }
    } catch { /* ignore */ }
  }
  // Save on change
  for (const key of keys) {
    watch(key, val => {
      try {
        localStorage.setItem(`${namespace}.${key}`, JSON.stringify(val));
      } catch { /* ignore */ }
    });
  }
}

/**
 * Batch multiple state updates (suppresses intermediate notifications).
 * @param {Function} fn
 */
export function batch(fn) {
  const oldListeners = new Map(listeners);
  listeners.clear();
  fn();
  // Re-attach and notify
  for (const [key, fns] of oldListeners) {
    listeners.set(key, fns);
    const val = get(key);
    fns.forEach(fn => fn(val, undefined));
  }
}

// Export state for debugging
if (typeof window !== 'undefined') {
  window.__STATE__ = state;
}

export { state };
