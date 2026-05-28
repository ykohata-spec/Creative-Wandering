import { useState, useRef, useEffect } from 'react';
import { C, S, uid, now, fmtD } from './constants.js';
import { getApiKey } from './storage.js';
import { generateBuddies, chatWithBuddy } from './buddy.js';
import QuickMemo from './QuickMemo.jsx';

const TAB = { ROSTER: 'roster', CHAT: 'chat' };

function BuddyCard({ buddy, isFavorite, onSelect, onToggleFav }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`,
      borderRadius: 14, padding: 16, position: 'relative',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <button
        onClick={() => onToggleFav?.(buddy)}
        style={{
          position: 'absolute', top: 10, right: 10,
          background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
          color: isFavorite ? '#F59E0B' : C.border,
        }}
        title={isFavorite ? 'お気に入り解除' : 'お気に入りに保存'}
      >
        {isFavorite ? '★' : '☆'}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `linear-gradient(135deg, ${C.accent}40, ${C.accent2}40)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, flexShrink: 0,
        }}>
          {buddy.emoji || '👤'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{buddy.name}（{buddy.age}）</div>
          <div style={{ fontSize: 14, color: C.sub, marginTop: 2 }}>{buddy.location}</div>
        </div>
      </div>
      <div style={{ fontSize: 15, color: C.textLight, marginBottom: 8, lineHeight: 1.5 }}>{buddy.occupation}</div>
      <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, lineHeight: 1.5 }}>{buddy.personality}</div>
      {buddy.currentMood && (
        <div style={{ fontSize: 13, color: C.accent2, marginBottom: 12, fontStyle: 'italic' }}>
          いまの気分: {buddy.currentMood}
        </div>
      )}
      <button
        onClick={() => onSelect(buddy)}
        style={{
          ...S.pri, padding: '10px 14px', fontSize: 15,
          background: C.accent2,
        }}
      >
        💬 雑談する
      </button>
    </div>
  );
}

export default function WanderingBuddy({ data, save }) {
  const [topic, setTopic] = useState('');
  const [tab, setTab] = useState(TAB.ROSTER);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeBuddy, setActiveBuddy] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [showFavs, setShowFavs] = useState(true);
  const chatBoxRef = useRef(null);

  const buddies = data.buddies || [];
  const favBuddies = buddies.filter(b => b.isFavorite);

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setCandidates([]);
    const apiKey = getApiKey();
    const buds = await generateBuddies(apiKey, topic.trim());
    setCandidates(buds.map(b => ({ ...b, id: 'b_' + uid(), topicSeed: topic.trim(), emoji: pickEmoji(b) })));
    setLoading(false);
  };

  const toggleFav = (buddy) => {
    const isAlreadySaved = buddies.find(b => b.id === buddy.id);
    if (isAlreadySaved) {
      const updated = buddies.map(b => b.id === buddy.id ? { ...b, isFavorite: !b.isFavorite } : b);
      save({ ...data, buddies: updated });
    } else {
      save({ ...data, buddies: [...buddies, { ...buddy, isFavorite: true, createdAt: now() }] });
    }
    setCandidates(prev => prev.map(b => b.id === buddy.id ? { ...b, isFavorite: !b.isFavorite } : b));
  };

  const startChat = (buddy) => {
    setActiveBuddy(buddy);
    setMessages([]);
    setTab(TAB.CHAT);
    setTimeout(async () => {
      setSending(true);
      const apiKey = getApiKey();
      const opener = await chatWithBuddy(apiKey, buddy, [], '(雑談を始める。挨拶代わりに、最近の自分の生活の断片を1つだけ話して、軽く相手に「最近どう？」みたいに振ってください。短く。)');
      setMessages([{ role: 'buddy', text: opener, ts: now() }]);
      setSending(false);
    }, 100);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const next = [...messages, { role: 'user', text, ts: now() }];
    setMessages(next);
    setSending(true);
    const apiKey = getApiKey();
    const reply = await chatWithBuddy(apiKey, activeBuddy, next, text);
    setMessages([...next, { role: 'buddy', text: reply, ts: now() }]);
    setSending(false);
  };

  const endChat = () => {
    if (messages.length > 0 && activeBuddy) {
      const chat = {
        id: 'c_' + uid(), buddyId: activeBuddy.id, buddyName: activeBuddy.name,
        topicSeed: activeBuddy.topicSeed, messages,
        createdAt: messages[0]?.ts, endedAt: now(),
      };
      save({ ...data, buddyChats: [chat, ...(data.buddyChats || [])].slice(0, 50) });
    }
    setActiveBuddy(null);
    setMessages([]);
    setTab(TAB.ROSTER);
  };

  const addSpark = (sp) => {
    save({ ...data, sparks: [...data.sparks, { ...sp, buddyName: activeBuddy?.name }] });
    setShowMemo(false);
  };

  if (tab === TAB.CHAT && activeBuddy) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FDFBF8' }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.accent}40, ${C.accent2}40)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>{activeBuddy.emoji || '👤'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{activeBuddy.name}</div>
            <div style={{ fontSize: 13, color: C.sub }}>{activeBuddy.occupation}</div>
          </div>
          <button style={{ ...S.txtBtn, fontSize: 14 }} onClick={endChat}>終了</button>
        </div>

        <div ref={chatBoxRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
              background: m.role === 'user' ? C.accent + '20' : '#fff',
              border: `1px solid ${m.role === 'user' ? C.accent + '40' : C.border}`,
              fontSize: 15, lineHeight: 1.5, color: C.text,
              whiteSpace: 'pre-wrap',
            }}>{m.text}</div>
          ))}
          {sending && (
            <div style={{ alignSelf: 'flex-start', fontSize: 13, color: C.sub, padding: '4px 14px' }}>
              {activeBuddy.name} が考え中…
            </div>
          )}
        </div>

        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: '#fff', display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="どうでもいい話を…"
            style={{ ...S.inp, margin: 0, flex: 1 }}
            disabled={sending}
          />
          <button onClick={send} disabled={sending || !input.trim()} style={{ ...S.pri, width: 'auto', padding: '0 18px' }}>送信</button>
        </div>
        <button style={S.dmnSpark} onClick={() => setShowMemo(true)}>💡 ひらめいた</button>
        {showMemo && <QuickMemo onSave={addSpark} onClose={() => setShowMemo(false)} />}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: C.bg }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>☕ Wandering Buddy</div>
          <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6 }}>
            お題と関係ない人と、タバコスペース的などうでもいい雑談を。<br />
            気になる人は ★ でお気に入りに保存できます。
          </div>
        </div>

        <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 8 }}>❶ 雑談相手を探したいお題</div>
          <textarea
            style={{ ...S.inp, minHeight: 60, fontSize: 16 }}
            placeholder="今考えていること…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
          <button style={{ ...S.pri, fontSize: 16, background: C.accent2 }} onClick={generate} disabled={loading || !topic.trim()}>
            {loading ? '呼んでます…' : '👥 3人呼ぶ'}
          </button>
        </div>

        {candidates.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>新しく呼ばれた3人</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {candidates.map(b => (
                <BuddyCard
                  key={b.id} buddy={b}
                  isFavorite={!!buddies.find(x => x.id === b.id && x.isFavorite) || b.isFavorite}
                  onSelect={startChat}
                  onToggleFav={toggleFav}
                />
              ))}
            </div>
          </div>
        )}

        {favBuddies.length > 0 && (
          <div>
            <button
              onClick={() => setShowFavs(!showFavs)}
              style={{ ...S.txtBtn, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}
            >
              ⭐ お気に入り（{favBuddies.length}）{showFavs ? '▼' : '▶'}
            </button>
            {showFavs && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {favBuddies.map(b => (
                  <BuddyCard
                    key={b.id} buddy={b} isFavorite={true}
                    onSelect={startChat} onToggleFav={toggleFav}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {candidates.length === 0 && favBuddies.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: C.sub, fontSize: 15, marginTop: 40, lineHeight: 1.8 }}>
            まだ誰もいません。<br />お題を入れて「3人呼ぶ」を押してみてください。
          </div>
        )}
      </div>
    </div>
  );
}

function pickEmoji(buddy) {
  const occ = (buddy.occupation || '').toLowerCase();
  const age = buddy.age || 30;
  if (/漁|海|船/.test(occ)) return '🎣';
  if (/農|畑|野菜|花/.test(occ)) return '🌾';
  if (/料理|シェフ|寿司|パン|カフェ/.test(occ)) return '🍳';
  if (/学生|大学/.test(occ)) return '🎓';
  if (/音楽|歌|楽器|ミュージシャン|バンド/.test(occ)) return '🎵';
  if (/絵|画家|デザイン|イラスト|職人/.test(occ)) return '🎨';
  if (/エンジニア|プログラ|IT/.test(occ)) return '💻';
  if (/看護|医|介護/.test(occ)) return '🩺';
  if (/教師|先生|保育/.test(occ)) return '📚';
  if (/僧|宮司|神主/.test(occ)) return '⛩️';
  if (/タクシー|運転|配送|トラック/.test(occ)) return '🚕';
  if (/スポーツ|ヨガ|ジム|ダンス/.test(occ)) return '🧘';
  if (/主婦|主夫|育児/.test(occ)) return '🏠';
  if (age >= 65) return '👴';
  if (age <= 22) return '🧑‍🎓';
  return '👤';
}
