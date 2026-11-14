import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ChevronRight,
  FileText,
  Ghost,
  History,
  Menu,
  MessageCircle,
  Paperclip,
  Pin,
  Plus,
  Send,
  Settings2,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { BeneMark, Sheet } from '../components/ui';
import { showToast } from '../components/toast';

const SUGGESTIONS = [
  { icon: <FileText size={18} />, title: 'Create a training plan', sub: 'Build a week around recovery', prompt: 'Create a training plan for the next 6 weeks.' },
  { icon: <Utensils size={18} />, title: 'Log food', sub: 'Add a meal or snack', prompt: 'Help me log lunch — chicken bowl with rice and avocado.' },
  { icon: <MessageCircle size={18} />, title: 'Review my recovery', sub: 'See what moved last night', prompt: 'Why is my recovery low today?' },
  { icon: <History size={18} />, title: 'Plan my week', sub: 'Balance load and sleep', prompt: 'Plan my training week around my recovery.' },
];

export function IntelligenceScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const state = useAppStore();
  const [text, setText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const thread = state.chats.find((c) => c.id === id);
  const recent = state.chats.filter((c) => !c.ghost && !c.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pinned = state.chats.filter((c) => c.pinned && !c.ghost);
  const canSend = state.settings.aiEnabled;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread?.messages.length]);

  useEffect(() => {
    const now = Date.now();
    for (const c of state.chats) {
      if (c.ghost && c.expiresAt && new Date(c.expiresAt).getTime() < now) state.deleteChat(c.id);
    }
    // run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (value?: string) => {
    const message = (value ?? text).trim();
    if (!message) return;
    if (!canSend) {
      setSettingsOpen(true);
      return;
    }
    let threadId = id;
    if (!threadId) {
      threadId = state.createChatThread(false);
      navigate(`/chat/${threadId}`);
    }
    state.sendChatMessage(threadId, message);
    setText('');
    if (textRef.current) textRef.current.style.height = 'auto';
  };

  const ghostMinutes = useMemo(() => {
    if (!thread?.expiresAt) return null;
    return Math.max(0, Math.round((new Date(thread.expiresAt).getTime() - Date.now()) / 60000));
  }, [thread?.expiresAt]);

  return (
    <div className="chat-page">
      <div className="chat-head">
        <button className="icon-btn icon-btn--soft" onClick={() => setHistoryOpen(true)} aria-label="Chat history"><Menu size={19} /></button>
        <div className="chat-head__name">
          <BeneMark size={18} />
          <span>Local coach</span>
        </div>
        <button className="icon-btn icon-btn--soft" onClick={() => navigate('/intelligence')} aria-label="New chat"><Plus size={19} /></button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {!thread || thread.messages.length === 0 ? (
          <div className="chat-empty">
            <div className="brand-mark__icon" style={{ width: 56, height: 56, borderRadius: 12 }}>
              <BeneMark size={30} />
            </div>
            <div className="chat-date">{format(new Date(), 'EEE, MMM d')}</div>
            <div className="chat-greeting">Welcome back, {state.profile.name.split(' ')[0]}</div>
            <p className="caption" style={{ maxWidth: 280, marginTop: 4 }}>
              Runs on this device. Answers are composed from your metrics by local rules — no network call.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s.title} className="suggestion-card" onClick={() => send(s.prompt)}>
                  <span className="list-icon" style={{ width: 30, height: 30, borderRadius: 9 }}>{s.icon}</span>
                  <div className="suggestion-card__title">{s.title}</div>
                  <div className="suggestion-card__sub">{s.sub}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {thread.ghost ? (
              <div className="row gap-6" style={{ justifyContent: 'center', marginBottom: 14 }}>
                <span className="pill pill--sm pill--flat"><Ghost size={12} /> Ghost chat · disappears in {ghostMinutes ?? 60}m</span>
              </div>
            ) : null}
            {thread.messages.map((m) => (
              <div key={m.id}>
                <div className={`msg-row ${m.role === 'user' ? 'msg-row--user' : ''}`}>
                  {m.role === 'assistant' ? <BeneMark size={24} className="chat-mark" /> : null}
                  <div className={`bubble ${m.role === 'user' ? 'bubble--user' : 'bubble--assistant'}`}>
                    {m.pending ? (
                      <span className="thinking"><i /><i /><i /></span>
                    ) : (
                      <>
                        {m.attachmentName ? <div className="bubble-meta" style={{ color: 'inherit', opacity: 0.7 }}><Paperclip size={11} /> {m.attachmentName}</div> : null}
                        {m.text}
                      </>
                    )}
                  </div>
                </div>
                {m.role === 'assistant' && !m.pending && m.followUps && state.settings.suggestedFollowUps ? (
                  <div className="followups">
                    {m.followUps.map((f) => (
                      <button key={f} className="followup" onClick={() => send(f)}>{f}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="chat-composer">
        <textarea
          ref={textRef}
          rows={1}
          placeholder="Ask about your numbers"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="composer-actions">
          <span className="pill pill--sm pill--flat" style={{ padding: '5px 8px', fontSize: 10.5 }}>On-device</span>
          <button className="send-btn" disabled={!text.trim()} onClick={() => send()} aria-label="Send"><Send size={15} /></button>
        </div>
      </div>

      {historyOpen ? (
        <Sheet title="Chats" onClose={() => setHistoryOpen(false)} full>
          <p className="caption" style={{ margin: '0 4px 4px' }}>Chats are stored on this device and never leave it.</p>
          <div className="row gap-8 mt-16">
            <button className="btn btn--soft btn--block" onClick={() => { setHistoryOpen(false); navigate('/intelligence'); }}><Plus size={16} /> New chat</button>
            <button
              className="btn btn--outline btn--block"
              onClick={() => {
                const ghostId = state.createChatThread(true);
                setHistoryOpen(false);
                navigate(`/chat/${ghostId}`);
              }}
            >
              <Ghost size={16} /> Ghost
            </button>
          </div>

          {pinned.length ? (
            <>
              <div className="settings-group-label">Pinned</div>
              {pinned.map((c) => (
                <button key={c.id} className="thread-row" onClick={() => { setHistoryOpen(false); navigate(`/chat/${c.id}`); }}>
                  <BeneMark size={20} className="chat-mark" />
                  <span className="grow">
                    <span className="thread-title" style={{ display: 'block' }}>{c.title}</span>
                    <span className="thread-sub" style={{ display: 'block' }}>{c.messages.length} messages</span>
                  </span>
                  <Pin size={13} className="chevron" />
                </button>
              ))}
            </>
          ) : null}

          <div className="settings-group-label">Recent</div>
          {recent.map((c) => (
            <div key={c.id} className="thread-row">
              <button className="grow" style={{ textAlign: 'left' }} onClick={() => { setHistoryOpen(false); navigate(`/chat/${c.id}`); }}>
                <div className="thread-title">{c.title}</div>
                <div className="thread-sub">{format(new Date(c.updatedAt), 'MMM d, h:mm a')} · {c.messages.length} messages</div>
              </button>
              <button className="icon-btn icon-btn--ghost" style={{ width: 30, height: 30 }} onClick={() => { state.togglePinChat(c.id); }} aria-label="Pin"><Pin size={14} className="chevron" /></button>
              <button className="icon-btn icon-btn--ghost" style={{ width: 30, height: 30 }} onClick={() => { state.deleteChat(c.id); showToast('Chat deleted'); }} aria-label="Delete"><Trash2 size={14} className="chevron" /></button>
            </div>
          ))}
          {recent.length === 0 ? <div className="empty" style={{ padding: 20 }}>No chats yet.</div> : null}

          <button className="list-row list-row--plain mt-16" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setHistoryOpen(false); setSettingsOpen(true); }}>
            <div className="list-icon"><Settings2 size={16} /></div>
            <div className="grow"><div className="list-title">Bene Intelligence settings</div><div className="list-sub">Model, ghost mode, personality, data</div></div>
            <ChevronRight size={16} className="chevron" />
          </button>
        </Sheet>
      ) : null}

      {settingsOpen ? (
        <Sheet title="Local coach" subtitle="Answers from your metrics, on this device" onClose={() => setSettingsOpen(false)}>
          <div className="list-card" style={{ boxShadow: 'none' }}>
            <div className="list-row">
              <div className="list-icon"><MessageCircle size={16} /></div>
              <div className="grow"><div className="list-title">Local coach</div><div className="list-sub">Reads your metrics on this device</div></div>
              <button className={`switch ${state.settings.aiEnabled ? 'switch--on' : ''}`} onClick={() => state.updateSettings({ aiEnabled: !state.settings.aiEnabled })} aria-label="Toggle AI" />
            </div>
            <div className="list-row">
              <div className="list-icon"><Ghost size={16} /></div>
              <div className="grow"><div className="list-title">Ghost Mode</div><div className="list-sub">Chats vanish after {state.settings.ghostRetentionMin >= 60 ? `${state.settings.ghostRetentionMin / 60}h` : `${state.settings.ghostRetentionMin}m`}</div></div>
              <button className={`switch ${state.settings.ghostDefault ? 'switch--on' : ''}`} onClick={() => state.updateSettings({ ghostDefault: !state.settings.ghostDefault })} aria-label="Ghost default" />
            </div>
          </div>

          <div className="settings-group-label">Conversation</div>
          <div className="list-card" style={{ boxShadow: 'none' }}>
            <div className="list-row">
              <div className="grow"><div className="list-title">Suggested follow-ups</div><div className="list-sub">Show chips under replies</div></div>
              <button className={`switch ${state.settings.suggestedFollowUps ? 'switch--on' : ''}`} onClick={() => state.updateSettings({ suggestedFollowUps: !state.settings.suggestedFollowUps })} aria-label="Suggestions" />
            </div>
            <div className="list-row">
              <div className="list-icon"><Trash2 size={16} /></div>
              <div className="grow"><div className="list-title" style={{ color: 'var(--red)' }}>Delete all chats</div><div className="list-sub">This cannot be undone</div></div>
              <button className="pill pill--sm pill--flat" onClick={() => { state.chats.forEach((c) => state.deleteChat(c.id)); showToast('All chats deleted'); }}>Delete</button>
            </div>
          </div>
          <p className="caption mt-16">Bene Intelligence cannot diagnose conditions, recommend medication doses, start workouts or change settings. It is not a doctor.</p>
        </Sheet>
      ) : null}
    </div>
  );
}
