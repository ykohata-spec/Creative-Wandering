import { useState, useEffect, useRef } from 'react';
import { C, S, SCENES, SIZES, uid, now } from './constants.js';

export default function QuickMemo({ onSave, onClose, initial = '' }) {
  const [text,  setText]  = useState(initial);
  const [size,  setSize]  = useState('');
  const [scene, setScene] = useState('');
  const [extra, setExtra] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const save = () => {
    if (!text.trim()) return;
    onSave({ id: uid(), content: text.trim(), size: size || null, scene: scene || null, hour: new Date().getHours(), createdAt: now() });
    onClose();
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        {/* handle bar */}
        <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>💡 ひらめきメモ</span>
          <button style={S.iconBtn} onClick={onClose}>✕</button>
        </div>

        <textarea
          ref={ref}
          style={{ ...S.inp, minHeight: 88 }}
          placeholder="ひらめいた内容..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) save(); }}
        />

        {!extra && (
          <button style={{ ...S.txtBtn, fontSize: 12, marginBottom: 10 }} onClick={() => setExtra(true)}>
            + サイズ・シーンを追加（任意）
          </button>
        )}

        {extra && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {SIZES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSize(size === s.id ? '' : s.id)}
                  style={{ ...S.chip, background: size === s.id ? s.c : '#fff', color: size === s.id ? '#fff' : C.sub, borderColor: size === s.id ? s.c : C.border }}
                >
                  {s.e} {s.l}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {SCENES.map(sc => (
                <button
                  key={sc}
                  onClick={() => setScene(scene === sc ? '' : sc)}
                  style={{ ...S.chip, fontSize: 11, padding: '3px 8px', background: scene === sc ? C.accent + '18' : '#fff', color: scene === sc ? C.accent : C.sub, borderColor: scene === sc ? C.accent : C.border }}
                >
                  {sc}
                </button>
              ))}
            </div>
          </>
        )}

        <button style={S.pri} onClick={save}>記録する</button>
        {/* safe-area padding for iOS */}
        <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
      </div>
    </div>
  );
}
