import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { C, S, MODES, TABS, SCENES, SIZES, WANDER, uid, pick, now, fmtD, fmtT, imgUrl } from './constants.js';
import { loadData, saveData, emptyData, clearAllData, getApiKey, setApiKey, saveImage, getImage, deleteImage, resizeImage, exportAllData, importAllData } from './storage.js';
import { callGemini, CEN_SYS } from './gemini.js';
import { memosToCSV, csvToMemos } from './csv.js';
import CWMode from './CWMode.jsx';
import QuickMemo from './QuickMemo.jsx';

/* ═══ useData hook ═══ */
function useData() {
  const [data, setData] = useState(() => loadData());
  const save = useCallback((next) => { setData(next); saveData(next); }, []);
  return { data, save };
}

/* ═══ MemoImage — loads from IndexedDB or URL ═══ */
function MemoImage({ imageId, style, onError }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getImage(imageId).then(url => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [imageId]);
  if (!src) return null;
  return <img src={src} alt="" style={style} onError={e => { e.currentTarget.style.display = 'none'; onError?.(); }} />;
}

/* ═══ SuggestInput ═══ */
function SuggestInput({ value, onChange, suggestions, placeholder, style: ext }) {
  const [focused, setFocused] = useState(false);
  const filtered = suggestions.filter(s => s && (!value || s.toLowerCase().includes(value.toLowerCase())) && s !== value);
  const show = focused && filtered.length > 0;
  return (
    <div style={{ position: 'relative', flex: ext?.flex }}>
      <input
        style={{ ...S.inp, ...ext, marginBottom: show ? 0 : 8 }}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {show && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: `1px solid ${C.border}`, borderRadius: '0 0 8px 8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: 120, overflowY: 'auto' }}>
          {filtered.slice(0, 8).map((s, i) => (
            <div key={i} style={{ padding: '6px 12px', fontSize: 12, color: C.text, cursor: 'pointer', borderBottom: `1px solid ${C.border}20` }} onMouseDown={() => onChange(s)}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ Settings modal ═══ */
function Settings({ onClose, onImport }) {
  const [key, setKey] = useState(getApiKey());
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);
  const impRef = useRef(null);
  const save = () => { setApiKey(key); onClose(); };

  const doExport = async () => {
    const json = await exportAllData();
    const b = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `creative-wandering-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setMsg('エクスポート完了');
  };

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const text = await file.text();
      const restored = await importAllData(text);
      onImport(restored);
      setMsg(`インポート完了（メモ${restored.memos?.length || 0}件）`);
    } catch (err) {
      setMsg('エラー: ' + err.message);
    }
    setImporting(false);
    e.target.value = '';
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '0 auto 16px' }} />
        <h3 style={{ ...S.sec, marginBottom: 16 }}>⚙ 設定</h3>

        <p style={{ fontSize: 13, color: C.textLight, lineHeight: 1.7, marginBottom: 12 }}>
          Gemini APIキーを設定してください。<br />
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: C.link }}>Google AI Studio</a> で無料取得できます（Googleアカウントのみ）。
        </p>

        <input
          type="password"
          style={S.inp}
          placeholder="AIza..."
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
        />
        {key && (
          <p style={{ fontSize: 11, color: C.sub, marginBottom: 8 }}>
            ※ このキーはあなたのブラウザにのみ保存されます。
          </p>
        )}
        <button style={S.pri} onClick={save}>保存する</button>

        {/* ── データ移行 ── */}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 20, paddingTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>📦 データ移行</div>
          <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>
            メモ・お題・画像など全データを1つのファイルで別デバイスに移行できます。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.pri, flex: 1, background: C.accent2 }} onClick={doExport}>エクスポート ↓</button>
            <button style={{ ...S.pri, flex: 1, background: C.bg2, color: C.text }} onClick={() => impRef.current?.click()} disabled={importing}>
              {importing ? '読込中...' : 'インポート ↑'}
            </button>
            <input ref={impRef} type="file" accept=".json" style={{ display: 'none' }} onChange={doImport} />
          </div>
          {msg && <p style={{ fontSize: 12, color: msg.startsWith('エラー') ? '#D07070' : '#22C55E', marginTop: 8 }}>{msg}</p>}
        </div>

        <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
      </div>
    </div>
  );
}

/* ═══ MemoDetail — view / edit modal ═══ */
function MemoDetail({ memo, onSave, onDelete, onClose, suggestions }) {
  const [ed,  setEd]  = useState(false);
  const [ti,  sTi]    = useState(memo.title   || '');
  const [co,  sCo]    = useState(memo.content || '');
  const [iid, sIid]   = useState(memo.imageId || null);
  const [iPrev, setIPrev] = useState(null);
  const [ur,  sUr]    = useState(memo.url     || '');
  const [tg,  sTg]    = useState(memo.tag     || '');
  const [pl,  sPl]    = useState(memo.place   || '');
  const [st,  sSt]    = useState(memo.state   || '');
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef(null);

  /* load preview for existing image */
  useEffect(() => {
    if (iid) getImage(iid).then(setIPrev);
  }, [iid]);

  const handleImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await resizeImage(file);
    if (!dataUrl) return;
    const newId = 'img-' + uid();
    await saveImage(newId, dataUrl);
    /* delete old image if replaced */
    if (iid) await deleteImage(iid);
    sIid(newId);
    setIPrev(dataUrl);
  };

  const handlePaste = async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); await handleImageFile(item.getAsFile()); }
  };

  const removeImage = async () => {
    if (iid) await deleteImage(iid);
    sIid(null); setIPrev(null);
  };

  const doSave = () => {
    onSave({ ...memo, title: ti.trim() || null, content: co.trim(), imageId: iid, url: ur.trim() || null, tag: tg.trim() || null, place: pl.trim() || null, state: st.trim() || null });
    setEd(false);
  };
  const doDelete = () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    if (memo.imageId) deleteImage(memo.imageId);
    onDelete(memo.id);
    onClose();
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{ed ? '📝 メモを編集' : '📦 メモ詳細'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!ed && <button style={{ ...S.txtBtn, fontSize: 12, color: C.accent }} onClick={() => setEd(true)}>編集</button>}
            <button style={S.iconBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {ed ? (
          <div onPaste={handlePaste}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleImageFile(e.dataTransfer.files?.[0]); }}
          >
            <input style={S.inp} placeholder="題名（任意）" value={ti} onChange={e => sTi(e.target.value)} />
            <textarea style={{ ...S.inp, minHeight: 200 }} placeholder="メモ内容" value={co} onChange={e => sCo(e.target.value)} />

            {/* image area */}
            {iPrev && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img src={iPrev} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                <button onClick={removeImage} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>削除</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button style={{ ...S.txtBtn, fontSize: 12, color: C.accent2, padding: '6px 12px', border: `1px solid ${C.accent2}`, borderRadius: 8 }} onClick={() => fileRef.current?.click()}>
                📷 画像を{iPrev ? '変更' : '追加'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageFile(e.target.files?.[0])} />
              <span style={{ fontSize: 11, color: C.sub, alignSelf: 'center' }}>またはペースト（Ctrl+V）</span>
            </div>

            <input style={S.inp} placeholder="URL（任意）" value={ur} onChange={e => sUr(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <SuggestInput value={tg} onChange={sTg} suggestions={suggestions?.tags || []} placeholder="タグ（任意）" style={{ flex: 1 }} />
              <SuggestInput value={pl} onChange={sPl} suggestions={suggestions?.places || []} placeholder="場所（任意）" style={{ flex: 1 }} />
            </div>
            <SuggestInput value={st} onChange={sSt} suggestions={suggestions?.states || []} placeholder="状態（任意）" />

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...S.pri, flex: 1, padding: '10px', fontSize: 13 }} onClick={doSave}>保存</button>
              <button style={{ ...S.pri, flex: 0, padding: '10px 16px', fontSize: 13, background: C.bg2, color: C.sub }} onClick={() => setEd(false)}>キャンセル</button>
            </div>
            <button
              style={{ ...S.txtBtn, fontSize: 11, color: confirmDel ? '#fff' : '#D07070', background: confirmDel ? '#D07070' : 'transparent', padding: confirmDel ? '4px 12px' : '0', borderRadius: 6, marginTop: 14 }}
              onClick={doDelete}
            >
              {confirmDel ? '本当に削除する' : 'このメモを削除'}
            </button>
          </div>
        ) : (
          <>
            {memo.imageId && (
              <MemoImage imageId={memo.imageId} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 12, objectFit: 'cover', display: 'block', background: C.bg2 }} />
            )}
            {memo.title && <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 6 }}>{memo.title}</div>}
            <div style={{ fontSize: 14, color: C.text, lineHeight: 1.8, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{memo.content}</div>
            {memo.url && <a href={memo.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.link, display: 'block', marginBottom: 8, wordBreak: 'break-all' }}>🔗 {memo.url}</a>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {memo.tag   && <span style={{ ...S.tgSm, fontSize: 12, padding: '3px 8px' }}>#{memo.tag}</span>}
              {memo.place && <span style={{ ...S.tgSm, fontSize: 12, padding: '3px 8px', color: C.accent2 }}>📍 {memo.place}</span>}
              {memo.state && <span style={{ ...S.tgSm, fontSize: 12, padding: '3px 8px', color: '#8B7EB0' }}>🧠 {memo.state}</span>}
            </div>
            <div style={{ fontSize: 11, color: C.sub }}>{fmtD(memo.createdAt)}</div>
          </>
        )}
        <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
      </div>
    </div>
  );
}

/* ═══ MemoTab ═══ */
function MemoTab({ data, save }) {
  const [text,      setText]      = useState('');
  const [title,     setTitle]     = useState('');
  const [url,       setUrl]       = useState('');
  const [tag,       setTag]       = useState('');
  const [place,     setPlace]     = useState('');
  const [state,     setState]     = useState('');
  const [imageId,   setImageId]   = useState(null);
  const [imagePrev, setImagePrev] = useState(null);
  const [showExtra, setShowExtra] = useState(false);
  const [view,      setView]      = useState('gallery');
  const [openMemo,  setOpenMemo]  = useState(null);
  const [selectMode,setSelectMode]= useState(false);
  const [selected,  setSelected]  = useState(new Set());
  const [confirmDel,setConfirmDel]= useState(false);
  const fileRef  = useRef(null);
  const formRef  = useRef(null);

  const suggestions = useMemo(() => ({
    tags:   [...new Set(data.memos.map(m => m.tag).filter(Boolean))],
    places: [...new Set(data.memos.map(m => m.place).filter(Boolean))],
    states: [...new Set(data.memos.map(m => m.state).filter(Boolean))],
  }), [data.memos]);

  /* ── image handling ── */
  const handleImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await resizeImage(file);
    if (!dataUrl) return;
    const newId = 'img-' + uid();
    await saveImage(newId, dataUrl);
    if (imageId) await deleteImage(imageId);
    setImageId(newId);
    setImagePrev(dataUrl);
  };

  const handlePaste = async (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); await handleImageFile(item.getAsFile()); }
  };

  const removeImage = async () => {
    if (imageId) await deleteImage(imageId);
    setImageId(null); setImagePrev(null);
  };

  /* ── add memo ── */
  const add = () => {
    if (!text.trim() && !url.trim() && !imageId) return;
    save({
      ...data,
      memos: [...data.memos, {
        id: uid(), title: title.trim() || null, content: text.trim(),
        imageId: imageId || null, url: url.trim() || null,
        tag: tag.trim() || null, place: place.trim() || null, state: state.trim() || null,
        createdAt: now(),
      }],
    });
    setText(''); setTitle(''); setUrl(''); setTag(''); setPlace(''); setState('');
    setImageId(null); setImagePrev(null);
  };

  const updateMemo = (updated) => { save({ ...data, memos: data.memos.map(m => m.id === updated.id ? updated : m) }); setOpenMemo(updated); };
  const deleteMemo = (id) => { save({ ...data, memos: data.memos.filter(m => m.id !== id) }); };

  /* ── select mode ── */
  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll    = () => setSelected(selected.size === data.memos.length ? new Set() : new Set(data.memos.map(m => m.id)));
  const exitSelect   = () => { setSelectMode(false); setSelected(new Set()); setConfirmDel(false); };
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    for (const id of selected) {
      const m = data.memos.find(x => x.id === id);
      if (m?.imageId) await deleteImage(m.imageId);
    }
    save({ ...data, memos: data.memos.filter(m => !selected.has(m.id)) });
    exitSelect();
  };

  /* ── CSV ── */
  const csvRef = useRef(null);
  const expCSV = () => {
    const b = new Blob([memosToCSV(data.memos)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'memo_box.csv'; a.click();
  };
  const impCSV = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const imported = csvToMemos(ev.target.result);
      if (imported.length > 0) save({ ...data, memos: [...data.memos, ...imported] });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCardClick = (m) => selectMode ? toggleSelect(m.id) : setOpenMemo(m);

  const imgStyle = (h) => ({ width: '100%', height: h, borderRadius: 8, marginBottom: 8, objectFit: 'cover', backgroundColor: C.bg2, display: 'block' });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={S.sec}>📦 メモ箱 <span style={{ fontSize: 13, color: C.sub, fontWeight: 400 }}>({data.memos.length}件)</span></h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={{ ...S.txtBtn, fontSize: 11 }} onClick={() => setView(view === 'gallery' ? 'list' : 'gallery')}>{view === 'gallery' ? '≡ リスト' : '▦ ギャラリー'}</button>
          {!selectMode && <>
            {data.memos.length > 0 && <button style={{ ...S.txtBtn, fontSize: 11 }} onClick={() => setSelectMode(true)}>選択</button>}
            <button style={{ ...S.txtBtn, fontSize: 11 }} onClick={() => csvRef.current?.click()}>CSV取込↑</button>
            <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={impCSV} />
            {data.memos.length > 0 && <button style={{ ...S.txtBtn, fontSize: 11 }} onClick={expCSV}>CSV書出↓</button>}
          </>}
        </div>
      </div>

      {/* select toolbar */}
      {selectMode && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '10px 14px', background: C.bg2, borderRadius: 10 }}>
          <button style={{ ...S.txtBtn, fontSize: 12, color: C.accent }} onClick={selectAll}>{selected.size === data.memos.length ? '全解除' : '全選択'}</button>
          <span style={{ fontSize: 12, color: C.sub, flex: 1 }}>{selected.size}件選択中</span>
          <button
            style={{ ...S.txtBtn, fontSize: 12, color: confirmDel ? '#fff' : '#D07070', background: confirmDel ? '#D07070' : 'transparent', padding: confirmDel ? '4px 12px' : '0', borderRadius: 6 }}
            onClick={deleteSelected} disabled={selected.size === 0}
          >
            {confirmDel ? `${selected.size}件を本当に削除` : '削除'}
          </button>
          <button style={{ ...S.txtBtn, fontSize: 12 }} onClick={exitSelect}>キャンセル</button>
        </div>
      )}

      {/* input form */}
      {!selectMode && (
        <div style={S.card} ref={formRef} onPaste={handlePaste}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleImageFile(e.dataTransfer.files?.[0]); }}
        >
          <input style={S.inp} placeholder="題名（任意）" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea style={{ ...S.inp, minHeight: 64 }} placeholder="メモ内容、気になったこと..." value={text} onChange={e => setText(e.target.value)} />

          {/* image preview */}
          {imagePrev && (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <img src={imagePrev} alt="" style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
              <button onClick={removeImage} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: 20, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>✕ 削除</button>
            </div>
          )}

          {/* image & url row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              style={{ ...S.txtBtn, fontSize: 12, color: C.accent2, padding: '6px 12px', border: `1px solid ${C.accent2}`, borderRadius: 8, flexShrink: 0 }}
              onClick={() => fileRef.current?.click()}
            >
              📷 画像を追加
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handleImageFile(e.target.files?.[0])} />
            <input style={{ ...S.inp, flex: 1, marginBottom: 0, minWidth: 120 }} placeholder="URL（任意）" value={url} onChange={e => setUrl(e.target.value)} />
          </div>

          {/* tag row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <SuggestInput value={tag} onChange={setTag} suggestions={suggestions.tags} placeholder="タグ（任意）" style={{ flex: 1 }} />
          </div>

          {!showExtra && (
            <button style={{ ...S.txtBtn, fontSize: 12, marginBottom: 8 }} onClick={() => setShowExtra(true)}>+ 場所・状態を追加（任意）</button>
          )}
          {showExtra && (
            <div style={{ display: 'flex', gap: 8 }}>
              <SuggestInput value={place} onChange={setPlace} suggestions={suggestions.places} placeholder="記入場所（任意）" style={{ flex: 1 }} />
              <SuggestInput value={state} onChange={setState} suggestions={suggestions.states} placeholder="記入状態（任意）" style={{ flex: 1 }} />
            </div>
          )}

          <button style={S.pri} onClick={add}>メモ箱に投げ込む</button>
        </div>
      )}

      {/* gallery */}
      {view === 'gallery' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginTop: 16 }}>
          {data.memos.slice().reverse().map(m => (
            <div
              key={m.id}
              style={{ ...S.galleryCard, cursor: 'pointer', outline: selectMode && selected.has(m.id) ? `2px solid ${C.accent}` : 'none', opacity: selectMode && !selected.has(m.id) ? 0.55 : 1 }}
              onClick={() => handleCardClick(m)}
            >
              {selectMode && (
                <div style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected.has(m.id) ? C.accent : C.border}`, background: selected.has(m.id) ? C.accent : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>
                  {selected.has(m.id) ? '✓' : ''}
                </div>
              )}
              {m.imageId && <MemoImage imageId={m.imageId} style={imgStyle(80)} />}
              {m.title && <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>}
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.content}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {m.tag   && <span style={S.tgSm}>#{m.tag}</span>}
                {m.place && <span style={{ ...S.tgSm, color: C.accent2 }}>📍{m.place}</span>}
              </div>
              <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>{fmtD(m.createdAt)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {data.memos.slice().reverse().map(m => (
            <div key={m.id} style={{ ...S.listItem, cursor: 'pointer', background: selectMode && selected.has(m.id) ? C.accent + '10' : 'transparent' }} onClick={() => handleCardClick(m)}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {selectMode && (
                  <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected.has(m.id) ? C.accent : C.border}`, background: selected.has(m.id) ? C.accent : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0, marginTop: 2 }}>
                    {selected.has(m.id) ? '✓' : ''}
                  </div>
                )}
                {m.imageId && <MemoImage imageId={m.imageId} style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0, objectFit: 'cover', backgroundColor: C.bg2 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {m.title && <div style={{ fontSize: 13, fontWeight: 600, color: C.accent, marginBottom: 1 }}>{m.title}</div>}
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.content}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {m.tag   && <span style={S.tgSm}>#{m.tag}</span>}
                    {m.place && <span style={{ ...S.tgSm, color: C.accent2 }}>📍{m.place}</span>}
                    {m.state && <span style={{ ...S.tgSm, color: '#8B7EB0' }}>🧠{m.state}</span>}
                    {m.url   && <span style={{ fontSize: 11, color: C.link }}>🔗</span>}
                    <span style={{ fontSize: 10, color: C.sub }}>{fmtD(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {openMemo && (
        <MemoDetail memo={openMemo} onSave={updateMemo} onDelete={deleteMemo} onClose={() => setOpenMemo(null)} suggestions={suggestions} />
      )}
    </div>
  );
}

/* ═══ ProjTab ═══ */
function ProjTab({ data, save }) {
  const [ti, sTi] = useState('');
  const [br, sBr] = useState('');
  const [an, sAn] = useState('');
  const [st, sSt] = useState('');
  const [sel, sSel] = useState(null);

  const addP = () => {
    if (!ti.trim()) return;
    save({ ...data, projects: [...data.projects, { id: uid(), title: ti.trim(), brief: br.trim(), anchors: [], createdAt: now() }] });
    sTi(''); sBr('');
  };
  const addA = () => {
    if (!sel || !an.trim()) return;
    save({ ...data, projects: data.projects.map(p => p.id === sel ? { ...p, anchors: [...p.anchors, { text: an.trim(), stuck: st.trim(), createdAt: now() }] } : p) });
    sAn(''); sSt('');
  };

  return (
    <div>
      <h3 style={S.sec}>🎯 お題管理</h3>
      <div style={S.card}>
        <input style={S.inp} placeholder="お題" value={ti} onChange={e => sTi(e.target.value)} />
        <textarea style={{ ...S.inp, minHeight: 50 }} placeholder="ブリーフ（任意）" value={br} onChange={e => sBr(e.target.value)} />
        <button style={S.pri} onClick={addP}>お題を登録</button>
      </div>

      {data.projects.length > 0 && (
        <div style={{ ...S.card, marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 8 }}>⚓ アンカー設定</div>
          <select style={S.inp} value={sel || ''} onChange={e => sSel(e.target.value)}>
            <option value="">お題を選択</option>
            {data.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <input style={S.inp} placeholder="次に考えたい方向性" value={an} onChange={e => sAn(e.target.value)} />
          <input style={S.inp} placeholder="今つまっているポイント（任意）" value={st} onChange={e => sSt(e.target.value)} />
          <button style={{ ...S.pri, background: C.accent2 }} onClick={addA}>⚓ アンカー投下</button>
        </div>
      )}

      {data.projects.slice().reverse().map(p => (
        <div key={p.id} style={{ ...S.listItem, marginTop: 8 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{p.title}</div>
          {p.brief && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{p.brief}</div>}
          <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>登録: {fmtD(p.createdAt)}</div>
          {p.anchors?.slice(-2).map((a, i) => (
            <div key={i} style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${C.accent2}` }}>
              <div style={{ fontSize: 12, color: C.accent }}>🧭 {a.text}</div>
              {a.stuck && <div style={{ fontSize: 11, color: '#D08080' }}>⚠ {a.stuck}</div>}
              <div style={{ fontSize: 10, color: C.sub }}>{fmtD(a.createdAt)}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ═══ ChatTab ═══ */
function ChatTab({ data, save }) {
  const [inp,   sInp]   = useState('');
  const [msgs,  sMsgs]  = useState(data.chatHistory || []);
  const [rally, sRally] = useState(data.rallyCount  || 0);
  const [loading, sL]   = useState(false);
  const ref   = useRef(null);
  const LIMIT = 6;

  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    if (!inp.trim() || loading) return;
    const um = { role: 'user', text: inp.trim(), time: now() };
    const nm = [...msgs, um];
    sMsgs(nm); sInp(''); sL(true);
    const nr = rally + 1;
    let ai;
    if (nr > LIMIT) {
      ai = '☕ そろそろ一度離れてみませんか？\n\nCWモードで漂うか、DMNモードで完全離脱すると、脳が整理を始めます。';
    } else {
      const mc = data.memos.length > 0
        ? '\n\n【メモ箱(最新10件)】\n' + data.memos.slice(-10).map(m => `- ${m.title || ''}: ${m.content}`).join('\n')
        : '';
      const pc = data.projects.length > 0
        ? '\n\n【お題】\n' + data.projects.slice(-3).map(p => `- ${p.title}: ${p.brief || ''}`).join('\n')
        : '';
      ai = await callGemini(getApiKey(), CEN_SYS, inp.trim() + mc + pc);
    }
    const am = { role: 'ai', text: ai, time: now() };
    const fm = [...nm, am];
    sMsgs(fm); sRally(nr); sL(false);
    save({ ...data, chatHistory: fm, rallyCount: nr });
  };

  const reset = () => { sMsgs([]); sRally(0); save({ ...data, chatHistory: [], rallyCount: 0 }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={S.sec}>🤝 CENエージェント</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: LIMIT }, (_, i) => (
              <div key={i} style={{ width: 16, height: 4, borderRadius: 2, background: i < rally ? C.accent : C.border }} />
            ))}
          </div>
          <button style={S.txtBtn} onClick={reset}>リセット</button>
        </div>
      </div>

      <div style={S.chatBox}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.sub }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
            <p style={{ fontSize: 13, lineHeight: 1.7 }}>考えていることを話してください。</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ ...S.bub, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? C.accent + '12' : '#fff', borderColor: m.role === 'user' ? C.accent + '40' : C.border }}>
            <div style={{ fontSize: 10, color: C.sub, marginBottom: 3 }}>{m.role === 'user' ? 'あなた' : 'CENエージェント'}</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{m.text}</div>
          </div>
        ))}
        {loading && (
          <div style={{ ...S.bub, alignSelf: 'flex-start', background: '#fff', borderColor: C.border }}>
            <div style={{ fontSize: 13, color: C.sub }}>思考中…</div>
          </div>
        )}
        <div ref={ref} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexShrink: 0 }}>
        <input
          style={{ ...S.inp, flex: 1, margin: 0 }}
          placeholder="考えていることを入力..."
          value={inp}
          onChange={e => sInp(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
        />
        <button style={{ ...S.pri, width: 'auto', padding: '0 20px', margin: 0 }} onClick={send}>送信</button>
      </div>
    </div>
  );
}

/* ═══ InsightTab ═══ */
function InsightTab({ data, save }) {
  const sp = data.sparks;
  const [filter, setFilter] = useState('all');
  const [openSpark, setOpenSpark] = useState(null);
  const [editText, setEditText] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const hd = Array.from({ length: 24 }, (_, h) => ({ h, c: sp.filter(s => s.hour === h).length }));
  const mH = Math.max(...hd.map(d => d.c), 1);
  const sm = {}; sp.forEach(s => { if (s.scene) sm[s.scene] = (sm[s.scene] || 0) + 1; });
  const se = Object.entries(sm).sort((a, b) => b[1] - a[1]);
  const mS = Math.max(...Object.values(sm), 1);
  const sc = { big: 0, middle: 0, small: 0 };
  sp.forEach(s => { if (s.size) sc[s.size]++; });

  const filtered = filter === 'all' ? sp : sp.filter(s => s.size === filter);
  const sizeInfo = { big: { e: '🔥', c: '#E05252', l: 'BIG' }, middle: { e: '✨', c: '#E0A030', l: 'MID' }, small: { e: '💫', c: '#4A90D9', l: 'SM' } };

  const expCSV = () => {
    const h = 'ID,内容,サイズ,シーン,時間,日時\n';
    const r = sp.map(s => [s.id, s.content || '', s.size || '', s.scene || '', s.hour, s.createdAt].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const b = new Blob([h + r], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sparks.csv'; a.click();
  };

  const deleteSpark = (id) => {
    save({ ...data, sparks: data.sparks.filter(s => s.id !== id) });
    setOpenSpark(null); setConfirmDel(false);
  };

  const updateSpark = (id, newContent) => {
    save({ ...data, sparks: data.sparks.map(s => s.id === id ? { ...s, content: newContent } : s) });
    setOpenSpark(null);
  };

  if (sp.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: C.sub }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <p>まだひらめきデータがありません。</p>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={S.sec}>📊 パターン分析</h3>
        <button style={S.txtBtn} onClick={expCSV}>CSV ↓</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div style={S.stat}><div style={{ fontSize: 26, fontWeight: 800, color: '#E0A030' }}>{sp.length}</div><div style={{ fontSize: 11, color: C.sub }}>総数</div></div>
        <div style={S.stat}><div style={{ fontSize: 26, fontWeight: 800, color: '#E05252' }}>{sc.big}</div><div style={{ fontSize: 11, color: C.sub }}>🔥 BIG</div></div>
        <div style={S.stat}><div style={{ fontSize: 26, fontWeight: 800, color: '#4A90D9' }}>{sc.small + sc.middle}</div><div style={{ fontSize: 11, color: C.sub }}>MID+SM</div></div>
      </div>
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 10 }}>時間帯別</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 72 }}>
          {hd.map(d => (
            <div key={d.h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ width: '100%', height: `${(d.c / mH) * 100}%`, background: d.c > 0 ? `linear-gradient(to top,${C.accent},${C.accent}90)` : 'transparent', borderRadius: '2px 2px 0 0', minHeight: d.c > 0 ? 3 : 0 }} />
              {d.h % 2 === 0 && <span style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{d.h}</span>}
            </div>
          ))}
        </div>
      </div>
      {se.length > 0 && (
        <div style={{ ...S.card, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 10 }}>シーン別</div>
          {se.slice(0, 6).map(([s, c]) => (
            <div key={s} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text, marginBottom: 2 }}><span>{s}</span><span>{c}</span></div>
              <div style={{ height: 5, background: C.bg2, borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${(c / mS) * 100}%`, background: C.accent, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── ひらめき一覧 ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={S.sec}>💡 ひらめき一覧 <span style={{ fontSize: 13, color: C.sub, fontWeight: 400 }}>({filtered.length}件)</span></h3>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilter('all')}
            style={{ ...S.chip, background: filter === 'all' ? C.accent + '18' : '#fff', color: filter === 'all' ? C.accent : C.sub, borderColor: filter === 'all' ? C.accent : C.border }}
          >
            すべて
          </button>
          {SIZES.map(s => (
            <button
              key={s.id}
              onClick={() => setFilter(filter === s.id ? 'all' : s.id)}
              style={{ ...S.chip, background: filter === s.id ? s.c : '#fff', color: filter === s.id ? '#fff' : C.sub, borderColor: filter === s.id ? s.c : C.border }}
            >
              {s.e} {s.l}
            </button>
          ))}
        </div>
        {filtered.slice().reverse().map(s => {
          const si = s.size && sizeInfo[s.size];
          return (
            <div
              key={s.id}
              style={{ ...S.card, marginBottom: 8, padding: 14, cursor: 'pointer', borderLeft: si ? `3px solid ${si.c}` : `3px solid ${C.border}` }}
              onClick={() => { setOpenSpark(s); setEditText(s.content || ''); setConfirmDel(false); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.content || '（内容なし）'}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {si && <span style={{ fontSize: 11, color: '#fff', background: si.c, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{si.e} {si.l}</span>}
                    {s.scene && <span style={{ ...S.tgSm, color: C.accent2 }}>{s.scene}</span>}
                    <span style={{ fontSize: 10, color: C.sub }}>{fmtD(s.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 16px', color: C.sub, fontSize: 13 }}>
            該当するひらめきがありません
          </div>
        )}
      </div>

      {/* ── ひらめき詳細モーダル ── */}
      {openSpark && (
        <div style={S.overlay} onClick={() => setOpenSpark(null)}>
          <div style={{ ...S.modal, maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>💡 ひらめき詳細</span>
              <button style={S.iconBtn} onClick={() => setOpenSpark(null)}>✕</button>
            </div>
            <textarea
              style={{ ...S.inp, minHeight: 100 }}
              value={editText}
              onChange={e => setEditText(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {openSpark.size && sizeInfo[openSpark.size] && (
                <span style={{ fontSize: 12, color: '#fff', background: sizeInfo[openSpark.size].c, padding: '3px 10px', borderRadius: 10, fontWeight: 600 }}>
                  {sizeInfo[openSpark.size].e} {sizeInfo[openSpark.size].l}
                </span>
              )}
              {openSpark.scene && <span style={{ ...S.tgSm, fontSize: 12, padding: '3px 8px', color: C.accent2 }}>{openSpark.scene}</span>}
              <span style={{ fontSize: 11, color: C.sub }}>{fmtD(openSpark.createdAt)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ ...S.pri, flex: 1 }}
                onClick={() => updateSpark(openSpark.id, editText.trim())}
                disabled={editText.trim() === (openSpark.content || '')}
              >
                保存する
              </button>
            </div>
            <button
              style={{ ...S.txtBtn, fontSize: 11, color: confirmDel ? '#fff' : '#D07070', background: confirmDel ? '#D07070' : 'transparent', padding: confirmDel ? '4px 12px' : '0', borderRadius: 6, marginTop: 14 }}
              onClick={() => confirmDel ? deleteSpark(openSpark.id) : setConfirmDel(true)}
            >
              {confirmDel ? '本当に削除する' : 'このひらめきを削除'}
            </button>
            <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ CENMode ═══ */
function CENMode({ data, save }) {
  const [tab,   setTab]   = useState(TABS.MEMO);
  const [showM, setShowM] = useState(false);
  const addSpark = (sp) => save({ ...data, sparks: [...data.sparks, sp] });

  return (
    <div style={S.cenC}>
      <div style={S.tabs}>
        {[
          { id: TABS.MEMO,    l: '📦 メモ箱' },
          { id: TABS.PROJ,    l: '🎯 お題'   },
          { id: TABS.CHAT,    l: '🤝 壁打ち' },
          { id: TABS.INSIGHT, l: '📊 分析'   },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...S.tabBtn, color: tab === t.id ? C.text : C.sub, borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent' }}
          >
            {t.l}
          </button>
        ))}
      </div>
      <div style={tab === TABS.CHAT ? { ...S.tabC, display: 'flex', flexDirection: 'column' } : S.tabC}>
        {tab === TABS.MEMO    && <MemoTab    data={data} save={save} />}
        {tab === TABS.PROJ    && <ProjTab    data={data} save={save} />}
        {tab === TABS.CHAT    && <ChatTab    data={data} save={save} />}
        {tab === TABS.INSIGHT && <InsightTab data={data} save={save} />}
      </div>
      <button style={S.fab} onClick={() => setShowM(true)}>💡</button>
      {showM && <QuickMemo onSave={addSpark} onClose={() => setShowM(false)} />}
    </div>
  );
}

/* ═══ DMNMode ═══ */
function DMNMode({ data, save }) {
  const [sec,   setSec]  = useState(0);
  const [act,   setAct]  = useState(false);
  const [showM, setShowM]= useState(false);
  const [showA, setShowA]= useState(true);
  const iv = useRef(null);
  const lp  = data.projects[data.projects.length - 1];
  const la  = lp?.anchors?.[lp.anchors.length - 1];
  const prompt = useMemo(() => pick(WANDER), []);

  const start = () => { setAct(true); setShowA(false); iv.current = setInterval(() => setSec(s => s + 1), 1000); };
  const stop  = () => { setAct(false); if (iv.current) clearInterval(iv.current); };
  useEffect(() => () => { if (iv.current) clearInterval(iv.current); }, []);

  const addSpark = (sp) => save({ ...data, sparks: [...data.sparks, { ...sp, projectId: lp?.id }] });

  return (
    <div style={S.dmnC}>
      {showA && la && (
        <div style={S.dmnAnc}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>⚓ 離脱前のアンカー</div>
          <div style={{ fontSize: 15, color: C.accent, fontWeight: 600 }}>{lp?.title}</div>
          <div style={{ fontSize: 13, color: C.textLight, marginTop: 4 }}>{la.text}</div>
          {la.stuck && <div style={{ fontSize: 12, color: '#D08080', marginTop: 2 }}>⚠ {la.stuck}</div>}
        </div>
      )}
      {!act && <p style={{ fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 1.8, maxWidth: 320 }}>{prompt}</p>}
      <div style={{ fontSize: 64, fontWeight: 200, color: act ? C.accent : C.border, fontFamily: "'Courier New',monospace", letterSpacing: '0.05em' }}>
        {fmtT(sec)}
      </div>
      {!act
        ? <button style={{ ...S.pri, width: 'auto', padding: '14px 40px', background: C.bg2, color: C.text, fontSize: 14 }} onClick={start}>離脱する 🌿</button>
        : <button style={{ ...S.pri, width: 'auto', padding: '14px 40px', background: '#fff', border: `1px solid ${C.border}`, color: C.textLight, fontSize: 14 }} onClick={stop}>戻ってきた</button>
      }
      <button style={S.dmnSpark} onClick={() => setShowM(true)}>💡 ひらめいた</button>
      {showM && <QuickMemo onSave={addSpark} onClose={() => setShowM(false)} />}
    </div>
  );
}

/* ═══ App (root) ═══ */
export default function App() {
  const { data, save } = useData();
  const [mode,          setMode]         = useState(MODES.CEN);
  const [showSettings,  setShowSettings] = useState(() => {
    if (getApiKey()) return false;
    if (localStorage.getItem('cw-settings-seen')) return false;
    localStorage.setItem('cw-settings-seen', '1');
    return true;
  });
  const [showReset,     setShowReset]    = useState(false);
  const [confirmReset,  setConfirmReset] = useState(false);

  const doReset = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    clearAllData();
    save(emptyData());
    setShowReset(false); setConfirmReset(false);
  };

  return (
    <div style={S.app}>
      {/* ── nav bar ── */}
      <nav style={S.mBar}>
        {[
          { id: MODES.CEN, l: 'CEN', s: '集中', c: C.accent  },
          { id: MODES.CW,  l: 'CW',  s: '漂う', c: C.accent2 },
          { id: MODES.DMN, l: 'DMN', s: '離脱', c: '#22C55E' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{ ...S.mBtn, color: mode === m.id ? m.c : C.sub, borderColor: mode === m.id ? m.c : 'transparent', background: mode === m.id ? m.c + '10' : 'transparent' }}
          >
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.05em' }}>{m.l}</span>
            <span style={{ fontSize: 10 }}>{m.s}</span>
          </button>
        ))}
        <button
          onClick={() => setShowSettings(true)}
          style={{ padding: '8px 14px', border: 'none', background: 'transparent', color: C.sub, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ⚙
        </button>
      </nav>

      {/* ── reset bar ── */}
      {showReset && (
        <div style={{ padding: '10px 16px', background: C.bg2, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: C.sub, flex: 1 }}>全データをリセット（メモ・お題・ひらめき・チャット履歴を全削除）</span>
          <button
            style={{ ...S.txtBtn, fontSize: 12, color: confirmReset ? '#fff' : '#D07070', background: confirmReset ? '#D07070' : 'transparent', padding: confirmReset ? '4px 12px' : '0', borderRadius: 6 }}
            onClick={doReset}
          >
            {confirmReset ? '本当にリセット' : 'リセット'}
          </button>
          <button style={{ ...S.txtBtn, fontSize: 12 }} onClick={() => { setShowReset(false); setConfirmReset(false); }}>閉じる</button>
        </div>
      )}

      {/* ── mode views ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {mode === MODES.CEN && <CENMode data={data} save={save} />}
        {mode === MODES.CW  && <CWMode  data={data} save={save} />}
        {mode === MODES.DMN && <DMNMode data={data} save={save} />}
      </div>

      {/* ── settings modal ── */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} onImport={(restored) => save(restored)} />}
    </div>
  );
}
