import { callGemini } from './gemini.js';

const UNSPLASH_BASE = 'https://api.unsplash.com';

const KEYWORD_SYS = `あなたはお題から画像検索キーワードを抽出するエンジンです。
お題を受け取り、Unsplashで検索するための英語キーワードを5個生成してください。
- 抽象的でなく、具体的に視覚イメージが浮かぶ単語
- ソフトファシネーション（注意を奪わず、心を引き留める）に向いた自然・風景・物体・抽象構図を狙う
- 「お題そのもの」だけでなく、感覚や情景の連想も含める
- 1キーワード=1〜3単語の英語

出力形式: {"keywords":["keyword1","keyword2","keyword3","keyword4","keyword5"]}
JSONのみ、マークダウン不要`;

export async function generateKeywords(geminiKey, topic) {
  if (!geminiKey) return [];
  try {
    const res = await callGemini(geminiKey, KEYWORD_SYS, `お題: ${topic}`, true, true);
    const cl = res.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cl);
    return Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [];
  } catch (e) {
    console.warn('keyword generation failed:', e.message);
    return [];
  }
}

export async function searchUnsplash(accessKey, query, perPage = 4) {
  if (!accessKey || !query) return [];
  try {
    const url = `${UNSPLASH_BASE}/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&content_filter=high`;
    const r = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });
    if (!r.ok) {
      console.warn('Unsplash search failed:', r.status, await r.text());
      return [];
    }
    const d = await r.json();
    return (d.results || []).map(p => ({
      id: p.id,
      thumb: p.urls.small,
      full: p.urls.regular,
      alt: p.alt_description || query,
      author: p.user?.name,
      authorUrl: p.user?.links?.html,
      query,
    }));
  } catch (e) {
    console.warn('Unsplash fetch error:', e.message);
    return [];
  }
}

export async function fetchImagesForTopic(geminiKey, unsplashKey, topic) {
  const keywords = await generateKeywords(geminiKey, topic);
  if (keywords.length === 0) return { keywords: [], images: [] };
  const batches = await Promise.all(keywords.map(k => searchUnsplash(unsplashKey, k, 3)));
  const flat = batches.flat();
  const seen = new Set();
  const unique = flat.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
  return { keywords, images: unique.slice(0, 12) };
}
