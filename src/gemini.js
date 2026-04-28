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

■ near（近い — 同じ世界の言葉）20-25件
お題と同じカテゴリ・業界の中にある構成要素・属性・トレンド・類似サービス。
お題を詳しく知る人が「そうそう、それも関係あるよね」と言うレベル。
例（お題:防災）：「避難所の導線設計」「ローリングストック」「ハザードマップ」「自治体の備蓄基準」

■ mid（やや遠い — 隣の世界の言葉）20-25件
異業種だが構造や仕組みが似ているもの。お題の人は普段見ないが、言われると「確かに似てる」と感じる距離。
例（お題:防災）：「朝活の習慣化設計」「サブスクの継続心理」「保険のナッジ設計」「ふるさと納税の行動経済学」

■ far（遠い — 対極の世界の言葉）20-25件
「サイエンス⇔アート」のように、お題と世界観・ジャンル感で気持ちよく対になる概念。
意味の反対語ではなく、価値観・姿勢・世界観が対極にあるもの。
お題の本質を抽出し、その対極を見つけてから、対極側の世界に属する具体的なフレーズを生成する。
例（お題:防災 → 本質「リスクを避ける・備える」→ 対極「リスクを取る・飛び込む」）：
「冒険旅行の即興性」「バンジージャンプの快感」「祝祭の非日常」「ギャンブラーの直感」「ストリートフードの衝動」

共通ルール:
- textは5〜20文字、文章にしない
- JSONオブジェクトのみ出力、マークダウンのコードブロック不要`;
