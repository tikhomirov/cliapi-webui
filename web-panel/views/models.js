/**
 * @fileoverview Models view — catalog with provider grouping, alias resolution,
 * payload overrides display, and accurate capability info.
 */

import { get, set, watch } from '../core/state.js';
import { fetchConfig, fetchLiveModels, fetchUsage, fetchProvidersCheck } from '../core/api.js';
import { enrichModels } from '../core/modelEnrichment.js';
import { DataTable } from '../components/table.js';
import { showModal, closeModal } from '../components/modal.js';
import { toastOk, toastError } from '../components/toast.js';
import { h, debounce, fmtNumber, fmtDuration } from '../core/utils.js';

// LocalStorage key for enabled models
const ENABLED_MODELS_KEY = 'cli-proxy-enabled-models';

// Load enabled models from localStorage
function loadEnabledModels() {
  try {
    const stored = localStorage.getItem(ENABLED_MODELS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save enabled models to localStorage
function saveEnabledModels(enabledModels) {
  localStorage.setItem(ENABLED_MODELS_KEY, JSON.stringify(enabledModels));
}

// Toggle model enabled state and trigger re-render
let _renderModelGridFn = null;
let _statsElRef = null;

function toggleModel(modelId, enabled) {
  const enabledModels = loadEnabledModels();
  if (enabled) {
    delete enabledModels[modelId]; // If enabled, remove from disabled list
  } else {
    enabledModels[modelId] = true; // If disabled, add to disabled list
  }
  saveEnabledModels(enabledModels);
  
  // Force re-render by updating a timestamp or using a workaround
  set('modelToggleTimestamp', Date.now());
  
  // If we have the render functions saved, call them directly
  if (_renderModelGridFn && _statsElRef) {
    _renderModelGridFn(_statsElRef);
  }
}

// Save reference to render functions for use in toggle
function setRenderFn(renderFn, statsEl) {
  _renderModelGridFn = renderFn;
  _statsElRef = statsEl;
}

// Check if model is enabled
function isModelEnabled(modelId) {
  const enabledModels = loadEnabledModels();
  return !enabledModels[modelId]; // Enabled if NOT in disabled list
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'Все' },
  { key: 'available', label: '🟢 Доступны' },
  { key: 'unavailable', label: '🔴 Недоступны' },
  { key: 'disabled', label: '🔴 Отключены' },
  { key: 'vision', label: '🖼️ Vision' },
  { key: 'reasoning', label: '🧠 Reasoning' },
];

export function renderModels(container) {
  const filterBtns = FILTER_OPTIONS.map(f => {
    const btn = h('button', {
      className: `btn btn-sm ${get('modelFilter') === f.key ? 'btn-primary' : 'btn-ghost'}`,
      onClick: () => set('modelFilter', f.key),
    }, [f.label]);
    btn.dataset.filterKey = f.key;
    return btn;
  });

  // Provider tabs container - will be populated when models are loaded
  const providerTabsContainer = h('div', { id: 'provider-tabs-container', className: 'tabs', style: { marginBottom: '1rem' } });
  
  // Function to update provider tabs
  function updateProviderTabs() {
    const models = get('enrichedModels') || [];
    const providers = models.length > 0 
      ? [...new Set(models.map(m => m.provider).filter(Boolean))].sort() 
      : [];
    
    const currentProvider = get('modelProviderFilter') || null;
    providerTabsContainer.innerHTML = '';
    providerTabsContainer.appendChild(
      h('button', {
        className: `tab ${!currentProvider ? 'active' : ''}`,
        onClick: () => set('modelProviderFilter', null),
      }, ['🏢 Все провайдеры'])
    );
    for (const p of providers) {
      providerTabsContainer.appendChild(
        h('button', {
          className: `tab ${currentProvider === p ? 'active' : ''}`,
          onClick: () => set('modelProviderFilter', p),
        }, [p])
      );
    }
  }

  const searchWrap = h('div', { className: 'flex gap-2', style: { flexWrap: 'wrap', marginBottom: '1rem' } }, [
    h('input', {
      className: 'form-input',
      style: { maxWidth: '300px' },
      placeholder: '🔍 Поиск по имени, алиасу, провайдеру...',
      value: get('modelSearch') || '',
      onInput: debounce(e => set('modelSearch', e.target.value), 200),
    }),
    ...filterBtns,
    h('button', {
      className: 'btn btn-sm btn-ghost',
      style: { marginLeft: 'auto' },
      onClick: () => {
        localStorage.removeItem('openrouter_models_v3');
        loadModelsData();
        toastOk('Кэш обновляется...');
      },
    }, ['🔄 Обновить кэш']),
    h('button', {
      className: 'btn btn-sm btn-warning',
      onClick: async () => {
        // Show loading state
        const btn = event.target;
        btn.disabled = true;
        btn.textContent = '⏳ Проверка...';
        
        try {
          // Get management key from localStorage
          const mgmtKey = localStorage.getItem('cli-proxy-management-key') || '';
          
          // First, check stale models
          const staleRes = await fetch('/v0/management/models/stale', {
            headers: mgmtKey ? { 'Authorization': mgmtKey } : {}
          });
          
          if (!staleRes.ok) {
            throw new Error('Не удалось получить список моделей');
          }
          
          const staleData = await staleRes.json();
          
          if (staleData.totalStale === 0) {
            toastOk('Все модели актуальны, устаревших нет!');
            btn.disabled = false;
            btn.textContent = '🧹 Очистить модели';
            return;
          }
          
          // Build the stale models list for display
          let staleListHtml = '<div style="max-height: 300px; overflow-y: auto;">';
          for (const provider of staleData.providers) {
            if (provider.stale && provider.stale.length > 0) {
              staleListHtml += `<div style="margin-bottom: 12px;">`;
              staleListHtml += `<strong>${provider.name}</strong> (${provider.stale.length} устаревших):<br/>`;
              staleListHtml += `<span style="color: var(--status-error); font-size: 0.85em;">${provider.stale.join(', ')}</span>`;
              staleListHtml += `</div>`;
            }
          }
          staleListHtml += '</div>';
          
          // Show confirmation modal
          showModal({
            title: '🧹 Очистка устаревших моделей',
            content: h('div', {}, [
              h('p', {}, `Найдено ${staleData.totalStale} устаревших моделей, которых нет в upstream:`),
              h('div', { innerHTML: staleListHtml }),
              h('p', { style: { marginTop: '1rem', fontWeight: 'bold' } }, 'Удалить эти модели из конфига?'),
            ]),
            buttons: [
              {
                label: '❌ Отмена',
                className: 'btn btn-ghost',
                onClick: () => {
                  closeModal();
                  btn.disabled = false;
                  btn.textContent = '🧹 Очистить модели';
                }
              },
              {
                label: '🗑️ Удалить',
                className: 'btn btn-danger',
                onClick: async () => {
                  closeModal();
                  btn.textContent = '⏳ Удаление...';
                  
                  try {
                    const cleanupRes = await fetch('/v0/management/models/cleanup', {
                      method: 'POST',
                      headers: mgmtKey ? { 'Authorization': mgmtKey } : {}
                    });
                    
                    if (!cleanupRes.ok) {
                      throw new Error('Не удалось удалить модели');
                    }
                    
                    const cleanupData = await cleanupRes.json();
                    
                    toastOk(`Удалено ${cleanupData.total} моделей: ${cleanupData.removed.join(', ')}`);
                    
                    // Reload models after cleanup
                    loadModelsData();
                    
                  } catch (err) {
                    toastError('Ошибка: ' + err.message);
                  }
                  
                  btn.disabled = false;
                  btn.textContent = '🧹 Очистить модели';
                }
              }
            ]
          });
          
        } catch (err) {
          toastError('Ошибка: ' + err.message);
          btn.disabled = false;
          btn.textContent = '🧹 Очистить модели';
        }
      },
    }, ['🧹 Очистить модели']),
  ]);

  const grid = h('div', { className: 'models-grid', id: 'models-grid' });
  const statsEl = h('div', { className: 'flex gap-4', style: { marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' } });

  container.appendChild(statsEl);
  container.appendChild(providerTabsContainer);
  container.appendChild(searchWrap);
  container.appendChild(grid);

  loadModelsData(statsEl);

  // Update provider tabs when models are loaded
  updateProviderTabs();

  // Save render function for use in toggle
  setRenderFn((statsElRef) => renderModelGrid(grid, statsElRef), statsEl);

  const unsub1 = watch('modelSearch', () => renderModelGrid(grid, statsEl));
  const unsub2 = watch('modelFilter', (val) => {
    // Update filter button active states
    for (const btn of filterBtns) {
      btn.classList.toggle('btn-primary', btn.dataset.filterKey === val);
      btn.classList.toggle('btn-ghost', btn.dataset.filterKey !== val);
    }
    renderModelGrid(grid, statsEl);
  });
  const unsub3 = watch('enrichedModels', () => {
    renderModelGrid(grid, statsEl);
    updateProviderTabs();
  });
  const unsub4 = watch('modelToggleTimestamp', () => renderModelGrid(grid, statsEl));
  const unsub5 = watch('modelProviderFilter', () => renderModelGrid(grid, statsEl));

  return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
}

async function loadModelsData(statsEl) {
  // Show loading state immediately
  if (statsEl) {
    statsEl.innerHTML = '<span>⏳ Загрузка данных...</span>';
  }

  // Timeout for all provider checks (15s per provider + buffer)
  let allData;
  try {
    allData = await Promise.race([
      Promise.all([
        fetchConfig().catch(() => null),
        fetchLiveModels().catch(() => []),
        fetchUsage().catch(() => null),
        fetchProvidersCheck().catch(() => ({ providers: [], allModels: [] })),
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут загрузки данных (30с)')), 30000)),
    ]);
  } catch (timeoutErr) {
    console.error('Timeout loading models data:', timeoutErr);
    if (statsEl) {
      statsEl.innerHTML = '<span style="color: var(--status-error);">⚠️ Таймаут загрузки</span>';
    }
    toastError('Таймаут загрузки моделей. Попробуйте ещё раз.');
    return;
  }
  
  try {
    const [config, liveModels, usage, providersData] = allData;

    set('config', config);
    set('usage', usage);

    // Get all models from providers
    const allProviderModels = new Set();
    for (const provider of providersData.providers || []) {
      if (provider.models) {
        for (const modelId of provider.models) {
          allProviderModels.add(modelId);
        }
      }
    }

    // Enrich and merge models
    let enriched = [];
    if (config || liveModels.length) {
      enriched = await enrichModels(liveModels, config, usage);
    }

    // Add provider models that are not already in the list
    const existingIds = new Set(enriched.map(m => m.id));
    for (const modelId of allProviderModels) {
      if (!existingIds.has(modelId)) {
        // Find which provider has this model
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
    }

    set('enrichedModels', enriched);

    // Update stats
    if (statsEl) {
      const enabledModels = loadEnabledModels();
      const disabledCount = Object.keys(enabledModels).length;
      const totalCount = enriched.length;
      const availableCount = enriched.filter(m => m.status === 'available').length;
      statsEl.innerHTML = `
        <span>📊 Всего моделей: ${totalCount}</span>
        <span>🟢 Доступно: ${availableCount}</span>
        <span>🔴 Отключено: ${disabledCount}</span>
      `;
    }
  } catch (e) {
    console.error('Failed to load models:', e);
    toastError(`Ошибка загрузки моделей: ${e.message}`);
  }
}

function renderModelGrid(container, statsEl) {
  const models = get('enrichedModels');
  if (!Array.isArray(models)) {
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-state-title">Загрузка моделей...</div></div>';
    return;
  }

  // Filter out disabled models
  const enabledModels = loadEnabledModels();
  
  const filter = get('modelFilter') || 'all';
  const providerFilter = get('modelProviderFilter') || null;
  const search = (get('modelSearch') || '').toLowerCase();

  let filtered = models.filter(m => {
    // Handle provider filter first
    if (providerFilter && m.provider !== providerFilter) return false;
    
    // Handle disabled filter separately
    const isDisabled = !!enabledModels[m.id];
    if (filter === 'disabled') {
      if (!isDisabled) return false;
      if (search) {
        const haystack = [m.id, m.realId, m.alias, m.provider, m.description].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      }
      return true;
    }
    // Skip disabled models for other filters
    if (isDisabled) return false;
    if (filter === 'available' && m.status !== 'available') return false;
    if (filter === 'unavailable' && m.status === 'available') return false;
    if (filter === 'vision' && !m.hasVision) return false;
    if (filter === 'reasoning' && !m.hasReasoning) return false;
    if (search) {
      const haystack = [m.id, m.realId, m.alias, m.provider, m.description].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    }
    return true;
  });

  // Update stats
  if (statsEl) {
    const disabledCount = Object.keys(enabledModels).length;
    const totalCount = models.length;
    statsEl.innerHTML = `
      <span>📊 Всего моделей: ${totalCount}</span>
      <span>🟢 Доступно: ${filtered.length}</span>
      <span>🔴 Отключено: ${disabledCount}</span>
    `;
  }

  container.innerHTML = '';

  if (!filtered.length) {
    container.appendChild(h('div', { className: 'empty-state' }, [
      h('div', { className: 'empty-state-icon' }, ['🔍']),
      h('div', { className: 'empty-state-title' }, ['Модели не найдены']),
      h('div', { className: 'empty-state-desc' }, ['Измените фильтры или поисковый запрос']),
    ]));
    return;
  }

  // Group by provider
  const groups = new Map();
  for (const m of filtered) {
    const prov = m.provider || 'unknown';
    if (!groups.has(prov)) groups.set(prov, []);
    groups.get(prov).push(m);
  }

  // Sort providers: openai first, then alphabetically
  const sortedProviders = [...groups.keys()].sort((a, b) => {
    if (a === 'openai') return -1;
    if (b === 'openai') return 1;
    return a.localeCompare(b);
  });

  for (const prov of sortedProviders) {
    const provModels = groups.get(prov);
    const availCount = provModels.filter(m => m.status === 'available').length;
    const groupEl = h('div', { className: 'models-group' }, [
      h('div', { className: 'models-group-header' }, [
        `${prov} `,
        h('span', { style: { color: 'var(--text-muted)', fontWeight: 400 } }, [`(${availCount}/${provModels.length} доступно)`]),
      ]),
      h('div', { className: 'models-group-grid' }, provModels.map(m => renderModelCard(m, enabledModels))),
    ]);
    container.appendChild(groupEl);
  }
}

function renderModelCard(model, enabledModels) {
  const tags = [];
  if (model.hasVision) tags.push('🖼️ Vision');
  if (model.hasAudio) tags.push('🔊 Audio');
  if (model.hasVideo) tags.push('🎬 Video');
  if (model.hasReasoning) tags.push('🧠 Reasoning');
  if (model.hasTools) tags.push('🔧 Tools');

  const isEnabled = !enabledModels[model.id];
  const statusBadge = model.status === 'available'
    ? h('span', { className: 'badge badge-ok' }, ['🟢 Доступна'])
    : h('span', { className: 'badge badge-warn' }, ['⚪ Недоступна']);

  const ctxStr = model.contextLength
    ? model.contextLength >= 1000000
      ? `${(model.contextLength / 1000000).toFixed(1)}M`
      : model.contextLength >= 1000
        ? `${Math.round(model.contextLength / 1000)}K`
        : String(model.contextLength)
    : '?';

  const maxOutStr = model.maxCompletionTokens
    ? model.maxCompletionTokens >= 1000
      ? `${Math.round(model.maxCompletionTokens / 1000)}K`
      : String(model.maxCompletionTokens)
    : '?';

  const priceStr = model.pricing
    ? `$${(model.pricing.input / 1_000_000).toFixed(2)}/$${(model.pricing.output / 1_000_000).toFixed(2)}`
    : '—';

  const sourceTag = model.dataSource === 'openrouter'
    ? h('span', { className: 'tag tag-info' }, ['✓ Проверено'])
    : h('span', { className: 'tag tag-muted' }, ['≈ Оценка']);

  // Build name line: show alias arrow if this is an alias
  const nameLine = model.isAlias && model.realId
    ? h('div', { className: 'model-card-name' }, [
        model.id,
        h('span', { className: 'model-card-alias' }, [` → ${model.realId}`]),
      ])
    : h('div', { className: 'model-card-name' }, [model.id]);

  // Build subtitle line
  const subtitleParts = [];
  if (model.alias) subtitleParts.push(`алиас: ${model.alias}`);
  if (model.payloadOverride) subtitleParts.push('⚙️ Переопределения');
  const subtitle = subtitleParts.join(' • ');

  const card = h('div', { className: 'model-card' }, [
    h('div', { className: 'model-card-header' }, [
      h('div', {}, [
        nameLine,
        subtitle ? h('div', { className: 'model-card-provider' }, [subtitle]) : null,
      ]),
      statusBadge,
    ]),

    model.description
      ? h('div', { className: 'model-card-desc' }, [model.description])
      : null,

    h('div', { className: 'model-card-meta' }, [
      h('span', {}, ['📏 ', ctxStr]),
      h('span', {}, ['🎯 ', maxOutStr]),
      h('span', {}, ['💰 ', priceStr]),
      sourceTag,
    ]),

    tags.length
      ? h('div', { className: 'model-card-tags' }, tags.map(t => h('span', { className: 'tag' }, [t])))
      : null,

    h('div', { className: 'model-card-actions' }, [
      h('button', { className: 'btn btn-sm btn-ghost', onClick: () => showModelDetail(model) }, ['📋 Подробнее']),
      h('button', { 
        className: 'btn btn-sm btn-ghost', 
        style: { marginLeft: '0.5rem' },
        onClick: () => showModelEditModal(model, () => {
          // Callback to refresh the grid after edit
          if (_renderModelGridFn && _statsElRef) {
            _renderModelGridFn(_statsElRef);
          }
        })
      }, ['✏️ Редактировать']),
      h('button', {
        className: `btn btn-sm ${isEnabled ? 'btn-primary' : 'btn-ghost'}`,
        style: { marginLeft: '0.5rem' },
        onClick: () => {
          toggleModel(model.id, !isEnabled);
        },
      }, [isEnabled ? '🔴 Выключить' : '🟢 Включить']),
    ]),
  ]);

  return card;
}

/* ── Model Detail Modal ── */
function showModelDetail(model) {
  const pricingRows = model.pricing ? [
    { label: 'Входящие', value: `$${model.pricing.input.toFixed(2)} / 1M токенов` },
    { label: 'Исходящие', value: `$${model.pricing.output.toFixed(2)} / 1M токенов` },
    { label: 'Кэш', value: `$${model.pricing.cached.toFixed(2)} / 1M токенов` },
  ] : [{ label: 'Стоимость', value: 'Нет данных' }];

  const statsRows = model.stats ? [
    { label: 'Средняя задержка', value: fmtDuration(model.stats.avgLatency) },
    { label: 'Среднее токенов/запрос', value: fmtNumber(model.stats.avgTokens) },
    { label: 'Всего запросов', value: fmtNumber(model.stats.totalRequests) },
    { label: 'Доля ошибок', value: `${model.stats.errorRate}%` },
  ] : [{ label: 'Статистика', value: 'Пока нет данных' }];

  const payloadRows = model.payloadOverride
    ? Object.entries(model.payloadOverride).map(([k, v]) => ({
        label: k,
        value: typeof v === 'object' ? JSON.stringify(v) : String(v),
      }))
    : [{ label: 'Переопределения', value: 'Нет (используются параметры по умолчанию)' }];

  const capRows = [];
  if (model.isAlias && model.realId) {
    capRows.push({ label: 'Алиас →', value: model.realId });
  }
  capRows.push(
    { label: 'Контекст', value: model.contextLength ? fmtNumber(model.contextLength) : '?' },
    { label: 'Макс. вывод', value: model.maxCompletionTokens ? fmtNumber(model.maxCompletionTokens) : '?' },
    { label: 'Провайдер', value: model.provider },
    { label: 'Визуальный ввод', value: model.hasVision ? '✅' : '❌' },
    { label: 'Аудио ввод', value: model.hasAudio ? '✅' : '❌' },
    { label: 'Рассуждения', value: model.hasReasoning ? '✅' : '❌' },
    { label: 'Инструменты', value: model.hasTools ? '✅' : '❌' },
    { label: 'Модальность', value: model.architecture || '?' },
  );

  if (model.knowledgeCutoff) {
    capRows.push({ label: 'Данные до', value: model.knowledgeCutoff });
  }

  const dataSourceLabel = model.dataSource === 'openrouter'
    ? '✅ OpenRouter API (точные данные)'
    : '⚠️ Эвристика (оценочные данные)';

  showModal({
    title: `🧩 ${model.id}`,
    size: 'lg',
    children: [
      h('div', { className: 'flex flex-col gap-4' }, [
        model.description ? h('p', { style: { color: 'var(--text-secondary)' } }, [model.description]) : null,

        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' } }, [
          h('span', {}, ['Источник данных: ', dataSourceLabel]),
        ]),

        h('div', { className: 'flex gap-4', style: { flexWrap: 'wrap' } }, [
          h('div', { style: { flex: 1, minWidth: '250px' } }, [
            h('h4', { style: { fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' } }, ['📊 Характеристики']),
            DataTable({ columns: [{ key: 'label', label: '' }, { key: 'value', label: '' }], rows: capRows }),
          ]),
          h('div', { style: { flex: 1, minWidth: '250px' } }, [
            h('h4', { style: { fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' } }, ['💰 Стоимость']),
            DataTable({ columns: [{ key: 'label', label: '' }, { key: 'value', label: '' }], rows: pricingRows }),
          ]),
        ]),

        h('h4', { style: { fontSize: '0.875rem', fontWeight: 600, marginTop: '0.5rem', color: 'var(--text-secondary)' } }, ['⚙️ Параметры (Payload Override)']),
        DataTable({ columns: [{ key: 'label', label: 'Параметр' }, { key: 'value', label: 'Значение' }], rows: payloadRows }),

        model.stats ? h('div', {}, [
          h('h4', { style: { fontSize: '0.875rem', fontWeight: 600, marginTop: '0.5rem', color: 'var(--text-secondary)' } }, ['📈 Производительность (24ч)']),
          DataTable({ columns: [{ key: 'label', label: '' }, { key: 'value', label: '' }], rows: statsRows }),
        ]) : null,

        model.supportedParameters?.length ? h('div', {}, [
          h('h4', { style: { fontSize: '0.875rem', fontWeight: 600, marginTop: '0.5rem', color: 'var(--text-secondary)' } }, ['🔧 Поддерживаемые параметры']),
          h('div', { className: 'flex gap-1', style: { flexWrap: 'wrap' } },
            model.supportedParameters.map(p => h('span', { className: 'tag' }, [p]))
          ),
        ]) : null,
      ]),
    ],
    footer: [
      h('button', { className: 'btn btn-ghost', onClick: closeModal }, ['Закрыть']),
    ],
  });
}

/* ── Model Edit Modal ── */
const MODEL_PARAMS_KEY = 'cli-proxy-model-params';

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

function showModelEditModal(model, onSave) {
  const params = loadModelParams();
  const modelParams = params[model.id] || {};
  
  const aliasInput = h('input', {
    className: 'form-input',
    type: 'text',
    value: modelParams.alias || model.alias || '',
    placeholder: 'Например: gpt-4-turbo',
  });
  
  // Payload override textarea - show as JSON
  const payloadTextarea = h('textarea', {
    className: 'form-input',
    style: { minHeight: '120px', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' },
    placeholder: '{\n  "max_tokens": 4096,\n  "temperature": 0.7\n}',
  });
  
  // Set current value
  if (modelParams.payloadOverride) {
    payloadTextarea.value = JSON.stringify(modelParams.payloadOverride, null, 2);
  } else if (model.payloadOverride) {
    payloadTextarea.value = JSON.stringify(model.payloadOverride, null, 2);
  }
  
  // Current values display
  const currentAlias = modelParams.alias || model.alias;
  const currentPayload = modelParams.payloadOverride || model.payloadOverride;
  
  showModal({
    title: `✏️ Редактировать: ${model.id}`,
    children: [h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1rem' } }, [
      h('div', {}, [
        h('label', { style: { display: 'block', marginBottom: '0.5rem', fontWeight: 500 } }, ['Алиас (alias)']), 
        aliasInput,
        h('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' } }, ['Имя модели, которое будет использоваться в API запросах']),
      ]),
      
      h('div', {}, [
        h('label', { style: { display: 'block', marginBottom: '0.5rem', fontWeight: 500 } }, ['Переопределения payload (JSON)']), 
        payloadTextarea,
        h('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' } }, ['Дополнительные параметры, которые будут добавлены к каждому запросу. Например: max_tokens, temperature, top_p']),
      ]),
      
      // Show current values
      currentAlias || currentPayload ? h('div', { style: { padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' } }, [
        h('div', { style: { fontWeight: 500, marginBottom: '0.5rem' } }, ['Текущие сохранённые значения:']),
        currentAlias ? h('div', {}, [`📝 Алиас: ${currentAlias}`]) : null,
        currentPayload ? h('div', {}, [`⚙️ Payload: ${JSON.stringify(currentPayload).substring(0, 100)}...`]) : null,
      ]) : null,
    ])],
    footer: [
      h('button', { 
        className: 'btn btn-error', 
        onClick: () => {
          // Clear saved params for this model
          const allParams = loadModelParams();
          delete allParams[model.id];
          saveModelParams(allParams);
          closeModal();
          if (onSave) onSave();
          toastOk('Параметры сброшены');
        }
      }, ['🗑️ Сбросить']), 
      h('button', { className: 'btn btn-ghost', onClick: closeModal }, ['Отмена']),
      h('button', { 
        className: 'btn btn-primary', 
        onClick: () => {
          const newAlias = aliasInput.value.trim();
          let newPayload = null;
          
          // Parse JSON payload
          const payloadValue = payloadTextarea.value.trim();
          if (payloadValue) {
            try {
              newPayload = JSON.parse(payloadValue);
            } catch (e) {
              toastError('Ошибка в JSON: ' + e.message);
              return;
            }
          }
          
          // Save to localStorage
          const allParams = loadModelParams();
          allParams[model.id] = {
            alias: newAlias || null,
            payloadOverride: newPayload,
          };
          saveModelParams(allParams);
          
          closeModal();
          if (onSave) onSave();
          toastOk('Сохранено для ' + model.id);
        }
      }, ['💾 Сохранить']),
    ],
  });
}
