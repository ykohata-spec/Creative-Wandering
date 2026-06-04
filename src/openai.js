const OPENAI_BASE = 'https://api.openai.com/v1/chat/completions';

export async function callOpenAI(apiKey, sys, msg, jsonMode = false, model = 'gpt-4.1-mini') {
  if (!apiKey) return '⚠️ OpenAI APIキーが設定されていません。右上の ⚙ から設定してください。';
  try {
    const body = {
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: msg },
      ],
      max_tokens: 2000,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    };
    const r = await fetch(OPENAI_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.error) return `APIエラー: ${d.error.message || ''}`;
    return d.choices?.[0]?.message?.content || '応答を取得できませんでした。';
  } catch (e) {
    return `接続エラー: ${e.message}`;
  }
}
