const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export async function callGemini(apiKey, sys, msg, jsonMode = false) {
  if (!apiKey) return '⚠️ APIキーが設定されていません。右上の ⚙ から設定してください。';
  try {
    const r = await fetch(`${BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: msg }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    const d = await r.json();
    if (d.error) return `APIエラー: ${d.error.message}`;
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '応答を取得できませんでした。';
  } catch (e) {
    return `接続エラー: ${e.message}`;
  }
}

/* ─── CEN: 思考拡張エージェント ─── */
export const CEN_SYS = `あなたはユーザーの思考(CEN状態)を拡張する知的共創パートナーです。
- 知識提供を惜しまず、たたき台を求められたら論理的に回答
- 禁止される「答え」=ユーザーの代わりに意思決定すること。可能性提示は積極的に
- メモ箱データが提供される場合、文脈に合う時のみ自然に織り交ぜる
- 問いかけは毎回ではなく行き詰まり時のみ1つだけ
- 外部情報引用時はソース明記。日本語で応答`;

/* ─── CW: Cloud Synapse ノード生成 ─── */
export const CW_SYS = `あなたは深い洞察力を持つDeep Researcherです。以下のルールに従ってJSON形式のみで出力してください。Markdownは使用不可。
1. "internal_words": お題と化学反応を起こしそうなユーザーのメモを最大3〜5個厳選。 [{"text": "抽出したフレーズ", "id": "元のID番号"}]
2. "external_words": お題に対するDeep Researchを行い、想像力を刺激するキーワードを15〜20個生成。（「形容詞＋名詞」などのエモい言葉）`;
