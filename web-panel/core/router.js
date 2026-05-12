/**
 * @fileoverview Simple hash-based router with view lifecycle hooks.
 */

import { set, get } from './state.js';

/** @type {Map<string, Function>} */
const routes = new Map();

/** @type {Function|null} */
let currentCleanup = null;

/**
 * Register a view renderer for a route.
 * @param {string} path
 * @param {Function} renderFn - (container: HTMLElement) => (() => void) | void
 */
export function register(path, renderFn) {
  routes.set(path, renderFn);
}

/**
 * Navigate to a view.
 * @param {string} path
 */
export function navigate(path) {
  window.location.hash = path;
}

/**
 * Initialize the router.
 * @param {HTMLElement} container
 */
export function init(container) {
  function handle() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const path = hash.split('/')[0];

    // Run cleanup for previous view
    if (currentCleanup) {
      try { currentCleanup(); } catch (e) { console.error('Cleanup error:', e); }
      currentCleanup = null;
    }

    set('activeView', path);

    // Update sidebar active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === path);
    });

    // Update page title
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      const labels = {
        dashboard: 'Dashboard',
        providers: 'Providers',
        models: 'Models',
        traffic: 'Traffic',
        keys: 'Keys & Auth',
        settings: 'Settings',
        config: 'Config',
        chat: 'Chat',
      };
      titleEl.textContent = labels[path] || path;
    }

    // Render view
    const renderFn = routes.get(path);
    container.innerHTML = '';
    if (renderFn) {
      try {
        const cleanup = renderFn(container);
        if (typeof cleanup === 'function') currentCleanup = cleanup;
      } catch (e) {
        console.error('View render error:', e);
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-title">Loading Error</div>
          <div class="empty-state-desc">${e.message}</div>
        </div>`;
      }
    } else {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Page Not Found</div>
        <div class="empty-state-desc">Redirecting to Dashboard...</div>
      </div>`;
      setTimeout(() => navigate('dashboard'), 1500);
    }
  }

  window.addEventListener('hashchange', handle);
  handle();
}

/**
 * Get current route params from hash.
 * @returns {Record<string, string>}
 */
export function getParams() {
  const hash = window.location.hash.slice(1);
  const parts = hash.split('/');
  const params = {};
  for (let i = 1; i < parts.length; i += 2) {
    params[parts[i]] = parts[i + 1];
  }
  return params;
}
