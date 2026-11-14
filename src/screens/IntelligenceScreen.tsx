import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ChevronRight,
  CreditCard,
  FileText,
  Ghost,
  History,
  Image as ImageIcon,
  Menu,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CoachOrb, Sheet } from '../components/ui';
import { showToast } from '../components/toast';
import { format as fmt } from 'date-fns';

const SUGGESTIONS = [
  { icon: <FileText size={18} />, title: 'Create a training plan', sub: 'Personalized for you', prompt: 'Create a training plan for the next 6 weeks.' },
  { icon: <Utensils size={18} />, title: 'Log food', sub: 'Track your daily nutrition', prompt: 'Help me log lunch — chicken bowl with rice and avocado.' },
  { icon: <Sparkles size={18} />, title: 'Review my recovery', sub: 'See what is driving it', prompt: 'Why is my recovery low today?' },
  { icon: <History size={18} />, title: 'Plan my week', sub: 'Balance load and sleep', prompt: 'Plan my training week around my recovery.' },
];

export function IntelligenceScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const state = useAppStore();
  const [text, setText] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const thread = state.chats.find((c) => c.id === id);
  const recent = state.chats.filter((c) => !c.ghost && !c.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pinned = state.chats.filter((c) => c.pinned && !c.ghost);
  const creditsLeft = state.credits.weeklyAllowance - state.credits.weeklyUsed + state.credits.purchased;
  const canSend = creditsLeft > 0 && state.settings.aiEnabled;

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
      setCreditsOpen(true);
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
        <div className="row gap-6" style={{ alignItems: 'center' }}>
          <span className="chat-orb-small" style={{ width: 22, height: 22 }} />
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Bevel Intelligence</span>
        </div>
        <button className="icon-btn icon-btn--soft" onClick={() => navigate('/')} aria-label="Close"><X size={19} /></button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {!thread || thread.messages.length === 0 ? (
          <div className="chat-empty">
            <CoachOrb size={88} />
            <div className="chat-date">{format(new Date(), 'EEE, MMM d')}</div>
            <div className="chat-greeting">Welcome back, {state.profile.name.split(' ')[0]}!</div>
            <p className="caption" style={{ maxWidth: 280, marginTop: 4 }}>
              Fully offline. Your coach reads today’s recovery, sleep, training and nutrition on this device — no account, no cloud.
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
                  {m.role === 'assistant' ? <span className="chat-orb-small" /> : null}
                  <div className={`bubble ${m.role === 'user' ? 'bubble--user' : 'bubble--assistant'}`}>
                    {m.pending ? (
                      <span className="thinking"><i /><i /><i /></span>
                    ) : (
                      <>
                        {m.attachmentName ? <div className="bubble-meta" style={{ color: 'inherit', opacity: 0.7 }}><Paperclip size={11} /> {m.attachmentName}</div> : null}
                        {m.text}
                        {m.role === 'assistant' ? (
                          <div className="bubble-meta"><Sparkles size={10} /> {m.credits ?? 1} credits</div>
                        ) : null}
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
          placeholder="Ask Bevel anything"
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
          <button className="composer-plus" onClick={() => setAttachOpen(true)} aria-label="Attach"><Plus size={18} /></button>
          <button className="composer-mode" onClick={() => { state.updateSettings({ aiModel: state.settings.aiModel === 'standard' ? 'upgraded' : 'standard' }); showToast(state.settings.aiModel === 'standard' ? 'Upgraded model enabled' : 'Standard model enabled'); }}>
            {state.settings.aiModel === 'standard' ? 'Fast' : 'Deep'}
          </button>
          <span className="pill pill--sm pill--flat" style={{ padding: '5px 8px', fontSize: 10.5 }}>Offline</span>
          <button className="icon-btn icon-btn--ghost" style={{ width: 32, height: 32 }} onClick={() => showToast('Voice input requires the native build')} aria-label="Microphone"><Mic size={18} className="chevron" /></button>
          <button className="send-btn" disabled={!text.trim()} onClick={() => send()} aria-label="Send"><Send size={15} /></button>
        </div>
      </div>

      {historyOpen ? (
        <Sheet title="Chats" onClose={() => setHistoryOpen(false)} full>
          <div className="credit-card">
            <div className="row-between">
              <div>
                <div className="credit-card__label">Weekly allowance</div>
                <div className="credit-card__value">{creditsLeft}</div>
              </div>
              <button className="pill pill--sm" style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }} onClick={() => { setHistoryOpen(false); setCreditsOpen(true); }}>
                <CreditCard size={12} /> Buy credits
              </button>
            </div>
            <div className="credit-bar"><span style={{ width: `${Math.min(100, (state.credits.weeklyUsed / state.credits.weeklyAllowance) * 100)}%` }} /></div>
            <div className="row-between mt-8" style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)' }}>
              <span>{state.credits.weeklyUsed} used this week</span>
              <span>Resets {format(new Date(state.credits.resetsAt), 'MMM d')}</span>
            </div>
          </div>
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
                  <span className="chat-orb-small" style={{ width: 24, height: 24 }} />
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
            <div className="grow"><div className="list-title">Bevel Intelligence settings</div><div className="list-sub">Model, ghost mode, personality, data</div></div>
            <ChevronRight size={16} className="chevron" />
          </button>
        </Sheet>
      ) : null}

      {settingsOpen ? (
        <Sheet title="Bevel Intelligence" subtitle="Your coach, your rules." onClose={() => setSettingsOpen(false)}>
          <div className="list-card" style={{ boxShadow: 'none' }}>
            <div className="list-row">
              <div className="list-icon"><Sparkles size={16} /></div>
              <div className="grow"><div className="list-title">Bevel Intelligence</div><div className="list-sub">Grounded in your health data</div></div>
              <button className={`switch ${state.settings.aiEnabled ? 'switch--on' : ''}`} onClick={() => state.updateSettings({ aiEnabled: !state.settings.aiEnabled })} aria-label="Toggle AI" />
            </div>
            <div className="list-row">
              <div className="list-icon"><CreditCard size={16} /></div>
              <div className="grow"><div className="list-title">Usage & credits</div><div className="list-sub">{creditsLeft} left · resets {format(new Date(state.credits.resetsAt), 'MMM d')}</div></div>
              <button className="pill pill--sm pill--flat" onClick={() => { setSettingsOpen(false); setCreditsOpen(true); }}>Manage</button>
            </div>
            <div className="list-row">
              <div className="list-icon"><Ghost size={16} /></div>
              <div className="grow"><div className="list-title">Ghost Mode</div><div className="list-sub">Chats vanish after {state.settings.ghostRetentionMin >= 60 ? `${state.settings.ghostRetentionMin / 60}h` : `${state.settings.ghostRetentionMin}m`}</div></div>
              <button className={`switch ${state.settings.ghostDefault ? 'switch--on' : ''}`} onClick={() => state.updateSettings({ ghostDefault: !state.settings.ghostDefault })} aria-label="Ghost default" />
            </div>
            <div className="list-row">
              <div className="list-icon"><Settings2 size={16} /></div>
              <div className="grow"><div className="list-title">Model</div><div className="list-sub">Upgraded uses more credits</div></div>
              <button className="pill pill--sm pill--flat" onClick={() => state.updateSettings({ aiModel: state.settings.aiModel === 'standard' ? 'upgraded' : 'standard' })}>
                {state.settings.aiModel === 'standard' ? 'Standard' : 'Upgraded'}
              </button>
            </div>
          </div>

          <div className="settings-group-label">Personality</div>
          <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
            {(['supportive', 'direct', 'analytical', 'playful'] as const).map((p) => (
              <button key={p} className={`pill ${state.settings.aiPersonality === p ? 'pill--dark' : 'pill--flat'}`} onClick={() => state.updateSettings({ aiPersonality: p })}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <div className="settings-group-label">Conversation</div>
          <div className="list-card" style={{ boxShadow: 'none' }}>
            <div className="list-row">
              <div className="grow"><div className="list-title">Suggested follow-ups</div><div className="list-sub">Show chips under replies</div></div>
              <button className={`switch ${state.settings.suggestedFollowUps ? 'switch--on' : ''}`} onClick={() => state.updateSettings({ suggestedFollowUps: !state.settings.suggestedFollowUps })} aria-label="Suggestions" />
            </div>
            <div className="list-row">
              <div className="grow"><div className="list-title">Expanded thinking</div><div className="list-sub">Show reasoning steps (beta)</div></div>
              <button className={`switch ${state.settings.expandedThinking ? 'switch--on' : ''}`} onClick={() => state.updateSettings({ expandedThinking: !state.settings.expandedThinking })} aria-label="Thinking" />
            </div>
            <div className="list-row">
              <div className="list-icon"><Trash2 size={16} /></div>
              <div className="grow"><div className="list-title" style={{ color: 'var(--red)' }}>Delete all chats</div><div className="list-sub">This cannot be undone</div></div>
              <button className="pill pill--sm pill--flat" onClick={() => { state.chats.forEach((c) => state.deleteChat(c.id)); showToast('All chats deleted'); }}>Delete</button>
            </div>
          </div>
          <p className="caption mt-16">Bevel Intelligence cannot diagnose conditions, recommend medication doses, start workouts or change settings. It is not a doctor.</p>
        </Sheet>
      ) : null}

      {creditsOpen ? (
        <Sheet title="Credits" subtitle="Purchased credits roll over and never expire." onClose={() => setCreditsOpen(false)}>
          <div className="credit-card" style={{ background: 'linear-gradient(135deg,#20301a,#33452a)' }}>
            <div className="credit-card__label">Balance</div>
            <div className="credit-card__value">{creditsLeft}</div>
            <div className="credit-bar"><span style={{ width: `${Math.min(100, (state.credits.weeklyUsed / state.credits.weeklyAllowance) * 100)}%` }} /></div>
          </div>
          <div className="col gap-8 mt-16">
            {[
              [350, '$4.99', '350 credits'],
              [700, '$8.99', '700 + 50 bonus'],
              [1400, '$16.99', '1,400 + 150 bonus'],
              [3500, '$39.99', '3,500 + 700 bonus'],
            ].map(([n, price, label]) => (
              <button key={String(n)} className="status-option" onClick={() => { state.buyCredits(Number(n) as 350 | 700 | 1400 | 3500); showToast('Credits added'); }}>
                <span className="status-option__icon">✨</span>
                <span className="grow"><span className="list-title">{n} credits</span><span className="list-sub">{label}</span></span>
                <span style={{ fontWeight: 700 }}>{price}</span>
              </button>
            ))}
          </div>
          <p className="caption mt-16">Pro includes a weekly allowance that resets every 7 days. Standard features stay free.</p>
        </Sheet>
      ) : null}

      {attachOpen ? (
        <Sheet title="Attach" subtitle="Files are analyzed on-device in this build." onClose={() => setAttachOpen(false)}>
          <div className="col gap-8">
            {[
              ['Photo library', <ImageIcon size={18} />, 'Add a meal or lab photo'],
              ['Take a photo', <ImageIcon size={18} />, 'Camera'],
              ['Health record', <FileText size={18} />, 'PDF, image or text · max 5 MB'],
            ].map(([label, icon, sub]) => (
              <button key={String(label)} className="status-option" onClick={() => { setAttachOpen(false); showToast('Attachment added to your next message'); }}>
                <span className="status-option__icon">{icon}</span>
                <span className="grow"><span className="list-title">{label}</span><span className="list-sub">{sub}</span></span>
                <ChevronRight size={16} className="chevron" />
              </button>
            ))}
          </div>
          <p className="caption mt-16">Sending a lab report can improve Biological Age confidence. You can delete files any time.</p>
        </Sheet>
      ) : null}

      <div className="row" style={{ justifyContent: 'center', gap: 4, paddingBottom: 2 }}>
        <MoreHorizontal size={12} className="chevron" />
        <span style={{ fontSize: 9.5, color: 'var(--muted-2)' }}>{fmt(new Date(), 'yyyy')} · Bevel Community · on-device demo</span>
      </div>
    </div>
  );
}
