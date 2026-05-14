/**
 * @fileoverview Provider Catalog - Pre-configured providers with endpoints and auth methods
 * Similar to Pi agents' provider list
 */

export const PROVIDERS_CATALOG = {
  // OpenAI-compatible providers
  openrouter: {
    name: 'OpenRouter',
    id: 'openrouter',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    website: 'https://openrouter.ai',
    description: 'Unified API for 100+ AI models with routing and caching',
    keyEnvVar: 'OPENROUTER_API_KEY',
    keyFormat: 'sk-or-v1-...',
    popularModels: [
      { name: 'meta-llama/llama-3.3-70b-instruct', alias: 'llama-3.3-70b' },
      { name: 'google/gemma-2-27b-it', alias: 'gemma-2-27b' },
      { name: 'qwen/qwen-2.5-72b-instruct', alias: 'qwen-2.5-72b' },
      { name: 'anthropic/claude-3.5-sonnet', alias: 'claude-3.5-sonnet' },
    ],
    freeModels: true,
    supportsStreaming: true,
  },
  'z.ai': {
    name: 'ZAI',
    id: 'z.ai',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    website: 'https://z.ai',
    description: 'Zhipu AI (GLM models) - High-performance Chinese AI inference',
    keyEnvVar: 'ZAI_API_KEY',
    keyFormat: 'sk-...',
    popularModels: [
      { name: 'glm-5-flash', alias: 'glm-5-flash' },
      { name: 'glm-4-flash', alias: 'glm-4-flash' },
      { name: 'glm-4-plus', alias: 'glm-4-plus' },
    ],
    supportsStreaming: true,
  },
  minimax: {
    name: 'MiniMax',
    id: 'minimax',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.minimax.chat/v1',
    website: 'https://platform.minimax.chat',
    description: 'Chinese AI provider with powerful language models',
    keyEnvVar: 'MINIMAX_API_KEY',
    keyFormat: '...',
    popularModels: [
      { name: 'abab5.5-chat', alias: 'minimax-abab5.5' },
      { name: 'abab6.5-chat', alias: 'minimax-abab6.5' },
    ],
    supportsStreaming: true,
  },
  nvidia: {
    name: 'NVIDIA NIM',
    id: 'nvidia',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    website: 'https://build.nvidia.com',
    description: 'NVIDIA NIM - Accelerated AI inference',
    keyEnvVar: 'NVIDIA_API_KEY',
    keyFormat: 'nvapi-...',
    popularModels: [
      { name: 'meta/llama-3.1-405b-instruct', alias: 'llama-3.1-405b' },
      { name: 'google/gemma-2-2b-it', alias: 'gemma-2-2b' },
      { name: 'mistralai/mistral-large', alias: 'mistral-large' },
      { name: 'meta/llama-3.3-70b-instruct', alias: 'llama-3.3-70b' },
    ],
    freeModels: true,
    supportsStreaming: true,
  },
  deepseek: {
    name: 'DeepSeek',
    id: 'deepseek',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.deepseek.com/v1',
    website: 'https://platform.deepseek.com',
    description: 'Chinese AI lab with powerful coding models',
    keyEnvVar: 'DEEPSEEK_API_KEY',
    keyFormat: 'sk-...',
    popularModels: [
      { name: 'deepseek-chat', alias: 'deepseek-chat' },
      { name: 'deepseek-coder', alias: 'deepseek-coder' },
    ],
    supportsStreaming: true,
  },
  groq: {
    name: 'Groq',
    id: 'groq',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.groq.com/openai/v1',
    website: 'https://groq.com',
    description: 'Ultra-fast AI inference with LPU inference engine',
    keyEnvVar: 'GROQ_API_KEY',
    keyFormat: 'gsk_...',
    popularModels: [
      { name: 'llama-3.3-70b-versatile', alias: 'llama-3.3-70b' },
      { name: 'mixtral-8x7b-32768', alias: 'mixtral-8x7b' },
      { name: 'gemma-7b-it', alias: 'gemma-7b' },
    ],
    freeModels: true,
    supportsStreaming: true,
  },
  cerebras: {
    name: 'Cerebras',
    id: 'cerebras',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.cerebras.ai/v1',
    website: 'https://inference.cerebras.ai',
    description: 'Fastest inference in the world',
    keyEnvVar: 'CEREBRAS_API_KEY',
    keyFormat: '...',
    popularModels: [
      { name: 'llama3.3-70b', alias: 'llama-3.3-70b' },
      { name: 'meta-llama-3.1-70b', alias: 'llama-3.1-70b' },
    ],
    supportsStreaming: true,
  },
  fireworks: {
    name: 'Fireworks AI',
    id: 'fireworks',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    website: 'https://fireworks.ai',
    description: 'Fast and affordable AI inference',
    keyEnvVar: 'FIREWORKS_API_KEY',
    keyFormat: '...',
    popularModels: [
      { name: 'accounts/fireworks/models/llama-v3-70b-instruct', alias: 'llama-3-70b' },
      { name: 'accounts/fireworks/models/mixtral-8x7b-instruct', alias: 'mixtral-8x7b' },
    ],
    supportsStreaming: true,
  },
  together: {
    name: 'Together AI',
    id: 'together',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.together.xyz/v1',
    website: 'https://together.ai',
    description: 'Open-source AI models at production scale',
    keyEnvVar: 'TOGETHER_API_KEY',
    keyFormat: '...',
    popularModels: [
      { name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', alias: 'llama-3.3-70b' },
      { name: 'mistralai/Mixtral-8x7B-Instruct-v0.1', alias: 'mixtral-8x7b' },
      { name: 'Qwen/Qwen2.5-72B-Instruct-Turbo', alias: 'qwen-2.5-72b' },
    ],
    supportsStreaming: true,
  },
  anyscale: {
    name: 'Anyscale',
    id: 'anyscale',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.endpoints.anyscale.com/v1',
    website: 'https://anyscale.com',
    description: 'Ray-based AI infrastructure',
    keyEnvVar: 'ANYSCALE_API_KEY',
    keyFormat: '...',
    popularModels: [
      { name: 'meta-llama/Llama-2-70b-chat-hf', alias: 'llama-2-70b' },
      { name: 'codellama/CodeLlama-34b-Instruct-hf', alias: 'codellama-34b' },
    ],
    supportsStreaming: true,
  },
  'moonshot-ai': {
    name: 'Moonshot AI',
    id: 'moonshot-ai',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.moonshot.cn/v1',
    website: 'https://platform.moonshot.cn',
    description: 'Chinese AI startup with powerful language models',
    keyEnvVar: 'MOONSHOT_API_KEY',
    keyFormat: '...',
    popularModels: [
      { name: 'moonshot-v1-8k', alias: 'moonshot-8k' },
      { name: 'moonshot-v1-32k', alias: 'moonshot-32k' },
      { name: 'moonshot-v1-128k', alias: 'moonshot-128k' },
    ],
    supportsStreaming: true,
  },
  '01-ai': {
    name: '01.AI',
    id: '01-ai',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    website: 'https://01.ai',
    description: 'Chinese AI company (Yi models)',
    keyEnvVar: 'YI_API_KEY',
    keyFormat: '...',
    popularModels: [
      { name: 'yi-large', alias: 'yi-large' },
      { name: 'yi-medium', alias: 'yi-medium' },
      { name: 'yi-spark', alias: 'yi-spark' },
    ],
    supportsStreaming: true,
  },
  qwen: {
    name: 'Qwen (Alibaba)',
    id: 'qwen',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    website: 'https://dashscope.aliyun.com',
    description: 'Alibaba Cloud AI platform',
    keyEnvVar: 'DASHSCOPE_API_KEY',
    keyFormat: 'sk-...',
    popularModels: [
      { name: 'qwen-turbo', alias: 'qwen-turbo' },
      { name: 'qwen-plus', alias: 'qwen-plus' },
      { name: 'qwen-max', alias: 'qwen-max' },
    ],
    supportsStreaming: true,
  },
  'perplexity-ai': {
    name: 'Perplexity AI',
    id: 'perplexity-ai',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.perplexity.ai',
    website: 'https://perplexity.ai',
    description: 'AI-powered search and answer engine',
    keyEnvVar: 'PERPLEXITY_API_KEY',
    keyFormat: 'pplx-...',
    popularModels: [
      { name: 'llama-3.1-sonar-small-128k-online', alias: 'sonar-small-128k' },
      { name: 'llama-3.1-sonar-large-128k-online', alias: 'sonar-large-128k' },
    ],
    supportsStreaming: true,
  },
  'cloudflare-workers-ai': {
    name: 'Cloudflare Workers AI',
    id: 'cloudflare-workers-ai',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    website: 'https://workers.cloudflare.com',
    description: 'AI inference on Cloudflare edge network',
    keyEnvVar: 'CLOUDFLARE_API_KEY',
    requiresAccount: true,
    keyFormat: '...',
    popularModels: [
      { name: '@cf/meta/llama-3.1-8b-instruct', alias: 'llama-3.1-8b' },
      { name: '@cf/mistral/mistral-7b-instruct-v0.2', alias: 'mistral-7b' },
    ],
    freeModels: true,
    supportsStreaming: true,
  },
  'opencode-zen': {
    name: 'OpenCode Zen',
    id: 'opencode-zen',
    type: 'openai-compatibility',
    auth: 'api-key',
    baseUrl: 'https://opencode.ai/zen/v1',
    website: 'https://opencode.ai',
    description: 'AI coding platform with Zen models',
    keyEnvVar: 'OPENCODE_API_KEY',
    keyFormat: 'sk-...',
    popularModels: [
      { name: 'gpt-4o-mini', alias: 'zen-gpt-4o-mini' },
      { name: 'glm-5', alias: 'zen-glm-5' },
      { name: 'qwen3.6-plus', alias: 'zen-qwen3.6-plus' },
    ],
    freeModels: true,
    supportsStreaming: true,
  },
};

// OAuth providers
export const OAUTH_PROVIDERS_CATALOG = {
  codex: {
    name: 'OpenAI (ChatGPT/Codex)',
    id: 'codex',
    type: 'oauth',
    authUrl: '/codex-auth-url',
    website: 'https://chatgpt.com',
    description: 'Official OpenAI ChatGPT with OAuth authentication',
    popularModels: [
      { name: 'gpt-4o', alias: 'gpt-4o' },
      { name: 'gpt-4o-mini', alias: 'gpt-4o-mini' },
      { name: 'gpt-4-turbo', alias: 'gpt-4-turbo' },
    ],
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    id: 'anthropic',
    type: 'oauth',
    authUrl: '/anthropic-auth-url',
    website: 'https://claude.ai',
    description: 'Official Anthropic Claude API with OAuth',
    popularModels: [
      { name: 'claude-sonnet-4-20250514', alias: 'claude-sonnet-4' },
      { name: 'claude-opus-4-20250514', alias: 'claude-opus-4' },
      { name: 'claude-3.5-sonnet-20241022', alias: 'claude-3.5-sonnet' },
    ],
  },
  'gemini-cli': {
    name: 'Google Gemini CLI',
    id: 'gemini-cli',
    type: 'oauth',
    authUrl: '/gemini-cli-auth-url',
    website: 'https://gemini.google.com',
    description: 'Google Gemini with OAuth authentication',
    popularModels: [
      { name: 'gemini-2.5-pro', alias: 'gemini-2.5-pro' },
      { name: 'gemini-2.5-flash', alias: 'gemini-2.5-flash' },
      { name: 'gemini-1.5-pro', alias: 'gemini-1.5-pro' },
    ],
  },
  antigravity: {
    name: 'Antigravity',
    id: 'antigravity',
    type: 'oauth',
    authUrl: '/antigravity-auth-url',
    website: 'https://antigravity.com',
    description: 'Antigravity AI platform',
    popularModels: [
      { name: 'gemini-3-pro-high', alias: 'gemini-3-pro-high' },
      { name: 'gemini-3-flash-high', alias: 'gemini-3-flash-high' },
    ],
  },
  kimi: {
    name: 'Kimi (Moonshot)',
    id: 'kimi',
    type: 'oauth',
    authUrl: '/kimi-auth-url',
    website: 'https://kimi.moonshot.cn',
    description: 'Moonshot AI Kimi with OAuth',
    popularModels: [
      { name: 'kimi-k2', alias: 'kimi-k2' },
      { name: 'kimi-k2.5', alias: 'kimi-k2.5' },
    ],
  },
  qwen: {
    name: 'Qwen (Alibaba)',
    id: 'qwen',
    type: 'oauth',
    authUrl: '/qwen-auth-url',
    website: 'https://qwen.ai',
    description: 'Alibaba Qwen with OAuth',
    popularModels: [
      { name: 'qwen3-coder-plus', alias: 'qwen3-coder-plus' },
      { name: 'qwen3.6-plus', alias: 'qwen3.6-plus' },
    ],
  },
};

// API Key providers (built-in)
export const API_KEY_PROVIDERS_CATALOG = {
  'gemini-api-key': {
    name: 'Google Gemini (API Key)',
    id: 'gemini-api-key',
    type: 'api-key',
    configKey: 'gemini-api-key',
    website: 'https://aistudio.google.com/app/apikey',
    description: 'Google Gemini with API key authentication',
    keyEnvVar: 'GEMINI_API_KEY',
    keyFormat: 'AIzaSy...',
    popularModels: [
      { name: 'gemini-2.5-pro', alias: 'gemini-2.5-pro' },
      { name: 'gemini-2.5-flash', alias: 'gemini-2.5-flash' },
    ],
  },
  'claude-api-key': {
    name: 'Anthropic Claude (API Key)',
    id: 'claude-api-key',
    type: 'api-key',
    configKey: 'claude-api-key',
    website: 'https://console.anthropic.com',
    description: 'Anthropic Claude with API key authentication',
    keyEnvVar: 'ANTHROPIC_API_KEY',
    keyFormat: 'sk-ant-...',
    popularModels: [
      { name: 'claude-sonnet-4-20250514', alias: 'claude-sonnet-4' },
      { name: 'claude-opus-4-20250514', alias: 'claude-opus-4' },
      { name: 'claude-3.5-sonnet-20241022', alias: 'claude-3.5-sonnet' },
    ],
  },
  'codex-api-key': {
    name: 'OpenAI Codex (API Key)',
    id: 'codex-api-key',
    type: 'api-key',
    configKey: 'codex-api-key',
    website: 'https://platform.openai.com/api-keys',
    description: 'OpenAI with API key authentication',
    keyEnvVar: 'OPENAI_API_KEY',
    keyFormat: 'sk-...',
    popularModels: [
      { name: 'gpt-4o', alias: 'gpt-4o' },
      { name: 'gpt-4o-mini', alias: 'gpt-4o-mini' },
      { name: 'gpt-4-turbo', alias: 'gpt-4-turbo' },
    ],
  },
  'vertex-api-key': {
    name: 'Google Vertex AI (API Key)',
    id: 'vertex-api-key',
    type: 'api-key',
    configKey: 'vertex-api-key',
    website: 'https://console.cloud.google.com',
    description: 'Google Vertex AI with API key authentication',
    keyEnvVar: 'GOOGLE_API_KEY',
    keyFormat: 'AIzaSy...',
    popularModels: [
      { name: 'gemini-2.5-pro', alias: 'vertex-gemini-2.5-pro' },
      { name: 'gemini-2.5-flash', alias: 'vertex-gemini-2.5-flash' },
    ],
  },
};

// Helper functions
export function getProviderById(id) {
  return PROVIDERS_CATALOG[id] || OAUTH_PROVIDERS_CATALOG[id] || API_KEY_PROVIDERS_CATALOG[id];
}

export function getProvidersByType(type) {
  switch (type) {
    case 'openai-compatibility':
      return Object.values(PROVIDERS_CATALOG);
    case 'oauth':
      return Object.values(OAUTH_PROVIDERS_CATALOG);
    case 'api-key':
      return Object.values(API_KEY_PROVIDERS_CATALOG);
    default:
      return [];
  }
}

export function getAllProviders() {
  return [
    ...Object.values(PROVIDERS_CATALOG),
    ...Object.values(OAUTH_PROVIDERS_CATALOG),
    ...Object.values(API_KEY_PROVIDERS_CATALOG),
  ];
}

export function searchProviders(query) {
  const q = query.toLowerCase();
  return getAllProviders().filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q)
  );
}
