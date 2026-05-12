/**
 * @fileoverview Utility functions.
 */

/**
 * Format a number with locale separators.
 * @param {number} n
 * @returns {string}
 */
export function fmtNumber(n) {
  if (n == null) return '-';
  return n.toLocaleString('en-US');
}

/**
 * Format bytes to human-readable.
 * @param {number} bytes
 * @returns {string}
 */
export function fmtBytes(bytes) {
  if (bytes == null) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format milliseconds to human-readable.
 * @param {number} ms
 * @returns {string}
 */
export function fmtDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format a date.
 * @param {string|number|Date} d
 * @returns {string}
 */
export function fmtDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Format relative time.
 * @param {string|number|Date} d
 * @returns {string}
 */
export function fmtRelative(d) {
  if (!d) return '-';
  const diff = Date.now() - new Date(d).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'только что';
  if (seconds < 60) return `${seconds} сек назад`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч ${minutes % 60} мин назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return fmtDate(d);
}

/**
 * Debounce a function.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Copy text to clipboard.
 * @param {string} text
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}

/**
 * Deep clone an object.
 * @param {any} obj
 * @returns {any}
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep equal comparison.
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Estimate token count (very rough).
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text with ellipsis.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a unique ID.
 * @returns {string}
 */
export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * Create an element with attributes and children.
 * @param {string} tag
 * @param {object} [attrs]
 * @param {(string|Node)[]} [children]
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) {
        el.setAttribute('data-' + dk.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), dv);
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '');
      else el.removeAttribute(k);
    }
    else {
      // For form controls, prefer setting the property (especially important for <textarea>)
      if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
        try { el.value = v; } catch { /* ignore */ }
      }
      el.setAttribute(k, v);
    }
  }
  function appendChildRecursive(parent, child) {
    if (child == null || child === false) return;
    if (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean') {
      parent.appendChild(document.createTextNode(String(child)));
    } else if (Array.isArray(child)) {
      for (const nested of child) appendChildRecursive(parent, nested);
    } else {
      parent.appendChild(child);
    }
  }
  for (const child of children) {
    appendChildRecursive(el, child);
  }
  return el;
}

/**
 * Group array items by key function.
 * @param {any[]} arr
 * @param {Function} keyFn
 * @returns {Map<string, any[]>}
 */
export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/**
 * Sort array by key function.
 * @param {any[]} arr
 * @param {Function} keyFn
 * @param {boolean} [desc]
 * @returns {any[]}
 */
export function sortBy(arr, keyFn, desc = false) {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    if (ka < kb) return desc ? 1 : -1;
    if (ka > kb) return desc ? -1 : 1;
    return 0;
  });
}
