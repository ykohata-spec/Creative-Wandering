import { useState, useEffect, useRef, useCallback } from 'react';
import { C, S, now } from './constants.js';
import QuickMemo from './QuickMemo.jsx';

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ═══ Digit Task — Pattern A (Odd/Even Judgment, Baird 2012) ═══ */
function DigitTask({ onLog }) {
  const [trial, setTrial] = useState({ num: 0, target: false, visible: false, answered: false });
  const refs = useRef({ timeout: null, mounted: true, targetTime: 0 });

  const next = useCallback(() => {
    if (!refs.current.mounted) return;
    const num = Math.floor(Math.random() * 9) + 1;
    const target = Math.random() < 0.12;
    setTrial({ num, target, visible: true, answered: false });
    if (target) {
      refs.current.targetTime = Date.now();
      onLog('target');
    }
    refs.current.timeout = setTimeout(() => {
      if (!refs.current.mounted) return;
      setTrial(p => ({ ...p, visible: false }));
      refs.current.timeout = setTimeout(next, 700 + Math.random() * 500);
    }, 1300);
  }, [onLog]);

  useEffect(() => {
    refs.current.mounted = true;
    const t = setTimeout(next, 600);
    return () => { refs.current.mounted = false; clearTimeout(t); clearTimeout(refs.current.timeout); };
  }, [next]);

  const answer = (even) => {
    if (trial.answered || !trial.target) return;
    const correct = (trial.num % 2 === 0) === even;
    onLog('answer', { correct, rt: Date.now() - refs.current.targetTime });
    setTrial(p => ({ ...p, answered: true }));
  };

  return (
    <>
      <div style={{
        width: 140, height: 140, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: trial.visible && trial.target ? '#E8F5E918' : 'transparent',
        border: `2px solid ${trial.visible && trial.target ? '#4CAF50' : 'transparent'}`,
        transition: 'all 0.2s',
      }}>
        {trial.visible && (
          <div style={{
            fontSize: 56, fontWeight: 200, color: trial.target ? '#4CAF50' : C.text,
            fontFamily: "'Courier New', monospace",
          }}>
            {trial.num}
          </div>
        )}
      </div>
      <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
        {trial.visible && trial.target && !trial.answered ? (
          <div style={{ display: 'flex', gap: 20 }}>
            <button onClick={() => answer(true)} style={greenBtn}>偶数</button>
            <button onClick={() => answer(false)} style={greenBtn}>奇数</button>
          </div>
        ) : (
          <div style={{ fontSize: 15, color: C.sub, textAlign: 'center' }}>
            緑の数字が出たら偶数・奇数を選んでください
          </div>
        )}
      </div>
    </>
  );
}

const greenBtn = {
  padding: '14px 32px', background: '#E8F5E9', border: '1.5px solid #4CAF50',
  borderRadius: 12, fontSize: 18, fontWeight: 600, color: '#2E7D32',
  cursor: 'pointer', fontFamily: 'inherit',
};

/* ═══ Rhythm Task — Pattern D (Metronome Tap, Safati 2024) ═══ */
function RhythmTask({ onLog }) {
  const [pulse, setPulse] = useState(false);
  const refs = useRef({ ctx: null, interval: null });

  const playClick = useCallback(() => {
    try {
      if (!refs.current.ctx) refs.current.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = refs.current.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 900;
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.06);
    } catch { /* ignore audio errors */ }
  }, []);

  useEffect(() => {
    const tick = () => { playClick(); setPulse(true); setTimeout(() => setPulse(false), 180); };
    tick();
    refs.current.interval = setInterval(tick, 1300);
    return () => {
      clearInterval(refs.current.interval);
      refs.current.ctx?.close().catch(() => {});
    };
  }, [playClick]);

  return (
    <div onClick={() => onLog('tap')} style={{
      width: '100%', flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none',
    }}>
      <div style={{
        width: pulse ? 120 : 88, height: pulse ? 120 : 88, borderRadius: '50%',
        background: pulse ? C.accent + '28' : C.accent + '0C',
        border: `2px solid ${pulse ? C.accent : C.border}`,
        transition: 'all 0.12s ease-out',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: pulse ? 28 : 16, height: pulse ? 28 : 16, borderRadius: '50%',
          background: pulse ? C.accent : C.sub,
          transition: 'all 0.12s ease-out',
        }} />
      </div>
      <div style={{ fontSize: 15, color: C.sub, marginTop: 24 }}>
        リズムに合わせて軽くタップしてください
      </div>
    </div>
  );
}

/* ═══ MWTask — Main Component ═══ */
export default function MWTask({ type, duration, anchor, onSpark, onDone }) {
  const [phase, setPhase] = useState(anchor?.topic ? 'anchor' : 'instruction');
  const [elapsed, setElapsed] = useState(0);
  const [showMemo, setShowMemo] = useState(false);
  const total = duration * 60;
  const timerRef = useRef(null);
  const logRef = useRef({ type, duration, startedAt: null, targets: 0, correct: 0, reactions: [], taps: [] });

  useEffect(() => {
    if (phase === 'anchor') {
      const t = setTimeout(() => setPhase('instruction'), 3000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    timerRef.current = setInterval(() => {
      setElapsed(p => {
        if (p + 1 >= total) { clearInterval(timerRef.current); setTimeout(() => setPhase('done'), 0); return total; }
        return p + 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, total]);

  const onLog = useCallback((ev, d) => {
    const log = logRef.current;
    if (ev === 'target') log.targets++;
    if (ev === 'answer') { if (d?.correct) log.correct++; if (d?.rt) log.reactions.push(d.rt); }
    if (ev === 'tap') log.taps.push(Date.now());
  }, []);

  const saveSpark = (sp) => { onSpark({ ...sp, mwTask: type, mwElapsed: elapsed }); setShowMemo(false); };
  const remain = total - elapsed;

  if (phase === 'anchor') return (
    <div style={S.dmnC}>
      <div style={{ fontSize: 15, color: C.sub }}>あなたのお題</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.accent, textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
        {anchor.topic}
      </div>
      {anchor.text && <div style={{ fontSize: 17, color: C.textLight, marginTop: 8, textAlign: 'center' }}>{anchor.text}</div>}
    </div>
  );

  if (phase === 'instruction') {
    const digitRules = [
      '画面に数字が次々と表示されます',
      'ほとんどは白い数字 → 眺めるだけでOK',
      'たまに緑の数字が出ます → 偶数か奇数かを選んでください',
      'スコアは記録しません。正解にこだわらなくて大丈夫です',
    ];
    const rhythmRules = [
      '一定のリズムで音と光が鳴ります',
      'リズムに合わせて画面を軽くタップしてください',
      '正確さは気にしなくて大丈夫。なんとなく合わせる程度で',
    ];
    const rules = type === 'digit' ? digitRules : rhythmRules;
    return (
      <div style={S.dmnC}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          {type === 'digit' ? '数字タスクのやり方' : 'リズムタスクのやり方'}
        </div>
        <div style={{ maxWidth: 320, width: '100%' }}>
          {rules.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
              <span style={{ fontSize: 15, color: C.accent, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ fontSize: 16, color: C.textLight, lineHeight: 1.6 }}>{r}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, color: C.sub, marginTop: 8 }}>{duration}分間</div>
        <button style={{ ...S.pri, width: 'auto', padding: '14px 36px', marginTop: 16 }} onClick={() => setPhase('permission')}>
          わかった
        </button>
      </div>
    );
  }

  if (phase === 'permission') {
    const msg = type === 'digit'
      ? '数字に軽く反応しながら、\n頭は自由に遊ばせてください。\n\nお題のことを考えなくても大丈夫。\nふと何か浮かんだら、追いかけてみて。'
      : 'リズムに軽く合わせながら、\n頭は自由に彷徨わせてください。\n\n集中しなくて大丈夫。\nふと何か浮かんだら、追いかけてみて。';
    return (
      <div style={S.dmnC}>
        <div style={{ fontSize: 18, color: C.textLight, lineHeight: 2.2, textAlign: 'center', whiteSpace: 'pre-wrap', maxWidth: 340 }}>{msg}</div>
        <button style={{ ...S.pri, width: 'auto', padding: '14px 36px', marginTop: 16 }} onClick={() => { logRef.current.startedAt = now(); setPhase('running'); }}>
          はじめる
        </button>
      </div>
    );
  }

  if (phase === 'done') return (
    <div style={S.dmnC}>
      <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>お疲れさまでした</div>
      <div style={{ fontSize: 17, color: C.sub, marginBottom: 24 }}>何か浮かびましたか？</div>
      <button style={{ ...S.pri, width: 'auto', padding: '14px 36px', marginBottom: 10 }} onClick={() => setShowMemo(true)}>💡 ひらめきを記録</button>
      <button style={{ ...S.pri, width: 'auto', padding: '14px 36px', background: '#6E5DC6', marginBottom: 10 }} onClick={() => onDone('cw')}>☁️ Cloud Synapse へ</button>
      <button style={S.txtBtn} onClick={() => onDone('back')}>← 戻る</button>
      {showMemo && <QuickMemo onSave={saveSpark} onClose={() => setShowMemo(false)} />}
    </div>
  );

  return (
    <div style={{ ...S.dmnC, justifyContent: 'flex-start', paddingTop: 24, gap: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 200, color: C.sub, fontFamily: "'Courier New', monospace", letterSpacing: '0.05em', marginBottom: 20 }}>
        {fmtTime(remain)}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 0 }}>
        {type === 'digit' ? <DigitTask onLog={onLog} /> : <RhythmTask onLog={onLog} />}
      </div>
      <button style={S.dmnSpark} onClick={() => setShowMemo(true)}>💡 ひらめいた</button>
      {showMemo && <QuickMemo onSave={saveSpark} onClose={() => setShowMemo(false)} />}
    </div>
  );
}
