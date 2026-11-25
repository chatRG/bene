import { useMemo, useState, useEffect } from 'react';
import { format, subDays, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Flame, Moon, Plus, Utensils, Footprints, Info, Check, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { dayPath } from '../domain/day-route';
import { deriveDay } from '../domain/derive';
import { dateAtTime } from '../domain/time';
import { Sheet } from '../components/ui';
import { Glyph } from '../components/glyphs';
import { showToast } from '../components/toast';
import { useGoBack } from '../native';
import { useDayParam } from '../components/use-day-param';
import type { WorkoutKind } from '../domain/types';

export function TimelineScreen() {
  const navigate = useNavigate();
  const back = useGoBack();
  const state = useAppStore();
  const day = useDayParam();
  const today = dateKey(new Date());
  const [selected, setSelected] = useState(() => new Date(`${day}T12:00:00`));
  useEffect(() => {
    setSelected(new Date(`${day}T12:00:00`));
  }, [day]);
  const selectedKey = dateKey(selected);
  const d = useMemo(() => deriveDay(state, selectedKey, new Date()), [state, selectedKey]);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'menu' | 'food' | 'activity' | 'sleep'>('menu');
  const [detail, setDetail] = useState<string | null>(null);

  const isToday = selectedKey === today;
  const entries = useMemo(() => {
    const list: { id: string; time: string; sort: number; kind: 'sleep' | 'workout' | 'meal' | 'planned'; title: string; sub: string; emoji?: string; ref?: string }[] = [];
    // toLocaleTimeString throws a RangeError on an invalid Date, so a corrupt
    // timestamp must not reach it.
    const clock = (d: Date) => (Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
    const hoursLabel = (from: Date, to: Date) =>
      Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())
        ? '—'
        : `${Math.floor((to.getTime() - from.getTime()) / 60000 / 60)}h ${Math.round(((to.getTime() - from.getTime()) / 60000) % 60)}m`;
    if (d.sleep) {
      const t = new Date(d.sleep.start);
      const end = new Date(d.sleep.end);
      list.push({
        id: d.sleep.id,
        time: clock(t),
        sort: Number.isNaN(t.getTime()) ? 0 : t.getHours() * 60 + t.getMinutes(),
        kind: 'sleep',
        title: 'Primary sleep',
        sub: `${clock(end)} · ${hoursLabel(t, end)} in bed · ${d.sleep.source}`,
      });
    }
    for (const w of d.record.workouts) {
      const t = new Date(w.start);
      list.push({
        id: w.id,
        time: clock(t),
        sort: Number.isNaN(t.getTime()) ? 0 : t.getHours() * 60 + t.getMinutes(),
        kind: 'workout',
        title: w.name,
        sub: `${w.durationMin} min${w.distanceKm ? ` · ${w.distanceKm.toFixed(1)} km` : ''} · ${w.calories ?? '—'} kcal`,
        emoji: '🔥',
        ref: w.id,
      });
    }
    for (const m of d.record.meals) {
      const [h, mi] = m.time.split(':').map(Number);
      list.push({
        id: m.id,
        time: format(new Date(2026, 0, 1, h, mi), 'h:mm a'),
        sort: h * 60 + mi,
        kind: 'meal',
        title: m.name,
        sub: `${m.calories} kcal · P ${m.proteinG}g · C ${m.carbsG}g · F ${m.fatG}g`,
        emoji: m.emoji,
      });
    }
    for (const r of state.routines) {
      if (r.scheduledDates.includes(selectedKey) && !r.completedDates.includes(selectedKey)) {
        list.push({ id: `planned-${r.id}`, time: '6:15 PM', sort: 18 * 60 + 15, kind: 'planned', title: `${r.name} · planned`, sub: `${r.durationMin} min · not started`, ref: r.id });
      }
    }
    return list.sort((a, b) => a.sort - b.sort);
  }, [d, state.routines, selectedKey]);

  const shift = (n: number) => setSelected((s) => (n > 0 ? addDays(s, 1) : subDays(s, 1)));

  return (
    <div className="screen screen--detail">
      <div className="detail-head">
        <button className="icon-btn icon-btn--soft" onClick={() => back()} aria-label="Back"><ChevronLeft size={20} /></button>
        <div>
          <div className="detail-head__title">Timeline</div>
          <div className="detail-head__sub">{format(selected, 'EEEE, MMMM d')}</div>
        </div>
        <div className="detail-head__right">
          <button className="icon-btn icon-btn--soft" onClick={() => { setAddOpen(true); setAddMode('menu'); }} aria-label="Add entry"><Plus size={19} /></button>
        </div>
      </div>

      <div className="row-between mt-12">
        <button className="icon-btn icon-btn--soft" onClick={() => shift(-1)} aria-label="Previous day"><ChevronLeft size={18} /></button>
        <div className="row gap-8">
          <button className="pill pill--flat" onClick={() => setSelected(new Date())} style={isToday ? { background: 'var(--text)', color: 'var(--bg)' } : undefined}>
            Today
          </button>
          <button className="pill pill--flat" onClick={() => shift(1)}>Tomorrow</button>
        </div>
        <button className="icon-btn icon-btn--soft" onClick={() => shift(1)} aria-label="Next day"><ChevronRight size={18} /></button>
      </div>

      <div className="timeline-day card" style={{ padding: 6, boxShadow: 'var(--shadow-soft)' }}>
        {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
          const date = addDays(selected, offset);
          const key = dateKey(date);
          const active = key === selectedKey;
          const has = (state.days[key]?.workouts.length ?? 0) > 0;
          return (
            <button key={key} className={`timeline-day__item ${active ? 'timeline-day__item--active' : ''}`} onClick={() => setSelected(date)}>
              <span>{format(date, 'EEE')}</span>
              <strong>{format(date, 'd')}</strong>
              <span style={{ width: 5, height: 5, borderRadius: 9, background: has ? (active ? 'var(--bg)' : 'var(--green)') : 'transparent' }} />
            </button>
          );
        })}
      </div>

      <div className="timeline-list">
        {entries.map((e) => (
          <button
            key={e.id}
            className="timeline-item"
            onClick={() => {
              if (e.kind === 'sleep') navigate(dayPath('/sleep', selectedKey, today));
              else if (e.kind === 'workout' && e.ref) navigate(`/workout/${e.ref}`);
              else if (e.kind === 'planned' && e.ref) navigate(`/workout/${e.ref}`);
              else setDetail(e.id);
            }}
          >
            <span className="timeline-item__time">{e.time}</span>
            <span className="timeline-item__dot" style={{ borderColor: e.kind === 'sleep' ? 'var(--sleep)' : e.kind === 'meal' ? 'var(--green)' : e.kind === 'planned' ? 'var(--muted-2)' : 'var(--orange)' }} />
            <div className="row gap-8">
              <span style={{ display: 'grid', placeItems: 'center', width: 22 }}>{e.kind === 'sleep' ? <Moon size={16} /> : e.kind === 'meal' ? <Glyph emoji={e.emoji} size={16} /> : e.kind === 'planned' ? <Calendar size={15} /> : <Flame size={16} />}</span>
              <div className="grow">
                <div className="timeline-item__title">{e.title}</div>
                <div className="timeline-item__sub">{e.sub}</div>
              </div>
              {e.kind === 'sleep' ? <span className="caption">Sleep</span> : null}
              {e.kind === 'planned' ? <span className="pill pill--sm pill--flat">Planned</span> : null}
            </div>
          </button>
        ))}
        {entries.length === 0 ? (
          <div className="timeline-empty">Nothing logged yet. Add food, an activity or last night's sleep.</div>
        ) : null}
      </div>

      <div className="card card--flat mt-16" style={{ display: 'flex', gap: 10 }}>
        <Info size={16} className="chevron" />
        <span className="caption" style={{ flex: 1 }}>Sleep is recorded by your tracker and can’t be deleted or moved. Activities imported from other apps can’t have their date changed.</span>
      </div>

      {addOpen ? (
        <Sheet title={addMode === 'menu' ? 'Add to timeline' : addMode === 'food' ? 'Log food' : addMode === 'activity' ? 'Log activity' : 'Add sleep'} subtitle={addMode === 'menu' ? 'What would you like to log?' : undefined} onClose={() => { setAddOpen(false); setAddMode('menu'); }}>
          {addMode === 'menu' ? (
            <div className="col gap-8">
              {[
                ...(state.settings.activeTabs.nutrition
                  ? [['food', 'Food', 'Search, describe, photo or barcode', <Utensils size={18} />] as const]
                  : []),
                ['activity', 'Activity', 'Run, strength, cycle or walk', <Flame size={18} />],
                ['sleep', 'Sleep', 'Naps and overnight sleep', <Moon size={18} />],
              ].map(([id, title, sub, icon]) => (
                <button key={String(id)} className="status-option" onClick={() => setAddMode(id as typeof addMode)}>
                  <span className="status-option__icon">{icon}</span>
                  <span className="grow"><span className="list-title">{title}</span><span className="list-sub">{sub}</span></span>
                  <ChevronRight size={16} className="chevron" />
                </button>
              ))}
            </div>
          ) : null}

          {addMode === 'food' ? (
            <div className="col gap-8">
              <button className="status-option" onClick={() => { setAddOpen(false); navigate(dayPath('/nutrition', selectedKey, today)); }}>
                <span className="status-option__icon"><Utensils size={18} /></span>
                <span className="grow"><span className="list-title">Open nutrition logger</span><span className="list-sub">Search 1.2M foods, photo, describe or barcode</span></span>
                <ChevronRight size={16} className="chevron" />
              </button>
              <button
                className="status-option"
                onClick={() => {
                  state.addMeal({
                    id: `meal-${Date.now()}`,
                    name: 'Quick snack',
                    date: selectedKey,
                    time: '15:30',
                    calories: 180,
                    proteinG: 8,
                    carbsG: 22,
                    fatG: 7,
                    fiberG: 2,
                    vegGrams: 0,
                    fruitCups: 0,
                    wholeGrainServings: 0,
                    healthyOilPctOfCalories: 15,
                    nutsGrams: 0,
                    omega3Mg: 0,
                    redMeatGrams: 0,
                    processedMeatGrams: 0,
                    alcoholGrams: 0,
                    sodiumMg: 120,
                    addedSugarG: 4,
                    source: 'bene',
                    emoji: '🍎',
                    loggedVia: 'custom',
                  });
                  setAddOpen(false);
                  showToast('Quick snack logged');
                }}
              >
                <span className="status-option__icon">🍎</span>
                <span className="grow"><span className="list-title">Quick add</span><span className="list-sub">180 kcal snack</span></span>
                <ChevronRight size={16} className="chevron" />
              </button>
            </div>
          ) : null}

          {addMode === 'activity' ? <ActivityForm date={selectedKey} onDone={() => setAddOpen(false)} /> : null}

          {addMode === 'sleep' ? (
            <div>
              <div className="insight-unlock"><Moon size={18} /><span>Overnight sleep comes from your tracker. You can log a nap, but full overnight sleep from previous nights can’t be added retroactively.</span></div>
              <button
                className="btn btn--block mt-16"
                onClick={() => {
                  setAddOpen(false);
                  state.logNap(selectedKey);
                  showToast('Nap logged');
                }}
              >
                <Check size={16} /> Log a 20-minute nap
              </button>
            </div>
          ) : null}
        </Sheet>
      ) : null}

      {detail ? (
        <Sheet title="Entry details" subtitle="Logged in Bene" onClose={() => setDetail(null)}>
          <p className="body">This entry was logged in the app, so its details can be edited. Sleep and imported workouts stay read-only.</p>
          <button className="btn btn--soft btn--block mt-20" onClick={() => setDetail(null)}>Close</button>
        </Sheet>
      ) : null}
    </div>
  );
}

function ActivityForm({ date, onDone }: { date: string; onDone: () => void }) {
  const state = useAppStore();
  const [kind, setKind] = useState<WorkoutKind>('run');
  const [name, setName] = useState('Evening Run');
  const [duration, setDuration] = useState(30);
  const [distance, setDistance] = useState(5);
  return (
    <div>
      <div className="field-label">Activity</div>
      <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
        {(['run', 'strength', 'cycle', 'walk', 'swim', 'hiit'] as WorkoutKind[]).map((k) => (
          <button key={k} className={`pill ${kind === k ? 'pill--dark' : 'pill--flat'}`} onClick={() => setKind(k)}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <div className="field-label" style={{ marginTop: 16 }}>Name</div>
      <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row gap-8 mt-8">
        <div className="grow"><div className="field-label">Duration (min)</div><input className="text-input" type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
        <div className="grow"><div className="field-label">Distance (km)</div><input className="text-input" type="number" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></div>
      </div>
      <button
        className="btn btn--block mt-20"
        onClick={() => {
          const start = dateAtTime(date, format(new Date(), 'HH:mm')) ?? new Date();
          const isRun = kind === 'run' || kind === 'walk' || kind === 'cycle';
          const zone: [number, number, number, number, number, number] = isRun ? [4, 8, 12, 6, 1, 0] : [6, 10, 8, 3, 1, 0];
          state.logWorkout({
            id: `workout-${Date.now()}`,
            kind,
            name,
            date,
            start: start.toISOString(),
            durationMin: duration,
            distanceKm: isRun ? distance : null,
            avgHr: isRun ? 148 : 118,
            maxHr: isRun ? 168 : 150,
            calories: Math.round(duration * (isRun ? 11 : 7)),
            strain: Math.round(duration * 0.9),
            source: 'Bene',
            imported: false,
            zoneMinutes: zone,
          });
          onDone();
          showToast('Activity logged');
        }}
      >
        <Footprints size={16} /> Save activity
      </button>
    </div>
  );
}
