/**
 * @fileoverview Providers view — connections, OAuth auth, upstream check,
 * models list, and payload overrides.
 */

import { get, set, watch } from '../core/state.js';
import { fetchConfig, saveConfig, fetchProvidersCheck, fetchAuthFiles, fetchOAuthURL, OAUTH_PROVIDERS, getClientApiKey } from '../core/api.js';
import { DataTable } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { toastOk, toastError } from '../components/toast.js';
import { h, deepClone, debounce } from '../core/utils.js';

const TABS = [
  { key: 'connections', label: 'Подключения', icon: '🔌' },
  { key: 'oauth', label: 'OAuth', icon: '🔐' },
  { key: 'check', label: 'Проверка', icon: '🔍' },
  { key: 'models', label: 'Модели', icon: '🧩' },
  { key: 'payload', label: 'Payload', icon: '⚙️' },
];

export function renderProviders(container) {
  const tabEls = TABS.map(t => {
    const btn = h('button', {
      className: `tab ${get('providerTab') === t.key ? 'active' : ''}`,
      onClick: () => set('providerTab', t.key),
    }, [`${t.icon} ${t.label}`]);
    btn.dataset.tabKey = t.key;
    return btn;
  });

  const tabs = h('div', { className: 'tabs' }, tabEls);
  const content = h('div', { id: 'providers-content' });
  container.appendChild(tabs);
  container.appendChild(content);

  if (!get('config')) {
    fetchConfig().then(c => set('config', c)).catch(e => toastError(e.message));
  }

  function update(tab) {
    // Update tab button classes
    for (const btn of tabEls) {
      btn.classList.toggle('active', btn.dataset.tabKey === tab);
    }
    content.innerHTML = '';
    switch (tab) {
      case 'connections': renderConnections(content); break;
      case 'oauth': renderOAuth(content); break;
      case 'check': renderProviderCheck(content); break;
      case 'models': renderModelsTab(content); break;
      case 'payload': renderPayloadOverrides(content); break;
      default: renderConnections(content);
    }
  }

  const unsub = watch('providerTab', update);
  const unsub2 = watch('config', (val) => update(get('providerTab') || 'connections'));
  update(get('providerTab') || 'connections');

  return () => { unsub(); unsub2(); };
}

/* ════════════════════════════════════════
   TAB 1: Connections (all provider types)
   ════════════════════════════════════════ */

function renderConnections(container) {
  const config = get('config') || {};
  const providers = config['openai-compatibility'] || [];
  const sections = [];

  // Section: OpenAI-compatibility providers
  sections.push(
    h('h3', { style: { margin: '1rem 0 0.5rem', fontSize: '1rem' } }, ['📡 OpenAI-совместимые провайдеры']),
  );

  if (!providers.length) {
    sections.push(h('p', { className: 'text-muted' }, ['Нет настроенных провайдеров']));
  } else {
    const grid = h('div', { className: 'card-grid' });
    for (const p of providers) {
      grid.appendChild(renderCompatCard(p));
    }
    sections.push(grid);
  }

  // Section: OAuth API keys configured in config
  sections.push(
    h('h3', { style: { margin: '1.5rem 0 0.5rem', fontSize: '1rem' } }, ['🔑 API-ключи (OAuth провайдеры)']),
  );

  const keyProviders = [
    { key: 'codexKey', label: 'OpenAI (Codex/ChatGPT)', icon: '🟢' },
    { key: 'claudeKey', label: 'Anthropic (Claude)', icon: '🟣' },
    { key: 'geminiKey', label: 'Google (Gemini)', icon: '🔵' },
  ];

  for (const kp of keyProviders) {
    const keys = config[kp.key] || [];
    const count = Array.isArray(keys) ? keys.length : 0;
    sections.push(h('div', { className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      h('div', {}, [
        h('span', { style: { fontSize: '1.2rem', marginRight: '0.5rem' } }, [kp.icon]),
        h('strong', {}, [kp.label]),
      ]),
      h('span', { className: 'badge badge-ok' }, [`${count} ключ${count === 1 ? '' : count < 5 ? 'а' : 'ей'}`]),
    ]));
  }

  // Section: OAuth-model-alias
  const oauthAliases = config['oauth-model-alias'] || {};
  if (Object.keys(oauthAliases).length) {
    sections.push(
      h('h3', { style: { margin: '1.5rem 0 0.5rem', fontSize: '1rem' } }, ['🏷️ OAuth-алиасы моделей']),
    );
    const aliasRows = [];
    for (const [channel, entries] of Object.entries(oauthAliases)) {
      for (const entry of entries || []) {
        aliasRows.push({
          channel,
          model: entry.name,
          alias: entry.alias || '(без алиаса)',
          fork: entry.fork ? '✅' : '❌',
        });
      }
    }
    sections.push(DataTable({
      columns: [
        { key: 'channel', label: 'Канал' },
        { key: 'model', label: 'Модель' },
        { key: 'alias', label: 'Алиас' },
        { key: 'fork', label: 'Fork' },
      ],
      rows: aliasRows,
    }));
  }

  // Section: Vertex API keys
  const vertexKeys = config['vertex-api-key'] || [];
  if (Array.isArray(vertexKeys) && vertexKeys.length) {
    sections.push(
      h('h3', { style: { margin: '1.5rem 0 0.5rem', fontSize: '1rem' } }, ['☁️ Vertex AI']),
      h('div', { className: 'card' }, [
        h('span', { className: 'badge badge-ok' }, [`${vertexKeys.length} ключ${vertexKeys.length === 1 ? '' : vertexKeys.length < 5 ? 'а' : 'ей'}`]),
      ]),
    );
  }

  sections.forEach(el => container.appendChild(el));
}

function renderCompatCard(p) {
  const name = p.name || p['base-url'] || 'unnamed';
  const keyCount = p['api-key-entries']?.length || 0;
  const modelsCount = p.models?.length || 0;

  return h('div', { className: 'card' }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' } }, [
      h('div', {}, [
        h('div', { className: 'card-title' }, [name]),
        h('div', { className: 'text-muted', style: { fontSize: '0.8rem', wordBreak: 'break-all' } }, [p['base-url'] || 'no URL']),
      ]),
      h('div', { className: 'flex gap-1' }, [
        h('button', { className: 'btn btn-sm btn-ghost', onClick: () => editProvider(p) }, ['✏️']),
        h('button', { className: 'btn btn-sm btn-ghost', style: { color: 'var(--color-error, #ef4444)' }, onClick: () => deleteProvider(name) }, ['🗑️']),
      ]),
    ]),
    h('div', { className: 'flex gap-4', style: { fontSize: '0.85rem' } }, [
      h('span', {}, [`🔑 ${keyCount} ключ${keyCount === 1 ? '' : keyCount < 5 ? 'а' : 'ей'}`]),
      h('span', {}, [`🧩 ${modelsCount} модель${modelsCount === 1 ? '' : modelsCount < 5 ? (modelsCount < 10 ? 'и' : 'ей') : 'ей'}`]),
      p.prefix ? h('span', {}, [`🏷️ ${p.prefix}`]) : null,
    ].filter(Boolean)),
  ]);
}

function editProvider(p) {
  const name = p.name || p['base-url'] || 'unnamed';
  const baseURLInput = h('input', { className: 'form-input', value: p['base-url'] || '' });
  const keyInput = h('input', { className: 'form-input', type: 'password', value: p['api-key-entries']?.[0]?.['api-key'] || '' });

  showModal({
    title: `Редактировать: ${name}`,
    children: [
      h('div', { className: 'form-group' }, [
        h('label', { className: 'form-label' }, ['Base URL']),
        baseURLInput,
      ]),
      h('div', { className: 'form-group' }, [
        h('label', { className: 'form-label' }, ['API Key']),
        keyInput,
        h('div', { className: 'form-hint' }, ['Оставьте пустым, чтобы не менять']),
      ]),
    ],
    footer: [
      h('button', { className: 'btn btn-ghost', onClick: closeModal }, ['Отмена']),
      h('button', {
        className: 'btn btn-primary',
        onClick: async () => {
          const cfg = deepClone(get('config'));
          const providers = cfg['openai-compatibility'] || [];
          const idx = providers.findIndex(pr => pr.name === p.name);
          if (idx < 0) return;

          providers[idx]['base-url'] = baseURLInput.value.trim();
          const newKey = keyInput.value.trim();
          if (newKey) {
            providers[idx]['api-key-entries'] = [{ 'api-key': newKey }];
          }

          try {
            await saveConfig(cfg);
            set('config', cfg);
            toastOk(`Провайдер "${name}" обновлён`);
            closeModal();
          } catch (e) {
            toastError(e.message);
          }
        },
      }, ['Сохранить']),
    ],
  });
}

async function deleteProvider(name) {
  if (!confirm(`Удалить провайдер "${name}"?`)) return;

  const cfg = deepClone(get('config'));
  cfg['openai-compatibility'] = (cfg['openai-compatibility'] || []).filter(p => p.name !== name);

  try {
    await saveConfig(cfg);
    set('config', cfg);
    toastOk(`Провайдер "${name}" удалён`);
  } catch (e) {
    toastError(e.message);
  }
}

/* ════════════════════════════════════════
   TAB 2: OAuth Authorization
   ════════════════════════════════════════ */

async function renderOAuth(container) {
  const authStatusEl = h('div', { style: { textAlign: 'center' } }, [
    h('div', { className: 'spinner' }),
    h('p', { className: 'text-muted' }, ['Загрузка статуса авторизации...']),
  ]);
  container.appendChild(authStatusEl);

  let authFiles = [];
  try {
    authFiles = await fetchAuthFiles();
  } catch (e) {
    console.warn('Failed to fetch auth files:', e);
  }

  authStatusEl.innerHTML = '';

  const grid = h('div', { className: 'card-grid' });

  for (const prov of OAUTH_PROVIDERS) {
    // Check if this provider has auth tokens
    const hasAuth = authFiles.some(f => {
      const fname = (f.name || f.file_name || '').toLowerCase();
      const keywords = [prov.key, prov.key.replace('-', '')].filter(Boolean);
      // Codex auth file names are often "openai"/"chatgpt" and not "codex"
      if (prov.key === 'codex') keywords.push('openai', 'chatgpt');
      return keywords.some(k => fname.includes(k));
    });

    // Also check config for direct API keys
    const config = get('config') || {};
    let configKeys = 0;
    if (prov.key === 'codex') configKeys = (config['codex-api-key'] || []).length;
    if (prov.key === 'anthropic') configKeys = (config['claude-api-key'] || []).length;
    if (prov.key === 'gemini-cli') configKeys = (config['gemini-api-key'] || []).length;

    const isAuthed = hasAuth || configKeys > 0;
    const statusBadge = isAuthed
      ? h('span', { className: 'badge badge-ok' }, ['✅ Авторизован'])
      : h('span', { className: 'badge badge-warn' }, ['❌ Не авторизован']);

    const detailLines = [];
    if (hasAuth) detailLines.push(`OAuth токен: есть`);
    if (configKeys > 0) detailLines.push(`API ключей в конфиге: ${configKeys}`);

    grid.appendChild(h('div', { className: 'card' }, [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' } }, [
        h('div', {}, [
          h('div', { className: 'card-title' }, [prov.label]),
          detailLines.length
            ? h('div', { className: 'text-muted', style: { fontSize: '0.8rem' } }, [detailLines.join(' • ')])
            : null,
        ]),
        statusBadge,
      ]),
      h('div', { className: 'flex gap-2', style: { marginTop: '0.5rem' } }, [
        h('button', {
          className: 'btn btn-sm btn-primary',
          onClick: () => startOAuth(prov.key, prov.label),
        }, ['🔐 Войти через OAuth']),
        isAuthed
          ? h('button', {
              className: 'btn btn-sm btn-ghost',
              style: { color: 'var(--color-error, #ef4444)' },
              onClick: () => { toastOk('Для удаления OAuth токенов используйте вкладку "Подключения" → Auth Files'); },
            }, ['🗑️ Выйти'])
          : null,
      ].filter(Boolean)),
    ]));
  }

  container.appendChild(grid);

  // Also show auth files list
  if (authFiles.length) {
    container.appendChild(
      h('h3', { style: { margin: '1.5rem 0 0.5rem', fontSize: '1rem' } }, ['📁 OAuth-токены (Auth Files)']),
    );
    const fileRows = authFiles.slice(0, 20).map(f => ({
      name: f.name || f.file_name || '?',
      status: f.status || f.state || 'active',
      models: (f.models_count ?? f.modelCount ?? '-'),
      channel: f.channel || f.provider || '-',
    }));
    container.appendChild(DataTable({
      columns: [
        { key: 'name', label: 'Файл' },
        { key: 'channel', label: 'Канал' },
        { key: 'status', label: 'Статус' },
        { key: 'models', label: 'Моделей' },
      ],
      rows: fileRows,
    }));
  }
}

async function startOAuth(providerKey, label) {
  try {
    const url = await fetchOAuthURL(providerKey);
    if (!url) {
      toastError('URL авторизации не получен');
      return;
    }
    // Open in new window for OAuth flow
    const w = window.open(url, '_blank', 'width=600,height=700');
    if (!w) {
      toastError('Браузер заблокировал всплывающее окно. Разрешите его для этого сайта.');
      return;
    }
    toastOk(`Открыта страница авторизации ${label}`);
    // Poll for completion
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (attempts > 120) { // 2 minutes max
        clearInterval(poll);
        return;
      }
      if (w.closed) {
        clearInterval(poll);
        // Refresh provider list
        set('config', get('config')); // trigger re-render
      }
    }, 1000);
  } catch (e) {
    toastError(`Ошибка OAuth: ${e.message}`);
  }
}

/* ════════════════════════════════════════
   TAB 3: Provider Upstream Check
   ════════════════════════════════════════ */

function renderProviderCheck(container) {
  container.appendChild(h('div', { style: { marginBottom: '1rem' } }, [
    h('p', { className: 'text-muted', style: { marginBottom: '0.75rem' } }, [
      'Проверяет upstream /v1/models каждого провайдера. Покажет какие модели реально доступны.'
    ]),
    h('button', {
      className: 'btn btn-primary',
      onClick: () => doProviderCheck(container),
    }, ['🔌 Проверить все провайдеры']),
  ]));

  const resultsEl = h('div', { id: 'provider-check-results' });
  container.appendChild(resultsEl);
}

async function doProviderCheck(container) {
  const resultsEl = document.getElementById('provider-check-results') || container.querySelector('#provider-check-results');
  if (!resultsEl) return;

  resultsEl.innerHTML = '';
  resultsEl.appendChild(h('div', { className: 'empty-state' }, [
    h('div', { className: 'spinner' }),
    h('div', { className: 'empty-state-title' }, ['Проверяю провайдеры...']),
    h('div', { className: 'empty-state-desc' }, ['Это может занять до 15 секунд на каждый провайдер']),
  ]));

  // Get the live models list for comparison
  const enrichedModels = Array.isArray(get('enrichedModels')) ? get('enrichedModels') : [];
  const proxyModelIds = new Set(enrichedModels.map(m => m.id));

  try {
    const checkResult = await fetchProvidersCheck();
    const providers = checkResult.providers;
    resultsEl.innerHTML = '';

    if (!providers.length) {
      resultsEl.appendChild(h('div', { className: 'empty-state' }, [
        h('div', { className: 'empty-state-icon' }, ['⚠️']),
        h('div', { className: 'empty-state-title' }, ['Нет настроенных провайдеров']),
        h('div', { className: 'empty-state-desc' }, ['Добавьте провайдеры в секции openai-compatibility']),
      ]));
      return;
    }

    // Summary
    const okStatuses = new Set(['ok', 'oauth-active', 'models-via-proxy']);
    const warnStatuses = new Set(['no-models-endpoint', 'oauth-inactive', 'timeout']);
    const okCount = providers.filter(p => okStatuses.has(p.status)).length;
    const warnCount = providers.filter(p => warnStatuses.has(p.status)).length;
    const errCount = providers.filter(p => !okStatuses.has(p.status) && !warnStatuses.has(p.status)).length;

    resultsEl.appendChild(h('div', { style: { display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' } }, [
      h('span', { className: 'badge badge-ok' }, [`✅ ${okCount} работает/найдено`]),
      warnCount ? h('span', { className: 'badge badge-warn' }, [`⚠️ ${warnCount} предупреждение`]) : null,
      errCount ? h('span', { className: 'badge badge-error' }, [`❌ ${errCount} ошибка`]) : null,
      h('span', { className: 'badge' }, [`📊 ${providers.length} всего`]),
    ].filter(Boolean)));

    for (const p of providers) {
      resultsEl.appendChild(renderProviderResult(p, proxyModelIds));
    }

  } catch (e) {
    resultsEl.innerHTML = '';
    resultsEl.appendChild(h('div', { className: 'empty-state' }, [
      h('div', { className: 'empty-state-icon' }, ['❌']),
      h('div', { className: 'empty-state-title' }, ['Ошибка проверки']),
      h('div', { className: 'empty-state-desc' }, [e.message || String(e)]),
    ]));
  }
}

function providerStatusMeta(status) {
  switch (status) {
    case 'ok': return { color: 'badge-ok', icon: '🟢', text: 'OK' };
    case 'oauth-active': return { color: 'badge-ok', icon: '🔐', text: 'OAuth активен' };
    case 'models-via-proxy': return { color: 'badge-ok', icon: '🌐', text: 'Есть модели в прокси' };
    case 'no-models-endpoint': return { color: 'badge-warn', icon: '🟡', text: 'Нет /models endpoint' };
    case 'oauth-inactive': return { color: 'badge-warn', icon: '⚪', text: 'OAuth не найден' };
    case 'timeout': return { color: 'badge-warn', icon: '🟡', text: 'Таймаут' };
    default: return { color: 'badge-error', icon: '🔴', text: 'Ошибка' };
  }
}

function renderProviderResult(p, proxyModelIds) {
  const meta = providerStatusMeta(p.status);
  const upstreamModels = Array.isArray(p.models) ? p.models : [];
  const missingModels = p.type === 'openai-compat'
    ? upstreamModels.filter(m => !proxyModelIds.has(m))
    : [];
  const proxyOnly = p.type === 'openai-compat'
    ? [...proxyModelIds].filter(m => {
        const enriched = Array.isArray(get('enrichedModels')) ? get('enrichedModels') : [];
        const mod = enriched.find(e => e.id === m);
        return mod && mod.provider === p.name && !upstreamModels.includes(m) && !upstreamModels.includes(mod.realId);
      })
    : [];

  const children = [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' } }, [
      h('div', {}, [
        h('span', { className: `badge ${meta.color}`, style: { marginRight: '0.5rem' } }, [meta.icon, ' ', meta.text]),
        h('strong', {}, [p.name]),
        p.type ? h('span', { className: 'tag tag-muted', style: { marginLeft: '0.5rem' } }, [p.type]) : null,
        p.latencyMs != null && p.latencyMs > 0 ? h('span', { className: 'text-muted', style: { marginLeft: '0.5rem', fontSize: '0.85em' } }, [`${p.latencyMs}мс`]) : null,
      ].filter(Boolean)),
      h('span', { style: { fontSize: '0.85em', color: 'var(--text-muted)' } }, [`${upstreamModels.length} моделей`]),
    ]),
  ];

  if (p.error) {
    const isNoModelsEndpoint = p.status === 'no-models-endpoint';
    children.push(h('div', {
      style: {
        color: isNoModelsEndpoint ? '#f59e0b' : 'var(--color-error, #ef4444)',
        fontSize: '0.85em',
        marginBottom: '0.5rem',
        wordBreak: 'break-word',
      },
    }, [isNoModelsEndpoint
      ? 'ℹ️ Upstream не предоставляет стандартный /v1/models. Это не обязательно ошибка: модели могут быть заданы вручную в config.yaml.'
      : `⚠️ ${p.error}`]));
  }

  if (p.status === 'oauth-active') {
    children.push(h('div', { style: { color: '#4ade80', fontSize: '0.85em', marginBottom: '0.5rem' } }, [
      '✅ Найден OAuth auth-файл. Модели ниже взяты из конфигурации/прокси.',
    ]));
  } else if (p.status === 'oauth-inactive') {
    children.push(h('div', { style: { color: '#f59e0b', fontSize: '0.85em', marginBottom: '0.5rem' } }, [
      '⚠️ OAuth auth-файл не найден. Авторизуйтесь на вкладке OAuth.',
    ]));
  } else if (p.status === 'models-via-proxy') {
    children.push(h('div', { style: { color: '#4ade80', fontSize: '0.85em', marginBottom: '0.5rem' } }, [
      '✅ В прокси есть модели этого провайдера. OAuth-файл явно не найден, возможно используется другой тип авторизации.',
    ]));
  }

  if (p.baseUrl) {
    children.push(h('div', { style: { color: 'var(--text-muted)', fontSize: '0.8em', marginBottom: '0.5rem', wordBreak: 'break-all' } }, [`URL: ${p.baseUrl}`]));
  }

  if (upstreamModels.length > 0) {
    children.push(h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '0.5rem' } },
      upstreamModels.slice(0, 20).map(m => h('span', { className: 'tag' }, [m]))
        .concat(upstreamModels.length > 20 ? [h('span', { className: 'tag tag-muted' }, [`+ещё ${upstreamModels.length - 20}`])] : [])
    ));
  }

  if (missingModels.length > 0) {
    children.push(h('div', { style: { color: '#f59e0b', fontSize: '0.85em', marginBottom: '0.25rem' } }, [
      `⚠️ Есть в upstream, но НЕ в прокси: ${missingModels.slice(0, 10).join(', ')}${missingModels.length > 10 ? ` +ещё ${missingModels.length - 10}` : ''}`
    ]));
  }

  if (proxyOnly.length > 0) {
    children.push(h('div', { style: { color: 'var(--text-muted)', fontSize: '0.85em', marginBottom: '0.25rem' } }, [
      `ℹ️ Есть в прокси, но НЕ в upstream: ${proxyOnly.slice(0, 10).join(', ')}${proxyOnly.length > 10 ? ` +ещё ${proxyOnly.length - 10}` : ''}`
    ]));
  }

  return h('div', {
    style: {
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)',
      marginBottom: '0.75rem',
    },
  }, children);
}

/* ════════════════════════════════════════
   TAB 4: Models list
   ════════════════════════════════════════ */

async function renderModelsTab(container) {
  // ── Section: Models grouped by provider with status ──
  const header = h('h3', { style: { margin: '0 0 0.5rem', fontSize: '1rem' } }, ['📊 Модели по провайдерам']);
  container.appendChild(header);

  const providerRefreshBtn = h('button', {
    className: 'btn btn-sm btn-ghost',
    style: { marginBottom: '1rem' },
    onClick: () => loadProvidersWithModels(),
  }, ['🔄 Обновить']);
  container.appendChild(providerRefreshBtn);

  // Function to test provider API through proxy
  async function testProviderAPI(provider) {
    const testBtn = document.getElementById(`test-api-${provider.name?.replace(/\s+/g, '-')}`);
    if (testBtn) {
      testBtn.textContent = '⏳ Проверяю...';
      testBtn.disabled = true;
    }

    try {
      // Use the panel's nginx proxy to reach the upstream CLIProxyAPI.
      // The proxy requires a valid *client* API key (not the management key).
      const clientKey = getClientApiKey();
      if (!clientKey) {
        throw new Error('Нет client API key для /v1/* запросов. Добавьте api-keys в config.yaml и перезайдите в панель.');
      }

      const response = await fetch('/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${clientKey}`,
        },
      });

      const result = await response.text();
      let message = '';

      if (response.ok) {
        message = '✅ Прокси API доступен (/v1/models)';
      } else {
        const errorData = result.substring(0, 500).toLowerCase();
        if (response.status === 401 || errorData.includes('unauthorized') || errorData.includes('api key')) {
          message = '🔴 Неверный API ключ прокси';
        } else if (response.status === 403 || errorData.includes('forbidden')) {
          message = '🔴 Доступ запрещён';
        } else if (errorData.includes('timeout')) {
          message = '⏱️ Таймаут';
        } else if (response.status === 502 || response.status === 503 || response.status === 504) {
          message = `🔴 Прокси недоступен (${response.status})`;
        } else {
          message = `⚠️ Ошибка: ${response.status}`;
        }
      }

      if (testBtn) {
        testBtn.textContent = message;
        testBtn.disabled = false;
        // Reset after 5 seconds
        setTimeout(() => {
          if (testBtn) testBtn.textContent = '🧪 Проверить API';
        }, 5000);
      }
    } catch (e) {
      if (testBtn) {
        testBtn.textContent = `🔴 Ошибка: ${e.message}`;
        testBtn.disabled = false;
      }
    }
  }

  const providersContainer = h('div', { id: 'providers-models-container' });
  container.appendChild(providersContainer);

  let providersData = [];

  async function loadProvidersWithModels() {
    providersContainer.innerHTML = '';
    providersContainer.appendChild(h('div', { className: 'empty-state' }, [
      h('div', { className: 'spinner' }),
      h('div', { className: 'empty-state-title' }, ['Загружаю провайдеров...']),
    ]));

    try {
      const result = await fetchProvidersCheck();
      providersData = result.providers || [];
    } catch (e) {
      console.error('Failed to fetch providers:', e);
      providersData = [];
    }

    renderProvidersWithModels();
  }

  function renderProvidersWithModels() {
    providersContainer.innerHTML = '';

    if (!providersData.length) {
      providersContainer.appendChild(h('div', { className: 'empty-state' }, [
        h('div', { className: 'empty-state-icon' }, ['⚠️']),
        h('div', { className: 'empty-state-title' }, ['Нет данных о провайдерах']),
      ]));
      return;
    }

    // Summary stats
    const okCount = providersData.filter(p => p.status === 'ok' || p.status === 'oauth-active').length;
    const totalModels = providersData.reduce((sum, p) => sum + (p.models?.length || 0), 0);
    
    providersContainer.appendChild(h('div', { style: { display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' } }, [
      h('span', { className: 'badge badge-ok' }, [`🟢 ${okCount} провайдеров доступно`]),
      h('span', { className: 'badge' }, [`📊 ${totalModels} моделей всего`]),
      h('span', { className: 'badge' }, [`🏢 ${providersData.length} провайдеров`]),
    ].filter(Boolean)));

    // Render each provider
    for (const p of providersData) {
      const isOk = p.status === 'ok' || p.status === 'oauth-active';
      const statusColor = isOk ? 'var(--color-success, #22c55e)' : 'var(--color-error, #ef4444)';
      const statusIcon = isOk ? '🟢' : '🔴';
      const statusText = p.status === 'ok' ? 'Доступен' : p.status === 'oauth-active' ? 'OAuth активен' : 'Недоступен';

      const providerCard = h('div', { 
        className: 'card',
        style: { marginBottom: '1rem', padding: '1rem' }
      }, [
        // Provider header
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' } }, [
          h('div', {}, [
            h('div', { style: { fontWeight: 600, fontSize: '1rem' } }, [p.name || 'Unknown']),
            h('div', { className: 'text-muted', style: { fontSize: '0.8rem' } }, [p.baseUrl || '']),
          ]),
          h('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } }, [
            p.latencyMs !== undefined && p.latencyMs > 0 
              ? h('span', { className: 'text-muted', style: { fontSize: '0.8rem' } }, [`⏱️ ${p.latencyMs}ms`]) 
              : null,
            h('span', { style: { color: statusColor, fontWeight: 500 } }, [`${statusIcon} ${statusText}`]),
            h('button', {
              className: 'btn btn-sm btn-ghost',
              id: `test-api-${p.name?.replace(/\s+/g, '-')}`,
              style: { marginLeft: '0.5rem', fontSize: '0.75rem' },
              onClick: () => testProviderAPI(p),
            }, ['🧪 Проверить API']),
          ]),
        ]),

        // Models list
        p.models && p.models.length > 0
          ? h('div', { style: { marginTop: '0.5rem' } }, [
              h('div', { className: 'text-muted', style: { fontSize: '0.8rem', marginBottom: '0.5rem' } }, [`Модели (${p.models.length}):`]),
              h('div', { 
                style: { 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '4px',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  padding: '8px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                } 
              }, [
                ...p.models.slice(0, 50).map(m => 
                  h('span', {
                    className: 'tag',
                    style: { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75em' },
                    title: m,
                  }, [m.length > 40 ? m.substring(0, 40) + '...' : m])
                ),
                p.models.length > 50 
                  ? h('span', { className: 'text-muted', style: { fontSize: '0.8rem' } }, [`... и ещё ${p.models.length - 50}`])
                  : null,
              ].filter(Boolean)),
            ])
          : h('div', { className: 'text-muted', style: { fontSize: '0.85rem', marginTop: '0.5rem' } }, ['Нет моделей']),
      ]);

      providersContainer.appendChild(providerCard);
    }
  }

  // Initial load
  await loadProvidersWithModels();

  // Legacy: Keep old flat list section below for reference
  const allModelsHeader = h('h3', { style: { margin: '2rem 0 0.5rem', fontSize: '1rem' } }, ['📋 Все доступные модели (плоский список)']);
  container.appendChild(allModelsHeader);

  const filterWrap = h('div', { style: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' } }, [
    h('input', {
      className: 'form-input',
      id: 'all-models-filter',
      placeholder: 'Фильтр по названию модели…',
      style: { maxWidth: '360px', flex: '1' },
    }),
    h('span', { id: 'all-models-count', className: 'text-muted', style: { fontSize: '0.85rem' } }, ['Загрузка…']),
  ]);
  container.appendChild(filterWrap);

  const allModelsGrid = h('div', {
    id: 'all-models-grid',
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '6px',
      maxHeight: '420px',
      overflowY: 'auto',
      marginBottom: '1.5rem',
      padding: '12px',
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-light)',
    },
  });
  container.appendChild(allModelsGrid);

  let allModelsData = [];

  async function loadAllModels() {
    allModelsGrid.innerHTML = '';
    const countEl = document.getElementById('all-models-count');
    if (countEl) countEl.textContent = 'Загрузка…';

    try {
      const result = await fetchProvidersCheck();
      allModelsData = result.allModels || [];
    } catch (e) {
      console.error('Failed to fetch all models:', e);
      allModelsData = [];
    }

    renderAllModelsGrid(allModelsData);
  }

  function renderAllModelsGrid(models) {
    allModelsGrid.innerHTML = '';
    const countEl = document.getElementById('all-models-count');
    if (countEl) countEl.textContent = `${models.length} моделей`;

    if (!models.length) {
      allModelsGrid.appendChild(h('span', { className: 'text-muted', style: { padding: '0.5rem' } }, ['Нет данных']));
      return;
    }

    for (const m of models) {
      const chip = h('span', {
        className: 'tag',
        title: m,
        style: { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8em', cursor: 'default' },
      }, [m]);
      allModelsGrid.appendChild(chip);
    }
  }

  // Filter input handler
  const filterInput = document.getElementById('all-models-filter');
  if (filterInput) {
    let debounceTimer;
    filterInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = filterInput.value.trim().toLowerCase();
        if (!q) {
          renderAllModelsGrid(allModelsData);
        } else {
          renderAllModelsGrid(allModelsData.filter(m => m.toLowerCase().includes(q)));
        }
      }, 150);
    });

    // Ctrl+K shortcut to focus filter when on Models tab
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        if (get('providerTab') === 'models') {
          e.preventDefault();
          filterInput.focus();
        }
      }
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('all-models-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadAllModels());
  }

  // Initial load
  await loadAllModels();

  // ── Section 2: Configured models from openai-compatibility providers ─
  const config = get('config') || {};
  const providers = config['openai-compatibility'] || [];
  const oauthAliases = config['oauth-model-alias'] || {};

  const allModels = [];
  for (const p of providers) {
    for (const m of p.models || []) {
      const modelId = typeof m === 'string' ? m : m.name;
      const alias = typeof m === 'string' ? null : m.alias;
      allModels.push({
        model: modelId,
        alias: alias || '—',
        provider: p.name || p['base-url'] || 'unnamed',
        status: '',
      });
    }
  }

  if (allModels.length) {
    container.appendChild(h('h3', { style: { margin: '1rem 0 0.5rem', fontSize: '1rem' } }, ['📡 Настроенные модели провайдеров']));
    container.appendChild(DataTable({
      columns: [
        { key: 'status', label: '' },
        { key: 'model', label: 'Модель' },
        { key: 'alias', label: 'Алиас' },
        { key: 'provider', label: 'Провайдер' },
      ],
      rows: allModels,
    }));
  }

  // Section: OAuth aliases
  const aliasRows = [];
  for (const [channel, entries] of Object.entries(oauthAliases)) {
    for (const entry of entries || []) {
      aliasRows.push({
        channel,
        model: entry.name,
        alias: entry.alias || '—',
        fork: entry.fork ? '✅ Fork' : '⛓️ Proxy',
      });
    }
  }

  if (aliasRows.length) {
    container.appendChild(h('h3', { style: { margin: '1.5rem 0 0.5rem', fontSize: '1rem' } }, ['🔐 OAuth-алиасы моделей']));
    container.appendChild(DataTable({
      columns: [
        { key: 'channel', label: 'Канал' },
        { key: 'model', label: 'Модель' },
        { key: 'alias', label: 'Алиас' },
        { key: 'fork', label: 'Тип' },
      ],
      rows: aliasRows,
    }));
  }

  // Section: Live models from API
  const enriched = get('enrichedModels') || [];
  if (enriched.length) {
    container.appendChild(h('h3', { style: { margin: '1.5rem 0 0.5rem', fontSize: '1rem' } }, ['🌐 Доступные модели (из API)']));

    // Group by provider
    const groups = new Map();
    for (const m of enriched) {
      const prov = m.provider || 'unknown';
      if (!groups.has(prov)) groups.set(prov, []);
      groups.get(prov).push(m);
    }

    for (const [prov, models] of groups) {
      const availCount = models.filter(m => m.status === 'available').length;
      const availModels = models.filter(m => m.status === 'available');

      if (availModels.length) {
        container.appendChild(
          h('div', { style: { marginBottom: '1rem' } }, [
            h('h4', { style: { fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' } }, [
              `${prov} (${availCount})`,
            ]),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
              availModels.map(m => {
                const tags = [];
                if (m.isAlias) tags.push(`→${m.alias}`);
                if (m.hasVision) tags.push('');
                if (m.hasReasoning) tags.push('🧠');
                return h('span', { className: 'tag', title: [m.description].filter(Boolean).join('\n') }, [
                  m.id,
                  tags.length ? ` ${tags.join(' ')}` : '',
                ]);
              })
            ),
          ]),
        );
      }
    }
  }
}

/* ════════════════════════════════════════
   TAB 5: Payload Overrides
   ════════════════════════════════════════ */

function renderPayloadOverrides(container) {
  const config = get('config') || {};
  const payload = config.payload || {};
  const overrides = payload.override || [];

  if (!overrides.length) {
    container.appendChild(h('div', { className: 'empty-state' }, [
      h('div', { className: 'empty-state-icon' }, ['⚙️']),
      h('div', { className: 'empty-state-title' }, ['Нет переопределений payload']),
      h('div', { className: 'empty-state-desc' }, ['Настройте параметры в config.yaml → payload.override']),
    ]));
    return;
  }

  const rows = [];
  for (const rule of overrides) {
    const modelNames = (rule.models || []).map(m => typeof m === 'string' ? m : m.name).join(', ');
    const paramsStr = JSON.stringify(rule.params || {}, null, 2);
    rows.push({
      models: modelNames,
      params: h('pre', { className: 'font-mono text-sm', style: { margin: 0, maxWidth: '500px', overflow: 'auto', fontSize: '0.8em' } }, [paramsStr]),
    });
  }

  container.appendChild(DataTable({
    columns: [
      { key: 'models', label: 'Модели' },
      { key: 'params', label: 'Параметры' },
    ],
    rows,
  }));
}
