import { callGemini } from './gemini.js';
import { callOpenAI } from './openai.js';
import { getApiKey, getOpenAIKey, getProvider } from './storage.js';

// 統一ラッパー。プロバイダ設定に応じて Gemini or OpenAI を呼ぶ。
export async function callLLM(sys, msg, jsonMode = false, noThinking = false) {
  const provider = getProvider();
  if (provider === 'openai') {
    const k = getOpenAIKey();
    if (!k) return '⚠️ OpenAI APIキーが設定されていません。右上の ⚙ から設定してください。';
    return callOpenAI(k, sys, msg, jsonMode);
  }
  const k = getApiKey();
  if (!k) return '⚠️ Gemini APIキーが設定されていません。右上の ⚙ から設定してください。';
  return callGemini(k, sys, msg, jsonMode, noThinking);
}

// JSONレスポンスを期待する場合のリトライ込みヘルパー
export async function callLLMRetry(sys, msg, jsonMode = true, noThinking = true, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await callLLM(sys, msg, jsonMode, noThinking);
    if (!res) continue;
    if (/high demand|overloaded|unavailable|503|rate limit|429/i.test(res)) {
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      continue;
    }
    return res;
  }
  return null;
}
