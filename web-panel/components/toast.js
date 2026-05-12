/**
 * @fileoverview Toast notification system with queue, types, and undo.
 */

import { h } from '../core/utils.js';

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 5000;

/** @type {Array<{id: string, el: HTMLElement, timer: number}>} */
const queue = [];

/**
 * Show a toast notification.
 * @param {object} opts
 * @param {string} opts.message
 * @param {string} [opts.title]
 * @param {'ok'|'warn'|'error'|'info'} [opts.type='info']
 * @param {number} [opts.duration=5000]
 * @param {{label: string, fn: Function}} [opts.undo]
 */
export function showToast({ message, title, type = 'info', duration = DEFAULT_DURATION, undo }) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Remove oldest if queue is full
  while (queue.length >= MAX_TOASTS) {
    removeToast(queue[0].id);
  }

  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const icons = {
    ok: '✅',
    warn: '⚠️',
    error: '❌',
    info: 'ℹ️',
  };

  const el = h('div', { className: 'toast', id }, [
    h('span', { className: 'toast-icon' }, [icons[type] || icons.info]),
    h('div', { className: 'toast-content' }, [
      title ? h('div', { className: 'toast-title' }, [title]) : null,
      h('div', { className: 'toast-message' }, [message]),
    ]),
    undo
      ? h('div', { className: 'toast-actions' }, [
          h('button', {
            className: 'btn btn-sm btn-ghost',
            onClick: () => {
              try { undo.fn(); } catch (e) { console.error(e); }
              removeToast(id);
            },
          }, [undo.label || 'Undo']),
        ])
      : null,
    h('button', {
      className: 'btn btn-sm btn-ghost',
      style: { padding: '4px', minWidth: 'auto' },
      onClick: () => removeToast(id),
    }, ['✕']),
  ]);

  container.appendChild(el);

  const timer = setTimeout(() => removeToast(id), duration);
  queue.push({ id, el, timer });
}

/**
 * Remove a toast by ID.
 * @param {string} id
 */
export function removeToast(id) {
  const idx = queue.findIndex(t => t.id === id);
  if (idx < 0) return;

  const { el, timer } = queue[idx];
  clearTimeout(timer);
  el.classList.add('removing');

  setTimeout(() => {
    el.remove();
    queue.splice(idx, 1);
  }, 300);
}

/**
 * Convenience: show success toast.
 */
export function toastOk(message, opts = {}) {
  showToast({ message, type: 'ok', ...opts });
}

/**
 * Convenience: show error toast.
 */
export function toastError(message, opts = {}) {
  showToast({ message, type: 'error', ...opts });
}

/**
 * Convenience: show undo toast.
 */
export function toastUndo(message, undoFn, opts = {}) {
  showToast({ message, type: 'ok', undo: { label: 'Undo', fn: undoFn }, ...opts });
}
