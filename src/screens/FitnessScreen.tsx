import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { ChevronRight, Dumbbell, Flame, Footprints, Play, Plus, Sparkles, Timer, TrendingUp, Zap } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { deriveDay } from '../domain/derive';
import { computeCardioLoad, muscleFreshness, muscleLoadStatus } from '../domain/scoring/load';
import { zoneConfigFor } from '../domain/derive';
import { Avatar, SectionHead } from '../components/ui';
import { Sparkline } from '../components/charts';
import { MUSCLE_LABELS } from '../domain/math';

export function FitnessScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const today = dateKey(new Date());
  const now = new Date();
  const d = useMemo(() => deriveDay(state, today, now), [state, today]);
  const config = zoneConfigFor(state, today);
  const load = useMemo(() => computeCardioLoad(state.dayOrder.flatMap((date) => state.days[date].workouts), state.days, state.dayOrder, state.dayOrder.length - 1, config), [state, config]);
  const muscles = useMemo(() => muscleFreshness(state.dayOrder.flatMap((date) => state.days[date].workouts), now, state.dayOrder), [state, now]);
  const strength = muscleLoadStatus(state.dayOrder.flatMap((date) => state.days[date].workouts), state.days, state.dayOrder, state.dayOrder.length - 1);
  const weekWorkouts = state.dayOrder.slice(-7).flatMap((date) => state.days[date].workouts);
  const weekMinutes = weekWorkouts.reduce((a, w) => a + w.durationMin, 0);
  const recent = [...state.dayOrder.slice(-8)].reverse().flatMap((date) => state.days[date]?.workouts ?? []).slice(0, 4);
  const nextRoutine = state.routines.find((r) => r.scheduledDates.some((x) => x >= today)) ?? state.routines[0];
  const calibrated = load.status !== 'Calibrating';

  return (
    <div className="screen">
      <div className="app-header safe-top">
        <div>
          <div className="h1">Fitness</div>
          <div className="caption" style={{ marginTop: 2 }}>{format(now, 'EEEE, MMMM d')}</div>
        </div>
        <button className="avatar" onClick={() => navigate('/profile')} aria-label="Profile"><Avatar name={state.profile.name} /></button>
      </div>

      <div className="fitness-hero fade-up">
        <div className="fitness-hero__label">This week</div>
        <div className="fitness-hero__title">{weekWorkouts.length} sessions · {Math.round(weekMinutes / 60)}h {weekMinutes % 60}m</div>
        <div className="fitness-hero__sub">
          {d.recovery.status === 'scored' ? `Recovery ${d.recovery.score ?? '—'}% — ${(d.recovery.score ?? 0) >= 60 ? 'ready to build' : 'keep it controlled'}` : 'Building your training baseline'}
        </div>
        <div className="fitness-stats">
          <div className="fitness-stat"><strong>{Math.round(d.strain.score)}%</strong><span>Strain today</span></div>
          <div className="fitness-stat"><strong>{load.status}</strong><span>Cardio status</span></div>
          <div className="fitness-stat"><strong>{strength.weeklySets}</strong><span>Strength sets</span></div>
        </div>
      </div>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="week-strip card" style={{ padding: 8, boxShadow: 'var(--shadow-soft)' }}>
          {Array.from({ length: 7 }, (_, i) => {
            const date = subDays(now, 6 - i);
            const key = dateKey(date);
            const done = (state.days[key]?.workouts.length ?? 0) > 0;
            const isToday = key === today;
            return (
              <div key={key} className={`week-day ${isToday ? 'week-day--today' : ''} ${done ? 'week-day--done' : ''}`}>
                <span>{format(date, 'EEEEE')}</span>
                <span className="week-day__dot">{done ? '✓' : format(date, 'd')}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <SectionHead
          title="Next up"
          action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/intelligence')}><Sparkles size={12} /> Ask coach</button>}
        />
        <button className="card" style={{ width: '100%', textAlign: 'left', padding: 16 }} onClick={() => navigate(`/workout/${nextRoutine.id}`)}>
          <div className="row gap-12">
            <div className="list-icon" style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(0,168,143,.12)', color: 'var(--teal)' }}>
              {nextRoutine.kind === 'run' ? <Footprints size={22} /> : <Dumbbell size={22} />}
            </div>
            <div className="grow">
              <div className="card-title" style={{ fontSize: 16 }}>{nextRoutine.name}</div>
              <div className="card-sub">{nextRoutine.subtitle} · {nextRoutine.durationMin} min · {format(new Date(`${nextRoutine.scheduledDates[0]}T12:00:00`), 'EEE, MMM d')}</div>
            </div>
            <span className="pill pill--sm pill--dark"><Play size={11} fill="currentColor" /> Start</span>
          </div>
        </button>
      </div>

      <div className="section">
        <SectionHead title="Training Load" action={<span className={`pill pill--sm ${calibrated ? 'pill--green' : 'pill--flat'}`}>{load.status}</span>} />
        <div className="load-grid">
          <div className="load-card">
            <div className="load-card__label">Cardio Load</div>
            <div className="load-card__value">{calibrated ? `${load.ratio.toFixed(2)}×` : `${load.calibrationPct}%`}</div>
            <div className="load-card__sub">{calibrated ? `Acute ${load.acute} · Chronic ${load.chronic}` : `${load.qualifyingDays}/10 qualifying days`}</div>
            <div className="bar mt-10"><div className="bar__fill" style={{ width: `${calibrated ? Math.min(100, (load.ratio / 1.6) * 100) : load.calibrationPct}%`, background: 'var(--orange)' }} /></div>
          </div>
          <div className="load-card">
            <div className="load-card__label">Muscular Load</div>
            <div className="load-card__value">{strength.status}</div>
            <div className="load-card__sub">{strength.trainingDays}/10 days · {strength.weeklySets} sets this week</div>
            <div className="bar mt-10"><div className="bar__fill" style={{ width: `${Math.min(100, (strength.weeklySets / 12) * 100)}%`, background: 'var(--indigo)' }} /></div>
          </div>
        </div>
        <div className="card mt-10">
          <div className="row-between">
            <div className="card-title">Cardio focus</div>
            <span className="caption">Last 6 weeks</span>
          </div>
          <div className="row gap-2 mt-12" style={{ height: 10 }}>
            {load.focus.map((pct, i) => (
              <span key={i} style={{ width: `${pct}%`, height: '100%', background: ['#9ac8ff', '#ffc83d', '#ff7a33'][i], borderRadius: 999 }} />
            ))}
          </div>
          <div className="row-between mt-8" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            <span>Low aerobic {load.focus[0]}%</span>
            <span>High aerobic {load.focus[1]}%</span>
            <span>Anaerobic {load.focus[2]}%</span>
          </div>
        </div>
      </div>

      <div className="section">
        <SectionHead title="Muscle Freshness" action={<span className="caption">Recovered ≥75%</span>} />
        <div className="card" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {muscles.slice(0, 6).map((m) => (
            <div className="freshness-row" key={m.muscle}>
              <span className="freshness-row__name">{MUSCLE_LABELS[m.muscle as keyof typeof MUSCLE_LABELS] ?? m.muscle}</span>
              <div className="bar" style={{ flex: 1 }}>
                <div className="bar__fill" style={{ width: `${m.pct}%`, background: m.band === 'Recovered' ? 'var(--green)' : m.band === 'Fatigued' ? 'var(--amber)' : m.band === 'Depleted' ? 'var(--red)' : 'var(--muted-2)' }} />
              </div>
              <span className="freshness-row__pct">{m.band === 'Calibrating' ? '—' : `${m.pct}%`}</span>
              <span className="pill pill--sm" style={{ background: 'var(--field)', color: m.band === 'Recovered' ? 'var(--green-deep)' : 'var(--muted)', minWidth: 78, justifyContent: 'center' }}>{m.band}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <SectionHead title="Recent workouts" action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/timeline')}>Timeline</button>} />
        <div className="col gap-8">
          {recent.map((w) => (
            <button key={w.id} className="workout-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate(`/workout/${w.id}`)}>
              <div className="workout-row__icon" style={{ color: w.kind === 'strength' ? 'var(--indigo)' : 'var(--orange)' }}>
                {w.kind === 'strength' ? <Dumbbell size={19} /> : <Flame size={19} />}
              </div>
              <div className="grow">
                <div className="workout-row__title">{w.name}</div>
                <div className="workout-row__sub">{format(new Date(`${w.date}T12:00:00`), 'EEE, MMM d')} · {w.durationMin} min{w.distanceKm ? ` · ${w.distanceKm.toFixed(1)} km` : ''} · {w.calories} kcal</div>
              </div>
              <Sparkline values={w.zoneMinutes} width={64} height={30} color={w.kind === 'strength' ? 'var(--indigo)' : 'var(--orange)'} />
              <ChevronRight size={16} className="chevron" />
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <SectionHead title="Strength Builder" action={<button className="caption" style={{ color: 'var(--text)' }} onClick={() => navigate('/intelligence')}><Plus size={12} /> New</button>} />
        <div className="list-card">
          {state.routines.map((r) => (
            <button key={r.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate(`/workout/${r.id}`)}>
              <div className="list-icon"><Dumbbell size={16} /></div>
              <div className="grow">
                <div className="list-title">{r.name}</div>
                <div className="list-sub">{r.exercises.length} exercises · {r.durationMin} min · {r.blocks.length} blocks</div>
              </div>
              <ChevronRight size={17} className="chevron" />
            </button>
          ))}
          <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate('/intelligence')}>
            <div className="list-icon"><Sparkles size={16} /></div>
            <div className="grow"><div className="list-title">Build a routine with Bene</div><div className="list-sub">Describe your goal and available equipment</div></div>
            <ChevronRight size={17} className="chevron" />
          </button>
        </div>
      </div>

      <div className="section">
        <SectionHead title="Weekly balance" action={<TrendingUp size={16} className="chevron" />} />
        <div className="card">
          <div className="row gap-16">
            <div className="grow">
              <div className="caption">Cardio minutes</div>
              <div className="mono-num" style={{ fontSize: 24, fontWeight: 750 }}>{weekWorkouts.filter((w) => w.kind !== 'strength').reduce((a, w) => a + w.durationMin, 0)}</div>
              <div className="caption mt-4">Goal 150 · {Math.min(100, Math.round((weekWorkouts.filter((w) => w.kind !== 'strength').reduce((a, w) => a + w.durationMin, 0) / 150) * 100))}%</div>
            </div>
            <div className="grow">
              <div className="caption">Strength sets</div>
              <div className="mono-num" style={{ fontSize: 24, fontWeight: 750 }}>{strength.weeklySets}</div>
              <div className="caption mt-4">Goal 12 · {Math.min(100, Math.round((strength.weeklySets / 12) * 100))}%</div>
            </div>
            <div className="grow">
              <div className="caption">Training time</div>
              <div className="mono-num" style={{ fontSize: 24, fontWeight: 750 }}>{Math.round(weekMinutes / 60)}h</div>
              <div className="caption mt-4">vs 4h last week</div>
            </div>
          </div>
          <div className="divider" />
          <div className="row gap-8">
            <Timer size={15} className="chevron" />
            <span className="caption">Rest timer default 90s · Plate calculator available during a workout</span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card card--flat" style={{ background: 'transparent' }}>
          <div className="row gap-10">
            <Zap size={18} color="var(--orange)" />
            <div className="grow">
              <div className="card-title">Live HR sensor</div>
              <div className="card-sub">Connect a Bluetooth strap in Strength Builder. Requires Health write permission.</div>
            </div>
            <button className="pill pill--sm pill--flat" onClick={() => navigate('/settings/data')}>Manage</button>
          </div>
        </div>
      </div>
    </div>
  );
}
