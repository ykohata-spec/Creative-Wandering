import { uid, now } from './constants.js';

export function memosToCSV(memos) {
  const h = 'メモID,題名,メモ内容,画像,URL,タグ,日時,記入場所,記入状態\n';
  const r = memos.map(m =>
    [
      m.id,
      m.title   || '',
      m.content || '',
      m.imageId ? '[画像あり]' : '',
      m.url     || '',
      m.tag     || '',
      m.createdAt || '',
      m.place   || '',
      m.state   || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  return h + r;
}

export function csvToMemos(text) {
  /* full CSV parser (handles quoted multi-line fields) */
  const parseCSV = (csv) => {
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i], nx = csv[i + 1];
      if (inQ) {
        if (c === '"' && nx === '"') { field += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { field += c; }
      } else {
        if      (c === '"')                          { inQ = true; }
        else if (c === ',')                          { row.push(field); field = ''; }
        else if (c === '\n' || (c === '\r' && nx === '\n')) {
          row.push(field); field = '';
          if (row.some(f => f.trim())) rows.push(row);
          row = [];
          if (c === '\r') i++;
        } else { field += c; }
      }
    }
    row.push(field);
    if (row.some(f => f.trim())) rows.push(row);
    return rows;
  };

  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const cols = rows[0].map(c => c.trim());
  const idx  = (...names) => {
    for (const n of names) { const i = cols.findIndex(c => c.toLowerCase().includes(n.toLowerCase())); if (i >= 0) return i; }
    return -1;
  };
  const iId = idx('メモID','memoid','id');
  const iTi = idx('題名','title','タイトル');
  const iCo = idx('メモ内容','内容','content','memo');
  const iUr = idx('url','link','リンク');
  const iTg = idx('タグ','tag');
  const iDt = idx('日時','datetime','date','時間');
  const iPl = idx('記入場所','場所','place');
  const iSt = idx('記入状態','状態','state','status');
  const g   = (v, i) => (i >= 0 && i < v.length) ? v[i].trim() : '';

  return rows.slice(1).map(v => ({
    id:        g(v, iId) || uid(),
    title:     g(v, iTi) || null,
    content:   g(v, iCo) || '',
    imageId:   null,
    url:       g(v, iUr) || null,
    tag:       g(v, iTg) || null,
    createdAt: g(v, iDt) || now(),
    place:     g(v, iPl) || null,
    state:     g(v, iSt) || null,
  })).filter(m => m.content || m.title || m.url);
}
