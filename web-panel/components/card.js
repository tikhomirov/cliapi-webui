/**
 * @fileoverview Reusable card components.
 */

import { h } from '../core/utils.js';

/**
 * Create a stat card.
 * @param {object} opts
 * @param {string} opts.label
 * @param {string|number} opts.value
 * @param {string} [opts.delta]
 * @param {boolean} [opts.deltaUp]
 * @param {string} [opts.icon]
 * @returns {HTMLElement}
 */
export function StatCard({ label, value, delta, deltaUp, icon }) {
  return h('div', { className: 'stat-card' }, [
    h('div', { className: 'flex items-center justify-between' }, [
      h('span', { className: 'stat-label' }, [label]),
      icon ? h('span', { style: { fontSize: '1.25rem', opacity: '0.5' } }, [icon]) : null,
    ]),
    h('div', { className: 'stat-value' }, [String(value)]),
    delta ? h('div', { className: `stat-delta ${deltaUp ? 'up' : 'down'}` }, [
      deltaUp ? '↑' : '↓',
      ' ',
      delta,
    ]) : null,
  ]);
}

/**
 * Create a generic card container.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.subtitle]
 * @param {HTMLElement[]} [opts.actions]
 * @param {(string|Node)[]} [opts.children]
 * @returns {HTMLElement}
 */
export function Card({ title, subtitle, actions, children = [] }) {
  const header = title || subtitle || actions
    ? h('div', { className: 'card-header' }, [
        h('div', {}, [
          title ? h('div', { className: 'card-title' }, [title]) : null,
          subtitle ? h('div', { className: 'card-subtitle' }, [subtitle]) : null,
        ]),
        actions?.length ? h('div', { className: 'flex gap-2' }, actions) : null,
      ])
    : null;

  return h('div', { className: 'card' }, [
    header,
    ...children,
  ]);
}

/**
 * Create a model card.
 * @param {object} model
 * @param {object} opts
 * @param {Function} [opts.onBenchmark]
 * @param {Function} [opts.onConfigure]
 * @param {Function} [opts.onDetail]
 * @param {boolean} [opts.selected]
 * @param {Function} [opts.onToggleSelect]
 * @returns {HTMLElement}
 */
export function ModelCard(model, { onBenchmark, onConfigure, onDetail, selected, onToggleSelect } = {}) {
  const tags = [];
  if (model.hasVision) tags.push('🖼️ Vision');
  if (model.hasAudio) tags.push('🔊 Audio');
  if (model.hasVideo) tags.push('🎬 Video');
  if (model.hasReasoning) tags.push('🧠 Reasoning');
  if (model.hasTools) tags.push('🔧 Tools');

  const statusBadge = model.status === 'available'
    ? h('span', { className: 'badge badge-ok' }, ['🟢 OK'])
    : h('span', { className: 'badge badge-error' }, ['🔴 Unavailable']);

  const contextStr = model.contextLength
    ? model.contextLength >= 1000000
      ? `${(model.contextLength / 1000000).toFixed(1)}M`
      : model.contextLength >= 1000
        ? `${Math.round(model.contextLength / 1000)}K`
        : String(model.contextLength)
    : '?';

  const pricingStr = model.pricing
    ? `$${(model.pricing.input / 1_000_000).toFixed(2)}/$${(model.pricing.output / 1_000_000).toFixed(2)}`
    : 'N/A';

  return h('div', { className: 'model-card' }, [
    h('div', { className: 'model-card-header' }, [
      h('div', {}, [
        h('div', { className: 'model-card-name' }, [
          onToggleSelect
            ? h('input', {
                type: 'checkbox',
                checked: selected,
                style: { marginRight: '8px', cursor: 'pointer' },
                onChange: () => onToggleSelect(model.id),
              })
            : null,
          '🧩 ',
          model.id,
        ]),
        h('div', { className: 'model-card-provider' }, [
          model.provider,
          model.alias && model.alias !== model.id ? ` • alias: ${model.alias}` : '',
        ]),
      ]),
      statusBadge,
    ]),

    model.description
      ? h('div', { className: 'model-card-desc' }, [model.description])
      : null,

    h('div', { className: 'model-card-meta' }, [
      h('span', {}, ['📏 Context: ', contextStr]),
      model.maxCompletionTokens
        ? h('span', {}, ['🎯 Max out: ', String(model.maxCompletionTokens >= 1000 ? `${Math.round(model.maxCompletionTokens / 1000)}K` : model.maxCompletionTokens)])
        : null,
      h('span', {}, ['💰 ', pricingStr]),
    ]),

    tags.length
      ? h('div', { className: 'model-card-tags' }, tags.map(t => h('span', { className: 'tag' }, [t])))
      : null,

    h('div', { className: 'model-card-actions' }, [
      onBenchmark ? h('button', { className: 'btn btn-sm btn-ghost', onClick: () => onBenchmark(model) }, ['📊 Бенhмарк']) : null,
      onConfigure ? h('button', { className: 'btn btn-sm btn-ghost', onClick: () => onConfigure(model) }, ['⚙️ Configure']) : null,
      onDetail ? h('button', { className: 'btn btn-sm btn-ghost', onClick: () => onDetail(model) }, ['📋 Details']) : null,
    ]),
  ]);
}
