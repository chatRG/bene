import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar, Check, ChevronLeft, ChevronRight, Clock, Dumbbell, Flame, Footprints, MoreHorizontal, Play, Snowflake, Timer, Watch, Zap } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { Sparkline } from '../components/charts';
import { Sheet } from '../components/ui';
import { showToast } from '../components/toast';
import type { Workout } from '../domain/types';

export function WorkoutDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const state = useAppStore();
  const routine = state.routines.find((r) => r.id === id);
  const workout = useMemo(() => {
    for (const day of Object.values(state.days)) {
      const found = day.workouts.find((w) => w.id === id);
      if (found) return found;
    }
    return null;
  }, [state.days, id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<Workout | null>(null);

  useEffect(() => {
    if (startedAt == null) return;
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);

  if (!routine && !workout) {
    return (
      <div className="screen screen--detail">
        <div className="detail-head safe-top"><button className="icon-btn" onClick={() => navigate(-1)}><ChevronLeft size={20} /></button><div className="detail-head__title">Workout</div><div /></div>
        <div className="empty">Workout not found.</div>
      </div>
    );
  }

  if (routine) {
    const isRun = routine.kind === 'run';
    return (
      <div className="screen screen--detail" style={{ background: isRun ? 'linear-gradient(180deg,#e9f8f6,var(--bg) 45%)' : 'var(--bg)' }}>
        <div className="detail-head safe-top" style={{ paddingTop: 8 }}>
          <button className="icon-btn icon-btn--soft" onClick={() => navigate(-1)} aria-label="Close"><ChevronLeft size={20} /></button>
          <div />
          <div className="detail-head__right">
            <button className="icon-btn icon-btn--soft" onClick={() => setMenuOpen(true)} aria-label="More"><MoreHorizontal size={19} /></button>
          </div>
        </div>

        <div className="workout-hero">
          <div className="workout-ring">
            {isRun ? <Footprints size={26} /> : <Dumbbell size={24} />}
          </div>
          <div className="workout-kind">{routine.subtitle}</div>
          <div className="workout-name">{routine.name}</div>
          <div className="workout-meta">{routine.durationMin}m{routine.kind === 'run' ? ' · 4.1 mi' : ` · ${routine.exercises.length} exercises`}</div>
          <div className="workout-date"><Calendar size={13} /> {routine.scheduledDates[0] ? format(new Date(`${routine.scheduledDates[0]}T12:00:00`), 'MMM d, yyyy') : 'Unscheduled'} <ChevronRight size={13} className="chevron" /></div>
        </div>

        <div className="col gap-9">
          {routine.blocks.map((b) => (
            <div className="block-card" key={b.id}>
              <div className="row-between">
                <div className="row gap-9">
                  <span className="block-icon" style={{ color: b.kind === 'warmup' ? 'var(--orange)' : b.kind === 'cooldown' ? 'var(--blue)' : 'var(--text-2)' }}>
                    {b.kind === 'warmup' ? <Flame size={16} /> : b.kind === 'cooldown' ? <Snowflake size={16} /> : b.kind === 'repeat' ? <Zap size={16} /> : <Timer size={16} />}
                  </span>
                  <div>
                    <div className="block-title">{b.title}{b.repeats && !b.title.includes('×') ? ` ×${b.repeats}` : ''}</div>
                    <div className="block-sub">{b.durationMin ? `${b.durationMin}m` : ''}{b.target ? ` · ${b.target}` : ''}</div>
                  </div>
                </div>
                {b.kind === 'repeat' ? (
                  <div className="col gap-6" style={{ alignItems: 'flex-end' }}>
                    <span className="block-title" style={{ fontSize: 12 }}>Tempo 6m</span>
                    <span className="block-title" style={{ fontSize: 12 }}>Recovery 2m</span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {routine.exercises.map((ex) => (
            <div className="block-card" key={ex.id}>
              <div className="row-between">
                <div className="row gap-9">
                  <span className="block-icon"><Dumbbell size={15} /></span>
                  <div>
                    <div className="block-title">{ex.name}</div>
                    <div className="block-sub">{ex.sets.length} sets · rest {ex.restSec}s</div>
                  </div>
                </div>
                <span className="caption">{ex.sets.map((x) => `${x.reps}×${x.weightKg}kg`).join(' · ')}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="device-bar mt-16">
          <span>Device</span>
          <span className="row gap-6" style={{ color: 'var(--text)', fontWeight: 650 }}><Watch size={15} /> Apple Watch <ChevronRight size={14} className="chevron" /></span>
        </div>

        {startedAt == null ? (
          <button className="btn btn--block mt-12" onClick={() => { setStartedAt(Date.now()); setElapsed(0); }}>
            <Play size={17} fill="currentColor" /> Start
          </button>
        ) : (
          <div className="card mt-12">
            <div className="row-between">
              <span className="pill pill--sm pill--green"><span className="status-dot" /> Live</span>
              <strong className="mono-num" style={{ fontSize: 24 }}>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</strong>
            </div>
            <div className="bar mt-12"><div className="bar__fill" style={{ width: `${Math.min(100, (elapsed / 60 / routine.durationMin) * 100)}%`, background: 'var(--green)' }} /></div>
            <div className="caption mt-8">Warmup complete · move into the repeat block when ready.</div>
            <div className="row gap-8 mt-12">
              <button className="btn btn--soft btn--block" onClick={() => { setStartedAt(null); setElapsed(0); }}>Discard</button>
              <button
                className="btn btn--block"
                onClick={() => {
                  const duration = Math.max(1, Math.round(elapsed / 60));
                  const w: Workout = {
                    id: `workout-${Date.now()}`,
                    kind: routine.kind,
                    name: routine.name,
                    date: dateKey(new Date()),
                    start: new Date(Date.now() - elapsed * 1000).toISOString(),
                    durationMin: duration,
                    distanceKm: isRun ? Math.round(duration * 0.16 * 10) / 10 : null,
                    avgHr: isRun ? 148 : 118,
                    maxHr: isRun ? 168 : 150,
                    calories: Math.round(duration * (isRun ? 10.5 : 7)),
                    strain: Math.round(duration * 0.85),
                    source: 'Apple Watch',
                    imported: false,
                    zoneMinutes: isRun ? [3, 7, 10, 8, 2, 0] : [6, 10, 8, 3, 1, 0],
                    exercises: routine.exercises.length ? routine.exercises.map((e) => ({ id: e.id, name: e.name, muscle: e.muscle, sets: e.sets.map((x) => ({ id: x.id, reps: x.reps, weightKg: x.weightKg, rpe: 7.5, type: x.type, completed: true })) })) : undefined,
                  };
                  state.logWorkout(w);
                  state.completeRoutineDay(routine.id, dateKey(new Date()));
                  setSummary(w);
                  setStartedAt(null);
                }}
              >
                <Check size={16} /> Finish
              </button>
            </div>
          </div>
        )}

        {menuOpen ? (
          <Sheet title="Routine options" onClose={() => setMenuOpen(false)}>
            <div className="list-card" style={{ boxShadow: 'none' }}>
              <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { showToast('Routine duplicated'); setMenuOpen(false); }}>
                <div className="list-icon"><Dumbbell size={16} /></div><div className="grow"><div className="list-title">Duplicate routine</div><div className="list-sub">Creates an editable copy</div></div>
              </button>
              <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { showToast('Routine is now scheduled'); setMenuOpen(false); }}>
                <div className="list-icon"><Calendar size={16} /></div><div className="grow"><div className="list-title">Schedule</div><div className="list-sub">Adds to Fitness and the Watch</div></div>
              </button>
              <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { showToast('Routine deleted (demo)'); setMenuOpen(false); }}>
                <div className="list-icon" style={{ color: 'var(--red)' }}><MoreHorizontal size={16} /></div><div className="grow"><div className="list-title" style={{ color: 'var(--red)' }}>Delete routine</div></div>
              </button>
            </div>
          </Sheet>
        ) : null}

        {summary ? (
          <Sheet title="Workout saved" subtitle={`${summary.name} · ${summary.durationMin} min`} onClose={() => { setSummary(null); navigate('/fitness'); }}>
            <div className="row gap-12">
              <span className="bio-contributor__icon"><Check size={18} /></span>
              <div><div className="card-title">Nice session</div><div className="card-sub">Strain and training load have been updated.</div></div>
            </div>
            <button className="btn btn--block mt-20" onClick={() => { setSummary(null); navigate('/fitness'); }}>Back to Fitness</button>
          </Sheet>
        ) : null}
      </div>
    );
  }

  const w = workout!;
  const zoneLabels = ['Rest', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
  const zoneColors = ['#d8d8dc', '#9ac8ff', '#5f9df8', '#ffc83d', '#ff7a33', '#ff5a5f'];
  const totalZone = w.zoneMinutes.reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="screen screen--detail">
      <div className="detail-head safe-top" style={{ paddingTop: 8 }}>
        <button className="icon-btn icon-btn--soft" onClick={() => navigate(-1)} aria-label="Back"><ChevronLeft size={20} /></button>
        <div className="detail-head__title">{w.kind === 'strength' ? 'Strength' : 'Cardio'}</div>
        <div />
      </div>

      <div className="workout-hero">
        <div className="workout-ring">{w.kind === 'strength' ? <Dumbbell size={26} /> : <Footprints size={26} />}</div>
        <div className="workout-kind" style={{ textTransform: 'capitalize' }}>{w.source}</div>
        <div className="workout-name">{w.name}</div>
        <div className="workout-meta">{format(new Date(`${w.date}T12:00:00`), 'EEEE, MMM d')} · {new Date(w.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
      </div>

      <div className="metric-pair">
        <div className="metric-card"><div className="metric-card__label"><Clock size={13} /> Duration</div><div className="metric-card__value"><strong>{w.durationMin}</strong><span>min</span></div></div>
        <div className="metric-card"><div className="metric-card__label"><Flame size={13} /> Calories</div><div className="metric-card__value"><strong>{w.calories ?? '—'}</strong><span>kcal</span></div></div>
        <div className="metric-card"><div className="metric-card__label"><Zap size={13} /> Strain</div><div className="metric-card__value"><strong>{Math.round(w.strain)}</strong><span>%</span></div></div>
        <div className="metric-card"><div className="metric-card__label"><Footprints size={13} /> Distance</div><div className="metric-card__value"><strong>{w.distanceKm?.toFixed(1) ?? '—'}</strong><span>km</span></div></div>
      </div>

      <div className="chart-card mt-12">
        <div className="chart-card__head"><span className="chart-card__title">Heart rate</span><span className="caption">Avg {w.avgHr ?? '—'} · Max {w.maxHr ?? '—'} bpm</span></div>
        <Sparkline values={w.zoneMinutes.map((m, i) => 90 + m * 3 + i * 4)} width={320} height={70} color="var(--red)" />
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 12 }}>Time in zones</div>
        <div className="card">
          <div className="row gap-2" style={{ height: 12 }}>
            {w.zoneMinutes.map((m, i) => (
              <span key={i} style={{ width: `${(m / totalZone) * 100}%`, background: zoneColors[i], borderRadius: 4, height: '100%' }} />
            ))}
          </div>
          <div className="col gap-2 mt-12" style={{ gap: 6 }}>
            {w.zoneMinutes.map((m, i) => (
              <div className="row-between" key={i} style={{ fontSize: 11.5 }}>
                <span className="row gap-6"><i style={{ width: 7, height: 7, borderRadius: 9, background: zoneColors[i], display: 'inline-block' }} />{zoneLabels[i]}</span>
                <span className="mono-num">{m} min</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {w.exercises?.length ? (
        <div className="section">
          <div className="section-title" style={{ marginBottom: 12 }}>Exercises</div>
          <div className="list-card">
            {w.exercises.map((e) => (
              <div className="list-row" key={e.id}>
                <div className="list-icon"><Dumbbell size={15} /></div>
                <div className="grow"><div className="list-title">{e.name}</div><div className="list-sub">{e.sets.length} sets · {e.sets[0]?.reps} reps</div></div>
                <span className="caption">{e.sets.map((s) => `${s.weightKg}kg`).join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="card card--flat" style={{ display: 'flex', gap: 10 }}>
          <Watch size={16} className="chevron" />
          <span className="caption" style={{ flex: 1 }}>
            {w.imported ? 'Imported workouts can’t be edited or have their date changed.' : `Logged by ${w.source}. Source data is written to Apple Health.`}
          </span>
        </div>
      </div>
    </div>
  );
}
