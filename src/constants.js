export const MODES = { CEN: 'cen', CW: 'cw', DMN: 'dmn' };
export const TABS  = { MEMO: 'memo', PROJ: 'proj', CHAT: 'chat', INSIGHT: 'insight' };

export const SCENES = [
  'シャワー中','散歩中','移動中','食事中','家事中','トイレ',
  '就寝前','起床時','カフェ','運動中','サウナ','読書中',
  'デスクワーク','会議中','休憩中','その他',
];
export const SIZES = [
  { id: 'big',    l: 'BIG', e: '🔥', c: '#E05252', p: 5 },
  { id: 'middle', l: 'MID', e: '✨', c: '#E0A030', p: 3 },
  { id: 'small',  l: 'SM',  e: '💫', c: '#4A90D9', p: 1 },
];
export const WANDER = [
  'スマホを置いて、窓の外を眺めてみませんか？',
  'お茶を淹れに行きましょう。',
  '少し散歩してみませんか？',
  '深呼吸を3回。目を閉じて。',
  'ちょっとした家事をしてみましょう。',
  'シャワーは最高のひらめきスポット。',
  'PCを閉じて、ぼんやりする時間。',
];

/* ── helpers ── */
export const uid   = () => Math.random().toString(36).slice(2, 10);
export const pick  = (a) => a[Math.floor(Math.random() * a.length)];
export const now   = () => new Date().toISOString();
export const fmtD  = (d) => {
  try { return new Date(d).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};
export const fmtT  = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Google Drive share URL → direct thumbnail URL */
export const imgUrl = (raw) => {
  if (!raw) return null;
  const s = raw.trim();
  const d = s.match(/drive\.google\.com\/file\/d\/([^/?s]+)/);
  if (d) return `https://drive.google.com/thumbnail?id=${d[1]}&sz=w800`;
  const o = s.match(/drive\.google\.com\/open\?id=([^&s]+)/);
  if (o) return `https://drive.google.com/thumbnail?id=${o[1]}&sz=w800`;
  if (s.includes('drive.google.com/thumbnail')) return s;
  const u = s.match(/drive\.google\.com\/uc\?.*id=([^&s]+)/);
  if (u) return `https://drive.google.com/thumbnail?id=${u[1]}&sz=w800`;
  return s;
};

/* ── design tokens ── */
export const C = {
  bg:        '#FAFAFA',
  bg2:       '#F5F5F4',
  text:      '#2D2D2D',
  textLight: '#5A5A5A',
  sub:       '#A9ABA0',
  accent:    '#8BBE2C',
  accent2:   '#6E5DC6',
  link:      '#3B82F6',
  border:    '#E6E7E4',
};

export const S = {
  app: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: C.bg,
    color: C.text,
    fontFamily: "'Zen Kaku Gothic New','Noto Sans JP',system-ui,sans-serif",
    overflow: 'hidden',
  },
  mBar: {
    display: 'flex',
    borderBottom: `1px solid ${C.border}`,
    background: '#FDFBF8',
    flexShrink: 0,
  },
  mBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '12px 0',
    border: 'none',
    borderBottom: '2px solid',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
    background: 'transparent',
  },
  cenC: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  tabs: {
    display: 'flex',
    borderBottom: `1px solid ${C.border}`,
    background: '#FDFBF8',
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: '10px 4px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 600,
    textAlign: 'center',
    transition: 'color 0.2s',
    whiteSpace: 'nowrap',
  },
  tabC: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    background: C.bg,
  },
  card: {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  inp: {
    width: '100%',
    padding: '10px 12px',
    background: '#FAFAFA',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 13,
    marginBottom: 8,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
    display: 'block',
  },
  pri: {
    width: '100%',
    padding: '12px',
    background: C.accent,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'block',
  },
  txtBtn: {
    background: 'none',
    border: 'none',
    color: C.sub,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: 0,
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: C.sub,
    fontSize: 16,
    cursor: 'pointer',
    padding: '4px 8px',
    fontFamily: 'inherit',
  },
  fab: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: C.accent,
    border: 'none',
    fontSize: 22,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(139,190,44,0.3)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
  },
  chip: {
    padding: '5px 12px',
    border: '1px solid',
    borderRadius: 16,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    background: '#fff',
  },
  sec: {
    fontSize: 16,
    fontWeight: 700,
    color: C.text,
    margin: '0 0 12px',
  },
  listItem: {
    padding: '12px 0',
    borderBottom: `1px solid ${C.border}30`,
  },
  galleryCard: {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    position: 'relative',
    overflow: 'hidden',
  },
  tgSm: {
    fontSize: 10,
    color: C.sub,
    background: C.bg2,
    padding: '2px 6px',
    borderRadius: 4,
    display: 'inline-block',
  },
  stat: {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 12,
    textAlign: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  chatBox: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 8,
    background: C.bg,
    minHeight: 0,
  },
  bub: {
    maxWidth: '85%',
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid',
  },
  /* bottom-sheet style modal (feels native on mobile) */
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 200,
  },
  modal: {
    background: '#fff',
    borderRadius: '18px 18px 0 0',
    padding: 20,
    width: '100%',
    maxWidth: 560,
    boxShadow: '0 -4px 32px rgba(0,0,0,0.14)',
    maxHeight: '92vh',
    overflowY: 'auto',
  },
  dmnC: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    background: '#FDFBF8',
    padding: 24,
    overflowY: 'auto',
  },
  dmnAnc: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 16,
    maxWidth: 320,
    textAlign: 'center',
    width: '100%',
  },
  dmnSpark: {
    position: 'fixed',
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '14px 32px',
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 28,
    color: C.accent,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    zIndex: 50,
    whiteSpace: 'nowrap',
  },
};
