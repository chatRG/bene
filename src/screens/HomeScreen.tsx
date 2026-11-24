import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Flame,
  Heart,
  Leaf,
  Minus,
  MessageCircle,
  Moon,
  Plus,
  Utensils,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { deriveDay, coachInsight } from '../domain/derive';
import { clockLabel } from '../domain/time';
import { recoveryColor } from '../domain/scoring/recovery';
import { stageTotals } from '../domain/math';
import { Ring, Sheet, SectionHead } from '../components/ui';
import { EnergyBar } from '../components/charts';
import { Glyph } from '../components/glyphs';
import { showToast } from '../components/toast';
import { PullToRefresh } from '../components/pull-to-refresh';
import { readAndImport } from '../native/link';
import type { ActivityStatus } from '../domain/types';

const CARD_META: Record<string, { title: string; blurb: string }> = {
  scores: { title: 'Daily scores', blurb: 'Recovery, Strain and Sleep' },
  coach: { title: 'Coach insight', blurb: 'Your morning briefing' },
  stress: { title: 'Stress & Energy', blurb: 'Live stress and Energy Bank' },
  sleep: { title: 'Sleep', blurb: "Last night's stages and sleep bank" },
  timeline: { title: 'Timeline', blurb: 'Your day, past and planned' },
  nutrition: { title: 'Nutrition', blurb: 'Calories, macros and net energy' },
  journal: { title: 'Journal', blurb: 'Quick-log your habits' },
  fitness: { title: 'Training', blurb: 'Load, freshness and next session' },
};

const DEFAULT_ORDER = ['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal'];

const STATUS_LABEL: Record<ActivityStatus, string> = {
  active: 'Active',
  sick: 'Sick',
  injured: 'Injured',
  break: 'On a break',
};

export function HomeScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const today = dateKey(new Date());
  const derived = useMemo(() => deriveDay(state, today, new Date()), [state, today]);
  const weeklyZone2 = useMemo(
    () => Math.round(state.dayOrder.slice(-7).reduce((total, day) => total + (state.days[day]?.workouts ?? []).reduce((sum, w) => sum + w.zoneMinutes[2] + w.zoneMinutes[3], 0), 0)),
    [state.dayOrder, state.days],
  );
  const allWorkouts = useMemo(
    () => state.dayOrder.flatMap((date) => state.days[date]?.workouts ?? []),
    [state.dayOrder, state.days],
  );
  const insight = coachInsight(derived);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(state.settings.homeOrder);
  const [addOpen, setAddOpen] = useState(false);
  const location = useLocation();

  // Settings sends the user here to arrange cards, rather than telling them to
  // find the button themselves. The flag is consumed once so a back press does
  // not reopen the editor.
  useEffect(() => {
    if ((location.state as { editHome?: boolean } | null)?.editHome) {
      setDraft(state.settings.homeOrder);
      setEditing(true);
      navigate('/', { replace: true, state: null });
    }
  }, [location.state, navigate, state.settings.homeOrder]);

  const order = editing ? draft : state.settings.homeOrder;
  const visible = order.filter((id) => {
    if (id === 'journal' && !state.settings.activeTabs.journal) return false;
    if (id === 'fitness' && !state.settings.activeTabs.fitness) return false;
    if (id === 'nutrition' && !state.settings.activeTabs.nutrition) return false;
    return true;
  });

  const sleepTotals = derived.sleep ? stageTotals(derived.sleep) : null;
  const sleepHours = sleepTotals ? Math.floor(sleepTotals.asleepMin / 60) : 0;
  const sleepMins = sleepTotals ? sleepTotals.asleepMin % 60 : 0;
  const remaining = state.settings.calorieGoal - derived.nutrition.totals.calories;
  const status = state.settings.activityStatus;

  const move = (id: string, dir: -1 | 1) => {
    const idx = draft.indexOf(id);
    const next = [...draft];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft(next);
  };

  const save = () => {
    state.saveHomeLayout(draft);
    setEditing(false);
    showToast('Home updated');
  };

  const startEdit = () => {
    setDraft(state.settings.homeOrder);
    setEditing(true);
  };

  const toggleCard = (id: string) => {
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  };

  /* Pull to refresh does the one thing that can bring in new numbers: read the
     health store and merge whatever it has. The date is rolled first, so a pull
     just after midnight lands on the new day rather than the old one. */
  const importHealthDays = useAppStore((s) => s.importHealthDays);
  const ensureToday = useAppStore((s) => s.ensureToday);

  const refresh = useCallback(async () => {
    ensureToday();
    const link = await readAndImport(importHealthDays);
    showToast(
      link.phase === 'connected'
        ? link.days
          ? `Synced ${link.days} ${link.days === 1 ? 'day' : 'days'}`
          : 'Already up to date'
        : link.phase === 'denied'
          ? 'Health access was not granted'
          : 'No health store to sync',
    );
  }, [ensureToday, importHealthDays]);

  const quickJournal = (tagId: string, value: 'yes' | 'no') => {
    state.addJournal(today, tagId, value);
    const tag = state.journalTags.find((t) => t.id === tagId);
    showToast(`${tag?.label ?? 'Entry'} logged`);
  };

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="screen home-screen">
      <div className="home-top">
        <div className="home-top__left">
          <button className={`status-chip ${status !== 'active' ? 'status-chip--alert' : ''}`} onClick={() => setStatusOpen(true)}>
            {status === 'active' ? <span className="status-dot" /> : <Heart size={13} />}
            <span>
              <strong>{STATUS_LABEL[status]}</strong>
              <small>{state.settings.activityStatusUntil ? 'Until ' + format(new Date(state.settings.activityStatusUntil), 'MMM d') : 'Today'}</small>
            </span>
          </button>
        </div>
        <button
          className="avatar"
          onClick={() => navigate('/profile')}
          aria-label="Profile"
        >
          {state.profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
        </button>
      </div>

      <div className="row-between" style={{ marginTop: 18, marginBottom: 16 }}>
        <button className="date-button" onClick={() => navigate('/timeline')}>
          {editing ? 'Edit Home' : `Today, ${format(new Date(), 'MMMM d')}`}
          {!editing ? <ChevronDown size={18} strokeWidth={2.4} /> : null}
        </button>
        {editing ? (
          <div className="row gap-8">
            <button className="pill pill--flat" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="pill pill--dark" onClick={save}>
              <Check size={14} /> Save
            </button>
          </div>
        ) : (
          <button className="icon-btn icon-btn--soft" onClick={() => navigate('/intelligence')} aria-label="Open coach">
            <MessageCircle size={18} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className={editing ? 'edit-stack' : 'stagger'}>
        {visible.map((id) => {
          const inner = (() => {
            switch (id) {
              case 'scores':
                return (
                  <div className="card score-card">
                    <button className="score-card__col" onClick={() => navigate('/strain')}>
                      <Ring value={derived.strain.score} size={78} stroke={7} color="var(--orange)">
                        <div className="ring__center">
                          <span className="ring__value">{derived.strain.unscored ? '—' : `${Math.round(derived.strain.score)}%`}</span>
                          <span className="ring__label">Strain</span>
                        </div>
                      </Ring>
                      <span className="score-card__hint">{derived.strain.unscored ? 'No data' : derived.strain.status === 'within' ? 'On target' : derived.strain.status === 'above' ? 'Above target' : 'Below target'}</span>
                    </button>
                    <div className="score-card__divider" />
                    <button className="score-card__col" onClick={() => navigate('/recovery')}>
                      <Ring value={derived.recovery.score ?? 0} size={78} stroke={7} color={recoveryColor(derived.recovery.score)}>
                        <div className="ring__center">
                          <span className="ring__value">{derived.recovery.score ?? '—'}</span>
                          <span className="ring__label">Recovery</span>
                        </div>
                      </Ring>
                      <span className="score-card__hint">{derived.recovery.label}</span>
                    </button>
                    <div className="score-card__divider" />
                    <button className="score-card__col" onClick={() => navigate('/sleep')}>
                      <Ring value={derived.sleepScore?.score ?? 0} size={78} stroke={7} color="var(--sleep)">
                        <div className="ring__center">
                          <span className="ring__value">{derived.sleepScore?.score ?? '—'}{derived.sleepScore ? '%' : ''}</span>
                          <span className="ring__label">Sleep</span>
                        </div>
                      </Ring>
                      <span className="score-card__hint">{derived.sleepScore ? `${sleepHours}h ${sleepMins}m` : 'No data'}</span>
                    </button>
                  </div>
                );
              case 'coach':
                return (
                  <button className="card coach-card" onClick={() => navigate('/intelligence')} style={{ width: '100%', textAlign: 'left' }}>
                    <div className="row gap-8">
                      <span className={`coach-dot ${insight.tone}`}><Leaf size={14} /></span>
                      <span className="card-title">{insight.title}</span>
                      <ChevronRight size={16} className="chevron" style={{ marginLeft: 'auto' }} />
                    </div>
                    <p className="coach-card__body">{insight.body}</p>
                  </button>
                );
              case 'stress':
                return (
                  <div className="section">
                    <SectionHead
                      title="Stress & Energy"
                      action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/strain')}>Details</button>}
                    />
                    <div className="card stress-card">
                      <div className="row-between">
                        <div>
                          <div className="row gap-6">
                            <span className="status-dot" style={{ background: 'var(--green)' }} />
                            <span className="card-title">Today's stress</span>
                          </div>
                          <div className="card-sub" style={{ marginTop: 2 }}>Last updated at {format(new Date(), 'h:mm a')}</div>
                        </div>
                        <span className={`pill pill--sm ${derived.stress.status === 'scored' ? 'pill--green' : 'pill--flat'}`}>
                          {derived.stress.status === 'scored' ? 'Balanced' : 'Calibrating'}
                        </span>
                      </div>
                      <div className="stress-stats">
                        <div><strong>{derived.stress.status === 'scored' || derived.stress.high > 0 ? derived.stress.high : '—'}</strong><span>Highest</span></div>
                        <div><strong>{derived.stress.status === 'scored' || derived.stress.low > 0 ? derived.stress.low : '—'}</strong><span>Lowest</span></div>
                        <div><strong>{derived.stress.status === 'scored' || derived.stress.average > 0 ? derived.stress.average : '—'}</strong><span>Average</span></div>
                        <div><strong>{derived.stress.status === 'scored' ? derived.stress.energyBank : '—'}</strong><span>Energy bank</span></div>
                      </div>
                      {derived.stress.status === 'scored' ? <EnergyBar value={derived.stress.energyBank} /> : <div className="caption">No stress samples yet. Wear your tracker to build a baseline.</div>}
                    </div>
                  </div>
                );
              case 'sleep':
                return (
                  <button className="card sleep-summary-card" onClick={() => navigate('/sleep')} style={{ width: '100%', textAlign: 'left' }}>
                    <div className="row-between">
                      <div className="row gap-8">
                        <span className="list-icon" style={{ background: 'rgba(109,124,247,.12)', color: 'var(--sleep)' }}><Moon size={17} /></span>
                        <div>
                          <div className="card-title">Sleep</div>
                          <div className="card-sub">{derived.sleep ? `${sleepHours}h ${sleepMins}m asleep` : 'No sleep data'}</div>
                        </div>
                      </div>
                      <div className="row gap-6">
                        <span className="sleep-score">{derived.sleepScore?.score ?? '—'}</span>
                        <ChevronRight size={17} className="chevron" />
                      </div>
                    </div>
                    {sleepTotals && sleepTotals.inBedMin > 0 ? (
                      <>
                        <div className="stage-bar">
                          <span style={{ width: `${(sleepTotals.deepMin / sleepTotals.inBedMin) * 100}%`, background: 'var(--sleep-deep)' }} />
                          <span style={{ width: `${(sleepTotals.coreMin / sleepTotals.inBedMin) * 100}%`, background: 'var(--sleep-core)' }} />
                          <span style={{ width: `${(sleepTotals.remMin / sleepTotals.inBedMin) * 100}%`, background: 'var(--sleep-rem)' }} />
                          <span style={{ width: `${(sleepTotals.awakeMin / sleepTotals.inBedMin) * 100}%`, background: 'var(--sleep-awake)' }} />
                        </div>
                        <div className="stage-legend">
                          <span><i style={{ background: 'var(--sleep-deep)' }} />Deep {Math.round((sleepTotals.deepMin / sleepTotals.inBedMin) * 100)}%</span>
                          <span><i style={{ background: 'var(--sleep-core)' }} />Core {Math.round((sleepTotals.coreMin / sleepTotals.inBedMin) * 100)}%</span>
                          <span><i style={{ background: 'var(--sleep-rem)' }} />REM {Math.round((sleepTotals.remMin / sleepTotals.inBedMin) * 100)}%</span>
                          <span><i style={{ background: 'var(--sleep-awake)' }} />Awake {Math.round((sleepTotals.awakeMin / sleepTotals.inBedMin) * 100)}%</span>
                        </div>
                      </>
                    ) : null}
                    <div className="sleep-need-row">
                      <span>Sleep needed tonight</span>
                      <strong>{Math.floor(derived.sleepNeedMin / 60)}h {derived.sleepNeedMin % 60}m <ChevronRight size={14} /></strong>
                    </div>
                  </button>
                );
              case 'timeline':
                return (
                  <div className="section">
                    <SectionHead
                      title="Timeline"
                      action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/timeline')}>View timeline</button>}
                    />
                    <div className="list-card">
                      {derived.sleep && sleepTotals ? (
                        <div className="list-row">
                          <div className="list-icon" style={{ background: 'rgba(109,124,247,.12)', color: 'var(--sleep)' }}><Moon size={16} /></div>
                          <div className="grow">
                            <div className="list-title">Primary sleep</div>
                            <div className="list-sub">
                              {format(new Date(derived.sleep.start), 'h:mm a')} – {format(new Date(derived.sleep.end), 'h:mm a')} · {Math.floor(sleepTotals.asleepMin / 60)}h {sleepTotals.asleepMin % 60}m asleep
                            </div>
                          </div>
                          <span className="caption">Sleep</span>
                        </div>
                      ) : null}
                      {derived.record.workouts.slice(0, 2).map((w) => (
                        <div className="list-row" key={w.id}>
                          <div className="list-icon" style={{ background: 'rgba(255,122,51,.12)', color: 'var(--orange)' }}><Flame size={16} /></div>
                          <div className="grow">
                            <div className="list-title">{w.name}</div>
                            <div className="list-sub">{w.durationMin} min{w.distanceKm != null ? ` · ${w.distanceKm.toFixed(1)} km` : ''} · {w.calories} kcal</div>
                          </div>
                          <span className="caption">{clockLabel(w.start)}</span>
                        </div>
                      ))}
                      {(state.settings.activeTabs.nutrition ? derived.record.meals : []).slice(0, 2).map((m) => (
                        <div className="list-row" key={m.id}>
                          <div className="list-icon" style={{ background: 'rgba(75,201,58,.12)', color: 'var(--green-deep)' }}><Utensils size={16} /></div>
                          <div className="grow">
                            <div className="list-title">{m.name}</div>
                            <div className="list-sub">{m.calories} kcal · {Math.round(m.proteinG)}g protein</div>
                          </div>
                          <span className="caption">{m.time}</span>
                        </div>
                      ))}
                      {!derived.sleep &&
                      derived.record.workouts.length === 0 &&
                      (!state.settings.activeTabs.nutrition || derived.record.meals.length === 0) ? (
                        <div className="empty" style={{ padding: '18px 12px' }}>Nothing logged yet. Add food, an activity or last night's sleep.</div>
                      ) : null}
                    </div>
                  </div>
                );
              case 'nutrition':
                return (
                  <div className="section">
                    <SectionHead
                      title="Nutrition"
                      action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/nutrition')}>Open</button>}
                    />
                    <button className="card nutrition-mini" onClick={() => navigate('/nutrition')} style={{ width: '100%', textAlign: 'left' }}>
                      <div className="row-between" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <div className="card-sub">Calories eaten</div>
                          <div className="row gap-6" style={{ alignItems: 'baseline' }}>
                            <span className="mono-num" style={{ fontSize: 28, fontWeight: 500 }}>{derived.nutrition.totals.calories.toLocaleString()}</span>
                            <span className="caption" style={{ color: remaining >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                              {remaining >= 0 ? `${remaining.toLocaleString()} under goal` : `${Math.abs(remaining).toLocaleString()} over goal`}
                            </span>
                          </div>
                        </div>
                        <span className="meta-mono">{state.settings.calorieGoal > 0 ? `${Math.round((derived.nutrition.totals.calories / state.settings.calorieGoal) * 100)}% of goal` : 'Goal not set'}</span>
                      </div>
                      <div className="stage-bar" aria-hidden>
                        <span style={{ width: `${derived.nutrition.macroPercents.protein}%`, background: 'var(--protein)' }} />
                        <span style={{ width: `${derived.nutrition.macroPercents.carbs}%`, background: 'var(--carbs)' }} />
                        <span style={{ width: `${derived.nutrition.macroPercents.fat}%`, background: 'var(--fat)' }} />
                      </div>
                      <div className="stage-legend">
                        <span><i style={{ background: 'var(--protein)' }} />Protein {derived.nutrition.totals.proteinG} g · {derived.nutrition.macroPercents.protein}%</span>
                        <span><i style={{ background: 'var(--carbs)' }} />Carbs {derived.nutrition.totals.carbsG} g · {derived.nutrition.macroPercents.carbs}%</span>
                        <span><i style={{ background: 'var(--fat)' }} />Fat {derived.nutrition.totals.fatG} g · {derived.nutrition.macroPercents.fat}%</span>
                      </div>
                      <div className="net-row">
                        <span>Net energy · intake − burn</span>
                        <strong>{derived.nutrition.netEnergy != null ? `${derived.nutrition.netEnergy > 0 ? '+' : ''}${derived.nutrition.netEnergy} kcal` : '—'}</strong>
                      </div>
                    </button>
                  </div>
                );
              case 'journal':
                return (
                  <div className="section">
                    <SectionHead
                      title="Journal"
                      action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/journal')}>All tags</button>}
                    />
                    <div className="card journal-quick">
                      {state.journalTags.filter((t) => t.pinned).slice(0, 4).map((tag) => {
                        const entry = derived.record.journal.find((j) => j.tagId === tag.id);
                        return (
                          <div className="journal-quick__row" key={tag.id}>
                            <span className="journal-emoji"><Glyph emoji={tag.icon} /></span>
                            <span className="grow list-title">{tag.label}</span>
                            {tag.kind === 'yesno' ? (
                              <div className="yesno">
                                <button className={entry?.value === 'yes' ? 'on' : ''} onClick={() => quickJournal(tag.id, 'yes')}><Check size={13} /></button>
                                <button className={entry?.value === 'no' ? 'on no' : 'no'} onClick={() => quickJournal(tag.id, 'no')}><X size={13} /></button>
                              </div>
                            ) : (
                              <button className="pill pill--sm pill--flat" onClick={() => navigate('/journal')}>
                                {entry ? String(entry.value) : 'Log'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              case 'fitness':
                return (
                  <div className="section">
                    <SectionHead title="Training" action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/fitness')}>Open</button>} />
                    <button className="card fitness-mini" onClick={() => navigate('/fitness')} style={{ width: '100%', textAlign: 'left' }}>
                      <div className="row-between">
                        <div>
                          <div className="card-sub">Cardio load</div>
                          <div className="h2" style={{ marginTop: 2 }}>{allWorkouts.length > 0 ? 'Logged' : 'No sessions yet'}</div>
                        </div>
                        <span className={`pill pill--sm ${allWorkouts.length > 0 ? 'pill--green' : 'pill--flat'}`}>{allWorkouts.length > 0 ? 'On track' : 'Calibrating'}</span>
                      </div>
                      <div className="row gap-16" style={{ marginTop: 14 }}>
                        <div><div className="caption">Strain</div><strong className="mono-num">{derived.strain.unscored ? '—' : `${Math.round(derived.strain.score)}%`}</strong></div>
                        <div><div className="caption">Target</div><strong className="mono-num">{derived.strain.target}%</strong></div>
                        <div><div className="caption">Zone 2</div><strong className="mono-num">{weeklyZone2}m</strong></div>
                      </div>
                    </button>
                  </div>
                );
              default:
                return null;
            }
          })();

          return (
            <div className={`home-block ${editing ? 'home-block--editing' : ''}`} key={id}>
              {editing ? (
                <div className="edit-bar">
                  <div className="row gap-8">
                    <span className="tiny">{CARD_META[id]?.title}</span>
                  </div>
                  <div className="row gap-6">
                    <button className="edit-mini" onClick={() => move(id, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                    <button className="edit-mini" onClick={() => move(id, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                    <button className="edit-mini edit-mini--remove" onClick={() => toggleCard(id)} aria-label="Hide card"><EyeOff size={14} /></button>
                  </div>
                </div>
              ) : null}
              <div style={editing ? { pointerEvents: 'none' } : undefined}>{inner}</div>
            </div>
          );
        })}
      </div>

      {editing ? (
        <div className="row gap-8" style={{ marginTop: 18 }}>
          <button className="btn btn--soft btn--block" onClick={() => setAddOpen(true)}><Plus size={17} /> Add card</button>
          <button className="btn btn--outline" onClick={() => setDraft(DEFAULT_ORDER)}>Restore</button>
        </div>
      ) : (
        <button className="edit-home-link" onClick={startEdit}>
          <span className="row gap-6"><Minus size={15} /> Edit Home</span>
          <ChevronRight size={15} />
        </button>
      )}

      {statusOpen ? (
        <StatusSheet
          current={state.settings.activityStatus}
          note={state.settings.activityStatusNote}
          onClose={() => setStatusOpen(false)}
          onSave={(s, until, note) => {
            state.setActivityStatus(s, until, note);
            setStatusOpen(false);
            showToast(s === 'active' ? 'Status updated to Active' : `Marked as ${STATUS_LABEL[s]}`);
          }}
        />
      ) : null}

      {addOpen ? (
        <Sheet title="Add card" subtitle="Choose what appears on your Home screen." onClose={() => setAddOpen(false)}>
          <div className="list-card" style={{ boxShadow: 'none', background: 'var(--field)' }}>
            {Object.entries(CARD_META)
              .filter(([id]) => {
                if (draft.includes(id)) return false;
                // Same gating as the `visible` filter, so a card cannot be added
                // while its tab is off and then silently disappear.
                if (id === 'journal' && !state.settings.activeTabs.journal) return false;
                if (id === 'fitness' && !state.settings.activeTabs.fitness) return false;
                if (id === 'nutrition' && !state.settings.activeTabs.nutrition) return false;
                return true;
              })
              .map(([id, meta]) => (
                <button key={id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { toggleCard(id); setAddOpen(false); }}>
                  <div className="list-icon"><Plus size={16} /></div>
                  <div className="grow"><div className="list-title">{meta.title}</div><div className="list-sub">{meta.blurb}</div></div>
                  <ChevronRight size={16} className="chevron" />
                </button>
              ))}
            {Object.keys(CARD_META).every((id) => draft.includes(id) || (id !== 'journal' && id !== 'fitness' && id !== 'nutrition') || !state.settings.activeTabs[id as 'journal' | 'fitness' | 'nutrition']) ? <div className="empty">Every card is already on your Home screen.</div> : null}
          </div>
        </Sheet>
      ) : null}
      </div>
    </PullToRefresh>
  );
}

function StatusSheet({
  current,
  note,
  onClose,
  onSave,
}: {
  current: ActivityStatus;
  note: string;
  onClose: () => void;
  onSave: (s: ActivityStatus, until: string | null, note: string) => void;
}) {
  const [status, setStatus] = useState<ActivityStatus>(current);
  const [duration, setDuration] = useState<'untilChanged' | 'tomorrow' | '7' | '14'>('untilChanged');
  const [text, setText] = useState(note);
  const options: { value: ActivityStatus; label: string; desc: string; icon: string }[] = [
    { value: 'active', label: 'Active', desc: 'Training as planned', icon: '🟢' },
    { value: 'sick', label: 'Sick', desc: 'Lower targets while you recover', icon: '🤒' },
    { value: 'injured', label: 'Injured', desc: 'Strain is limited and Target Strain is hidden', icon: '🩹' },
    { value: 'break', label: 'On a Break', desc: 'Pause training guidance', icon: '🌴' },  ];
  const until = (() => {
    const d = new Date();
    if (duration === 'tomorrow') {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    if (duration === '7' || duration === '14') {
      d.setDate(d.getDate() + Number(duration));
      return d.toISOString();
    }
    return null;
  })();
  return (
    <Sheet title="Activity Status" subtitle="This changes how Strain and recovery guidance behave." onClose={onClose}>
      <div className="status-options">
        {options.map((o) => (
          <button key={o.value} className={`status-option ${status === o.value ? 'status-option--active' : ''}`} onClick={() => setStatus(o.value)}>
            <span className="status-option__icon"><Glyph emoji={o.icon} size={20} /></span>
            <span className="grow">
              <span className="list-title">{o.label}</span>
              <span className="list-sub">{o.desc}</span>
            </span>
            {status === o.value ? <Check size={18} /> : null}
          </button>
        ))}
      </div>
      <div className="field-label" style={{ marginTop: 20 }}>Keep this status</div>
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        {[
          ['untilChanged', 'Until changed'],
          ['tomorrow', 'Until tomorrow'],
          ['7', '7 days'],
          ['14', '14 days'],
        ].map(([v, label]) => (
          <button key={v} className={`pill ${duration === v ? 'pill--dark' : 'pill--flat'}`} onClick={() => setDuration(v as typeof duration)}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="field-label">Note (optional)</div>
        <input className="text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Fighting a cold" />
      </div>
      <button className="btn btn--block mt-20" onClick={() => onSave(status, until, text)}>Save</button>
    </Sheet>
  );
}
