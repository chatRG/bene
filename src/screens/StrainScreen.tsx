import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Activity, ChevronLeft, Flame, Heart, Info, Share2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { deriveDay } from '../domain/derive';
import { daytimeAverageHr, strainSeriesForDay } from '../domain/scoring/strain';
import { zoneConfigFor } from '../domain/derive';
import { clockLabel } from '../domain/time';
import { LineChart, Sparkline } from '../components/charts';
import { Sheet } from '../components/ui';
import { showToast } from '../components/toast';

type Tab = 'strain' | 'exercise' | 'hr' | 'energy';

export function StrainScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const today = dateKey(new Date());
  const d = useMemo(() => deriveDay(state, today, new Date()), [state, today]);
  const [tab, setTab] = useState<Tab>('strain');
  const [infoOpen, setInfoOpen] = useState(false);

  const config = zoneConfigFor(state, today);
  const series = strainSeriesForDay(d.record.metrics.hrSamples, d.record.workouts, Math.round(d.baselineRhr || 55), config).map((p) => p.value);
  const hasHr = series.length > 4;
  const values = hasHr ? series : [];
  const avg = hasHr ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const avgHr = daytimeAverageHr(d.record.metrics.hrSamples);
  const hiddenTarget = state.settings.activityStatus === 'injured' || state.settings.activityStatus === 'break';
  const statusNote = state.settings.activityStatus === 'injured'
    ? 'Target Strain is hidden while you are injured. Strain calculations are limited.'
    : state.settings.activityStatus === 'sick'
      ? 'You are marked sick, so today’s target is reduced.'
      : state.settings.activityStatus === 'break'
        ? 'You are on a break — no strain target is enforced.'
        : null;

  const share = async () => {
    const text = `Strain ${Math.round(d.strain.score)}% today · ${Math.round(d.strain.score)} / target ${d.strain.target}%`;
    try {
      if (navigator.share) await navigator.share({ title: 'My Strain', text });
      else {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
      }
    } catch {
      showToast('Share cancelled');
    }
  };

  return (
    <div className="screen screen--detail">
      <div className="detail-head safe-top" style={{ paddingTop: 8 }}>
        <button className="icon-btn icon-btn--soft" onClick={() => navigate(-1)} aria-label="Close"><ChevronLeft size={20} /></button>
        <div className="detail-head__title">Strain Score</div>
        <div className="detail-head__right">
          <div className="row gap-6">
            <button className="icon-btn icon-btn--soft" onClick={() => setInfoOpen(true)} aria-label="Info"><Info size={18} /></button>
            <button className="icon-btn icon-btn--soft" onClick={share} aria-label="Share"><Share2 size={17} /></button>
          </div>
        </div>
      </div>

      <div className="strain-score-line">
        <div>
          <div className="strain-score-line__value">{Math.round(d.strain.score)}<span style={{ fontSize: 28 }}>%</span></div>
          <div className="strain-score-line__date">{format(new Date(), 'MMM d, yyyy')} <span style={{ color: 'var(--muted-2)' }}>·</span> {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        <div>
          <div className="strain-range" style={hiddenTarget ? { color: 'var(--muted)' } : undefined}>
            {hiddenTarget ? 'Target hidden' : d.strain.status === 'within' ? 'On target' : d.strain.label === 'Normal range' ? 'In range' : d.strain.label}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="caption" style={{ marginTop: 3 }}>{hiddenTarget ? 'Injured status' : 'Normal range'}</div>
            {!hiddenTarget ? <div style={{ fontSize: 15, fontWeight: 500 }}>{d.strain.normLow} – {d.strain.normHigh}%</div> : null}
          </div>
        </div>
      </div>

      <div className="pill-row" style={{ marginTop: 10 }}>
        {([
          ['strain', 'Strain'],
          ['exercise', 'Duration'],
          ['hr', 'Daytime HR'],
          ['energy', 'Energy'],
        ] as [Tab, string][]).map(([value, label]) => (
          <button key={value} className={`pill-tab ${tab === value ? 'pill-tab--active' : ''}`} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'strain' ? (
        hasHr ? <div className="chart-wrap" style={{ marginTop: 8 }}>
          <LineChart
            values={values}
            yMax={100}
            yTicks={[100, 67, 33]}
            color="var(--orange)"
            height={220}
            avg={avg}
            avgLabel={`Avg. ${Math.round(avg)}%`}
            band={[d.strain.normLow, d.strain.normHigh]}
            xLabels={['12 AM', 'Now']}
          />
        </div> : <div className="card card--flat mt-12"><div className="caption">No heart-rate samples for this day.</div></div>
      ) : null}

      {tab === 'exercise' ? (
        <div className="col gap-10" style={{ marginTop: 8 }}>
          {d.record.workouts.map((w) => (
            <div className="card card--tight" key={w.id}>
              <div className="row-between">
                <div className="row gap-8">
                  <span className="list-icon" style={{ background: 'rgba(255,122,51,.12)', color: 'var(--orange)' }}><Flame size={16} /></span>
                  <div>
                    <div className="card-title">{w.name}</div>
                    <div className="card-sub">{clockLabel(w.start)} · {w.avgHr ?? '—'} bpm avg</div>
                  </div>
                </div>
                <strong>{w.durationMin} min</strong>
              </div>
              <div className="bar mt-12"><div className="bar__fill" style={{ width: `${Math.min(100, (w.durationMin / 90) * 100)}%`, background: 'var(--orange)' }} /></div>
            </div>
          ))}
          <div className="card card--tight">
            <div className="row-between">
              <span className="card-title">Total exercise</span>
              <strong>{d.record.metrics.exerciseMinutes} min</strong>
            </div>
            <div className="caption mt-4">Recommended: 150+ min moderate activity per week.</div>
          </div>
        </div>
      ) : null}

      {tab === 'hr' ? (
        <div className="chart-wrap" style={{ marginTop: 8 }}>
          <LineChart
            values={d.record.metrics.hrSamples.filter((s) => s.minute >= 360).map((s) => s.bpm)}
            yMax={200}
            yTicks={[200, 150, 100, 50]}
            color="var(--red)"
            height={220}
            xLabels={['6 AM', 'Now']}
          />
        </div>
      ) : null}

      {tab === 'energy' ? (
        <div className="col gap-10" style={{ marginTop: 8 }}>
          <div className="card">
            <div className="caption">Total Energy</div>
            <div className="row gap-6" style={{ alignItems: 'baseline' }}>
              <span className="mono-num" style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em' }}>{d.record.metrics.totalCalories.toLocaleString()}</span>
              <span className="caption">kcal</span>
            </div>
            <div className="row gap-16 mt-12">
              <div><div className="caption">Active</div><strong>{d.record.metrics.activeCalories} kcal</strong></div>
              <div><div className="caption">Resting</div><strong>{(d.record.metrics.totalCalories - d.record.metrics.activeCalories).toLocaleString()} kcal</strong></div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Active energy timeline</div>
            <div className="row gap-2 mt-12" style={{ alignItems: 'flex-end', height: 80 }}>
              {Array.from({ length: 24 }, (_, h) => {
                const val = d.record.metrics.hrSamples.filter((s) => Math.floor(s.minute / 60) === h).reduce((a, s) => a + Math.max(0, s.bpm - 60), 0) / 8;
                return <span key={h} style={{ flex: 1, height: `${Math.max(4, Math.min(100, val))}%`, background: 'var(--orange)', opacity: 0.35 + (val / 150), borderRadius: 3 }} />;
              })}
            </div>
            <div className="row-between caption mt-6"><span>12 AM</span><span>12 PM</span><span>11 PM</span></div>
          </div>
        </div>
      ) : null}

      {statusNote ? <div className="insight-unlock mt-12"><Info size={16} /><span>{statusNote}</span></div> : null}

      <div className="section">
        <div className="col gap-10">
          <div className="card strain-card">
            <div className="list-icon" style={{ background: 'rgba(255,90,95,.1)', color: 'var(--red)' }}><Heart size={18} /></div>
            <div className="strain-card__main">
              <div className="strain-card__label">Daytime HR</div>
              <div className="strain-card__value"><strong>{avgHr ?? '—'}</strong><span>bpm</span></div>
              {avgHr == null ? <div className="caption">No heart-rate samples</div> : <div className="normal-check"><span style={{ width: 7, height: 7, borderRadius: 9, background: 'var(--green)', display: 'inline-block' }} /> Normal range</div>}
            </div>
            <Sparkline values={d.record.metrics.hrSamples.filter((s) => s.minute >= 360).map((s) => s.bpm)} width={92} height={44} color="var(--orange)" />
          </div>

          <div className="card strain-card">
            <div className="list-icon" style={{ background: 'rgba(255,122,51,.12)', color: 'var(--orange)' }}><Flame size={18} /></div>
            <div className="strain-card__main">
              <div className="strain-card__label">Total Energy</div>
              <div className="strain-card__value"><strong>{d.record.metrics.totalCalories.toLocaleString()}</strong><span>kcal</span></div>
              <div className="caption" style={{ marginTop: 3 }}>{d.record.metrics.activeCalories} active kcal</div>
            </div>

          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 12 }}>Today's target</div>
        <div className="card">
          <div className="row-between">
            <div className="row gap-10">
              <span className="list-icon" style={{ background: 'rgba(142,219,47,.14)', color: '#5f9a12' }}><Zap size={16} /></span>
              <div>
                <div className="card-title">Target Strain</div>
                <div className="card-sub">Based on recovery {d.recovery.score ?? '—'}% and recent load</div>
              </div>
            </div>
            <strong style={{ fontSize: 22 }} className="mono-num">{hiddenTarget ? '—' : `${d.strain.target}%`}</strong>
          </div>
          {!hiddenTarget ? (
            <>
              <div className="bar mt-14">
                <div className="bar__fill" style={{ width: `${Math.min(100, (d.strain.score / Math.max(1, d.strain.target)) * 100)}%`, background: d.strain.status === 'above' ? 'var(--orange)' : 'var(--lime)' }} />
              </div>
              <div className="target-note">
                <span>{d.strain.status === 'within' ? 'You are inside today’s target range.' : d.strain.status === 'below' ? 'You still have room to move.' : 'You are above today’s target.'}</span>
                <strong style={{ marginLeft: 'auto' }}>{Math.round(d.strain.score)} / {d.strain.target}%</strong>
              </div>
            </>
          ) : <div className="caption mt-8">Target is hidden because of your activity status. Switch back to Active to see it.</div>}
        </div>
      </div>

      <button className="link-row mt-16" onClick={() => setInfoOpen(true)}>
        <Activity size={17} />
        <span>How Strain is calculated</span>
        <ChevronLeft size={16} className="chevron" style={{ marginLeft: 'auto', transform: 'rotate(180deg)' }} />
      </button>

      {infoOpen ? (
        <Sheet title="About Strain" subtitle="0–100+, logarithmic, never clamped at 100." onClose={() => setInfoOpen(false)}>
          <p className="body" style={{ lineHeight: 1.6 }}>
            Strain combines the load from your workouts with passive load from background heart rate. Time in higher heart-rate zones adds
            disproportionately more, and the total uses logarithmic diminishing returns — two 30-minute runs do not add up linearly.
          </p>
          <div className="divider" />
          <div className="list-card" style={{ boxShadow: 'none' }}>
            {[
              ['Exercise Duration', `${d.record.metrics.exerciseMinutes} min today`],
              ['Cardio load', `${d.strain.activeTrimp} TRIMP active`],
              ['Passive load', `${d.strain.passiveTrimp} TRIMP background`],
              ['Total Energy', `${d.record.metrics.totalCalories.toLocaleString()} kcal`],
            ].map(([a, b]) => (
              <div className="list-row" key={a}>
                <div className="grow"><div className="list-title">{a}</div></div>
                <div className="list-value">{b}</div>
              </div>
            ))}
          </div>
          <p className="caption mt-16" style={{ lineHeight: 1.55 }}>
            Strain may exceed 100% on very demanding days. That is intentional. Target Strain rises after good recovery and falls after poor recovery.
          </p>
          <button className="btn btn--block mt-20" onClick={() => setInfoOpen(false)}>Got it</button>
        </Sheet>
      ) : null}
    </div>
  );
}
