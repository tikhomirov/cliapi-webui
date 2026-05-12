/**
 * @fileoverview Chat view — direct chat with models via /v1/chat/completions.
 * Features: searchable model select with provider grouping, chat history,
 * image upload for vision models, persistent system prompt.
 */

import { get, set, watch } from '../core/state.js';
import { fetchLiveModels, getClientApiKey, getApiKey } from '../core/api.js';
import { Card } from '../components/card.js';
import { toastOk, toastError } from '../components/toast.js';
import { h, escapeHtml, uid, debounce, copyToClipboard, estimateTokens, truncate } from '../core/utils.js';
import { showModal, closeModal } from '../components/modal.js';
import { enrichModels } from '../core/modelEnrichment.js';

const HISTORY_KEY = 'cli-proxy-chat-history';
const SYSTEM_PROMPT_KEY = 'cli-proxy-chat-system-prompt'; // legacy single prompt
const SYSTEM_PROMPTS_STORE_KEY = 'cli-proxy-system-prompts'; // JSON store: { activeId, prompts: [{id,name,text,updatedAt}] }
const SYSTEM_PROMPTS_ACTIVE_KEY = 'cli-proxy-system-prompts-active';
const SELECTED_MODEL_KEY = 'cli-proxy-chat-selected-model';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/* ── History helpers ── */

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return { chats: [] };
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.chats)) return { chats: [] };
    const cutoff = Date.now() - MAX_AGE_MS;
    data.chats = data.chats.filter(c => (c.updatedAt || c.createdAt) > cutoff);
    return data;
  } catch {
    return { chats: [] };
  }
}

function saveHistory(data) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function saveCurrentChat(chat) {
  if (!chat.messages || chat.messages.length === 0) return;
  const history = loadHistory();
  const idx = history.chats.findIndex(c => c.id === chat.id);
  const entry = { ...chat, updatedAt: Date.now(), messages: JSON.parse(JSON.stringify(chat.messages)) };
  if (idx >= 0) history.chats[idx] = entry;
  else history.chats.unshift(entry);
  if (history.chats.length > 200) history.chats = history.chats.slice(0, 200);
  saveHistory(history);
}

function generateChatTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'Новый чат';
  let text = '';
  if (typeof firstUser.content === 'string') {
    text = firstUser.content;
  } else if (Array.isArray(firstUser.content)) {
    const part = firstUser.content.find(c => c.type === 'text');
    text = part?.text || '';
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.slice(0, 60) + (text.length > 60 ? '…' : '') || 'Новый чат';
}

function modelSupportsVision(modelId) {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  // OpenAI vision-capable models
  if (id.includes('gpt-4o')) return true;           // gpt-4o, gpt-4o-mini, gpt-4o-latest
  if (id.includes('gpt-4-turbo')) return true;      // gpt-4-turbo, gpt-4-turbo-preview
  if (id.startsWith('o1') || id.startsWith('o3')) return true; // o1, o1-mini, o3, o3-mini
  // Anthropic Claude 3/3.5/4 family (all support vision)
  if (id.includes('claude-3')) return true;
  if (id.includes('claude-4')) return true;
  // Google Gemini (all current versions are multimodal)
  if (id.includes('gemini')) return true;
  // DeepSeek VL
  if (id.includes('deepseek-vl')) return true;
  // Alibaba Qwen VL
  if (id.includes('qwen-vl')) return true;
  if (id.includes('qwen2-vl')) return true;
  if (id.includes('qwen2.5-vl')) return true;
  // Mistral Pixtral
  if (id.includes('pixtral')) return true;
  // Meta LLaMA 3.2 Vision
  if (id.includes('llama-3.2')) return true;
  // xAI Grok Vision
  if (id.includes('grok-vision')) return true;
  if (id.includes('grok-2-vision')) return true;
  // Microsoft Phi Vision
  if (id.includes('phi-3-vision')) return true;
  if (id.includes('phi-4-multimodal')) return true;
  // 01.AI Yi Vision
  if (id.includes('yi-vision')) return true;
  // InternVL
  if (id.includes('internvl')) return true;
  // CogVLM
  if (id.includes('cogvlm')) return true;
  // LLaVA
  if (id.includes('llava')) return true;
  // Generic vision tag (last resort)
  if (id.includes('vision')) return true;
  return false;
}

/* ── Content rendering ── */

function renderMessageContent(content) {
  if (Array.isArray(content)) {
    const frag = document.createDocumentFragment();
    for (const part of content) {
      if (part.type === 'text' && part.text) {
        frag.appendChild(renderTextWithImages(part.text));
      } else if (part.type === 'image_url' && part.image_url?.url) {
        frag.appendChild(h('img', {
          src: part.image_url.url,
          style: { maxWidth: '100%', maxHeight: '300px', borderRadius: 'var(--radius-sm)', marginTop: '4px', display: 'block' },
        }));
      }
    }
    return frag;
  }
  if (typeof content === 'string') {
    return renderTextWithImages(content);
  }
  return document.createTextNode(String(content));
}

function renderTextWithImages(text) {
  // Detect markdown images ![alt](url) and raw data URLs
  const container = document.createElement('div');
  container.style.whiteSpace = 'pre-wrap';
  container.style.wordBreak = 'break-word';

  const regex = /(!\[[^\]]*\]\(([^)]+)\))|((?:data:image\/[^;]+;base64,[A-Za-z0-9+/=]+))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      const span = document.createElement('span');
      span.textContent = before;
      container.appendChild(span);
    }

    const url = match[2] || match[3];
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '300px';
      img.style.borderRadius = 'var(--radius-sm)';
      img.style.marginTop = '4px';
      img.style.display = 'block';
      container.appendChild(img);
    }
    lastIndex = regex.lastIndex;
  }

  const remaining = text.slice(lastIndex);
  if (remaining) {
    const span = document.createElement('span');
    span.textContent = remaining;
    container.appendChild(span);
  }

  return container;
}

/* ── Model selector component ── */

function createModelSelector(onChange) {
  let models = [];
  let selected = localStorage.getItem(SELECTED_MODEL_KEY) || '';
  let open = false;

  const trigger = h('div', { className: 'chat-model-trigger', tabIndex: 0 }, [
    h('span', { className: 'chat-model-trigger-text' }, [selected || 'Выберите модель…']),
    h('span', { className: 'chat-model-trigger-arrow' }, ['▼']),
  ]);

  const searchInput = h('input', { className: 'chat-model-search', type: 'text', placeholder: 'Поиск модели…' });
  const dropdownList = h('div', { className: 'chat-model-dropdown-list' });
  const dropdown = h('div', { className: 'chat-model-dropdown', hidden: true }, [
    searchInput,
    dropdownList,
  ]);

  function setValue(value, label) {
    selected = value;
    trigger.querySelector('.chat-model-trigger-text').textContent = label || value || 'Выберите модель…';
    localStorage.setItem(SELECTED_MODEL_KEY, value);
    if (onChange) onChange(value);
  }

  function renderDropdown(filter = '') {
    dropdownList.innerHTML = '';
    const q = filter.toLowerCase().trim();

    const grouped = new Map();
    for (const m of models) {
      if (q && !m.id.toLowerCase().includes(q) && !(m.owned_by || '').toLowerCase().includes(q)) continue;
      const provider = m.owned_by || 'unknown';
      if (!grouped.has(provider)) grouped.set(provider, []);
      grouped.get(provider).push(m);
    }

    if (grouped.size === 0) {
      dropdownList.appendChild(h('div', { className: 'chat-model-empty' }, ['Ничего не найдено']));
      return;
    }

    for (const [provider, list] of grouped) {
      const group = h('div', { className: 'chat-model-group' }, [
        h('div', { className: 'chat-model-group-label' }, [provider]),
        ...list.map(m => {
          const item = h('div', { className: 'chat-model-option', dataset: { value: m.id, label: m.id } }, [
            h('span', { className: 'chat-model-option-id' }, [m.id]),
            h('span', { className: 'chat-model-option-tags' }, [
              m.vision
                ? h('span', { className: 'chat-model-option-tag is-on', title: 'Поддерживает изображения (vision)' }, ['🖼️ VISION'])
                : h('span', { className: 'chat-model-option-tag is-off', title: 'Без поддержки изображений' }, ['🖼️ нет']),
            ]),
          ]);
          if (selected === m.id) item.classList.add('active');
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            setValue(m.id, m.id);
            closeDropdown();
          });
          return item;
        }),
      ]);
      dropdownList.appendChild(group);
    }
  }

  function openDropdown() {
    open = true;
    dropdown.hidden = false;
    searchInput.value = '';
    renderDropdown();
    requestAnimationFrame(() => {
      dropdown.classList.add('show');
      searchInput.focus();
    });
  }

  function closeDropdown() {
    open = false;
    dropdown.classList.remove('show');
    setTimeout(() => { dropdown.hidden = true; }, 150);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) closeDropdown();
    else openDropdown();
  });

  searchInput.addEventListener('input', debounce((e) => renderDropdown(e.target.value), 100));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
    if (e.key === 'Enter') {
      const first = dropdownList.querySelector('.chat-model-option');
      if (first) first.click();
    }
  });

  document.addEventListener('click', (e) => {
    if (open && !trigger.contains(e.target) && !dropdown.contains(e.target)) {
      closeDropdown();
    }
  });

  async function load() {
    try {
      const live = await fetchLiveModels();
      models = live.map(m => ({
        id: m.id,
        owned_by: m.owned_by || 'unknown',
        vision: modelSupportsVision(m.id),
      }));
    } catch (err) {
      // Fallback to config models
      const config = get('config') || {};
      const providers = config['openai-compatibility'] || [];
      for (const p of providers) {
        for (const m of p.models || []) {
          const id = typeof m === 'string' ? m : (m.alias || m.name);
          if (id) models.push({ id, owned_by: p.name || p['base-url'] || 'config', vision: modelSupportsVision(id) });
        }
      }
    }

    // Only auto-select first model if user hasn't picked one yet.
    // Never overwrite an existing selection even if the model is not in the fetched list
    // (it may be an alias or temporarily unavailable).
    if (!selected && models.length) {
      setValue(models[0].id, models[0].id);
    } else {
      trigger.querySelector('.chat-model-trigger-text').textContent = selected || 'Выберите модель…';
    }
    renderDropdown();
  }

  const wrap = h('div', { className: 'chat-model-select', style: { position: 'relative', flex: 1 } }, [trigger, dropdown]);
  wrap.setValue = setValue;
  wrap.load = load;
  wrap.getValue = () => selected;
  return wrap;
}

/* ── Main render ── */

export function renderChat(container) {
  container.style.maxWidth = '100%';

  const config = get('config') || {};
  const apiKey = config['api-keys']?.[0] || getClientApiKey() || getApiKey() || '';

  // Chat state
  let chatId = uid();
  let messages = [];
  let pendingImages = []; // { file, dataUrl }
  let pendingFiles = [];  // { name, text }

  // ── System prompts (persisted JSON store) ──
  function loadPromptsStore() {
    try {
      const raw = localStorage.getItem(SYSTEM_PROMPTS_STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.prompts)) {
          return {
            activeId: parsed.activeId || localStorage.getItem(SYSTEM_PROMPTS_ACTIVE_KEY) || parsed.prompts[0]?.id || null,
            prompts: parsed.prompts,
          };
        }
      }
    } catch { /* ignore */ }

    // migrate from legacy SYSTEM_PROMPT_KEY
    let legacy = '';
    try { legacy = localStorage.getItem(SYSTEM_PROMPT_KEY) || ''; } catch { /* ignore */ }

    const def = {
      activeId: 'default',
      prompts: [{ id: 'default', name: 'По умолчанию', text: legacy || '', updatedAt: Date.now() }],
    };
    try {
      localStorage.setItem(SYSTEM_PROMPTS_STORE_KEY, JSON.stringify(def));
      localStorage.setItem(SYSTEM_PROMPTS_ACTIVE_KEY, def.activeId);
    } catch { /* ignore */ }
    return def;
  }

  function savePromptsStore(store) {
    try {
      localStorage.setItem(SYSTEM_PROMPTS_STORE_KEY, JSON.stringify(store));
      if (store.activeId) localStorage.setItem(SYSTEM_PROMPTS_ACTIVE_KEY, store.activeId);
      // keep legacy key in sync (active prompt text)
      const active = store.prompts.find(p => p.id === store.activeId);
      localStorage.setItem(SYSTEM_PROMPT_KEY, active?.text || '');
    } catch { /* ignore */ }
  }

  let promptsStore = loadPromptsStore();

  function getActivePrompt() {
    const activeId = promptsStore.activeId || localStorage.getItem(SYSTEM_PROMPTS_ACTIVE_KEY) || promptsStore.prompts[0]?.id || null;
    promptsStore.activeId = activeId;
    return promptsStore.prompts.find(p => p.id === activeId) || promptsStore.prompts[0] || { id: 'default', name: 'По умолчанию', text: '' };
  }

  let systemPrompt = getActivePrompt().text || '';

  // ── Sidebar: chat history ──
  const historyList = h('div', { className: 'chat-history-list' });

  function renderHistory() {
    historyList.innerHTML = '';
    const history = loadHistory();
    if (!history.chats.length) {
      historyList.appendChild(h('div', { className: 'chat-history-empty' }, ['Нет сохранённых чатов']));
      return;
    }
    for (const chat of history.chats) {
      const date = new Date(chat.updatedAt || chat.createdAt).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      const item = h('div', { className: 'chat-history-item', dataset: { id: chat.id } }, [
        h('div', { className: 'chat-history-title' }, [chat.title || 'Без названия']),
        h('div', { className: 'chat-history-meta' }, [
          h('span', {}, [chat.model || '—']),
          h('span', {}, [date]),
        ]),
      ]);
      if (chat.id === chatId) item.classList.add('active');
      item.addEventListener('click', () => loadChat(chat));
      historyList.appendChild(item);
    }
  }

  function loadChat(chat) {
    // Save current before switching
    saveCurrentChat({ id: chatId, messages, model: modelSelector.getValue(), systemPromptId: promptsStore.activeId, title: generateChatTitle(messages), createdAt: Date.now() });
    chatId = chat.id;
    messages = chat.messages ? JSON.parse(JSON.stringify(chat.messages)) : [];

    // System prompt is global (managed separately). We do NOT override it when switching chats.
    const active = getActivePrompt();
    systemPrompt = active.text || '';
    systemInput.value = systemPrompt;

    if (chat.model) {
      modelSelector.setValue(chat.model, chat.model);
      try { localStorage.setItem(SELECTED_MODEL_KEY, chat.model); } catch {}
    }
    renderMessages();
    renderHistory();
    updateModelSummary();
  }

  function startNewChat() {
    saveCurrentChat({ id: chatId, messages, model: modelSelector.getValue(), systemPromptId: promptsStore.activeId, title: generateChatTitle(messages), createdAt: Date.now() });
    chatId = uid();
    messages = [];
    renderMessages();
    renderHistory();
    updateModelSummary();
  }

  // ── Model selector ──
  // Model metadata cache for summary/context
  let enrichedModels = [];

  async function ensureEnrichedModels() {
    if (Array.isArray(get('enrichedModels')) && get('enrichedModels').length) {
      enrichedModels = get('enrichedModels');
      return enrichedModels;
    }
    try {
      const live = await fetchLiveModels();
      enrichedModels = await enrichModels(live, get('config') || {}, get('usage') || null);
      set('enrichedModels', enrichedModels);
    } catch {
      enrichedModels = [];
    }
    return enrichedModels;
  }

  const modelSelector = createModelSelector((modelId) => {
    updateImageUploadVisibility(modelId);
    updateModelSummary();
  });

  // ── System prompt ──
  const systemInput = h('textarea', {
    className: 'form-textarea chat-system-input',
    rows: 2,
    placeholder: 'Системный промпт (глобальный)…',
    value: systemPrompt,
  });

  const systemPromptHint = h('div', { className: 'text-muted', style: { fontSize: '0.78em', marginTop: '0.25rem' } }, []);
  systemPromptHint.textContent = `Активный промпт: ${getActivePrompt()?.name || '—'}`;

  function syncSystemPromptFromUI() {
    systemPrompt = systemInput.value;
    const active = getActivePrompt();
    if (active) {
      active.text = systemPrompt;
      active.updatedAt = Date.now();
      promptsStore.prompts = promptsStore.prompts.map(p => p.id === active.id ? active : p);
    }
    savePromptsStore(promptsStore);
  }

  systemInput.addEventListener('input', debounce(() => {
    syncSystemPromptFromUI();
    systemPromptHint.textContent = `Активный промпт: ${getActivePrompt()?.name || '—'}`;
    updateModelSummary();
  }, 300));

  // ── Model summary / context stats ──
  const modelSummary = h('div', { className: 'chat-model-summary' }, []);

  const resetContextBtn = h('button', { className: 'btn btn-ghost btn-sm', title: 'Очистить сообщения в этом чате' }, ['🧹 Сброс контекста']);
  const compressContextBtn = h('button', { className: 'btn btn-ghost btn-sm', title: 'Сжать историю: заменить старые сообщения краткой сводкой' }, ['🧠 Сжать контекст']);

  function contentToText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(p => p && p.type === 'text' && typeof p.text === 'string')
        .map(p => p.text)
        .join('\n');
    }
    return String(content ?? '');
  }

  function estimateCurrentContextTokens() {
    let text = '';
    if (systemPrompt?.trim()) text += systemPrompt.trim() + '\n\n';
    for (const m of messages) {
      text += `${m.role}: ${contentToText(m.content)}\n\n`;
    }
    // pending input + attachments not yet sent
    const draft = userInput.value || '';
    if (draft.trim()) text += `user(draft): ${draft}\n\n`;
    if (pendingFiles.length) {
      for (const f of pendingFiles) text += `file:${f.name}\n${f.text}\n\n`;
    }
    return estimateTokens(text);
  }

  async function updateModelSummary() {
    const modelId = modelSelector.getValue() || '';
    const ctxNow = estimateCurrentContextTokens();

    await ensureEnrichedModels();
    const entry = Array.isArray(enrichedModels) ? enrichedModels.find(m => m.id === modelId) : null;

    const ctxLimit = entry?.contextLength || null;
    const maxOut = entry?.maxCompletionTokens || null;
    const provider = entry?.provider || '';
    const ds = entry?.dataSource === 'openrouter' ? '✓ проверено' : entry ? '≈ оценка' : '';

    const vision = entry?.hasVision ?? modelSupportsVision(modelId);
    const attachments = `${pendingImages.length ? `🖼 ${pendingImages.length}` : ''}${pendingFiles.length ? `${pendingImages.length ? '  ' : ''}📎 ${pendingFiles.length}` : ''}`.trim();

    const pct = ctxLimit ? Math.min(100, Math.round((ctxNow / ctxLimit) * 100)) : null;

    modelSummary.innerHTML = '';
    modelSummary.appendChild(h('div', { className: 'chat-model-summary-row' }, [
      h('div', { className: 'chat-model-summary-title' }, [
        h('strong', {}, [modelId || '—']),
        provider ? h('span', { className: 'tag tag-muted', style: { marginLeft: '0.5rem' } }, [provider]) : null,
        ds ? h('span', { className: 'tag tag-muted', style: { marginLeft: '0.35rem' } }, [ds]) : null,
        vision ? h('span', { className: 'tag', style: { marginLeft: '0.35rem' } }, ['🖼 vision']) : h('span', { className: 'tag tag-muted', style: { marginLeft: '0.35rem' } }, ['🖼 нет']),
        attachments ? h('span', { className: 'tag tag-muted', style: { marginLeft: '0.35rem' } }, [attachments]) : null,
      ].filter(Boolean)),
      h('div', { className: 'chat-model-summary-meta' }, [
        ctxLimit ? `Контекст: ~${ctxNow} / ${ctxLimit} (${pct}%)` : `Контекст: ~${ctxNow} токенов`,
        maxOut ? ` • max output: ${maxOut}` : '',
      ].join('')),
    ]));

    if (ctxLimit) {
      modelSummary.appendChild(h('div', { className: 'chat-context-bar' }, [
        h('div', { className: 'chat-context-bar-fill', style: { width: `${pct}%` } }, []),
      ]));
    }
  }

  resetContextBtn.addEventListener('click', () => {
    messages = [];
    set('chatMessages', [...messages]);
    renderMessages();
    updateModelSummary();
  });

  compressContextBtn.addEventListener('click', async () => {
    if (!messages.length) return;
    const model = modelSelector.getValue();
    if (!model) return;
    if (!apiKey) { toastError('Нет доступного API ключа'); return; }

    try {
      const toSummarize = messages.slice(0, Math.max(0, messages.length - 6));
      if (toSummarize.length < 4) {
        toastError('Нечего сжимать: сообщений слишком мало');
        return;
      }

      toastOk('Сжимаю контекст…');

      const summaryReq = [
        { role: 'system', content: 'Сожми контекст. Дай краткую сводку диалога в 10–20 пунктах + важные факты/предпочтения. Пиши по-русски.' },
        ...toSummarize.map(m => ({
          role: m.role,
          content: Array.isArray(m.content)
            ? m.content.filter(p => p && p.type === 'text' && typeof p.text === 'string')
              .map(p => p.text).join('\n')
            : m.content,
        })),
      ];

      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: summaryReq, stream: false }),
      });

      const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
      if (!res.ok) throw new Error(body.error?.message || body.error || body.message || res.statusText);

      const summary = body.choices?.[0]?.message?.content ?? body.content ?? body.output_text ?? body.raw ?? '';
      const keepTail = messages.slice(-6);
      messages = [{ role: 'system', content: `Сжатый контекст (summary):\n${summary}` }, ...keepTail];
      set('chatMessages', [...messages]);
      renderMessages();
      saveCurrentChat({ id: chatId, messages, model, systemPromptId: promptsStore.activeId, title: generateChatTitle(messages), createdAt: Date.now() });
      updateModelSummary();
      toastOk('Контекст сжат');
    } catch (e) {
      toastError(e.message || String(e));
    }
  });

  // ── Messages area ──
  const messagesBox = h('div', { className: 'chat-messages' });

  function renderMessages() {
    messagesBox.innerHTML = '';
    if (!messages.length) {
      messagesBox.appendChild(h('div', { className: 'chat-empty-state' }, [
        'Выберите модель и отправьте сообщение.',
        h('br'),
        h('span', { className: 'text-muted', style: { fontSize: '0.8rem' } }, ['Поддерживается отправка изображений для vision-моделей.']),
      ]));
      return;
    }
    function contentToPlainText(content) {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter(p => p && p.type === 'text' && typeof p.text === 'string')
          .map(p => p.text)
          .join('\n');
      }
      return String(content ?? '');
    }

    for (const msg of messages) {
      const isUser = msg.role === 'user';
      const bubble = h('div', { className: `chat-bubble ${isUser ? 'user' : 'assistant'}` }, [
        h('div', { className: 'chat-bubble-header' }, [
          h('div', { className: 'chat-bubble-role' }, [msg.role]),
          h('div', { className: 'chat-bubble-actions' }, [
            h('button', { className: 'chat-copy-btn', title: 'Копировать сообщение' }, ['⧉']),
          ]),
        ]),
        h('div', { className: 'chat-bubble-content' }, []),
      ]);

      bubble.querySelector('.chat-bubble-content').appendChild(renderMessageContent(msg.content));

      bubble.querySelector('.chat-copy-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyToClipboard(contentToPlainText(msg.content));
        if (ok) toastOk('Скопировано');
        else toastError('Не удалось скопировать');
      });

      messagesBox.appendChild(bubble);
    }
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  renderMessages();

  // ── Input area ──
  const userInput = h('textarea', {
    className: 'form-textarea chat-input',
    rows: 2,
    placeholder: 'Введите сообщение…',
  });
  userInput.addEventListener('input', debounce(() => updateModelSummary(), 150));

  // Attachments: images (vision models) + text files
  const imageInput = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
  const textFileInput = h('input', { type: 'file', multiple: true, accept: 'text/*,.txt,.md,.json,.yaml,.yml,.toml,.ini,.log,.csv,.js,.ts,.py,.go,.java,.cs,.c,.cpp,.rs', style: { display: 'none' } });

  const imagePreviewWrap = h('div', { className: 'chat-image-previews' });
  const filePreviewWrap = h('div', { className: 'chat-file-previews' });

  const uploadImgBtn = h('button', { className: 'btn btn-ghost btn-sm', title: 'Прикрепить изображение' }, ['🖼️']);
  const uploadFileBtn = h('button', { className: 'btn btn-ghost btn-sm', title: 'Прикрепить файл (как текст)' }, ['📎']);

  function updateImageUploadVisibility(modelId) {
    const ok = modelSupportsVision(modelId);
    uploadImgBtn.disabled = !ok;
    uploadImgBtn.title = ok ? 'Прикрепить изображение' : 'Эта модель не отмечена как vision (изображения отключены)';
    if (!ok) {
      pendingImages = [];
      imagePreviewWrap.innerHTML = '';
    }
  }

  uploadImgBtn.addEventListener('click', () => {
    if (uploadImgBtn.disabled) return;
    imageInput.click();
  });

  uploadFileBtn.addEventListener('click', () => textFileInput.click());

  imageInput.addEventListener('change', async () => {
    const files = Array.from(imageInput.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await readFileAsDataURL(file);
        pendingImages.push({ file, dataUrl });
        const thumb = h('div', { className: 'chat-image-thumb' }, [
          h('img', { src: dataUrl }),
          h('button', { className: 'chat-image-thumb-remove', title: 'Удалить' }, ['×']),
        ]);
        thumb.querySelector('button').addEventListener('click', () => {
          pendingImages = pendingImages.filter(p => p.dataUrl !== dataUrl);
          thumb.remove();
          updateModelSummary();
        });
        imagePreviewWrap.appendChild(thumb);
      } catch {
        toastError('Ошибка чтения изображения');
      }
    }
    imageInput.value = '';
    updateModelSummary();
  });

  textFileInput.addEventListener('change', async () => {
    const files = Array.from(textFileInput.files || []);
    for (const file of files) {
      // Safety: only reasonably small files; everything is inlined as text
      if (file.size > 200 * 1024) {
        toastError(`Файл слишком большой: ${file.name} (лимит 200KB)`);
        continue;
      }
      try {
        const text = await readFileAsText(file);
        pendingFiles.push({ name: file.name, text });
        const chip = h('div', { className: 'chat-file-chip' }, [
          h('span', { className: 'chat-file-chip-name' }, [file.name]),
          h('span', { className: 'chat-file-chip-meta' }, [`${text.length} chars`]),
          h('button', { className: 'chat-file-chip-remove', title: 'Удалить' }, ['×']),
        ]);
        chip.querySelector('button').addEventListener('click', () => {
          pendingFiles = pendingFiles.filter(f => f.name !== file.name || f.text !== text);
          chip.remove();
          updateModelSummary();
        });
        filePreviewWrap.appendChild(chip);
      } catch {
        toastError(`Ошибка чтения файла: ${file.name}`);
      }
    }
    textFileInput.value = '';
    updateModelSummary();
  });

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  // Send
  const sendBtn = h('button', { className: 'btn btn-primary' }, ['➤ Отправить']);
  const newChatBtn = h('button', { className: 'btn btn-ghost btn-sm' }, ['✨ Новый чат']);
  const loadModelsBtn = h('button', { className: 'btn btn-ghost btn-sm' }, ['🔄 Модели']);
  const promptsBtn = h('button', { className: 'btn btn-ghost btn-sm' }, ['🧩 Промпты']);

  async function doSend() {
    const text = userInput.value.trim();
    if (!text && pendingImages.length === 0 && pendingFiles.length === 0) return;

    const model = modelSelector.getValue();
    if (!model) { toastError('Выберите модель'); return; }
    if (!apiKey) { toastError('Нет доступного API ключа'); return; }

    // Inline attached files as text blocks
    let filesText = '';
    if (pendingFiles.length) {
      filesText = pendingFiles.map(f => {
        const trimmed = String(f.text || '');
        return `\n\n[Файл: ${f.name}]\n\n\`\`\`\n${trimmed}\n\`\`\``;
      }).join('');
    }

    // Build user message content
    let userContent;
    if (pendingImages.length > 0) {
      userContent = [{ type: 'text', text: (text || '') + filesText }];
      for (const img of pendingImages) {
        userContent.push({ type: 'image_url', image_url: { url: img.dataUrl } });
      }
    } else {
      userContent = (text || '') + filesText;
    }

    messages.push({ role: 'user', content: userContent });
    set('chatMessages', [...messages]); // keep reactive sync
    userInput.value = '';
    pendingImages = [];
    pendingFiles = [];
    imagePreviewWrap.innerHTML = '';
    filePreviewWrap.innerHTML = '';
    renderMessages();
    updateModelSummary();

    // Build request messages
    const chatMessages = [];
    if (systemPrompt.trim()) {
      chatMessages.push({ role: 'system', content: systemPrompt.trim() });
    }
    chatMessages.push(...messages.map(m => ({ role: m.role, content: m.content })));

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: chatMessages, stream: false }),
      });

      const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
      if (!res.ok) throw new Error(body.error?.message || body.error || body.message || res.statusText);

      const answer = body.choices?.[0]?.message?.content ?? body.content ?? body.output_text ?? body.raw ?? 'Empty response';
      messages.push({ role: 'assistant', content: answer });
      set('chatMessages', [...messages]);
      if (body.usage) toastOk(`Tokens: ${body.usage.total_tokens ?? '?'}`);
      renderMessages();
      saveCurrentChat({ id: chatId, messages, model, systemPromptId: promptsStore.activeId, title: generateChatTitle(messages), createdAt: Date.now() });
      updateModelSummary();
    } catch (err) {
      messages.push({ role: 'assistant', content: `Ошибка: ${err.message}` });
      set('chatMessages', [...messages]);
      toastError(err.message);
      renderMessages();
      saveCurrentChat({ id: chatId, messages, model, systemPromptId: promptsStore.activeId, title: generateChatTitle(messages), createdAt: Date.now() });
      updateModelSummary();
    }
  }

  sendBtn.addEventListener('click', doSend);
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  newChatBtn.addEventListener('click', startNewChat);

  loadModelsBtn.addEventListener('click', async () => {
    try {
      await modelSelector.load();
      toastOk('Модели обновлены');
      updateImageUploadVisibility(modelSelector.getValue());
      await ensureEnrichedModels();
      updateModelSummary();
    } catch (err) {
      toastError(err.message);
    }
  });

  promptsBtn.addEventListener('click', () => {
    const store = promptsStore;
    const active = getActivePrompt();

    const list = h('div', { className: 'chat-prompts-list' }, []);
    const nameInput = h('input', { className: 'form-input', type: 'text', placeholder: 'Название', value: active?.name || '' });
    const textArea = h('textarea', { className: 'form-textarea', rows: 10, placeholder: 'Текст системного промпта…', value: active?.text || '' });

    let currentId = active?.id || store.prompts[0]?.id || 'default';

    function renderList() {
      list.innerHTML = '';
      for (const p of store.prompts) {
        const item = h('button', { className: `chat-prompts-item ${p.id === currentId ? 'active' : ''}` }, [
          h('div', { style: { fontWeight: 600 } }, [p.name || p.id]),
          h('div', { className: 'text-muted', style: { fontSize: '0.78em' } }, [p.updatedAt ? new Date(p.updatedAt).toLocaleString('ru-RU') : '—']),
        ]);
        item.addEventListener('click', () => {
          // save current edits
          const cur = store.prompts.find(x => x.id === currentId);
          if (cur) {
            cur.name = nameInput.value;
            cur.text = textArea.value;
            cur.updatedAt = Date.now();
          }

          currentId = p.id;
          nameInput.value = p.name || '';
          textArea.value = p.text || '';
          renderList();
        });
        list.appendChild(item);
      }
    }

    const btnNew = h('button', { className: 'btn btn-primary' }, ['➕ Новый']);
    const btnSetActive = h('button', { className: 'btn btn-ghost' }, ['✅ Сделать активным']);
    const btnDelete = h('button', { className: 'btn btn-danger' }, ['🗑️ Удалить']);

    btnNew.addEventListener('click', () => {
      const id = uid();
      const p = { id, name: 'Новый промпт', text: '', updatedAt: Date.now() };
      store.prompts.unshift(p);
      currentId = id;
      nameInput.value = p.name;
      textArea.value = p.text;
      renderList();
    });

    btnSetActive.addEventListener('click', () => {
      // persist current edits
      const cur = store.prompts.find(x => x.id === currentId);
      if (cur) {
        cur.name = nameInput.value;
        cur.text = textArea.value;
        cur.updatedAt = Date.now();
      }
      store.activeId = currentId;
      promptsStore = store;
      savePromptsStore(promptsStore);
      systemPrompt = getActivePrompt().text || '';
      systemInput.value = systemPrompt;
      systemPromptHint.textContent = `Активный промпт: ${getActivePrompt()?.name || '—'}`;
      updateModelSummary();
      toastOk('Активный промпт обновлён');
      closeModal();
    });

    btnDelete.addEventListener('click', () => {
      if (store.prompts.length <= 1) {
        toastError('Нельзя удалить последний промпт');
        return;
      }
      store.prompts = store.prompts.filter(p => p.id !== currentId);
      if (store.activeId === currentId) store.activeId = store.prompts[0]?.id || null;
      currentId = store.prompts[0]?.id || null;
      const cur = store.prompts.find(p => p.id === currentId);
      nameInput.value = cur?.name || '';
      textArea.value = cur?.text || '';
      renderList();
    });

    renderList();

    showModal({
      title: 'Системные промпты',
      size: 'lg',
      children: [
        h('div', { className: 'chat-prompts-layout' }, [
          list,
          h('div', { className: 'chat-prompts-editor' }, [
            h('div', { className: 'form-group' }, [
              h('label', { className: 'form-label' }, ['Название']),
              nameInput,
            ]),
            h('div', { className: 'form-group' }, [
              h('label', { className: 'form-label' }, ['Текст']),
              textArea,
            ]),
            h('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } }, [
              btnNew,
              btnSetActive,
              btnDelete,
            ]),
          ]),
        ]),
      ],
      onClose: () => {
        // if modal closed without applying, still persist edits to store (non-active)
        const cur = store.prompts.find(x => x.id === currentId);
        if (cur) {
          cur.name = nameInput.value;
          cur.text = textArea.value;
          cur.updatedAt = Date.now();
          promptsStore = store;
          savePromptsStore(promptsStore);
        }
      },
    });
  });

  // ── Layout ──
  const sidebar = h('div', { className: 'chat-sidebar' }, [
    h('div', { className: 'chat-sidebar-header' }, [
      h('span', {}, ['История']),
      newChatBtn,
    ]),
    historyList,
  ]);

  const settingsCard = Card({
    title: 'Настройки чата',
    actions: [promptsBtn, loadModelsBtn],
    children: [
      h('div', { className: 'form-row', style: { alignItems: 'flex-end' } }, [
        h('div', { className: 'form-group', style: { flex: 2 } }, [
          h('label', { className: 'form-label' }, ['Модель']),
          modelSelector,
        ]),
      ]),
      h('div', { className: 'form-group', style: { marginBottom: 0 } }, [
        h('label', { className: 'form-label' }, ['Системный промпт']),
        systemInput,
        systemPromptHint,
      ]),
      modelSummary,
      h('div', { style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' } }, [
        resetContextBtn,
        compressContextBtn,
      ]),
    ],
  });

  const dialogCard = Card({
    title: 'Диалог',
    children: [
      messagesBox,
      imagePreviewWrap,
      filePreviewWrap,
      h('div', { className: 'chat-input-bar' }, [
        h('div', { style: { flex: 1 } }, [userInput]),
        h('div', { className: 'chat-input-actions' }, [
          uploadImgBtn,
          uploadFileBtn,
          sendBtn,
        ]),
      ]),
    ],
  });

  const mainArea = h('div', { className: 'chat-main' }, [
    settingsCard,
    dialogCard,
  ]);

  const layout = h('div', { className: 'chat-layout' }, [sidebar, mainArea]);
  container.appendChild(layout);
  container.appendChild(imageInput);
  container.appendChild(textFileInput);

  // Init
  modelSelector.load().then(async () => {
    updateImageUploadVisibility(modelSelector.getValue());
    await ensureEnrichedModels();
    updateModelSummary();
  });
  renderHistory();

  // Keep reactive sync with any external state changes
  const unsub = watch('chatMessages', (val) => {
    if (Array.isArray(val) && val !== messages) {
      messages = val;
      renderMessages();
      updateModelSummary();
    }
  });

  return () => {
    unsub();
    saveCurrentChat({ id: chatId, messages, model: modelSelector.getValue(), systemPromptId: promptsStore.activeId, title: generateChatTitle(messages), createdAt: Date.now() });
  };
}
