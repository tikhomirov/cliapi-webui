/**
 * @fileoverview CLI Proxy API Management Panel v2
 * Entry point — wires up router, state, global UI, and views.
 */

import { set, get, watch, persist } from './core/state.js';
import { setApiKey, setClientApiKey, fetchConfig, saveConfig, fetchHealth } from './core/api.js';
import { register, init as initRouter, navigate } from './core/router.js';
import { toastOk, toastError } from './components/toast.js';
import { showModal, closeModal } from './components/modal.js';
import { h, debounce, icon } from './core/utils.js';
import { setupAlpineBridge } from './core/alpine-bridge.js';

// Views
import { renderDashboard } from './views/dashboard.js';
import { renderProviders } from './views/providers.js';
import { renderModels } from './views/models.js';
import { renderTraffic } from './views/traffic.js';
import { renderKeys } from './views/keys.js';
// renderSettings removed - functionality moved to Config page
import { renderConfig } from './views/config.js';
import { renderChat } from './views/chat.js';

// Global error handling
window.addEventListener('error', e => {
 console.error('Global error:', e.error);
});
window.addEventListener('unhandledrejection', e => {
 console.error('Unhandled rejection:', e.reason);
});

/* ============================================================
 AUTH / LOGIN
 ============================================================ */

const MGMT_KEY_STORAGE = 'cli-proxy-management-key';

function getStoredKey() {
 try { return localStorage.getItem(MGMT_KEY_STORAGE) || ''; } catch { return ''; }
}

function storeKey(key) {
 try { localStorage.setItem(MGMT_KEY_STORAGE, key); } catch { /* ignore */ }
}

function showLoginModal(message) {
 const input = h('input', { className: 'form-input', type: 'password', placeholder: 'management-key-or-api-key' });
 const errorEl = h('div', { className: 'text-sm', style: { color: 'var(--status-error)', minHeight: '1.25rem' } }, ['']);

 showModal({
 title: ' Authentication Required',
 size: 'sm',
 children: [
 h('p', { className: 'text-muted', style: { marginBottom: '1rem' } }, [message || 'Enter your management key to access the panel']),
 h('div', { className: 'form-group' }, [
 h('label', { className: 'form-label' }, ['Management Key']),
 input,
 h('div', { className: 'form-hint' }, ['You can use your management password or any valid API key.']),
 ]),
 errorEl,
 ],
 footer: [
 h('button', { className: 'btn btn-ghost', onClick: () => { closeModal(); showLoginModal(message); } }, ['Retry']),
 h('button', {
 className: 'btn btn-primary',
 onClick: async () => {
 const key = input.value.trim();
 if (!key) { errorEl.textContent = 'Key is required'; return; }

 setApiKey(key);
 try {
 const config = await fetchConfig();
 storeKey(key);
 set('config', config);
 // Set client API key for /v1/* endpoints
 const clientKey = config?.['api-keys']?.[0];
 if (clientKey) setClientApiKey(clientKey);
 closeModal();
 toastOk('Authenticated');
 // Start router and UI after successful auth
 startApp();
 } catch (e) {
 errorEl.textContent = `Invalid key: ${e.message || 'unauthorized'}`;
 }
 },
 }, ['Authenticate']),
 ],
 });

 setTimeout(() => input.focus(), 100);
}

/* ============================================================
 INIT
 ============================================================ */

async function init() {
 setupAlpineBridge();

 // Persist UI state
 persist(['sidebarCollapsed', 'modelFilter']);

 // Register routes
 register('dashboard', renderDashboard);
 register('providers', renderProviders);
 register('models', renderModels);
 register('traffic', renderTraffic);
 register('keys', renderKeys);
 // register('settings', renderSettings); - removed, see Config page
 register('config', renderConfig);
 register('chat', renderChat);

 // Show loading
 const content = document.getElementById('content');
 if (content) content.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-state-title">Connecting...</div></div>';

 // Step 1: Try to fetch config WITHOUT auth (when NO_MANAGEMENT_AUTH=true on server)
 setApiKey(''); // Clear any stale key
 try {
 const config = await fetchConfig();
 set('config', config);
 const clientKey = config?.['api-keys']?.[0];
 if (clientKey) setClientApiKey(clientKey);
 startApp();
 return;
 } catch (e) {
 // Config fetch failed — auth is likely required
 console.warn('No-auth config fetch failed, auth required:', e.message);
 }

 // Step 2: Try stored key from previous session
 const storedKey = getStoredKey();
 if (storedKey) {
 setApiKey(storedKey);
 try {
 const config = await fetchConfig();
 set('config', config);
 const clientKey = config?.['api-keys']?.[0];
 if (clientKey) setClientApiKey(clientKey);
 startApp();
 return;
 } catch (e) {
 console.warn('Stored key invalid, showing login:', e);
 }
 }

 // Step 3: Show login modal
 showLoginModal();
}

function startApp() {
 const content = document.getElementById('content');
 if (content) initRouter(content);
 setupSidebar();
 setupThemeToggle();
 setupGlobalSearch();
 setupKeyboardShortcuts();
 setupAutoSave();
 setupHealthCheck();
}

/* ============================================================
 THEME TOGGLE
 ============================================================ */

function setupThemeToggle() {
 const btn = document.getElementById('theme-toggle');
 if (!btn) return;

 btn.addEventListener('click', () => {
 const html = document.documentElement;
 const current = html.getAttribute('data-theme') || 'dark';
 const next = current === 'dark' ? 'light' : 'dark';
 html.setAttribute('data-theme', next);
 localStorage.setItem('cli-proxy-theme', next);

 // Update toggle icons
 const darkIcon = btn.querySelector('.theme-icon-dark');
 const lightIcon = btn.querySelector('.theme-icon-light');
 if (darkIcon) darkIcon.style.display = next === 'dark' ? '' : 'none';
 if (lightIcon) lightIcon.style.display = next === 'light' ? '' : 'none';
 });
}

/* ============================================================
 SIDEBAR
 ============================================================ */

function setupSidebar() {
 const toggle = document.getElementById('menu-toggle');
 const sidebar = document.getElementById('sidebar');

 if (toggle && sidebar) {
 toggle.addEventListener('click', () => {
 const collapsed = !sidebar.classList.contains('collapsed');
 sidebar.classList.toggle('collapsed', collapsed);
 set('sidebarCollapsed', collapsed);
 });

 if (get('sidebarCollapsed')) {
 sidebar.classList.add('collapsed');
 }
 }

 document.querySelectorAll('.nav-item').forEach(el => {
 el.addEventListener('click', e => {
 e.preventDefault();
 const view = el.dataset.view;
 if (view) navigate(view);
 if (sidebar && window.innerWidth <= 768) {
 sidebar.classList.remove('open');
 }
 });
 });
}

/* ============================================================
 GLOBAL SEARCH
 ============================================================ */

function setupGlobalSearch() {
 const btn = document.getElementById('global-search-btn');
 const modal = document.getElementById('search-modal');
 const input = document.getElementById('global-search-input');
 const results = document.getElementById('search-results');

 if (!btn || !modal || !input || !results) return;

 function openSearch() {
 modal.hidden = false;
 requestAnimationFrame(() => modal.classList.add('show'));
 input.value = '';
 input.focus();
 renderSearchResults('');
 }

 function closeSearch() {
 modal.classList.remove('show');
 setTimeout(() => { modal.hidden = true; }, 250);
 }

 btn.addEventListener('click', openSearch);

 input.addEventListener('input', debounce(e => {
 renderSearchResults(e.target.value.trim().toLowerCase());
 }, 150));

 input.addEventListener('keydown', e => {
 if (e.key === 'Escape') closeSearch();
 if (e.key === 'Enter') {
 const first = results.querySelector('.search-item');
 if (first) first.click();
 }
 });

 modal.addEventListener('click', e => {
 if (e.target === modal) closeSearch();
 });
}

function renderSearchResults(query) {
 const container = document.getElementById('search-results');
 if (!container) return;
 container.innerHTML = '';

 const items = [];
 const config = get('config') || {};

 // Providers
 const providers = config['openai-compatibility'] || [];
 for (const p of providers) {
 const name = p.name || p['base-url'] || 'unnamed';
 if (!query || name.toLowerCase().includes(query)) {
 items.push({ type: 'provider', icon: icon('server', { size: 18 }), title: name, desc: 'Provider', action: () => navigate('providers') });
 }
 }

 // Models
 const enriched = get('enrichedModels') || [];
 for (const m of enriched) {
 if (!query || m.id.toLowerCase().includes(query) || (m.provider || '').toLowerCase().includes(query)) {
 items.push({ type: 'model', icon: icon('cube', { size: 18 }), title: m.id, desc: m.provider || 'Model', action: () => navigate('models') });
 }
 }

 // Views
 const views = [
 { name: 'Dashboard', icon: icon('dashboard', { size: 18 }), view: 'dashboard' },
 { name: 'Providers', icon: icon('providers', { size: 18 }), view: 'providers' },
 { name: 'Models', icon: icon('models', { size: 18 }), view: 'models' },
 { name: 'Traffic', icon: icon('traffic', { size: 18 }), view: 'traffic' },
 { name: 'Keys & Auth', icon: icon('keys', { size: 18 }), view: 'keys' },
 // Settings moved to Config page
 { name: 'Config', icon: icon('config', { size: 18 }), view: 'config' },
 { name: 'Chat', icon: icon('chat', { size: 18 }), view: 'chat' },
 ];
 for (const v of views) {
 if (!query || v.name.toLowerCase().includes(query)) {
 items.push({ type: 'view', icon: v.icon, title: v.name, desc: 'Page', action: () => navigate(v.view) });
 }
 }

 if (!items.length) {
 container.appendChild(h('div', { className: 'text-muted text-center', style: { padding: '2rem' } }, ['No results']));
 return;
 }

 const groups = {};
 for (const item of items) {
 groups[item.type] = groups[item.type] || [];
 groups[item.type].push(item);
 }

 const groupMeta = {
 provider: { label: 'Providers', icon: 'server' },
 model: { label: 'Models', icon: 'cube' },
 view: { label: 'Pages', icon: 'page' },
 };

 for (const type of ['provider', 'model', 'view']) {
   const groupItems = groups[type];
   if (!groupItems || !groupItems.length) continue;
   const meta = groupMeta[type] || { label: type, icon: 'page' };

   container.appendChild(h('div', { className: 'search-group' }, [
     h('div', { className: 'search-group-title' }, [
       h('div', { className: 'search-group-title-left' }, [
         icon(meta.icon, { size: 15 }),
         h('span', {}, [meta.label]),
       ]),
       h('span', { className: 'search-group-count' }, [String(groupItems.length)]),
     ]),
     h('div', { className: 'search-group-list' }, groupItems.slice(0, 5).map(item =>
       h('div', { className: 'search-item', onClick: () => {
         document.getElementById('search-modal').classList.remove('show');
         setTimeout(() => { document.getElementById('search-modal').hidden = true; }, 250);
         item.action();
       } }, [
         h('div', { className: 'search-item-icon' }, [item.icon]),
         h('div', { className: 'search-item-text' }, [
           h('div', { className: 'search-item-title' }, [item.title]),
           h('div', { className: 'search-item-desc' }, [item.desc]),
         ]),
       ])
     )),
   ]));
 }
}

/* ============================================================
 KEYBOARD SHORTCUTS
 ============================================================ */

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('global-search-btn')?.click();
    }
    if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      showShortcutsHelp();
    }
  });
}

function showShortcutsHelp() {
  showModal({
    title: 'Keyboard Shortcuts',
    children: [
      h('div', { className: 'flex flex-col gap-2' }, [
        shortcutRow('Ctrl + K', 'Global search'),
        shortcutRow('Esc', 'Close modal / search'),
        shortcutRow('?', 'Show this help'),
      ]),
    ],
    footer: [h('button', { className: 'btn btn-ghost', onClick: closeModal }, ['Close'])],
  });
}

function shortcutRow(keys, desc) {
 return h('div', { className: 'flex justify-between items-center', style: { padding: '0.5rem 0', borderBottom: '1px solid var(--border-light)' } }, [
 h('span', {}, [desc]),
 h('kbd', { style: { background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' } }, [keys]),
 ]);
}

/* ============================================================
  AUTO-SAVE
  ============================================================ */

function setupAutoSave() {
  let ready = false;
  let timer = null;

  setTimeout(() => { ready = true; }, 2000);

  watch('config', config => {
    if (!ready || !config) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await saveConfig(config);
      } catch (e) {
        toastError(`Auto-save failed: ${e.message}`);
      }
    }, 1000);
  });
}

/* ============================================================
 HEALTH CHECK
 ============================================================ */

function setupHealthCheck() {
 async function check() {
 const statusEl = document.getElementById('server-status');
 if (!statusEl) return;

 const dot = statusEl.querySelector('.status-dot');
 const text = statusEl.querySelector('.status-text');

 try {
 await fetchHealth();
 dot?.classList.add('ok');
 dot?.classList.remove('error');
 if (text) text.textContent = 'Connected';
 } catch {
 dot?.classList.add('error');
 dot?.classList.remove('ok');
 if (text) text.textContent = 'Disconnected';
 }
 }

 check();
 setInterval(check, 30000);
}

/* ============================================================
 BOOT
 ============================================================ */
if (document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
