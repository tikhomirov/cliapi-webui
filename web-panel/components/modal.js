/**
 * @fileoverview Modal component with overlay, animations, and keyboard support.
 */

import { h } from '../core/utils.js';

let currentCloseHandler = null;

/**
 * Show a modal.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {(HTMLElement|string)[]} [opts.children]
 * @param {HTMLElement[]} [opts.footer]
 * @param {Function} [opts.onClose]
 * @param {string} [opts.size] - 'sm' | 'md' | 'lg' | 'xl'
 */
export function showModal({ title, children = [], footer, onClose, size = 'md' }) {
  const overlay = document.getElementById('modal-overlay');
  const root = document.getElementById('modal-root');
  if (!overlay || !root) return;

  currentCloseHandler = onClose;

  const sizeStyles = {
    sm: { maxWidth: '400px' },
    md: { maxWidth: '560px' },
    lg: { maxWidth: '800px' },
    xl: { maxWidth: '1100px' },
  };

  root.innerHTML = '';
  root.style.cssText = '';
  if (sizeStyles[size]) {
    Object.assign(root.style, sizeStyles[size]);
  }

  const header = title
    ? h('div', { className: 'modal-header' }, [
        h('div', { className: 'modal-title' }, [title]),
        h('button', { className: 'modal-close', onClick: closeModal }, ['✕']),
      ])
    : null;

  const body = h('div', { className: 'modal-body' }, children);

  const foot = footer
    ? h('div', { className: 'modal-footer' }, footer)
    : null;

  if (header) root.appendChild(header);
  root.appendChild(body);
  if (foot) root.appendChild(foot);

  overlay.hidden = false;
  // Trigger animation
  requestAnimationFrame(() => overlay.classList.add('show'));

  // Focus trap
  const focusable = root.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
  if (focusable.length) focusable[0].focus();
}

/**
 * Close the current modal.
 */
export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const root = document.getElementById('modal-root');
  if (!overlay) return;

  overlay.classList.remove('show');
  setTimeout(() => {
    overlay.hidden = true;
    if (root) root.innerHTML = '';
    if (currentCloseHandler) {
      currentCloseHandler();
      currentCloseHandler = null;
    }
  }, 250);
}

/**
 * Show a confirmation dialog.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.confirmLabel='Confirm']
 * @param {string} [opts.cancelLabel='Cancel']
 * @param {boolean} [opts.danger=false]
 * @returns {Promise<boolean>}
 */
export function confirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    showModal({
      title,
      children: [h('p', { className: 'text-muted' }, [message])],
      footer: [
        h('button', { className: 'btn btn-ghost', onClick: () => { closeModal(); resolve(false); } }, [cancelLabel]),
        h('button', {
          className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
          onClick: () => { closeModal(); resolve(true); },
        }, [confirmLabel]),
      ],
      onClose: () => resolve(false),
    });
  });
}

// Global keyboard handler
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('modal-overlay');
    const searchModal = document.getElementById('search-modal');
    if (overlay && !overlay.hidden) {
      closeModal();
    } else if (searchModal && !searchModal.hidden) {
      searchModal.hidden = true;
    }
  }
});
