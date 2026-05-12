/**
 * @fileoverview Benchmark engine for comparing model performance.
 */

import { estimateTokens } from './utils.js';

/** @type {Record<string, {name: string, prompt: string, expectedKeywords: string[]}>} */
export const BENCHMARK_TEMPLATES = {
  standard: {
    name: 'Standard',
    prompt: 'Explain quantum entanglement in simple terms. Maximum 3 sentences.',
    expectedKeywords: ['quantum', 'entanglement', 'hастиц'],
  },
  code: {
    name: 'Code',
    prompt: 'Write a quicksort function in Python with docstring and usage example.',
    expectedKeywords: ['def', 'quicksort', 'sort'],
  },
  math: {
    name: 'Math',
    prompt: 'Solve the quadratic equation: 2x² + 5x - 3 = 0. Show all steps.',
    expectedKeywords: ['x', '=', 'discriminant'],
  },
  context: {
    name: 'Context',
    prompt: 'Проhитай текст и выдели 3 mainых thesisа:\n\nИскусственный интеллект — это область компьютерных наук...',
    expectedKeywords: ['thesis', 'main', 'conclusion'],
  },
};

const BENCHMARK_HISTORY_KEY = 'benchmark_history_v2';

/**
 * Run a benchmark for a single model.
 * @param {string} model - model ID
 * @param {string} prompt - prompt text
 * @param {object} options
 * @param {string} options.apiKey
 * @param {number} [options.runs=3]
 * @param {number} [options.timeout=30000]
 * @returns {Promise<object>}
 */
export async function benchmarkModel(model, prompt, options) {
  const { apiKey, runs = 3, timeout = 30000 } = options;
  const results = [];

  for (let i = 0; i < runs; i++) {
    const result = await runSingle(model, prompt, { apiKey, timeout });
    results.push(result);
  }

  return aggregateResults(results);
}

async function runSingle(model, prompt, { apiKey, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = performance.now();

  try {
    const res = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
      signal: controller.signal,
    });

    const body = await res.json();
    const end = performance.now();
    clearTimeout(timer);

    if (!res.ok) {
      return {
        success: false,
        error: body.error?.message || `HTTP ${res.status}`,
        latency: end - start,
      };
    }

    const content = body.choices?.[0]?.message?.content || '';
    const usage = body.usage || {};
    const outputTokens = usage.completion_tokens || usage.output_tokens || estimateTokens(content);
    const generationTime = end - start;

    return {
      success: true,
      latency: generationTime,
      ttft: generationTime,
      totalTime: generationTime,
      tokens: outputTokens,
      tokensPerSec: outputTokens / Math.max(generationTime / 1000, 0.001),
      content,
      usage,
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      success: false,
      error: e.name === 'AbortError' ? 'Timeout' : e.message,
      latency: performance.now() - start,
    };
  }
}

function aggregateResults(results) {
  const successful = results.filter(r => r.success);

  if (successful.length === 0) {
    return {
      success: false,
      error: results[0]?.error || 'All requests failed',
      runs: results.length,
      successful: 0,
      failed: results.length,
      details: results,
    };
  }

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    success: true,
    runs: results.length,
    successful: successful.length,
    failed: results.length - successful.length,
    avgLatency: Math.round(avg(successful.map(r => r.latency))),
    avgTTFT: Math.round(avg(successful.map(r => r.ttft))),
    avgTotalTime: Math.round(avg(successful.map(r => r.totalTime))),
    avgTokens: Math.round(avg(successful.map(r => r.tokens))),
    avgTokensPerSec: Math.round(avg(successful.map(r => r.tokensPerSec))),
    minLatency: Math.round(Math.min(...successful.map(r => r.latency))),
    maxLatency: Math.round(Math.max(...successful.map(r => r.latency))),
    details: results,
  };
}

/**
 * Calculate quality score based on expected keywords.
 * @param {string} content
 * @param {string[]} expectedKeywords
 * @returns {number} 0-100
 */
export function calculateQuality(content, expectedKeywords) {
  if (!content) return 0;
  const lower = content.toLowerCase();
  const keywordScore = expectedKeywords.length > 0
    ? expectedKeywords.filter(k => lower.includes(k.toLowerCase())).length / expectedKeywords.length
    : 0.5;
  const lengthScore = Math.min(content.length / 200, 1);
  const structureScore = (content.includes('.') || content.includes('\n')) ? 0.5 : 0;
  return Math.round((keywordScore * 0.5 + lengthScore * 0.3 + structureScore * 0.2) * 100);
}

/**
 * Benchmark multiple models and return ranked results.
 * @param {string[]} models
 * @param {string} prompt
 * @param {object} options
 * @returns {Promise<object[]>}
 */
export async function benchmarkCompare(models, prompt, options) {
  const results = [];
  for (const model of models) {
    const result = await benchmarkModel(model, prompt, options);
    results.push({ model, ...result });
  }
  return results.sort((a, b) => {
    if (!a.success) return 1;
    if (!b.success) return -1;
    return a.avgLatency - b.avgLatency;
  });
}

/**
 * Save benchmark results to localStorage.
 * @param {object} result
 */
export function saveBenchmarkHistory(result) {
  try {
    const history = JSON.parse(localStorage.getItem(BENCHMARK_HISTORY_KEY) || '[]');
    history.unshift({ ...result, id: crypto.randomUUID(), timestamp: Date.now() });
    if (history.length > 50) history.pop();
    localStorage.setItem(BENCHMARK_HISTORY_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

/**
 * Load benchmark history from localStorage.
 * @returns {object[]}
 */
export function loadBenchmarkHistory() {
  try {
    return JSON.parse(localStorage.getItem(BENCHMARK_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}
