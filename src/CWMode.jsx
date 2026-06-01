import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { C, S, uid, now, fmtD } from './constants.js';
import { callGemini, CW_MEMO_SYS, CW_STIM_SYS, withProfile } from './gemini.js';
import { getApiKey, getUnsplashKey, getProfile, getImage } from './storage.js';
import { fetchImagesForTopic } from './unsplash.js';
import QuickMemo from './QuickMemo.jsx';
import WanderingBuddy from './WanderingBuddy.jsx';

const GROUP_COLORS = {
  1: { bg: '#EEFFC2', border: '#8BBE2C', color: '#5A8010' },
  2: { bg: '#DBEAFE', border: '#3B82F6', color: '#2563EB' },
  3: { bg: '#FFF3D0', border: '#F59E0B', color: '#D97706' },
  4: { bg: '#EDE5FF', border: '#6E5DC6', color: '#5B4AA8' },
  5: { bg: '#FFEEDB', border: '#E67E22', color: '#B85A0F' },
};

const DIST_INFO = [
  { l: '近い',     c: '#3B82F6', desc: 'お題のそばにある情景' },
  { l: 'やや遠い', c: '#F59E0B', desc: '感覚的に繋がるもの' },
  { l: '遠い',     c: '#6E5DC6', desc: '化学反応が起きそうなもの' },
  { l: '🖼 画像',  c: '#E67E22', desc: 'お題に通じる風景・物体の写真' },
];

/* ── 画像ノード用コンポーネント（メモ画像） ── */
function ImageNode({ imageId, text }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getImage(imageId).then(url => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [imageId]);
  return (
    <div style={{ textAlign: 'center', minWidth: 90 }}>
      {src
        ? <img src={src} alt="" style={{ width: 90, height: 68, objectFit: 'cover', borderRadius: 6, display: 'block', marginBottom: 4 }} />
        : <div style={{ width: 90, height: 68, background: '#f0ebe4', borderRadius: 6, marginBottom: 4 }} />
      }
      <div style={{ fontSize: 14, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</div>
    </div>
  );
}

/* ── Unsplash画像ノード ── */
function UnsplashNode({ thumb, alt, query }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 140 }}>
      <img src={thumb} alt={alt} style={{ width: 140, height: 100, objectFit: 'cover', borderRadius: 8, display: 'block', marginBottom: 4 }} loading="lazy" />
      <div style={{ fontSize: 12, color: '#B85A0F', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{query}</div>
    </div>
  );
}

export default function CWMode({ data, save }) {
  const [cwTab, setCwTab] = useState('synapse');
  const [memoNodes, setMemoNodes] = useState([]);
  const [pools,     setPools]     = useState({ near: [], mid: [], far: [], img: [] });
  const [pos,       setPos]       = useState({});
  const [sizes,     setSizes]     = useState({});
  const [pan,       setPan]       = useState({ x: 0, y: 0 });
  const [zoom,      setZoom]      = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [loadMsg,   setLoadMsg]   = useState('');
  const [topic,     setTopic]     = useState('外国人観光客に防災意識を持ってもらうアイデア');
  const [showM,     setShowM]     = useState(false);
  const [showHist,  setShowHist]  = useState(false);
  const [sideOpen,  setSideOpen]  = useState(false);
  const [drag,      setDrag]      = useState(null);
  const [off,       setOff]       = useState({ x: 0, y: 0 });
  const [panStart,  setPanStart]  = useState(null);
  const [dist,      setDist]      = useState(0);
  const canvasRef = useRef(null);
  const history   = data.cwHistory || [];

  const stimNodes = [pools.near, pools.mid, pools.far, pools.img][dist] || [];
  const visibleNodes = useMemo(() => [...memoNodes, ...stimNodes], [memoNodes, stimNodes]);
  const hasData = memoNodes.length > 0 || pools.near.length > 0;

  /* ── レイアウト ── */
  const doLayout = useCallback((nodeList) => {
    const cw = canvasRef.current?.clientWidth  || 900;
    const ch = canvasRef.current?.clientHeight || 700;
    const W = Math.max(cw, 1200);
    const H = Math.max(ch, 1000);
    const cx = W / 2;
    const cy = H / 2;
    const total = nodeList.length;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const np = {};
    const laid = nodeList.map((n, i) => {
      const id = n.id || uid();
      const a = i * golden + Math.random() * 0.4;
      const maxR = Math.min(W, H) * 0.44;
      const r = 60 + maxR * Math.sqrt((i + 1) / total) * (0.9 + Math.random() * 0.2);
      np[id] = {
        x: Math.max(10, cx + Math.cos(a) * r - 60),
        y: Math.max(10, cy + Math.sin(a) * r - 12),
      };
      return { ...n, id, _anim: n._anim ?? i % 6, _dur: n._dur ?? (8 + Math.random() * 12), _delay: n._delay ?? (Math.random() * -20) };
    });
    return { laid, np, cx, cy };
  }, []);

  const tryParse = (text, label) => {
    try {
      const cl = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cl);
    } catch (e) {
      console.warn(`CW parse failed [${label}]:`, e.message, '\nRaw:', text?.substring(0, 200));
      return [];
    }
  };

  /* ── 生成（2回のAPI呼び出しで全プール生成） ── */
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  const callWithRetry = async (apiKey, sys, msg, label) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await callGemini(apiKey, sys, msg, true, true);
      const trimmed = typeof res === 'string' ? res.trim() : '';
      if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
        console.warn(`CW API [${label}] attempt ${attempt + 1} failed:`, res?.substring?.(0, 200));
        await delay(3000 * (attempt + 1));
        continue;
      }
      return res;
    }
    console.error(`CW API [${label}] all retries exhausted`);
    return '[]';
  };

  const gen = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setSizes({});
    setPan({ x: 0, y: 0 });

    const apiKey = getApiKey();
    const memoCtx = data.memos.length > 0
      ? '\n\nメモ箱:\n' + data.memos.map(m => `[${m.tag || ''}] ${m.title || ''}: ${m.content}`).join('\n')
      : '\n\nメモ箱: (空)';

    const profile = getProfile();

    try {
      setLoadMsg('メモを解析中…(1/2)');
      const r1 = await callWithRetry(apiKey, withProfile(CW_MEMO_SYS, profile), 'お題: ' + topic + '\n' + memoCtx, 'memo');

      await delay(2000);
      setLoadMsg('3距離の刺激を一括生成中…(2/2)');
      const r2 = await callWithRetry(apiKey, withProfile(CW_STIM_SYS, profile), 'お題: ' + topic, 'stim');

      setLoadMsg('空間を構築中…');

      const memo = tryParse(r1, 'memo').map((n, i) => ({ ...n, group: 1, id: 'memo_' + i }));

      const imageMemos = data.memos
        .filter(m => m.imageId)
        .sort(() => 0.5 - Math.random())
        .slice(0, 5)
        .map((m, i) => ({
          id: 'img_' + i, text: m.title || m.content?.substring(0, 12) || '画像',
          group: 1, imageId: m.imageId,
        }));
      const allMemo = [...memo, ...imageMemos];

      const stimRaw = tryParse(r2, 'stim');
      const nearRaw = Array.isArray(stimRaw) ? stimRaw : (stimRaw.near || []);
      const midRaw  = Array.isArray(stimRaw) ? [] : (stimRaw.mid || []);
      const farRaw  = Array.isArray(stimRaw) ? [] : (stimRaw.far || []);

      const near = nearRaw.map((n, i) => ({ ...n, group: 2, id: 'near_' + i }));
      const mid  = midRaw.map((n, i) => ({ ...n, group: 3, id: 'mid_' + i }));
      const far  = farRaw.map((n, i) => ({ ...n, group: 4, id: 'far_' + i }));

      const { laid: viewNear, np: posNear, cx, cy } = doLayout([...allMemo, ...near]);
      const { laid: viewMid,  np: posMid }           = doLayout([...allMemo, ...mid]);
      const { laid: viewFar,  np: posFar }           = doLayout([...allMemo, ...far]);

      const memoLaid = viewNear.filter(n => n.group === 1);
      const stimNear = viewNear.filter(n => n.group === 2);
      const stimMid  = viewMid.filter(n => n.group === 3);
      const stimFar  = viewFar.filter(n => n.group === 4);

      // 画像モード用：Unsplash 画像のみ刺激として配置（メモ画像は memoNodes として常時表示）
      let unsplashNodes = [];
      const unsKey = getUnsplashKey();
      if (unsKey) {
        setLoadMsg('画像を検索中…');
        try {
          const { images } = await fetchImagesForTopic(apiKey, unsKey, topic);
          unsplashNodes = images.map((p, i) => ({
            id: 'unsp_' + i, group: 5, thumb: p.thumb, full: p.full,
            alt: p.alt, query: p.query, text: p.query,
          }));
        } catch (e) {
          console.warn('Unsplash fetch failed:', e);
        }
      }
      const { laid: viewImg, np: posImg } = doLayout([...allMemo, ...unsplashNodes]);
      const stimImg = viewImg.filter(n => n.group === 5);

      setMemoNodes(memoLaid);
      setPools({
        near: stimNear, nearPos: posNear,
        mid:  stimMid,  midPos:  posMid,
        far:  stimFar,  farPos:  posFar,
        img:  stimImg,  imgPos:  posImg,
      });
      setPos({ ...posNear, __t: { x: cx - 100, y: cy - 14 } });
      setDist(0);

      const entry = {
        id: uid(), topic: topic.trim(),
        memo, near, mid, far,
        imageMemos: imageMemos.map(m => ({ id: m.id, text: m.text, imageId: m.imageId })),
        unsplash: unsplashNodes.map(n => ({ id: n.id, thumb: n.thumb, full: n.full, alt: n.alt, query: n.query, text: n.text })),
        createdAt: now(),
      };
      save({ ...data, cwHistory: [entry, ...history].slice(0, 10) });
    } catch (e) {
      console.error('CW gen error:', e);
      setMemoNodes([{ id: uid(), text: '生成失敗。再試行してください。', group: 1, _anim: 0, _dur: 15, _delay: 0 }]);
    }
    setLoading(false);
    setLoadMsg('');
  };

  /* ── 距離切り替え ── */
  const switchDist = (level) => {
    const poolPos = [pools.nearPos, pools.midPos, pools.farPos, pools.imgPos][level];
    if (!poolPos) return;
    setDist(level);
    setPos(prev => ({ ...poolPos, __t: prev.__t || { x: 400, y: 300 } }));
  };

  /* ── 履歴復元 ── */
  const loadHist = (entry) => {
    setTopic(entry.topic);
    setSizes({});
    setPan({ x: 0, y: 0 });

    if (entry.memo) {
      const memo  = (entry.memo  || []).map((n, i) => ({ ...n, group: 1, id: 'memo_' + i }));
      const imgMs = (entry.imageMemos || []).map((n, i) => ({ ...n, group: 1, id: 'img_' + i }));
      const memoAll = [...memo, ...imgMs];
      const near  = (entry.near  || []).map((n, i) => ({ ...n, group: 2, id: 'near_' + i }));
      const mid   = (entry.mid   || []).map((n, i) => ({ ...n, group: 3, id: 'mid_' + i }));
      const far   = (entry.far   || []).map((n, i) => ({ ...n, group: 4, id: 'far_' + i }));
      const unsp  = (entry.unsplash || []).map((n, i) => ({ ...n, group: 5, id: 'unsp_' + i }));
      const { laid: vn, np: pn, cx, cy } = doLayout([...memoAll, ...near]);
      const { laid: vm, np: pm }         = doLayout([...memoAll, ...mid]);
      const { laid: vf, np: pf }         = doLayout([...memoAll, ...far]);
      const { laid: vi, np: pi }         = doLayout([...memoAll, ...unsp]);
      setMemoNodes(vn.filter(n => n.group === 1));
      setPools({
        near: vn.filter(n => n.group === 2), nearPos: pn,
        mid:  vm.filter(n => n.group === 3), midPos:  pm,
        far:  vf.filter(n => n.group === 4), farPos:  pf,
        img:  vi.filter(n => n.group === 5), imgPos:  pi,
      });
      setPos({ ...pn, __t: { x: cx - 100, y: cy - 14 } });
    } else if (entry.nodes) {
      const restoredNodes = entry.nodes.map((n, i) =>
        n._anim != null ? n : { ...n, _anim: i % 6, _dur: 10 + i * 0.4, _delay: -i * 1.2 }
      );
      setMemoNodes(restoredNodes);
      setPools({ near: [], mid: [], far: [], img: [] });
      const { np } = doLayout(restoredNodes);
      setPos(np);
    }
    setDist(0);
    setShowHist(false);
  };

  /* ── サイズ変更（ダブルクリック）── */
  const cycleSize = (id) => {
    setSizes(prev => {
      const cur = prev[id] || 1;
      const next = cur >= 1.4 ? 0.7 : cur <= 0.8 ? 1 : 1.5;
      return { ...prev, [id]: next };
    });
  };

  /* ── ドラッグ（マウス）── */
  const startDrag = (id, e) => {
    const p = pos[id]; if (!p) return;
    setDrag(id);
    setOff({ x: e.clientX - (p.x * zoom + pan.x), y: e.clientY - (p.y * zoom + pan.y) });
    e.preventDefault();
    e.stopPropagation();
  };

  const onMouseMove = (e) => {
    if (drag) {
      setPos(p => ({ ...p, [drag]: { x: (e.clientX - off.x - pan.x) / zoom, y: (e.clientY - off.y - pan.y) / zoom } }));
    } else if (panStart) {
      setPan({
        x: panStart.panX + e.clientX - panStart.mouseX,
        y: panStart.panY + e.clientY - panStart.mouseY,
      });
    }
  };

  const endAll = () => { setDrag(null); setPanStart(null); };

  const startCanvasPan = (e) => {
    setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y });
  };

  /* ── ホイール/2本指でズーム ── */
  const onWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // 拡大率は控えめに
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newZoom = Math.max(0.25, Math.min(2, zoom * factor));
    // マウス位置を中心にズーム
    const nx = mx - (mx - pan.x) * (newZoom / zoom);
    const ny = my - (my - pan.y) * (newZoom / zoom);
    setZoom(newZoom);
    setPan({ x: nx, y: ny });
  };

  const fitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  /* ── ドラッグ（タッチ）── */
  const startTouch = (id, e) => {
    const t = e.touches[0];
    const p = pos[id]; if (!p) return;
    setDrag(id);
    setOff({ x: t.clientX - (p.x * zoom + pan.x), y: t.clientY - (p.y * zoom + pan.y) });
  };
  const onTouchMove = (e) => {
    if (!drag) return;
    const t = e.touches[0];
    setPos(p => ({ ...p, [drag]: { x: (t.clientX - off.x - pan.x) / zoom, y: (t.clientY - off.y - pan.y) / zoom } }));
    e.preventDefault();
  };

  const addSpark = (sp) => save({ ...data, sparks: [...data.sparks, sp] });
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 680;

  const zoomBtnStyle = {
    width: 28, height: 28, border: 'none', background: C.bg2,
    borderRadius: '50%', fontSize: 17, fontWeight: 700, color: C.text,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', padding: 0,
  };

  const tabBar = (
    <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: '#FDFBF8', flexShrink: 0 }}>
      <button
        onClick={() => setCwTab('synapse')}
        style={{
          flex: 1, padding: '12px 8px', border: 'none', background: 'transparent',
          fontFamily: 'inherit', fontSize: 15, fontWeight: cwTab === 'synapse' ? 700 : 500,
          color: cwTab === 'synapse' ? C.accent2 : C.sub,
          borderBottom: `2.5px solid ${cwTab === 'synapse' ? C.accent2 : 'transparent'}`,
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >☁️ Cloud Synapse</button>
      <button
        onClick={() => setCwTab('buddy')}
        style={{
          flex: 1, padding: '12px 8px', border: 'none', background: 'transparent',
          fontFamily: 'inherit', fontSize: 15, fontWeight: cwTab === 'buddy' ? 700 : 500,
          color: cwTab === 'buddy' ? C.accent2 : C.sub,
          borderBottom: `2.5px solid ${cwTab === 'buddy' ? C.accent2 : 'transparent'}`,
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >☕ Wandering Buddy</button>
    </div>
  );

  if (cwTab === 'buddy') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tabBar}
        <WanderingBuddy data={data} save={save} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {tabBar}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}
        onMouseMove={onMouseMove}
        onMouseUp={endAll}
        onTouchMove={onTouchMove}
        onTouchEnd={endAll}
      >
      {/* ── サイドパネル ── */}
      {(!isMobile || sideOpen) && (
        <div style={{
          width: 280, padding: 20,
          borderRight: `1px solid ${C.border}`,
          background: '#FDFBF8',
          display: 'flex', flexDirection: 'column',
          flexShrink: 0, overflowY: 'auto',
          ...(isMobile ? { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 20, boxShadow: '4px 0 16px rgba(0,0,0,0.1)' } : {}),
        }}>
          {isMobile && (
            <button style={{ ...S.iconBtn, alignSelf: 'flex-end', marginBottom: 8 }} onClick={() => setSideOpen(false)}>✕</button>
          )}

          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Cloud Synapse</div>
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>Creative Wandering 空間</div>

          {/* 距離パラメータ */}
          {hasData && (
            <div style={{ background: C.bg2, borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>距離パラメータ</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {DIST_INFO.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => switchDist(i)}
                    disabled={i === 3 && (!pools.img || pools.img.length === 0)}
                    style={{
                      flex: '1 1 calc(50% - 4px)', padding: '8px 4px', borderRadius: 8,
                      border: `1.5px solid ${dist === i ? d.c : C.border}`,
                      background: dist === i ? d.c + '15' : '#fff',
                      color: dist === i ? d.c : C.sub,
                      fontSize: 13, fontWeight: dist === i ? 700 : 400,
                      cursor: i === 3 && (!pools.img || pools.img.length === 0) ? 'not-allowed' : 'pointer',
                      opacity: i === 3 && (!pools.img || pools.img.length === 0) ? 0.4 : 1,
                      fontFamily: 'inherit', transition: 'all 0.2s',
                    }}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 13, color: C.textLight, lineHeight: 1.5, textAlign: 'center' }}>
                {DIST_INFO[dist].desc}
              </div>
              <div style={{ fontSize: 13, color: C.sub, textAlign: 'center', marginTop: 4 }}>
                メモ {memoNodes.length} + 刺激 {stimNodes.length} 表示中
              </div>
              <div style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 2 }}>
                [近{pools.near?.length || 0} / やや遠{pools.mid?.length || 0} / 遠{pools.far?.length || 0} / 画{pools.img?.length || 0}]
              </div>
            </div>
          )}

          {/* 凡例 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />お題（中心）</div>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#8BBE2C', flexShrink: 0 }} />記憶・メモ — 常に表示</div>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />近い — お題のそばの情景</div>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />やや遠い — 感覚で繋がる</div>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#6E5DC6', flexShrink: 0 }} />遠い — 化学反応の種</div>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#E67E22', flexShrink: 0 }} />🖼 画像 — メモ写真 + Unsplash</div>
          </div>

          <div style={{ fontSize: 13, color: C.sub, marginBottom: 2 }}>💡 ダブルクリックでサイズ変更</div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 2 }}>🖐 背景ドラッグでスクロール</div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 14 }}>🔍 ホイール/2本指で拡大縮小</div>

          {/* 履歴 */}
          {history.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <button style={{ ...S.txtBtn, fontSize: 14, color: C.accent }} onClick={() => setShowHist(!showHist)}>
                📂 過去の空間 ({history.length}) {showHist ? '▲' : '▼'}
              </button>
              {showHist && (
                <div style={{ marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }} onClick={() => loadHist(h)}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{h.topic}</div>
                      <div style={{ fontSize: 13, color: C.sub }}>{fmtD(h.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 'auto' }}>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6 }}>❶ お題をセット</div>
            <textarea
              style={{ ...S.inp, minHeight: 60, fontSize: 16 }}
              placeholder="思考の種を入力..."
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
            <button style={{ ...S.pri, fontSize: 16 }} onClick={gen} disabled={loading}>
              {loading ? '生成中…' : '空間を生成する'}
            </button>
            <div style={{ fontSize: 13, color: C.sub, marginTop: 6 }}>ノードはドラッグで移動できます</div>
          </div>
        </div>
      )}

      {/* ── キャンバス ── */}
      <div
        ref={canvasRef}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: `radial-gradient(ellipse at center, #FEFFFE 0%, ${C.bg} 70%)`,
          cursor: panStart ? 'grabbing' : 'default',
        }}
        onMouseDown={startCanvasPan}
        onWheel={onWheel}
      >
        {isMobile && !sideOpen && (
          <button
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 15, padding: '6px 12px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 15, color: C.text, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            onClick={() => setSideOpen(true)}
          >
            ⚙ 設定
          </button>
        )}

        {/* ズームコントロール */}
        {hasData && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 15,
            display: 'flex', gap: 6, alignItems: 'center',
            background: '#fff', border: `1px solid ${C.border}`, borderRadius: 22,
            padding: '4px 6px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}>
            <button onClick={() => setZoom(z => Math.max(0.25, z / 1.15))} style={zoomBtnStyle}>−</button>
            <div style={{ fontSize: 13, color: C.sub, minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(zoom * 100)}%
            </div>
            <button onClick={() => setZoom(z => Math.min(2, z * 1.15))} style={zoomBtnStyle}>＋</button>
            <button onClick={fitToScreen} style={{ ...zoomBtnStyle, width: 'auto', padding: '0 10px', fontSize: 13 }}>全体</button>
          </div>
        )}

        {/* zoom/pan 適用ラッパー */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          pointerEvents: 'none',
        }}>
        {/* トピックラベル */}
        {hasData && pos.__t && (
          <div
            onMouseDown={e => startDrag('__t', e)}
            onTouchStart={e => startTouch('__t', e)}
            style={{
              position: 'absolute',
              left: pos.__t.x,
              top:  pos.__t.y,
              padding: '10px 28px',
              background: 'linear-gradient(135deg,#8BBE2C,#A0D940)',
              borderRadius: 28,
              fontSize: 19, fontWeight: 800, color: '#fff',
              cursor: drag === '__t' ? 'grabbing' : 'grab',
              userSelect: 'none', zIndex: 10,
              boxShadow: '0 4px 16px rgba(139,190,44,0.3)',
              whiteSpace: 'nowrap',
              touchAction: 'none',
              pointerEvents: 'auto',
            }}
          >
            {topic}
          </div>
        )}

        {/* ノード */}
        {visibleNodes.map((n) => {
          const p = pos[n.id]; if (!p) return null;
          const gc = GROUP_COLORS[n.group] || GROUP_COLORS[2];
          const scale = sizes[n.id] || 1;
          const isMemoImg = n.group === 1 && n.imageId;
          const isUnsplash = n.group === 5 && n.thumb;
          const isImageNode = isMemoImg || isUnsplash;
          return (
            <div
              key={n.id}
              onMouseDown={e => startDrag(n.id, e)}
              onTouchStart={e => startTouch(n.id, e)}
              onDoubleClick={() => cycleSize(n.id)}
              style={{
                position: 'absolute',
                left: p.x,
                top:  p.y,
                animation: drag === n.id ? 'none' : `cwFloat${n._anim} ${n._dur}s ease-in-out ${n._delay}s infinite`,
                zIndex: drag === n.id ? 10 : n.group === 1 ? 3 : 2,
                cursor: drag === n.id ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none',
                pointerEvents: 'auto',
              }}
            >
              <div style={{
                padding: isImageNode ? '8px' : '8px 16px',
                background: gc.bg,
                border: `1.5px solid ${gc.border}`,
                borderRadius: isImageNode ? 12 : 20,
                fontSize: 16, fontWeight: 600, color: gc.color,
                boxShadow: `0 2px 8px ${gc.border}30`,
                whiteSpace: 'normal',
                maxWidth: isImageNode ? undefined : 360,
                lineHeight: 1.5,
                transform: scale !== 1 ? `scale(${scale})` : undefined,
                transformOrigin: 'top left',
                transition: 'transform 0.2s ease',
                display: 'inline-block',
              }}>
                {isUnsplash ? (
                  <UnsplashNode thumb={n.thumb} alt={n.alt} query={n.query} />
                ) : isMemoImg ? (
                  <ImageNode imageId={n.imageId} text={n.text} />
                ) : (
                  <span>{n.text}</span>
                )}
              </div>
            </div>
          );
        })}
        </div>

        {/* 空状態 */}
        {!hasData && !loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: C.sub }}>
            <div style={{ fontSize: 56, marginBottom: 12, opacity: 0.25 }}>☁️</div>
            <p style={{ fontSize: 17 }}>お題をセットして空間を生成してください</p>
          </div>
        )}

        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 17, color: C.accent, animation: 'cwPulse 1.5s ease-in-out infinite' }}>
              {loadMsg || '生成中…'}
            </div>
          </div>
        )}
      </div>

      <button style={S.fab} onClick={() => setShowM(true)}>💡</button>
      {showM && <QuickMemo onSave={addSpark} onClose={() => setShowM(false)} />}

      <style>{`
        @keyframes cwPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes cwFloat0 { 0%,100%{transform:translate(0,0)}   50%{transform:translate(5px,-7px)}  }
        @keyframes cwFloat1 { 0%,100%{transform:translate(0,0)}   50%{transform:translate(-7px,5px)}  }
        @keyframes cwFloat2 { 0%,100%{transform:translate(0,0)}   50%{transform:translate(4px,6px)}   }
        @keyframes cwFloat3 { 0%,100%{transform:translate(0,0)}   50%{transform:translate(-5px,-5px)} }
        @keyframes cwFloat4 { 0%,100%{transform:translate(0,0)}   50%{transform:translate(6px,4px)}   }
        @keyframes cwFloat5 { 0%,100%{transform:translate(0,0)}   50%{transform:translate(-4px,7px)}  }
      `}</style>
      </div>
    </div>
  );
}
