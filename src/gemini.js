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

/* ─── CW: Cloud Synapse ノード生成（距離別4プロンプト） ─── */
export const CW_MEMO_SYS = `あなたはCLOUD SYNAPSEのメモ抽出エンジンです。お題とメモ箱を受け取り、メモ箱からお題に関連するキーワードやフレーズを抽出してJSON配列で返してください。他のテキスト不要。
出力形式: [{"text":"フレーズ"}]
- メモ箱の内容からお題に繋がりそうな言葉・概念を8-12件抽出
- textは5〜20文字、余計止め
- メモに画像URLが含まれている場合、"image"フィールドにそのURLを追加
- JSON配列のみ出力、マークダウンのコードブロック不要`;

export const CW_NEAR_SYS = `あなたはCLOUD SYNAPSEの「近い刺激」生成エンジンです。お題を受け取り、お題に近い概念・関連トレンド・同カテゴリの別視点のフレーズをJSON配列で返してください。他のテキスト不要。
出力形式: [{"text":"フレーズ"}]
- お題の直接的な構成要素・属性・同カテゴリの類似物・業界トレンドなど、30-35件
- textは5〜20文字、余計止め、文章にしない
- 良い例：「麺の食感革命」「スープの温度設計」「コンビニ限定商品」「深夜の罪悪感需要」
- JSON配列のみ出力、マークダウンのコードブロック不要`;

export const CW_MID_SYS = `あなたはCLOUD SYNAPSEの「やや遠い刺激」生成エンジンです。お題を受け取り、別カテゴリだが感覚的・構造的に繋がるフレーズをJSON配列で返してください。他のテキスト不要。
出力形式: [{"text":"フレーズ"}]
- 異業種の類似構造・別ジャンルの成功パターン・感覚的な共通点を持つ概念など、30-35件
- textは5〜20文字、余計止め、文章にしない
- 良い例：「朝活の熱量」「サブスクの期待設計」「アドベントカレンダーの快感」「韓国コスメの衝動買い構造」
- JSON配列のみ出力、マークダウンのコードブロック不要`;

export const CW_FAR_SYS = `あなたはCLOUD SYNAPSEの「遠い刺激」生成エンジンです。お題を受け取り、一見無関係だが本質や構造で繋がる可能性のある抽象概念・メタファー・五感的表現をJSON配列で返してください。他のテキスト不要。
出力形式: [{"text":"フレーズ"}]
- 哲学的概念・感情・五感・身体感覚・自然現象・芸術・歴史的メタファーなど、30-35件
- textは5〜20文字、余計止め、文章にしない
- 良い例：「偶発性の設計」「不便さへの愛着」「呼吸としての食」「心拍と想起の違い」「手触り感のある体験」
- JSON配列のみ出力、マークダウンのコードブロック不要`;
