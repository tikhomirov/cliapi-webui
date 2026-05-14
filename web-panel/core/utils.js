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
  return date.toLocaleString('en-US', {
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
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} m ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
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
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg','g','path','circle','rect','line','polyline','polygon','ellipse','text','tspan','defs','clipPath','mask','pattern','linearGradient','radialGradient','stop','symbol','use','image','foreignObject','feGaussianBlur','feOffset','feMerge','feMergeNode','filter']);

export function h(tag, attrs = {}, children = []) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.setAttribute('class', v);
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

/* ── Icon system ─────────────────────────────────────────── */

const SVG_PATHS = {
  search:      '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  close:       '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  refresh:     '<path d="M3 12a9 9 0 0 1 15-6.7"/><path d="M18 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7"/><path d="M6 21v-5h5"/>',
  save:        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  dashboard:   '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  providers:   '<rect x="2" y="4" width="20" height="6" rx="2"/><rect x="2" y="14" width="20" height="6" rx="2"/><circle cx="6" cy="7" r="1"/><circle cx="6" cy="17" r="1"/>',
  models:      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 6.7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  traffic:     '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  keys:        '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12l10-10"/><path d="M17 5l2 2"/><path d="M19 3l2 2"/>',
  chat:        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  config:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  settings:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  plus:        '<path d="M12 5v14"/><path d="M5 12h14"/>',
  edit:        '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
  trash:       '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  check:       '<path d="M20 6 9 17l-5-5"/>',
  warning:     '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  error:       '<circle cx="12" cy="12" r="9"/><path d="M15 9 9 15"/><path d="M9 9l6 6"/>',
  info:        '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  server:      '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><circle cx="7" cy="7" r="1"/><circle cx="7" cy="17" r="1"/>',
  cube:        '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.29 7 12 12l8.71-5"/><path d="M12 22V12"/>',
  page:        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  fileText:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  image:       '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  audio:       '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a5 5 0 0 1 0 6"/><path d="M18 6a9 9 0 0 1 0 12"/>',
  video:       '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10l4-2v8l-4-2z"/>',
  paperclip:   '<path d="M21.44 11.05 12 20.49a6 6 0 0 1-8.49-8.49l9.44-9.44a4 4 0 1 1 5.66 5.66l-9.45 9.44a2 2 0 1 1-2.82-2.82l8.48-8.48"/>',
  send:        '<path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/>',
  upload:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/>',
  eye:         '<path d="M2.06 12.79a1 1 0 0 1 0-1.58C4.67 8.37 8 6 12 6s7.33 2.37 9.94 5.21a1 1 0 0 1 0 1.58C19.33 15.63 16 18 12 18s-7.33-2.37-9.94-5.21Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:      '<path d="m3 3 18 18"/><path d="M10.58 10.58A3 3 0 0 0 12 15a3 3 0 0 0 2.42-1.26"/><path d="M9.88 5.09A10 10 0 0 1 12 5c4 0 7.33 2.37 9.94 5.21a1 1 0 0 1 0 1.58 21.47 21.47 0 0 1-3.31 3.1"/><path d="M6.11 6.11A18.14 18.14 0 0 0 2.06 11.79a1 1 0 0 0 0 1.58C4.67 15.63 8 18 12 18c1.05 0 2.06-.13 3.02-.38"/>',
  activity:    '<path d="M22 12h-4l-3 9-4-18-3 9H2"/>',
  terminal:    '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
};

/**
 * Create an inline SVG icon element.
 * Uses innerHTML on a wrapper div — no createElementNS headaches.
 * @param {string} name  Icon key from SVG_PATHS
 * @param {{ size?: number, className?: string, strokeWidth?: number }} [opts]
 * @returns {SVGElement|null}
 */
export function icon(name, opts = {}) {
  const paths = SVG_PATHS[name];
  if (!paths) return null;
  const { size = 18, className = '', strokeWidth = 2 } = opts || {};
  const cls = ['ui-icon', className].filter(Boolean).join(' ');
  const html = `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  return wrapper.firstElementChild;
}
