import { useState, useRef, useEffect } from 'react';
import { C, S, uid, now, fmtD } from './constants.js';
import { getUserName, getProfile } from './storage.js';
import { generateBuddies, chatWithBuddy } from './buddy.js';
import QuickMemo from './QuickMemo.jsx';

const TAB = { ROSTER: 'roster', CHAT: 'chat', REPLAY: 'replay' };

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
  const [errMsg, setErrMsg] = useState(null);
  const [activeBuddy, setActiveBuddy] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [showFavs, setShowFavs] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [showChats, setShowChats] = useState(true);
  const [replayChat, setReplayChat] = useState(null);
  const [chatId, setChatId] = useState(null);
  const chatBoxRef = useRef(null);

  const buddies = data.buddies || [];
  const favBuddies = buddies.filter(b => b.isFavorite);
  const sessions = data.buddySessions || [];
  const chatLogs = data.buddyChats || [];

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [messages]);

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setCandidates([]);
    setErrMsg(null);
    const profile = getProfile();
    const result = await generateBuddies(topic.trim(), profile);
    if (result.error) {
      setErrMsg(result.error);
    } else {
      setCandidates(result.buddies.map(b => ({ ...b, id: 'b_' + uid(), topicSeed: topic.trim(), emoji: pickEmoji(b) })));
    }
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
    setChatId('c_' + uid());
    setTab(TAB.CHAT);
    setTimeout(async () => {
      setSending(true);
      const userName = getUserName();
      const opener = await chatWithBuddy(buddy, [], '(雑談を始める。挨拶代わりに、最近の自分の生活の断片を1つだけ話して、軽く相手に「最近どう？」みたいに振ってください。短く。)', userName);
      setMessages([{ role: 'buddy', text: opener, ts: now() }]);
      setSending(false);
    }, 100);
  };

  // リアルタイム自動保存
  useEffect(() => {
    if (!chatId || !activeBuddy || messages.length === 0) return;
    const existing = (data.buddyChats || []).find(c => c.id === chatId);
    const entry = {
      id: chatId,
      buddyId: activeBuddy.id, buddyName: activeBuddy.name,
      topicSeed: activeBuddy.topicSeed, messages,
      createdAt: existing?.createdAt || messages[0]?.ts || now(),
      updatedAt: now(),
    };
    const rest = (data.buddyChats || []).filter(c => c.id !== chatId);
    save({ ...data, buddyChats: [entry, ...rest].slice(0, 50) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, chatId]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const next = [...messages, { role: 'user', text, ts: now() }];
    setMessages(next);
    setSending(true);
    const userName = getUserName();
    const reply = await chatWithBuddy(activeBuddy, next, text, userName);
    setMessages([...next, { role: 'buddy', text: reply, ts: now() }]);
    setSending(false);
  };

  const isActiveFav = !!buddies.find(b => b.id === activeBuddy?.id && b.isFavorite);
  const toggleActiveFav = () => {
    if (!activeBuddy) return;
    toggleFav(activeBuddy);
  };

  const saveSession = () => {
    if (candidates.length === 0) return;
    const sess = {
      id: 's_' + uid(),
      topic: candidates[0]?.topicSeed || topic.trim(),
      buddies: candidates,
      createdAt: now(),
    };
    save({ ...data, buddySessions: [sess, ...sessions].slice(0, 30) });
  };

  const loadSession = (sess) => {
    setCandidates(sess.buddies);
    setTopic(sess.topic);
    setErrMsg(null);
  };

  const deleteSession = (sid) => {
    save({ ...data, buddySessions: sessions.filter(s => s.id !== sid) });
  };

  const openReplay = (chat) => {
    setReplayChat(chat);
    setTab(TAB.REPLAY);
  };

  const closeReplay = () => {
    setReplayChat(null);
    setTab(TAB.ROSTER);
  };

  const deleteChat = (cid) => {
    save({ ...data, buddyChats: chatLogs.filter(c => c.id !== cid) });
  };

  const currentSessionSaved = candidates.length > 0 && sessions.some(s => s.buddies?.[0]?.id === candidates[0]?.id);

  const endChat = () => {
    // 自動保存済みなので state クリアのみ
    setActiveBuddy(null);
    setMessages([]);
    setChatId(null);
    setTab(TAB.ROSTER);
  };

  const addSpark = (sp) => {
    save({ ...data, sparks: [...data.sparks, { ...sp, buddyName: activeBuddy?.name }] });
    setShowMemo(false);
  };

  if (tab === TAB.REPLAY && replayChat) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FDFBF8' }}>
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>
              📼 再生: {replayChat.buddyName}
            </div>
            <div style={{ fontSize: 13, color: C.sub }}>
              {fmtD(replayChat.createdAt)}・お題: {replayChat.topicSeed}
            </div>
          </div>
          <button style={{ ...S.txtBtn, fontSize: 14 }} onClick={closeReplay}>戻る</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {replayChat.messages.map((m, i) => (
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
        </div>
      </div>
    );
  }

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
            <div style={{ fontSize: 12, color: C.sub }}>
              {activeBuddy.occupation}
              {messages.length > 0 && <span style={{ marginLeft: 8, color: '#22C55E' }}>● 自動保存中</span>}
            </div>
          </div>
          <button
            onClick={toggleActiveFav}
            style={{
              background: 'none', border: 'none', fontSize: 24, cursor: 'pointer',
              color: isActiveFav ? '#F59E0B' : C.border, padding: '4px 8px',
            }}
            title={isActiveFav ? 'お気に入り解除' : 'お気に入りに保存'}
          >{isActiveFav ? '★' : '☆'}</button>
          <button
            onClick={() => setShowMemo(true)}
            style={{
              background: '#FFF8E1', border: `1px solid ${C.accent}`, borderRadius: 18,
              padding: '6px 14px', fontSize: 14, color: '#7A6010', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600,
            }}
          >💡 ひらめいた</button>
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
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              if (e.shiftKey) return;
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              send();
            }}
            placeholder="どうでもいい話を…"
            style={{ ...S.inp, margin: 0, flex: 1 }}
            disabled={sending}
          />
          <button onClick={send} disabled={sending || !input.trim()} style={{ ...S.pri, width: 'auto', padding: '0 18px' }}>送信</button>
        </div>
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
          {errMsg && (
            <div style={{
              marginTop: 12, padding: '10px 12px', background: '#FFF1F0',
              border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 14, color: '#B91C1C', lineHeight: 1.5,
            }}>
              ⚠ {errMsg}
            </div>
          )}
        </div>

        {candidates.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>新しく呼ばれた3人</div>
              <button
                onClick={saveSession}
                disabled={currentSessionSaved}
                style={{
                  background: currentSessionSaved ? C.bg2 : '#fff',
                  border: `1px solid ${currentSessionSaved ? C.border : C.accent2}`,
                  color: currentSessionSaved ? C.sub : C.accent2,
                  padding: '6px 14px', borderRadius: 18, fontSize: 14,
                  cursor: currentSessionSaved ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontWeight: 600,
                }}
              >
                {currentSessionSaved ? '✓ 保存済み' : '💾 このセッションを保存'}
              </button>
            </div>
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
          <div style={{ marginBottom: 24 }}>
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

        {sessions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={() => setShowSessions(!showSessions)}
              style={{ ...S.txtBtn, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}
            >
              📂 保存したセッション（{sessions.length}）{showSessions ? '▼' : '▶'}
            </button>
            {showSessions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sessions.map(s => (
                  <div key={s.id} style={{
                    background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10,
                    padding: 12, display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic}</div>
                      <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                        {fmtD(s.createdAt)}・{s.buddies?.map(b => `${b.emoji || ''}${b.name}`).join(' / ')}
                      </div>
                    </div>
                    <button
                      onClick={() => loadSession(s)}
                      style={{
                        background: C.accent2, color: '#fff', border: 'none',
                        padding: '6px 12px', borderRadius: 16, fontSize: 13, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 600,
                      }}
                    >呼び出す</button>
                    <button
                      onClick={() => deleteSession(s.id)}
                      style={{ ...S.iconBtn, fontSize: 16, color: C.sub }}
                      title="削除"
                    >🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {chatLogs.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={() => setShowChats(!showChats)}
              style={{ ...S.txtBtn, fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}
            >
              💬 過去の会話（{chatLogs.length}）{showChats ? '▼' : '▶'}
            </button>
            {showChats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chatLogs.map(c => (
                  <div key={c.id} style={{
                    background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10,
                    padding: 12, display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.buddyName} と {c.messages?.length || 0} ターン
                      </div>
                      <div style={{ fontSize: 12, color: C.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {fmtD(c.createdAt)}・お題: {c.topicSeed}
                      </div>
                    </div>
                    <button
                      onClick={() => openReplay(c)}
                      style={{
                        background: '#fff', color: C.accent2, border: `1px solid ${C.accent2}`,
                        padding: '6px 12px', borderRadius: 16, fontSize: 13, cursor: 'pointer',
                        fontFamily: 'inherit', fontWeight: 600,
                      }}
                    >📼 再生</button>
                    <button
                      onClick={() => deleteChat(c.id)}
                      style={{ ...S.iconBtn, fontSize: 16, color: C.sub }}
                      title="削除"
                    >🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {candidates.length === 0 && favBuddies.length === 0 && sessions.length === 0 && !loading && (
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
