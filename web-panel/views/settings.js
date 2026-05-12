/**
 * @fileoverview Settings view — individual management settings.
 */

import { get, set } from '../core/state.js';
import { fetchDebug, saveDebug, fetchLoggingToFile, saveLoggingToFile, fetchRequestRetry, saveRequestRetry } from '../core/api.js';
import { Card } from '../components/card.js';
import { toastOk, toastError } from '../components/toast.js';
import { h } from '../core/utils.js';

export function renderSettings(container) {
  container.appendChild(h('div', { className: 'flex flex-col gap-4', style: { maxWidth: '700px' } }, [
    renderToggleSetting('Debug Mode', 'setting-debug', fetchDebug, saveDebug, 'debug'),
    renderToggleSetting('Logging to File', 'setting-logging', fetchLoggingToFile, saveLoggingToFile, 'logging-to-file'),
    renderNumberSetting('Request Retry', 'setting-retry', fetchRequestRetry, saveRequestRetry, 'request-retry'),
  ]));
}

function renderToggleSetting(label, id, fetchFn, saveFn, responseKey) {
  const card = Card({
    title: label,
    children: [
      h('div', { className: 'flex items-center justify-between' }, [
        h('span', { className: 'text-muted' }, [label]),
        h('div', { className: 'toggle', id }, []),
      ]),
      h('div', { className: 'flex justify-end mt-4' }, [
        h('button', { className: 'btn btn-primary btn-sm', onClick: async () => {
          const el = document.getElementById(id);
          const value = el?.classList.contains('on') || false;
          try {
            await saveFn(value);
            toastOk(`${label} saved`);
          } catch (e) {
            toastError(`Failed to save ${label}: ${e.message}`);
          }
        } }, ['💾 Save']),
      ]),
    ],
  });

  // Load initial value
  fetchFn().then(value => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', value);
  }).catch(() => {});

  // Toggle click handler
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        el.classList.toggle('on');
      });
    }
  }, 0);

  return card;
}

function renderNumberSetting(label, id, fetchFn, saveFn, responseKey) {
  const input = h('input', { className: 'form-input', type: 'number', id });

  const card = Card({
    title: label,
    children: [
      h('div', { className: 'form-group' }, [
        h('label', { className: 'form-label' }, [label]),
        input,
      ]),
      h('div', { className: 'flex justify-end' }, [
        h('button', { className: 'btn btn-primary btn-sm', onClick: async () => {
          const value = parseInt(document.getElementById(id)?.value, 10) || 0;
          try {
            await saveFn(value);
            toastOk(`${label} saved`);
          } catch (e) {
            toastError(`Failed to save ${label}: ${e.message}`);
          }
        } }, ['💾 Save']),
      ]),
    ],
  });

  fetchFn().then(value => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }).catch(() => {});

  return card;
}
