const OPENAI_BASE = 'https://api.openai.com/v1/chat/completions';

export async function callOpenAI(apiKey, sys, msg, jsonMode = false, model = 'gpt-4.1-mini') {
  if (!apiKey) return '⚠️ OpenAI APIキーが設定されていません。右上の ⚙ から設定してください。';
  try {
    // OpenAI の response_format: json_object はオブジェクトしか返せず配列対応不可。
    // 代わりにシステム指示に「JSONのみ返せ」を強化して、レスポンス側でクリーニングする。
    const sysFinal = jsonMode
      ? sys + '\n\n【出力ルール】JSONのみを返すこと。マークダウンのコードブロック（```）や説明文は禁止。指示された形式（配列またはオブジェクト）をそのまま出力する。'
      : sys;
    const body = {
      model,
      messages: [
        { role: 'system', content: sysFinal },
        { role: 'user', content: msg },
      ],
      max_tokens: 2000,
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
