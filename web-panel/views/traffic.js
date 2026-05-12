/**
 * @fileoverview Traffic view — requests and logs.
 */

import { get, set, watch } from '../core/state.js';
import { fetchUsage, fetchLogs, fetchRequestLogs } from '../core/api.js';
import { Card } from '../components/card.js';
import { DataTable } from '../components/table.js';
import { toastError } from '../components/toast.js';
import { h, fmtDate, fmtRelative, fmtDuration, truncate } from '../core/utils.js';

const TABS = [
  { key: 'requests', label: 'Requests', icon: '📊' },
  { key: 'logs', label: 'Logs', icon: '📋' },
];

export function renderTraffic(container) {
  const tabs = h('div', { className: 'tabs' }, TABS.map(t =>
    h('button', {
      className: `tab ${get('trafficTab') === t.key ? 'active' : ''}`,
      onClick: () => set('trafficTab', t.key),
    }, [`${t.icon} ${t.label}`])
  ));

  const content = h('div', { id: 'traffic-content' });
  container.appendChild(tabs);
  container.appendChild(content);

  // Load data if not present
  if (!get('usage')) {
    fetchUsage().then(u => { console.log('Usage loaded:', u); set('usage', u); }).catch(e => console.error('Usage error:', e));
  }
  if (!get('requestLogs')) {
    fetchRequestLogs().then(r => { console.log('RequestLogs loaded:', r); set('requestLogs', r); }).catch(e => console.error('RequestLogs error:', e));
  }

  function update() {
    const tab = get('trafficTab');
    content.innerHTML = '';
    if (tab === 'requests') renderRequests(content);
    else renderLogs(content);
  }

  const unsub = watch('trafficTab', update);
  const unsub2 = watch('usage', update);
  const unsub3 = watch('requestLogs', update);
  const unsub4 = watch('logs', update);
  update();

  // Preload logs
  if (!get('logs')) {
    loadLogs();
  }

  return () => { unsub(); unsub2(); unsub3(); unsub4(); };
}

function renderRequests(container) {
  const usage = get('usage');
  const requestLogsData = get('requestLogs') || {};
  const requestLogs = requestLogsData.logs || [];
  console.log('renderRequests called, usage:', usage, 'requestLogs:', requestLogs.length);

  // Try to get requests from usage first, fallback to request-logs
  let allRequests = [];
  
  // Try usage first (has token data if available)
  if (usage?.usage?.apis && Object.keys(usage.usage.apis).length > 0) {
    for (const [apiKey, api] of Object.entries(usage.usage.apis)) {
      for (const [modelName, modelStats] of Object.entries(api.models || {})) {
        for (const d of modelStats.details || []) {
          allRequests.push({
            time: d.timestamp,
            model: modelName,
            latency: d.latency_ms,
            tokens: d.tokens?.total_tokens,
            status: d.failed ? 'error' : 'ok',
            source: d.source,
          });
        }
      }
    }
  }
  
  // If no usage data, use request-logs
  if (allRequests.length === 0 && requestLogs.length > 0) {
    allRequests = requestLogs.map(log => {
      // Estimate tokens from request size (rough approximation: ~4 chars per token)
      const estimatedTokens = Math.round((log.size || 0) / 4);
      return {
        time: log.timestamp,
        model: log.model || 'unknown',
        latency: '-',
        tokens: estimatedTokens > 0 ? `~${estimatedTokens}` : '-',
        status: 'ok',
        method: log.method,
        url: log.url,
        request_id: log.request_id,
      };
    });
  }

  // Sort by time descending
  allRequests.sort((a, b) => new Date(b.time) - new Date(a.time));

  if (!allRequests.length) {
    container.appendChild(emptyState('No requests yet', 'Make requests through the proxy to see them here'));
    fetchUsage().then(u => set('usage', u)).catch(() => {});
    fetchRequestLogs().then(r => set('requestLogs', r)).catch(() => {});
    return;
  }

  // Show date range info + refresh button
  const firstTime = allRequests[allRequests.length - 1]?.time;
  const lastTime = allRequests[0]?.time;
  const dateRangeInfo = h('div', { className: 'flex justify-between items-center text-sm text-muted mb-3' }, [
    h('div', { className: 'flex gap-4' }, [
      h('span', {}, ['📅 С: ' + fmtDate(firstTime)]),
      h('span', {}, ['По: ' + fmtDate(lastTime)]),
      h('span', {}, ['Всего: ' + allRequests.length]),
    ]),
    h('button', { className: 'btn btn-sm btn-ghost', onClick: () => { 
      fetchUsage().then(u => set('usage', u)).catch(() => {});
      fetchRequestLogs().then(r => set('requestLogs', r)).catch(() => {});
    } }, ['🔄 Обновить']),
  ]);
  container.appendChild(dateRangeInfo);

  container.appendChild(DataTable({
    columns: [
      { key: 'time', label: 'Time', render: v => h('span', { title: fmtDate(v) }, [fmtRelative(v)]) },
      { key: 'model', label: 'Model' },
      { key: 'latency', label: 'Latency', render: v => v && v !== '-' ? fmtDuration(v) : '-' },
      { key: 'tokens', label: 'Tokens', render: v => v != null ? v : '-' },
      { key: 'status', label: 'Status', render: v => v === 'ok'
        ? h('span', { className: 'badge badge-ok' }, ['OK'])
        : h('span', { className: 'badge badge-error' }, ['ERR'])
      },
    ],
    rows: allRequests.slice(0, 100),
  }));

  container.appendChild(h('div', { className: 'text-muted text-sm mt-2' }, [`Showing ${Math.min(allRequests.length, 100)} of ${allRequests.length} requests`]));
}

function renderLogs(container) {
  const logs = get('logs');
  if (!logs || !logs.length) {
    container.appendChild(emptyState('Loading logs...', 'Please wait while loading server logs'));
    return;
  }

  container.appendChild(DataTable({
    columns: [
      { key: 'timestamp', label: 'Time', render: v => fmtDate(v) },
      { key: 'level', label: 'Level', render: v => {
        const map = { error: 'badge-error', warn: 'badge-warn', info: 'badge-info', debug: 'badge-accent' };
        return h('span', { className: `badge ${map[v] || 'badge-info'}` }, [v?.toUpperCase() || 'INFO']);
      }},
      { key: 'message', label: 'Message', render: v => truncate(v, 120) },
    ],
    rows: logs,
  }));

  container.appendChild(h('div', { className: 'flex justify-between items-center mt-4' }, [
    h('span', { className: 'text-muted text-sm' }, [`${logs.length} entries`]),
    h('button', { className: 'btn btn-sm btn-ghost', onClick: loadLogs }, ['🔄 Refresh']),
  ]));
}

async function loadLogs() {
  try {
    const data = await fetchLogs();
    const lines = data?.lines || [];
    const parsed = lines.map(line => {
      // Parse log line: [2026-04-08 05:45:46] [--------] [info ] ...
      const match = line.match(/^\[([^\]]+)\]\s*\[[^\]]*\]\s*\[([^\]]+)\]\s*(.*)$/);
      if (match) {
        return { timestamp: match[1].replace(' ', 'T'), level: match[2].trim(), message: match[3] };
      }
      return { timestamp: '', level: 'info', message: line };
    }).filter(l => l.message);
    set('logs', parsed);
  } catch (e) {
    toastError(`Failed to load logs: ${e.message}`);
  }
}

function emptyState(title, desc) {
  return h('div', { className: 'empty-state' }, [
    h('div', { className: 'empty-state-icon' }, ['📭']),
    h('div', { className: 'empty-state-title' }, [title]),
    desc ? h('div', { className: 'empty-state-desc' }, [desc]) : null,
  ]);
}
