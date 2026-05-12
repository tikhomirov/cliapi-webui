/**
 * @fileoverview Model enrichment: resolves aliases, matches OpenRouter data,
 * falls back to heuristics, and combines config payload overrides.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_KEY = 'openrouter_models_v3';
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2h

let openRouterCache = null;

/* ── OpenRouter fetch with localStorage cache ── */

export async function loadOpenRouterModels() {
  if (openRouterCache) return openRouterCache;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL) {
        openRouterCache = new Map(data.map(m => [m.id, m]));
        return openRouterCache;
      }
    }
  } catch { /* ignore */ }

  try {
    const res = await fetch(OPENROUTER_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    openRouterCache = new Map(data.map(m => [m.id, m]));
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
    } catch { /* ignore */ }
    return openRouterCache;
  } catch (e) {
    console.warn('[Enrichment] OpenRouter fetch failed:', e.message);
    return new Map();
  }
}

/* ── Alias resolution from config ── */

/**
 * Build a map: localId → { realId, alias, isAlias, provider, payloadOverride }
 */
function buildModelMeta(liveModels, config) {
  const meta = new Map();

  // 1. From oauth-model-alias (codex section)
  const oauthAliases = config?.['oauth-model-alias'] || {};
  for (const [provider, entries] of Object.entries(oauthAliases)) {
    for (const entry of entries || []) {
      if (!entry.name) continue;
      // The entry.alias is the local alias (e.g. "brain"), entry.name is the real model (e.g. "gpt-5.4")
      if (entry.alias) {
        meta.set(entry.alias, {
          realId: entry.name,
          alias: entry.alias,
          isAlias: true,
          provider: provider,
          fork: !!entry.fork,
        });
      }
      // Also register the real name if not already present
      if (!meta.has(entry.name)) {
        meta.set(entry.name, {
          realId: entry.name,
          alias: entry.alias || null,
          isAlias: false,
          provider: provider,
          fork: !!entry.fork,
        });
      }
    }
  }

  // 2. From openai-compatibility providers
  const providers = config?.['openai-compatibility'] || [];
  for (const p of providers) {
    const provName = p.name || p['base-url'] || 'unknown';
    for (const m of p.models || []) {
      const name = typeof m === 'string' ? m : m.name;
      const alias = typeof m === 'object' ? m.alias : null;
      if (!name) continue;
      const localId = alias || name;
      if (!meta.has(localId)) {
        meta.set(localId, {
          realId: name,
          alias: alias || null,
          isAlias: !!alias,
          provider: provName,
        });
      }
      // Provider-level override (may be different from oauth)
      if (!meta.has(name)) {
        meta.set(name, {
          realId: name,
          alias: null,
          isAlias: false,
          provider: provName,
        });
      }
    }
  }

  // 3. Add live models not yet in meta
  for (const m of liveModels) {
    if (!meta.has(m.id)) {
      meta.set(m.id, {
        realId: m.id,
        alias: null,
        isAlias: false,
        provider: m.owned_by || 'unknown',
      });
    }
  }

  return meta;
}

/* ── OpenRouter lookup with smart ID matching ── */

/**
 * Try to find an OpenRouter model matching a local model ID.
 * Attempts: exact match, then with common provider prefixes.
 */
function findOpenRouterModel(localId, meta, orMap) {
  // 1. Exact match (some models like "gpt-5.4" might match "gpt-5.4" if no prefix)
  if (orMap.has(localId)) return orMap.get(localId);

  // 2. Resolve alias first
  const m = meta.get(localId);
  const realId = m?.realId || localId;

  if (orMap.has(realId)) return orMap.get(realId);

  // 3. Try common provider prefixes
  const prefixes = [
    'openai/', 'anthropic/', 'google/', 'deepseek/', 'meta-llama/',
    'mistral/', 'qwen/', 'minimax/', 'moonshotai/', 'xiaomi/',
    'z-ai/', 'nvidia/',
  ];
  for (const prefix of prefixes) {
    const candidate = prefix + realId;
    if (orMap.has(candidate)) return orMap.get(candidate);
  }

  // 4. Fuzzy: try stripping known local prefixes and re-trying
  //    e.g. "nvidia-gemma-2-2b-it" → try "google/gemma-2-2b-it"
  //    e.g. "ds-v4-flash" → try "deepseek/deepseek-v4-flash"
  const localPrefixes = [
    { pattern: /^ds-/, replace: 'deepseek/deepseek-' },
    { pattern: /^nvidia-/, replace: null }, // handled by trying multiple providers below
  ];

  if (realId.startsWith('ds-')) {
    const candidate = 'deepseek/deepseek-' + realId.slice(3);
    if (orMap.has(candidate)) return orMap.get(candidate);
  }

  // 5. Search by suffix (last resort)
  // e.g. "nvidia-gemma-2-2b-it" → find any model ending in "gemma-2-2b-it"
  for (const [orId, orModel] of orMap) {
    if (orId.endsWith('/' + realId)) return orModel;
  }

  // 6. For nvidia- prefixed models, try without prefix
  if (realId.startsWith('nvidia-')) {
    const stripped = realId.slice(7);
    for (const [orId, orModel] of orMap) {
      if (orId.endsWith('/' + stripped)) return orModel;
    }
  }

  return null;
}

/* ── Heuristics for models without OpenRouter data ── */

function guessDescription(id) {
  const d = id.toLowerCase();
  if (d.includes('gpt-5.4')) return 'GPT-5.4 — флагманская мультимодальная модель OpenAI с глубоким рассуждением';
  if (d.includes('gpt-5.3')) return 'GPT-5.3 Codex — код-оптимизированная модель OpenAI';
  if (d.includes('gpt-5.2')) return 'GPT-5.2 — мощная мультимодальная модель OpenAI';
  if (d.includes('gpt-5.1')) return 'GPT-5.1 — быстрая модель OpenAI нового поколения';
  if (d.includes('gpt-5-codex')) return 'GPT-5 Codex — модель OpenAI для генерации кода';
  if (d.includes('gpt-5') && !d.includes('.')) return 'GPT-5 — мощная модель OpenAI';
  if (d.includes('deepseek') || d.includes('ds-v4')) return 'DeepSeek V4 — продвинутая модель с глубоким рассуждением';
  if (d.includes('claude')) return 'Claude — мультимодальный ИИ-ассистент от Anthropic';
  if (d.includes('gemini')) return 'Gemini — мультимодальная модель Google';
  if (d.includes('qwen')) return 'Qwen — языковая модель от Alibaba Cloud';
  if (d.includes('kimi')) return 'Kimi — ИИ-ассистент от Moonshot AI';
  if (d.includes('glm')) return 'GLM — языковая модель от Zhipu AI (知谱)';
  if (d.includes('minimax')) return 'MiniMax — мультимодальная модель от MiniMax';
  if (d.includes('mimo')) return 'MiMo — мультимодальная модель от Xiaomi';
  if (d.includes('llama')) return 'LLaMA — открытая модель от Meta';
  if (d.includes('gemma')) return 'Gemma — компактная открытая модель от Google';
  if (d.includes('codestral') || d.includes('mistral')) return 'Mistral — европейская языковая модель';
  if (d.includes('pixtral')) return 'Pixtral — мультимодальная модель от Mistral';
  return '';
}

function guessContextLength(id) {
  const d = id.toLowerCase();
  // OpenAI GPT-5 family
  if (d.match(/gpt-5[.4]|gpt-5\.4/)) return 400000;
  if (d.match(/gpt-5[.23]|gpt-5\.[23]/)) return 400000;
  if (d.match(/gpt-5[.1]|gpt-5\.1/)) return 400000;
  if (d.includes('gpt-5-codex')) return 400000;
  if (d.includes('gpt-5') && !d.includes('.')) return 400000;
  // Claude 3/4
  if (d.includes('claude-3') || d.includes('claude-4')) return 200000;
  // Gemini
  if (d.includes('gemini')) return 1000000;
  // DeepSeek
  if (d.includes('deepseek') || d.includes('ds-v4')) return 1048576;
  // Qwen
  if (d.includes('qwen3-coder')) return 1000000;
  if (d.includes('qwen3.5') || d.includes('qwen3.6')) return 1000000;
  if (d.includes('qwen3-8b')) return 32000;
  // Kimi
  if (d.includes('kimi-k2')) return 262144;
  // GLM
  if (d.includes('glm-5')) return 202752;
  if (d.includes('glm4')) return 128000;
  // MiniMax
  if (d.includes('minimax-m2')) return 196608;
  // MiMo
  if (d.includes('mimo-v2')) return 1048576;
  if (d.includes('mimo') && d.includes('pro')) return 1048576;
  // Gemma
  if (d.includes('gemma-2')) return 8192;
  // LLaMA
  if (d.includes('llama-3.2')) return 128000;
  if (d.includes('llama')) return 32768;
  return null;
}

function guessMaxOutput(id) {
  const d = id.toLowerCase();
  // OpenAI GPT-5 family: max_completion_tokens from OpenRouter
  if (d.match(/gpt-5\.[1-4]/)) return 128000;
  if (d.includes('gpt-5-codex')) return 128000;
  if (d.includes('gpt-5') && !d.includes('.')) return 128000;
  // Claude
  if (d.includes('claude-3') || d.includes('claude-4')) return 8192;
  // Gemini
  if (d.includes('gemini')) return 8192;
  // DeepSeek V4
  if (d.includes('deepseek') || d.includes('ds-v4')) return 384000;
  // Qwen
  if (d.includes('qwen3') && d.includes('coder')) return 65536;
  if (d.includes('qwen3.5') || d.includes('qwen3.6')) return 65536;
  // Others
  if (d.includes('minimax-m2.7')) return 131072;
  if (d.includes('minimax-m2.5')) return 131072;
  if (d.includes('glm-5.1')) return 65535;
  if (d.includes('glm-5')) return 16384;
  if (d.includes('kimi-k2')) return 65536;
  if (d.includes('mimo')) return 131072;
  return 4096;
}

function guessHasVision(id) {
  return modelSupportsVision(id);
}

function modelSupportsVision(modelId) {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  // OpenAI GPT-5 family — all multimodal
  if (id.includes('gpt-5')) return true;
  // OpenAI earlier
  if (id.includes('gpt-4o')) return true;
  if (id.includes('gpt-4-turbo')) return true;
  if (id.startsWith('o1') || id.startsWith('o3')) return true;
  // Anthropic
  if (id.includes('claude-3')) return true;
  if (id.includes('claude-4')) return true;
  // Google Gemini
  if (id.includes('gemini')) return true;
  // DeepSeek VL
  if (id.includes('deepseek-vl')) return true;
  // Qwen VL
  if (id.includes('qwen-vl')) return true;
  if (id.includes('qwen2-vl') || id.includes('qwen2.5-vl')) return true;
  if (id.includes('qwen3.5-plus')) return true;
  if (id.includes('qwen3.6-plus')) return true;
  // MiMo multimodal
  if (id.includes('mimo-v2.5') && !id.includes('pro')) return true;
  if (id.includes('mimo-v2-omni')) return true;
  // Kimi
  if (id.includes('kimi-k2')) return true;
  // Meta LLaMA 3.2
  if (id.includes('llama-3.2')) return true;
  // Mistral / Pixtral
  if (id.includes('pixtral')) return true;
  // xAI Grok Vision
  if (id.includes('grok-vision')) return true;
  // Generic
  if (id.includes('vision') || id.includes('llava') || id.includes('internvl') || id.includes('cogvlm')) return true;
  return false;
}

function guessHasAudio(id) {
  const d = id.toLowerCase();
  if (d.includes('gpt-5')) return true;
  if (d.includes('gpt-4o')) return true;
  if (d.includes('gemini')) return true;
  if (d.includes('mimo-v2-omni')) return true;
  if (d.includes('mimo-v2.5') && !d.includes('pro')) return true;
  return false;
}

function guessHasReasoning(id) {
  const d = id.toLowerCase();
  if (d.includes('gpt-5')) return true;
  if (d.includes('o1') || d.includes('o3')) return true;
  if (d.includes('deepseek') || d.includes('ds-v4')) return true;
  if (d.includes('r1') || d.includes('reason')) return true;
  if (d.includes('qwen3') && d.includes('coder')) return true;
  return false;
}

function guessHasTools(id) {
  const d = id.toLowerCase();
  if (d.includes('gpt-5')) return true;
  if (d.includes('gpt-4')) return true;
  if (d.includes('claude')) return true;
  if (d.includes('gemini')) return true;
  if (d.includes('deepseek') || d.includes('ds-v4')) return true;
  if (d.includes('kimi-k2')) return true;
  return false;
}

function guessModalities(id) {
  const v = guessHasVision(id);
  const a = guessHasAudio(id);
  const mods = ['text'];
  if (v) mods.push('image');
  if (a) mods.push('audio');
  return mods;
}

/* ── Main enrichment pipeline ── */

export async function enrichModels(liveModels, config, usage) {
  const orMap = await loadOpenRouterModels();
  const meta = buildModelMeta(liveModels, config);
  const enriched = [];

  // Track which OpenRouter models we've already matched (avoid duplicates)
  const seenIds = new Set();

  // Build payload override map
  const payloadOverrides = buildPayloadOverrideMap(config);

  // First: add all live models (API-reported provider takes priority)
  for (const live of liveModels) {
    if (seenIds.has(live.id)) continue;
    seenIds.add(live.id);

    const m = meta.get(live.id) || {};
    const realId = m.realId || live.id;
    const orModel = findOpenRouterModel(live.id, meta, orMap);
    const stats = computeUsageStats(live.id, usage);

    enriched.push(buildModelEntry({
      id: live.id,
      realId,
      alias: m.alias || null,
      isAlias: !!m.isAlias,
      // For live models, API owned_by is authoritative
      provider: live.owned_by || m.provider || 'unknown',
      status: 'available',
      orModel,
      stats,
      payloadOverride: payloadOverrides[live.id] || payloadOverrides[realId] || null,
      localId: live.id,
    }));
  }

  // Then: add config-only models not in live list (show as configured-but-unavailable)
  for (const [localId, m] of meta) {
    if (seenIds.has(localId)) continue;
    seenIds.add(localId);

    const orModel = findOpenRouterModel(localId, meta, orMap);
    enriched.push(buildModelEntry({
      id: localId,
      realId: m.realId || localId,
      alias: m.alias || null,
      isAlias: !!m.isAlias,
      provider: m.provider || 'unknown',
      status: 'unavailable',
      orModel,
      stats: null,
      payloadOverride: payloadOverrides[localId] || payloadOverrides[m.realId] || null,
      localId,
    }));
  }

  // Sort: available first, then alphabetically
  enriched.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'available' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return enriched;
}

function buildModelEntry({ id, realId, alias, isAlias, provider, status, orModel, stats, payloadOverride, localId }) {
  const hasOr = !!orModel;
  const or = orModel || {};

  // Resolve OpenRouter pricing (per-token → per-million)
  let pricing = null;
  if (or.pricing) {
    pricing = {
      input: parseFloat(or.pricing.prompt || 0) * 1_000_000,
      output: parseFloat(or.pricing.completion || 0) * 1_000_000,
      cached: parseFloat(or.pricing.input_cache_read || 0) * 1_000_000,
    };
  }

  // Determine capabilities from OpenRouter or heuristics
  const inputMods = or.architecture?.input_modalities || guessModalities(id);
  const hasVision = inputMods.includes('image') || guessHasVision(id);
  const hasAudio = inputMods.includes('audio') || guessHasAudio(id);
  const hasVideo = inputMods.includes('video');
  const hasReasoning = (or.supported_parameters || []).includes('reasoning') || guessHasReasoning(id);
  const hasTools = (or.supported_parameters || []).includes('tools') ||
    (or.supported_parameters || []).includes('tool_choice') ||
    guessHasTools(id);

  return {
    id,
    realId: realId !== id ? realId : null,
    alias,
    isAlias,
    provider,
    status,
    description: or.description || guessDescription(id),
    contextLength: or.context_length || guessContextLength(id),
    maxCompletionTokens: or.top_provider?.max_completion_tokens || guessMaxOutput(id),
    pricing,
    dataSource: hasOr ? 'openrouter' : 'heuristic',
    architecture: or.architecture?.modality || (hasVision ? 'text+image->text' : 'text->text'),
    inputModalities: inputMods,
    outputModalities: or.architecture?.output_modalities || ['text'],
    supportedParameters: or.supported_parameters || guessSupportedParams(id),
    knowledgeCutoff: or.knowledge_cutoff || '',
    expirationDate: or.expiration_date || '',
    stats,
    hasVision,
    hasAudio,
    hasVideo,
    hasReasoning,
    hasTools,
    payloadOverride,
  };
}

function guessSupportedParams(id) {
  const params = ['temperature', 'max_tokens', 'top_p'];
  if (guessHasReasoning(id)) params.push('reasoning');
  if (guessHasTools(id)) params.push('tools', 'tool_choice');
  return params;
}

function buildPayloadOverrideMap(config) {
  const map = {};
  const overrides = config?.payload?.override || [];
  for (const rule of overrides) {
    const models = rule.models || [];
    const params = rule.params || {};
    for (const m of models) {
      const name = typeof m === 'string' ? m : m.name;
      if (name && Object.keys(params).length) {
        map[name] = params;
      }
    }
  }
  return map;
}

function computeUsageStats(modelId, usage) {
  if (!usage?.usage?.apis) return null;
  let totalLatency = 0, totalTokens = 0, count = 0, errors = 0;

  for (const api of Object.values(usage.usage.apis)) {
    for (const [m, modelStats] of Object.entries(api.models || {})) {
      if (m === modelId) {
        for (const d of modelStats.details || []) {
          totalLatency += d.latency_ms || 0;
          totalTokens += d.tokens?.total_tokens || 0;
          count++;
          if (d.failed) errors++;
        }
      }
    }
  }

  if (count === 0) return null;
  return {
    avgLatency: Math.round(totalLatency / count),
    avgTokens: Math.round(totalTokens / count),
    totalRequests: count,
    totalTokens,
    errorRate: +(errors / count * 100).toFixed(1),
  };
}

export function getEnrichmentStatus(model) {
  if (model.dataSource === 'openrouter' && model.pricing && model.stats) return 'full';
  if (model.dataSource === 'openrouter' || model.pricing) return 'partial';
  if (model.status === 'available') return 'basic';
  return 'none';
}