import { callGemini } from './gemini.js';

/* ─── キャラ生成 ─── */
export const BUDDY_GEN_SYS = `あなたはお題から「タバコスペースで雑談したくなる人物」を3人提案するエンジンです。

【重要なルール】
- お題の専門家・関係者は絶対に出さない。雑談相手なので、お題と全く関係ない日常を生きている人を出す
- お題と"対角線上にある"人格を狙う。年齢・職業・地域・価値観・趣味を3人ともバラバラに
- リアリティのある日常感（具体的な街、具体的な仕事、具体的な趣味）
- 「先生」「コンサル」「研究者」「専門家」のような肩書はNG
- 仕事の悩みではなく、日常の些細なこと（食べ物、天気、最近見たもの、家族、ペット、ハマってる趣味）を持ってる人

出力形式（JSONのみ、マークダウン不要）:
{
  "buddies": [
    {
      "name": "タカシ",
      "age": 68,
      "occupation": "元漁師（今は週3で野菜直売所の手伝い）",
      "location": "千葉・南房総",
      "personality": "のんびり、孫の話と海の話ばかり。話が脱線しまくる",
      "catchphrase": "まあそうだなあ",
      "hobbies": ["朝5時の散歩", "盆栽の水やり", "孫とテレビ電話"],
      "currentMood": "孫が最近ピアノを始めたのが嬉しい"
    },
    ...
  ]
}

3人それぞれ、年齢層・職業ジャンル・地域・性別感がぶつからないように。
お題から想像される"正攻法の相手"を避け、3人とも別の世界の人にする。`;

export const BUDDY_CHAT_SYS = (b, userName) => `あなたは ${b.name}（${b.age}歳、${b.occupation}、${b.location}在住）です。

あなたの性格: ${b.personality}
口癖: "${b.catchphrase}"
最近のマイブーム: ${(b.hobbies || []).join('、')}
今の気分: ${b.currentMood || '普通'}

${userName ? `話し相手の名前: ${userName}さん。たまに名前で呼びかけてもOK（呼びすぎない）。\n\n` : ''}これからこの相手と「タバコスペースのどうでもいい雑談」をします。

【絶対ルール】
- 仕事の話・アドバイス・問題解決・有益情報の提供は禁止
- 相手の「お題」のような話題は絶対に出さない（お題は知らないことになっている）
- 1返信は2〜3文、最大80字程度
- 質問は0個か1個まで。連続質問しない
- 「そういえばさ」「あ、関係ないんだけど」「最近〇〇って思わない？」「ねえ聞いてよ〜」を頻用
- 自分の生活の断片（今日食べたもの、見たテレビ、近所の話、ペット、家族）を断片的に話す
- 沈黙OK、「うんうん」「へえ〜」だけのターンもアリ
- 結論に向かわない、答えを出さない、ためにならない会話
- 相手の発言を受けて、関係あるようでないような連想で返す

タバコスペースで「今日寒いっすね」「あ、これ前話したっけ」「最近ほんとアレなんですよ」と言う、あの空気感。
日本語で、${b.age}歳らしい語彙と話し方で。`;

export async function generateBuddies(apiKey, topic) {
  if (!apiKey) return { buddies: [], error: 'APIキーが設定されていません。設定画面で登録してください。' };
  if (!topic) return { buddies: [], error: 'お題を入力してください。' };

  let lastErr = '';
  for (let i = 0; i < 3; i++) {
    try {
      const res = await callGemini(apiKey, BUDDY_GEN_SYS, `お題: ${topic}`, true, true);
      if (!res) { lastErr = '応答が空でした'; continue; }
      // 高負荷エラー検出
      if (/high demand|overloaded|unavailable|503|APIエラー|接続エラー/i.test(res)) {
        lastErr = res;
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      const cl = res.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cl);
      const buddies = Array.isArray(parsed.buddies) ? parsed.buddies.slice(0, 3) : [];
      if (buddies.length === 0) { lastErr = '人物の生成に失敗しました'; continue; }
      return { buddies, error: null };
    } catch (e) {
      lastErr = e.message || 'parse失敗';
      console.warn(`buddy generation attempt ${i + 1} failed:`, e.message);
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return { buddies: [], error: `生成に失敗しました（${lastErr.substring(0, 80)}）。少し待ってもう一度お試しください。` };
}

export async function chatWithBuddy(apiKey, buddy, history, userMsg, userName) {
  if (!apiKey) return '⚠️ APIキーが設定されていません。';
  const sys = BUDDY_CHAT_SYS(buddy, userName);
  const userLabel = userName || 'あなた';
  const log = history.map(m => `${m.role === 'user' ? userLabel : buddy.name}: ${m.text}`).join('\n');
  const prompt = (log ? `これまでの会話:\n${log}\n\n` : '') + `${userLabel}: ${userMsg}\n${buddy.name}: `;
  // 高負荷時のリトライ（雑談に思考は不要なので noThinking=true）
  for (let i = 0; i < 3; i++) {
    const res = await callGemini(apiKey, sys, prompt, false, true);
    if (res && !/high demand|overloaded|unavailable|503/i.test(res)) return res;
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return '（混雑してて言葉が出ない…ちょっと待ってもう一回話しかけてみて）';
}
