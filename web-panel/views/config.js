/**
 * @fileoverview Config view — form + raw YAML editor for full configuration.
 */

import { get, set, watch } from '../core/state.js';
import { fetchConfig, fetchConfigYAML, saveConfigYAML, saveConfig } from '../core/api.js';
import { Card } from '../components/card.js';
import { toastOk, toastError } from '../components/toast.js';
import { h, deepClone } from '../core/utils.js';

export function renderConfig(container) {
  const tabForm = h('button', { className: 'tab active', onClick: () => set('configEditorMode', 'form') }, ['📝 Form']);
  const tabYaml = h('button', { className: 'tab', onClick: () => set('configEditorMode', 'yaml') }, ['📄 Raw YAML']);
  const tabs = h('div', { className: 'tabs' }, [tabForm, tabYaml]);

  const content = h('div', { id: 'config-content' });
  container.appendChild(tabs);
  container.appendChild(content);

  if (!get('config')) {
    fetchConfig().then(c => {
      set('config', c);
      set('configJson', JSON.stringify(c, null, 2));
    }).catch(e => toastError(e.message));
  }

  function update() {
    const mode = get('configEditorMode');
    tabForm.classList.toggle('active', mode === 'form');
    tabYaml.classList.toggle('active', mode === 'yaml');
    content.innerHTML = '';
    if (mode === 'form') renderFormEditor(content);
    else renderYamlEditor(content);
  }

  const unsub = watch('configEditorMode', update);
  const unsub2 = watch('config', update);
  update();

  return () => { unsub(); unsub2(); };
}

function renderFormEditor(container) {
  const config = get('config');
  if (!config) {
    container.appendChild(loadingState());
    return;
  }

  container.appendChild(h('div', { className: 'flex flex-col gap-4' }, [
    Card({
      title: 'General',
      children: [
        h('div', { className: 'form-group' }, [
          h('label', { className: 'form-label' }, ['Proxy URL']),
          h('input', { className: 'form-input', id: 'cfg-proxy-url', value: config['proxy-url'] || '' }),
        ]),
        h('div', { className: 'form-row' }, [
          h('div', { className: 'form-group' }, [
            h('label', { className: 'form-label' }, ['Request Log']),
            h('select', { className: 'form-select', id: 'cfg-request-log' }, [
              h('option', { value: 'true', selected: config['request-log'] === true }, ['Enabled']),
              h('option', { value: 'false', selected: config['request-log'] === false }, ['Disabled']),
            ]),
          ]),
          h('div', { className: 'form-group' }, [
            h('label', { className: 'form-label' }, ['Logging to File']),
            h('select', { className: 'form-select', id: 'cfg-logging-file' }, [
              h('option', { value: 'true', selected: config['logging-to-file'] === true }, ['Enabled']),
              h('option', { value: 'false', selected: config['logging-to-file'] === false }, ['Disabled']),
            ]),
          ]),
        ]),
        h('div', { className: 'form-row' }, [
          h('div', { className: 'form-group' }, [
            h('label', { className: 'form-label' }, ['Logs Max Size (MB)']),
            h('input', { className: 'form-input', id: 'cfg-logs-size', type: 'number', value: config['logs-max-total-size-mb'] || 100 }),
          ]),
          h('div', { className: 'form-group' }, [
            h('label', { className: 'form-label' }, ['Error Logs Max Files']),
            h('input', { className: 'form-input', id: 'cfg-error-logs', type: 'number', value: config['error-logs-max-files'] || 10 }),
          ]),
        ]),
      ],
    }),

    Card({
      title: 'Routing',
      children: [
        h('div', { className: 'form-group' }, [
          h('label', { className: 'form-label' }, ['Strategy']),
          h('select', { className: 'form-select', id: 'cfg-routing' }, [
            h('option', { value: 'round-robin', selected: config.routing?.strategy === 'round-robin' }, ['Round Robin']),
            h('option', { value: 'fill-first', selected: config.routing?.strategy === 'fill-first' }, ['Fill First']),
          ]),
        ]),
      ],
    }),

    Card({
      title: 'API Keys',
      children: [
        h('div', { className: 'form-group' }, [
          h('label', { className: 'form-label' }, ['Keys (JSON array)']),
          h('textarea', {
            className: 'form-textarea',
            id: 'cfg-api-keys',
            rows: 4,
            value: JSON.stringify(config['api-keys'] || [], null, 2),
          }),
        ]),
      ],
    }),

    h('div', { className: 'flex justify-end gap-2' }, [
      h('button', { className: 'btn btn-ghost', onClick: () => {
        fetchConfig().then(c => {
          set('config', c);
          set('configJson', JSON.stringify(c, null, 2));
          toastOk('Config reloaded');
        });
      } }, ['🔄 Reload']),
      h('button', { className: 'btn btn-primary', onClick: saveFormConfig }, ['💾 Save Config']),
    ]),
  ]));
}

function renderYamlEditor(container) {
  const textarea = h('textarea', {
    className: 'form-textarea json-editor',
    rows: 40,
    placeholder: 'Loading config.yaml...',
    style: { fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: '1.5' },
  });

  async function load() {
    try {
      const yaml = await fetchConfigYAML();
      textarea.value = yaml;
      toastOk('Config YAML loaded');
    } catch (e) {
      toastError(`Failed to load config: ${e.message}`);
    }
  }
  load();

  container.appendChild(Card({
    title: 'Raw config.yaml',
    subtitle: 'Edit the full configuration file directly. Invalid YAML will be rejected by the server.',
    children: [
      textarea,
      h('div', { className: 'flex justify-end gap-2 mt-4' }, [
        h('button', { className: 'btn btn-ghost', onClick: load }, ['🔄 Reload']),
        h('button', {
          className: 'btn btn-primary',
          onClick: async () => {
            try {
              await saveConfigYAML(textarea.value);
              toastOk('Config saved and reloaded');
              const c = await fetchConfig();
              set('config', c);
              set('configJson', JSON.stringify(c, null, 2));
            } catch (e) {
              toastError(`Save failed: ${e.message}`);
            }
          },
        }, ['💾 Save']),
      ]),
    ],
  }));
}

async function saveFormConfig() {
  const config = deepClone(get('config') || {});

  config['proxy-url'] = document.getElementById('cfg-proxy-url')?.value || '';
  config['request-log'] = document.getElementById('cfg-request-log')?.value === 'true';
  config['logging-to-file'] = document.getElementById('cfg-logging-file')?.value === 'true';
  config['logs-max-total-size-mb'] = parseInt(document.getElementById('cfg-logs-size')?.value, 10) || 100;
  config['error-logs-max-files'] = parseInt(document.getElementById('cfg-error-logs')?.value, 10) || 10;
  config.routing = { strategy: document.getElementById('cfg-routing')?.value || 'round-robin' };

  try {
    config['api-keys'] = JSON.parse(document.getElementById('cfg-api-keys')?.value || '[]');
  } catch {
    toastError('Invalid API keys JSON');
    return;
  }

  await doSave(config);
}

async function doSave(config) {
  try {
    await saveConfig(config);
    set('config', config);
    set('configJson', JSON.stringify(config, null, 2));
    set('unsavedChanges', false);
    toastOk('Configuration saved');
  } catch (e) {
    toastError(`Save failed: ${e.message}`);
  }
}

function loadingState() {
  return h('div', { className: 'empty-state' }, [
    h('div', { className: 'spinner' }),
    h('div', { className: 'empty-state-title' }, ['Loading config...']),
  ]);
}
