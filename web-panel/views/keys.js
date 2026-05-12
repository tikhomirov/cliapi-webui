/**
 * @fileoverview Keys & Auth view — API keys and auth settings.
 */

import { get, set, watch } from '../core/state.js';
import { fetchAPIKeys, createAPIKey, deleteAPIKey } from '../core/api.js';
import { Card } from '../components/card.js';
import { DataTable } from '../components/table.js';
import { showModal, closeModal, confirmModal } from '../components/modal.js';
import { toastOk, toastError } from '../components/toast.js';
import { h, copyToClipboard } from '../core/utils.js';

export function renderKeys(container) {
  const keys = get('keys');
  if (!keys || !keys.length) {
    fetchAPIKeys().then(k => set('keys', k)).catch(e => toastError(e.message));
  }

  container.appendChild(h('div', { className: 'flex justify-between items-center mb-4' }, [
    h('span', { className: 'text-muted text-sm', id: 'keys-count' }, [keys?.length ? `${keys.length} keys configured` : 'Loading...']),
    h('button', { className: 'btn btn-primary btn-sm', onClick: () => openAddKeyModal() }, ['➕ Add Key']),
  ]));

  const content = h('div', { id: 'keys-content' });
  container.appendChild(content);

  function update() {
    renderKeysList(content);
  }

  const unsub = watch('keys', update);
  update();

  return () => unsub();
}

function renderKeysList(container) {
  const keys = get('keys') || [];
  const countEl = document.getElementById('keys-count');
  if (countEl) countEl.textContent = keys.length ? `${keys.length} keys configured` : 'No keys';
  container.innerHTML = '';

  if (!keys.length) {
    container.appendChild(emptyState('No API keys', 'Add keys to authenticate with the proxy'));
    return;
  }

  container.appendChild(DataTable({
    columns: [
      { key: 'key', label: 'Key', render: v => h('span', { className: 'font-mono text-sm' }, [maskKey(v)]) },
      { key: 'actions', label: '', render: (_, row) => h('div', { className: 'flex gap-2' }, [
        h('button', { className: 'btn btn-sm btn-ghost', onClick: () => copyToClipboard(row.key).then(() => toastOk('Copied')) }, ['📋']),
        h('button', { className: 'btn btn-sm btn-danger', onClick: () => removeKey(row.key) }, ['🗑️']),
      ]) },
    ],
    rows: keys.map(k => ({ key: k })),
  }));
}

async function removeKey(key) {
  const confirmed = await confirmModal({ title: 'Delete Key?', message: 'This action cannot be undone.', danger: true });
  if (!confirmed) return;

  try {
    await deleteAPIKey(key);
    set('keys', (get('keys') || []).filter(k => k !== key));
    toastOk('Key deleted');
  } catch (e) {
    toastError(e.message);
  }
}

function openAddKeyModal() {
  const input = h('input', { className: 'form-input', placeholder: 'sk-...' });
  showModal({
    title: '➕ Add API Key',
    children: [
      h('div', { className: 'form-group' }, [
        h('label', { className: 'form-label' }, ['Key']),
        input,
      ]),
    ],
    footer: [
      h('button', { className: 'btn btn-ghost', onClick: closeModal }, ['Cancel']),
      h('button', {
        className: 'btn btn-primary',
        onClick: async () => {
          const key = input.value.trim();
          if (!key) { toastError('Key is required'); return; }
          try {
            await createAPIKey(key);
            set('keys', [...(get('keys') || []), key]);
            toastOk('Key added');
            closeModal();
          } catch (e) {
            toastError(e.message);
          }
        },
      }, ['Add']),
    ],
  });
}

function maskKey(key) {
  if (!key || key.length <= 8) return '••••';
  return key.slice(0, 4) + '••••' + key.slice(-4);
}

function emptyState(title, desc) {
  return h('div', { className: 'empty-state' }, [
    h('div', { className: 'empty-state-icon' }, ['🔑']),
    h('div', { className: 'empty-state-title' }, [title]),
    desc ? h('div', { className: 'empty-state-desc' }, [desc]) : null,
  ]);
}
