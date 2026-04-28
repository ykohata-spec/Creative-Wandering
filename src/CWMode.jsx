import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { C, S, uid, now, fmtD } from './constants.js';
import { callGemini, CW_MEMO_SYS, CW_STIM_SYS } from './gemini.js';
import { getApiKey, getImage } from './storage.js';
import QuickMemo from './QuickMemo.jsx';

const GROUP_COLORS = {
  1: { bg: '#EEFFC2', border: '#8BBE2C', color: '#5A8010' },
  2: { bg: '#DBEAFE', border: '#3B82F6', color: '#2563EB' },
  3: { bg: '#FFF3D0', border: '#F59E0B', color: '#D97706' },
  4: { bg: '#EDE5FF', border: '#6E5DC6', color: '#5B4AA8' },
};

const DIST_INFO = [
  { l: '近い',     c: '#3B82F6', desc: '同じ世界の言葉' },
  { l: 'やや遠い', c: '#F59E0B', desc: '隣の世界の言葉' },
  { l: '遠い',     c: '#6E5DC6', desc: '対極の世界の言葉' },
];

/* ── 画像ノード用コンポーネント ── */
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
      <div style={{ fontSize: 11, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</div>
    </div>
  );
}

export default function CWMode({ data, save }) {
  const [memoNodes, setMemoNodes] = useState([]);
  const [pools,     setPools]     = useState({ near: [], mid: [], far: [] });
  const [pos,       setPos]       = useState({});
  const [sizes,     setSizes]     = useState({});
  const [pan,       setPan]       = useState({ x: 0, y: 0 });
  const [loading,   setLoading]   = useState(false);
  const [loadMsg,   setLoadMsg]   = useState('');
  const [topic,     setTopic]     = useState(data.projects[data.projects.length - 1]?.title || '');
  const [showM,     setShowM]     = useState(false);
  const [showHist,  setShowHist]  = useState(false);
  const [sideOpen,  setSideOpen]  = useState(false);
  const [drag,      setDrag]      = useState(null);
  const [off,       setOff]       = useState({ x: 0, y: 0 });
  const [panStart,  setPanStart]  = useState(null);
  const [dist,      setDist]      = useState(0);
  const canvasRef = useRef(null);
  const history   = data.cwHistory || [];

  const stimNodes = [pools.near, pools.mid, pools.far][dist] || [];
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

    try {
      setLoadMsg('メモを解析中…(1/2)');
      const r1 = await callWithRetry(apiKey, CW_MEMO_SYS, 'お題: ' + topic + '\n' + memoCtx, 'memo');

      await delay(2000);
      setLoadMsg('3距離の刺激を一括生成中…(2/2)');
      const r2 = await callWithRetry(apiKey, CW_STIM_SYS, 'お題: ' + topic, 'stim');

      setLoadMsg('空間を構築中…');

      const memo = tryParse(r1, 'memo').map((n, i) => ({ ...n, group: 1, id: 'memo_' + i }));

      const stimRaw = tryParse(r2, 'stim');
      const nearRaw = Array.isArray(stimRaw) ? stimRaw : (stimRaw.near || []);
      const midRaw  = Array.isArray(stimRaw) ? [] : (stimRaw.mid || []);
      const farRaw  = Array.isArray(stimRaw) ? [] : (stimRaw.far || []);

      const near = nearRaw.map((n, i) => ({ ...n, group: 2, id: 'near_' + i }));
      const mid  = midRaw.map((n, i) => ({ ...n, group: 3, id: 'mid_' + i }));
      const far  = farRaw.map((n, i) => ({ ...n, group: 4, id: 'far_' + i }));

      const { laid: viewNear, np: posNear, cx, cy } = doLayout([...memo, ...near]);
      const { laid: viewMid,  np: posMid }           = doLayout([...memo, ...mid]);
      const { laid: viewFar,  np: posFar }           = doLayout([...memo, ...far]);

      const memoLaid = viewNear.filter(n => n.group === 1);
      const stimNear = viewNear.filter(n => n.group === 2);
      const stimMid  = viewMid.filter(n => n.group === 3);
      const stimFar  = viewFar.filter(n => n.group === 4);

      setMemoNodes(memoLaid);
      setPools({
        near: stimNear, nearPos: posNear,
        mid:  stimMid,  midPos:  posMid,
        far:  stimFar,  farPos:  posFar,
      });
      setPos({ ...posNear, __t: { x: cx - 100, y: cy - 14 } });
      setDist(0);

      const entry = { id: uid(), topic: topic.trim(), memo, near, mid, far, createdAt: now() };
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
    const poolPos = [pools.nearPos, pools.midPos, pools.farPos][level];
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
      const memo = (entry.memo || []).map((n, i) => ({ ...n, group: 1, id: 'memo_' + i }));
      const near = (entry.near || []).map((n, i) => ({ ...n, group: 2, id: 'near_' + i }));
      const mid  = (entry.mid  || []).map((n, i) => ({ ...n, group: 3, id: 'mid_' + i }));
      const far  = (entry.far  || []).map((n, i) => ({ ...n, group: 4, id: 'far_' + i }));
      const { laid: vn, np: pn, cx, cy } = doLayout([...memo, ...near]);
      const { laid: vm, np: pm }         = doLayout([...memo, ...mid]);
      const { laid: vf, np: pf }         = doLayout([...memo, ...far]);
      setMemoNodes(vn.filter(n => n.group === 1));
      setPools({
        near: vn.filter(n => n.group === 2), nearPos: pn,
        mid:  vm.filter(n => n.group === 3), midPos:  pm,
        far:  vf.filter(n => n.group === 4), farPos:  pf,
      });
      setPos({ ...pn, __t: { x: cx - 100, y: cy - 14 } });
    } else if (entry.nodes) {
      const restoredNodes = entry.nodes.map((n, i) =>
        n._anim != null ? n : { ...n, _anim: i % 6, _dur: 10 + i * 0.4, _delay: -i * 1.2 }
      );
      setMemoNodes(restoredNodes);
      setPools({ near: [], mid: [], far: [] });
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
    setOff({ x: e.clientX - p.x - pan.x, y: e.clientY - p.y - pan.y });
    e.preventDefault();
    e.stopPropagation();
  };

  const onMouseMove = (e) => {
    if (drag) {
      setPos(p => ({ ...p, [drag]: { x: e.clientX - off.x - pan.x, y: e.clientY - off.y - pan.y } }));
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

  /* ── ドラッグ（タッチ）── */
  const startTouch = (id, e) => {
    const t = e.touches[0];
    const p = pos[id]; if (!p) return;
    setDrag(id);
    setOff({ x: t.clientX - p.x - pan.x, y: t.clientY - p.y - pan.y });
  };
  const onTouchMove = (e) => {
    if (!drag) return;
    const t = e.touches[0];
    setPos(p => ({ ...p, [drag]: { x: t.clientX - off.x - pan.x, y: t.clientY - off.y - pan.y } }));
    e.preventDefault();
  };

  const addSpark = (sp) => save({ ...data, sparks: [...data.sparks, sp] });
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 680;

  return (
    <div
      style={{ ...S.cenC, flexDirection: 'row' }}
      onMouseMove={onMouseMove}
      onMouseUp={endAll}
      onTouchMove={onTouchMove}
      onTouchEnd={endAll}
    >
      {/* ── サイドパネル ── */}
      {(!isMobile || sideOpen) && (
        <div style={{
          width: 220, padding: 20,
          borderRight: `1px solid ${C.border}`,
          background: '#FDFBF8',
          display: 'flex', flexDirection: 'column',
          flexShrink: 0, overflowY: 'auto',
          ...(isMobile ? { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 20, boxShadow: '4px 0 16px rgba(0,0,0,0.1)' } : {}),
        }}>
          {isMobile && (
            <button style={{ ...S.iconBtn, alignSelf: 'flex-end', marginBottom: 8 }} onClick={() => setSideOpen(false)}>✕</button>
          )}

          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Cloud Synapse</div>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 14 }}>Creative Wandering 空間</div>

          {/* 距離パラメータ */}
          {hasData && (
            <div style={{ background: C.bg2, borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>距離パラメータ</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {DIST_INFO.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => switchDist(i)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8,
                      border: `1.5px solid ${dist === i ? d.c : C.border}`,
                      background: dist === i ? d.c + '15' : '#fff',
                      color: dist === i ? d.c : C.sub,
                      fontSize: 11, fontWeight: dist === i ? 700 : 400,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                    }}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.textLight, lineHeight: 1.5, textAlign: 'center' }}>
                {DIST_INFO[dist].desc}
              </div>
              <div style={{ fontSize: 10, color: C.sub, textAlign: 'center', marginTop: 4 }}>
                メモ {memoNodes.length} + 刺激 {stimNodes.length} 表示中
              </div>
              <div style={{ fontSize: 9, color: C.sub, textAlign: 'center', marginTop: 2 }}>
                [近{pools.near?.length || 0} / やや遠{pools.mid?.length || 0} / 遠{pools.far?.length || 0}]
              </div>
            </div>
          )}

          {/* 凡例 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />お題（中心）</div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#8BBE2C', flexShrink: 0 }} />記憶・メモ — 常に表示</div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />近い — 同じ世界の言葉</div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />やや遠い — 隣の世界の言葉</div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#6E5DC6', flexShrink: 0 }} />遠い — 対極の世界の言葉</div>
          </div>

          <div style={{ fontSize: 10, color: C.sub, marginBottom: 2 }}>💡 ダブルクリックでサイズ変更</div>
          <div style={{ fontSize: 10, color: C.sub, marginBottom: 14 }}>🖐 背景ドラッグでスクロール</div>

          {/* 履歴 */}
          {history.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <button style={{ ...S.txtBtn, fontSize: 11, color: C.accent }} onClick={() => setShowHist(!showHist)}>
                📂 過去の空間 ({history.length}) {showHist ? '▲' : '▼'}
              </button>
              {showHist && (
                <div style={{ marginTop: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }} onClick={() => loadHist(h)}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{h.topic}</div>
                      <div style={{ fontSize: 10, color: C.sub }}>{fmtD(h.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 'auto' }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6 }}>❶ お題をセット</div>
            <textarea
              style={{ ...S.inp, minHeight: 60, fontSize: 13 }}
              placeholder="思考の種を入力..."
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
            <button style={{ ...S.pri, fontSize: 13 }} onClick={gen} disabled={loading}>
              {loading ? '生成中…' : '空間を生成する'}
            </button>
            <div style={{ fontSize: 10, color: C.sub, marginTop: 6 }}>ノードはドラッグで移動できます</div>
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
      >
        {isMobile && !sideOpen && (
          <button
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 15, padding: '6px 12px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 12, color: C.text, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            onClick={() => setSideOpen(true)}
          >
            ⚙ 設定
          </button>
        )}

        {/* トピックラベル */}
        {hasData && pos.__t && (
          <div
            onMouseDown={e => startDrag('__t', e)}
            onTouchStart={e => startTouch('__t', e)}
            style={{
              position: 'absolute',
              left: pos.__t.x + pan.x,
              top:  pos.__t.y + pan.y,
              padding: '10px 28px',
              background: 'linear-gradient(135deg,#8BBE2C,#A0D940)',
              borderRadius: 28,
              fontSize: 16, fontWeight: 800, color: '#fff',
              cursor: drag === '__t' ? 'grabbing' : 'grab',
              userSelect: 'none', zIndex: 10,
              boxShadow: '0 4px 16px rgba(139,190,44,0.3)',
              whiteSpace: 'nowrap',
              touchAction: 'none',
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
          const isImg = n.group === 1 && n.imageId;
          return (
            <div
              key={n.id}
              onMouseDown={e => startDrag(n.id, e)}
              onTouchStart={e => startTouch(n.id, e)}
              onDoubleClick={() => cycleSize(n.id)}
              style={{
                position: 'absolute',
                left: p.x + pan.x,
                top:  p.y + pan.y,
                animation: drag === n.id ? 'none' : `cwFloat${n._anim} ${n._dur}s ease-in-out ${n._delay}s infinite`,
                zIndex: drag === n.id ? 10 : n.group === 1 ? 3 : 2,
                cursor: drag === n.id ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none',
              }}
            >
              <div style={{
                padding: isImg ? '8px' : '8px 16px',
                background: gc.bg,
                border: `1.5px solid ${gc.border}`,
                borderRadius: isImg ? 12 : 20,
                fontSize: 13, fontWeight: 600, color: gc.color,
                boxShadow: `0 2px 8px ${gc.border}30`,
                whiteSpace: 'normal',
                maxWidth: isImg ? undefined : 360,
                lineHeight: 1.5,
                transform: scale !== 1 ? `scale(${scale})` : undefined,
                transformOrigin: 'top left',
                transition: 'transform 0.2s ease',
                display: 'inline-block',
              }}>
                {isImg ? (
                  <ImageNode imageId={n.imageId} text={n.text} />
                ) : (
                  <span>{n.text}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* 空状態 */}
        {!hasData && !loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: C.sub }}>
            <div style={{ fontSize: 52, marginBottom: 12, opacity: 0.25 }}>☁️</div>
            <p style={{ fontSize: 14 }}>お題をセットして空間を生成してください</p>
          </div>
        )}

        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.accent, animation: 'cwPulse 1.5s ease-in-out infinite' }}>
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
  );
}
