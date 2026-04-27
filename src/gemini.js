const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export async function callGemini(apiKey, sys, msg, jsonMode = false, noThinking = false) {
  if (!apiKey) return '⚠️ APIキーが設定されていません。右上の ⚙ から設定してください。';
  try {
    const genConfig = {
      maxOutputTokens: 2000,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    };
    const r = await fetch(`${BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: msg }] }],
        generationConfig: genConfig,
      }),
    });
    const d = await r.json();
    if (d.error) return `APIエラー: ${d.error.message}`;
    const parts = d.candidates?.[0]?.content?.parts || [];
    const textPart = parts.filter(p => !p.thought).pop();
    return textPart?.text || '応答を取得できませんでした。';
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

/* ─── CW: Cloud Synapse ノード生成（2プロンプト構成） ─── */
export const CW_MEMO_SYS = `あなたはCLOUD SYNAPSEのメモ抽出エンジンです。お題とメモ箱を受け取り、メモ箱からお題に関連するキーワードやフレーズを抽出してJSON配列で返してください。他のテキスト不要。
出力形式: [{"text":"フレーズ"}]
- メモ箱の内容からお題に繋がりそうな言葉・概念を8-12件抽出
- textは5〜20文字、余計止め
- JSON配列のみ出力、マークダウンのコードブロック不要`;

export const CW_STIM_SYS = `あなたはCLOUD SYNAPSEの刺激生成エンジンです。お題を受け取り、3つの距離レベルに分けた刺激フレーズをJSONオブジェクトで返してください。他のテキスト不要。

出力形式:
{"near":[{"text":"フレーズ"}],"mid":[{"text":"フレーズ"}],"far":[{"text":"フレーズ"}]}

■ near（近い刺激）20-25件
お題の直接的な構成要素・属性・同カテゴリの類似物・業界トレンド
例：「麺の食感革命」「コンビニ限定商品」「深夜の罪悪感需要」

■ mid（やや遠い刺激）20-25件
異業種の類似構造・別ジャンルの成功パターン・感覚的な共通点を持つ概念
例：「朝活の熱量」「サブスクの期待設計」「韓国コスメの衝動買い構造」

■ far（遠い刺激）20-25件
一見無関係だが本質や構造で繋がる抽象概念・メタファー・五感的表現
例：「偶発性の設計」「不便さへの愛着」「心拍と想起の違い」

共通ルール:
- textは5〜20文字、文章にしない
- JSONオブジェクトのみ出力、マークダウンのコードブロック不要`;
