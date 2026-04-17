import { useState, useRef, useCallback, useEffect } from 'react';
import { C, S, uid, now, fmtD } from './constants.js';
import { callGemini, CW_SYS } from './gemini.js';
import { getApiKey, getImage } from './storage.js';
import QuickMemo from './QuickMemo.jsx';

const GROUP_STYLE = {
  internal: { bg: '#EEFFC2', border: '#8BBE2C', color: '#4A7010' },
  external: { bg: '#EDE5FF', border: '#6E5DC6', color: '#4C3D9E' },
  image:    { bg: '#FFF5E6', border: '#D4956A', color: '#7A4A20' },
};

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
  const [nodes,    setNodes]    = useState([]);
  const [pos,      setPos]      = useState({});
  const [sizes,    setSizes]    = useState({});        /* nodeId → scale数値 */
  const [pan,      setPan]      = useState({ x: 0, y: 0 });
  const [loading,  setLoading]  = useState(false);
  const [topic,    setTopic]    = useState(data.projects[data.projects.length - 1]?.title || '');
  const [showM,    setShowM]    = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [drag,     setDrag]     = useState(null);
  const [off,      setOff]      = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState(null);     /* キャンバスパン開始情報 */
  const canvasRef = useRef(null);
  const history   = data.cwHistory || [];

  /* ── レイアウト ── */
  const buildPositions = useCallback((nodeList) => {
    const cw = canvasRef.current?.clientWidth  || 900;
    const ch = canvasRef.current?.clientHeight || 700;
    const cx = Math.max(cw, 1100) / 2;
    const cy = Math.max(ch,  900) / 2;
    const total  = nodeList.length;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const np = { __t: { x: cx - 80, y: cy - 16 } };
    nodeList.forEach((n, i) => {
      const isNear = n.group === 'internal' || n.group === 'image';
      const angle = i * golden + Math.random() * 0.3;
      const minR  = isNear ? 100 : 200;
      const maxR  = isNear ? 220 : Math.min(cx, cy) * 0.82;
      const r     = minR + (maxR - minR) * Math.sqrt((i + 1) / total) * (0.9 + Math.random() * 0.2);
      np[n.id] = {
        x: Math.max(8, cx + Math.cos(angle) * r - 60),
        y: Math.max(8, cy + Math.sin(angle) * r - 14),
      };
    });
    return np;
  }, []);

  /* ── 生成 ── */
  const gen = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setSizes({});
    setPan({ x: 0, y: 0 });

    const memoCtx = data.memos.length > 0
      ? '\n\nユーザーのメモ箱:\n' + data.memos.map(m => `[ID:${m.id}] ${m.title ? m.title + ': ' : ''}${m.content}`).join('\n')
      : '\n\nユーザーのメモ箱: (空)';

    const res = await callGemini(getApiKey(), CW_SYS, `お題: ${topic}${memoCtx}`, true);

    /* API自体がエラー文字列を返した場合 */
    if (typeof res === 'string' && (res.startsWith('APIエラー') || res.startsWith('接続エラー') || res.startsWith('⚠️'))) {
      const errNode = [{ id: uid(), text: res, group: 'external', _anim: 0, _dur: 10, _delay: 0 }];
      setNodes(errNode);
      setPos(buildPositions(errNode));
      setLoading(false);
      return;
    }

    try {
      const clean  = res.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(clean);

      const internalNodes = (parsed.internal_words || []).map((w, i) => ({
        id: uid(), text: w.text || w, group: 'internal', sourceId: w.id || null,
        _anim: i % 6, _dur: 10 + Math.random() * 8, _delay: Math.random() * -20,
      }));
      const externalNodes = (parsed.external_words || []).map((w, i) => ({
        id: uid(), text: typeof w === 'string' ? w : w.text || '', group: 'external',
        _anim: i % 6, _dur: 12 + Math.random() * 10, _delay: Math.random() * -20,
      }));

      /* 画像メモをランダムで最大5件追加 */
      const usedIds = new Set(internalNodes.map(n => n.sourceId).filter(Boolean));
      const imageMemos = data.memos
        .filter(m => m.imageId && !usedIds.has(m.id))
        .sort(() => 0.5 - Math.random())
        .slice(0, 5);
      const imageNodes = imageMemos.map((m, i) => ({
        id: uid(),
        text: m.title || m.content.substring(0, 12) || '画像',
        group: 'image',
        imageId: m.imageId,
        _anim: i % 6, _dur: 14 + Math.random() * 8, _delay: Math.random() * -20,
      }));

      const allNodes = [...internalNodes, ...externalNodes, ...imageNodes];
      setNodes(allNodes);
      setPos(buildPositions(allNodes));

      const entry   = { id: uid(), topic: topic.trim(), nodes: allNodes, createdAt: now() };
      const newHist = [entry, ...history].slice(0, 10);
      save({ ...data, cwHistory: newHist });
    } catch (e) {
      console.error('CW parse error', e, res);
      const errNode = [{ id: uid(), text: `JSON解析エラー: ${e.message}`, group: 'external', _anim: 0, _dur: 10, _delay: 0 }];
      setNodes(errNode);
      setPos(buildPositions(errNode));
    }
    setLoading(false);
  };

  /* ── 履歴復元 ── */
  const loadHist = (entry) => {
    setTopic(entry.topic);
    setSizes({});
    setPan({ x: 0, y: 0 });
    const restoredNodes = entry.nodes.map((n, i) =>
      n._anim != null ? n : { ...n, _anim: i % 6, _dur: 10 + i * 0.4, _delay: -i * 1.2 }
    );
    setNodes(restoredNodes);
    setPos(buildPositions(restoredNodes));
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
    e.stopPropagation(); /* キャンバスパンを起動させない */
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

  /* ── キャンバスパン ── */
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

          {[
            { c: C.accent,  label: '私のメモから' },
            { c: C.accent2, label: 'Deep Research' },
            { c: '#D4956A', label: '画像メモ' },
          ].map(({ c, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, color: C.sub }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
              {label}
            </div>
          ))}

          <div style={{ fontSize: 10, color: C.sub, marginTop: 6, marginBottom: 2 }}>💡 ダブルクリックでサイズ変更</div>
          <div style={{ fontSize: 10, color: C.sub, marginBottom: 14 }}>🖐 背景ドラッグでスクロール</div>

          {history.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <button style={{ ...S.txtBtn, fontSize: 11, color: C.accent }} onClick={() => setShowHist(!showHist)}>
                📂 過去の空間 ({history.length}) {showHist ? '▲' : '▼'}
              </button>
              {showHist && (
                <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {history.map(h => (
                    <div key={h.id} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }} onClick={() => loadHist(h)}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{h.topic}</div>
                      <div style={{ fontSize: 10, color: C.sub }}>{fmtD(h.createdAt)} · {h.nodes.length}語</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 'auto' }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6 }}>❶ お題をセット</div>
            <textarea
              style={{ ...S.inp, minHeight: 64, fontSize: 13 }}
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
        {nodes.length > 0 && pos.__t && (
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
        {nodes.map((n) => {
          const p = pos[n.id]; if (!p) return null;
          const gs    = GROUP_STYLE[n.group] || GROUP_STYLE.external;
          const scale = sizes[n.id] || 1;
          const isImg = n.group === 'image';
          return (
            /* 外側div: 位置・ドラッグ・アニメーション */
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
                zIndex: drag === n.id ? 10 : 2,
                cursor: drag === n.id ? 'grabbing' : 'grab',
                userSelect: 'none',
                touchAction: 'none',
              }}
              title={isImg ? '画像メモ（ダブルクリックでサイズ変更）' : n.group === 'internal' ? 'メモから引用' : 'AI生成'}
            >
              {/* 内側div: 見た目・スケール（アニメーションのtransformと分離） */}
              <div style={{
                padding: isImg ? '8px' : '8px 16px',
                background: gs.bg,
                border: `1.5px solid ${gs.border}`,
                borderRadius: isImg ? 12 : 20,
                fontSize: 13, fontWeight: 600, color: gs.color,
                boxShadow: `0 2px 8px ${gs.border}30`,
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
                  <>
                    {n.text}
                    {n.group === 'internal' && (
                      <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.6 }}>📌</span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* 空状態 */}
        {nodes.length === 0 && !loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: C.sub }}>
            <div style={{ fontSize: 52, marginBottom: 12, opacity: 0.25 }}>☁️</div>
            <p style={{ fontSize: 14 }}>お題をセットして空間を生成してください</p>
          </div>
        )}

        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.accent, animation: 'cwPulse 1.5s ease-in-out infinite' }}>
              Deep Research 実行中…
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
