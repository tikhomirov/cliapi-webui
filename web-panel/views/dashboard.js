/**
 * @fileoverview Dashboard view — overview, stats, quick actions.
 */

import { get, watch, set } from '../core/state.js';
import { fetchHealth, fetchUsage, fetchConfig, clearCache } from '../core/api.js';
import { StatCard, Card } from '../components/card.js';
import { DataTable } from '../components/table.js';
import { toastOk, toastError } from '../components/toast.js';
import { h, fmtNumber, fmtDuration, fmtDate } from '../core/utils.js';

export function renderDashboard(container) {
  container.appendChild(h('div', { className: 'flex flex-col gap-4' }, [
    h('div', { className: 'card-grid', id: 'dashboard-stats' }),
    h('div', { className: 'flex gap-4', style: { flexWrap: 'wrap' } }, [
      h('div', { style: { flex: '2', minWidth: '400px' } }, [
        Card({
          title: 'Provider Health',
          subtitle: 'Configured OpenAI-compatible providers',
          children: [h('div', { id: 'dashboard-providers' })],
        }),
      ]),
      h('div', { style: { flex: '1', minWidth: '300px' } }, [
        Card({
          title: 'Recent Activity',
          subtitle: 'Top models by usage',
          children: [h('div', { id: 'dashboard-recent' })],
        }),
      ]),
    ]),
    Card({
      title: 'Quick Actions',
      children: [
        h('div', { className: 'flex gap-2', style: { flexWrap: 'wrap' } }, [
          h('button', { className: 'btn btn-ghost', onClick: () => refreshAll() }, ['🔄 Refresh Data']),
          h('button', { className: 'btn btn-ghost', onClick: () => window.location.hash = '#providers' }, ['🔌 Manage Providers']),
          h('button', { className: 'btn btn-ghost', onClick: () => window.location.hash = '#models' }, ['🧩 Browse Models']),
          h('button', { className: 'btn btn-ghost', onClick: () => window.location.hash = '#config' }, ['📝 Edit Config']),
        ]),
      ],
    }),
  ]));

  loadDashboardData();

  const unsub = watch('config', () => updateDashboard());
  const unsub2 = watch('usage', () => updateDashboard());

  return () => { unsub(); unsub2(); };
}

async function loadDashboardData() {
  set('isLoading', true);
  try {
    const [config, usage] = await Promise.all([
      fetchConfig().catch(() => null),
      fetchUsage().catch(() => null),
    ]);
    set('config', config);
    set('usage', usage);
    updateDashboard();
  } catch (e) {
    toastError(`Failed to load dashboard: ${e.message}`);
  } finally {
    set('isLoading', false);
  }
}

function refreshAll() {
  clearCache();
  loadDashboardData();
  toastOk('Data refreshed');
}

function updateDashboard() {
  renderStats();
  renderProviderHealth();
  renderRecentActivity();
}

function renderStats() {
  const config = get('config');
  const usage = get('usage');

  const providers = config?.['openai-compatibility']?.length || 0;
  const models = config?.['openai-compatibility']?.reduce((sum, p) => sum + (p.models?.length || 0), 0) || 0;

  let totalRequests = 0;
  let totalTokens = 0;
  if (usage?.usage) {
    totalRequests = usage.usage.total_requests || 0;
    totalTokens = usage.usage.total_tokens || 0;
  }

  const statsGrid = document.getElementById('dashboard-stats');
  if (!statsGrid) return;
  statsGrid.innerHTML = '';

  const stats = [
    { label: 'Providers', value: providers, icon: '🔌' },
    { label: 'Models', value: models, icon: '🧩' },
    { label: 'Total Requests', value: fmtNumber(totalRequests), icon: '📊' },
    { label: 'Total Tokens', value: fmtNumber(totalTokens), icon: '📝' },
  ];

  stats.forEach(s => statsGrid.appendChild(StatCard(s)));
}

function renderProviderHealth() {
  const config = get('config');
  const container = document.getElementById('dashboard-providers');
  if (!container) return;

  const providers = config?.['openai-compatibility'] || [];
  if (!providers.length) {
    container.innerHTML = '<div class="text-muted text-center" style="padding: 2rem;">No providers configured</div>';
    return;
  }

  const rows = providers.map(p => ({
    name: p.name || p['base-url'] || 'unnamed',
    url: p['base-url'] || '-',
    models: p.models?.length || 0,
  }));

  const table = DataTable({
    columns: [
      { key: 'name', label: 'Provider' },
      { key: 'url', label: 'Base URL', render: v => h('span', { className: 'cell-mono' }, [v]) },
      { key: 'models', label: 'Models' },
    ],
    rows,
    onRowClick: () => { window.location.hash = '#providers'; },
  });

  container.innerHTML = '';
  container.appendChild(table);
}

function renderRecentActivity() {
  const usage = get('usage');
  const container = document.getElementById('dashboard-recent');
  if (!container) return;

  // Extract top models from usage data
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

  if (!modelStats.length) {
    container.innerHTML = '<div class="text-muted text-center" style="padding: 2rem;">No activity yet</div>';
    return;
  }

  modelStats.sort((a, b) => b.requests - a.requests);

  const table = DataTable({
    columns: [
      { key: 'model', label: 'Model' },
      { key: 'requests', label: 'Requests', render: v => fmtNumber(v) },
      { key: 'tokens', label: 'Tokens', render: v => fmtNumber(v) },
    ],
    rows: modelStats.slice(0, 10),
  });

  container.innerHTML = '';
  container.appendChild(table);
}
