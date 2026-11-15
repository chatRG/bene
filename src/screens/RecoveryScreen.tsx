import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronRight, Heart, Info, Leaf, Share2, Waves } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { deriveDay, scoreHistory } from '../domain/derive';
import { recoveryColor } from '../domain/scoring/recovery';
import { DetailHeader, EmptyState, Ring, Sheet } from '../components/ui';
import { LineChart } from '../components/charts';
import { showToast } from '../components/toast';

export function RecoveryScreen() {
  const state = useAppStore();
  const today = dateKey(new Date());
  const d = useMemo(() => deriveDay(state, today, new Date()), [state, today]);
  const history = useMemo(() => scoreHistory(state, 30), [state]);
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [expanded, setExpanded] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  const points = history
    .slice(-range)
    .map((h) => h.recovery)
    .filter((v): v is number => v != null);

  const share = async () => {
    const text = `Recovery ${d.recovery.score ?? '—'}% today — HRV ${d.sleep?.hrvMs ?? '—'} ms, RHR ${d.sleep?.rhrBpm ?? '—'} bpm.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Recovery', text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
      }
    } catch {
      showToast('Share cancelled');
    }
  };

  if (d.recovery.status !== 'scored') {
    return (
      <div className="screen screen--detail recovery-page">
        <DetailHeader
          title="Recovery"
          subtitle={format(new Date(), 'MMMM d, yyyy')}
          right={<button className="icon-btn" onClick={() => setInfoOpen(true)} aria-label="Info"><Info size={18} /></button>}
        />
        <div className="card mt-20">
          <EmptyState
            icon={<Waves size={24} />}
            title={d.recovery.status === 'calibrating' ? 'Still calibrating' : 'Recovery needs more data'}
            body={d.recovery.reason ?? 'Recovery unlocks after two complete nights of sleep with stages, overnight HRV and resting heart rate.'}
            action={
              <button className="btn btn--soft" onClick={() => setInfoOpen(true)}>
                How Recovery works
              </button>
            }
          />
        </div>
        <div className="list-card mt-16">
          <div className="list-row">
            <div className="list-icon"><Heart size={16} /></div>
            <div className="grow"><div className="list-title">Check your data sources</div><div className="list-sub">Apple Health, Oura, Garmin and others</div></div>
            <ChevronRight size={17} className="chevron" />
          </div>
          <div className="list-row">
            <div className="list-icon"><Info size={16} /></div>
            <div className="grow"><div className="list-title">Why is my score missing?</div><div className="list-sub">Sleep stages, HRV and RHR must all be present</div></div>
            <ChevronRight size={17} className="chevron" />
          </div>
        </div>
        {infoOpen ? <RecoveryInfo onClose={() => setInfoOpen(false)} /> : null}
      </div>
    );
  }

  const score = d.recovery.score ?? 0;
  const hrvDelta = d.sleep?.hrvMs != null ? d.sleep.hrvMs - d.baselineHrv : null;
  const rhrDelta = d.sleep?.rhrBpm != null ? d.sleep.rhrBpm - d.baselineRhr : null;

  return (
    <div className="screen screen--detail recovery-page">
      <DetailHeader
        title="Recovery"
        subtitle={
          <button className="row gap-4" style={{ marginInline: 'auto', fontSize: 12.5, color: 'var(--muted)' }}>
            {format(new Date(), 'MMMM d, yyyy')} <ChevronDown size={13} />
          </button>
        }
        right={
          <div className="row gap-8">
            <button className="icon-btn glass" onClick={share} aria-label="Share"><Share2 size={17} /></button>
            <button className="icon-btn glass" onClick={() => setInfoOpen(true)} aria-label="Info"><Info size={17} /></button>
          </div>
        }
      />

      <div className="recovery-hero">
        <div className="recovery-gauge-wrap">
          <Ring value={score} size={196} stroke={6} color={recoveryColor(score)} track="var(--field)">
            <div className="ring__center">
              <span className="recovery-score">{score}</span>
              <span className="recovery-band">{d.recovery.label} · out of 100</span>
            </div>
          </Ring>
        </div>
      </div>

      <div className="metric-pair mt-16">
        <div className="metric-card">
          <div className="metric-card__label"><Waves size={13} /> Resting HRV</div>
          <div className="metric-card__value">
            <strong>{d.sleep?.hrvMs?.toFixed(1) ?? '—'}</strong>
            <span>ms</span>
            {hrvDelta != null ? (
              <span className="metric-card__delta" style={{ color: hrvDelta >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                {hrvDelta >= 0 ? '↑' : '↓'} {Math.abs(hrvDelta).toFixed(1)}
              </span>
            ) : null}
          </div>
          <div className="caption" style={{ marginTop: 2 }}>Baseline {d.baselineHrv.toFixed(1)} ms</div>
        </div>
        <div className="metric-card">
          <div className="metric-card__label"><Heart size={13} /> Resting HR</div>
          <div className="metric-card__value">
            <strong>{d.sleep?.rhrBpm?.toFixed(1) ?? '—'}</strong>
            <span>bpm</span>
            {rhrDelta != null ? (
              <span className="metric-card__delta" style={{ color: rhrDelta <= 0 ? 'var(--good)' : 'var(--warn)' }}>
                {rhrDelta >= 0 ? '↑' : '↓'} {Math.abs(rhrDelta).toFixed(1)}
              </span>
            ) : null}
          </div>
          <div className="caption" style={{ marginTop: 2 }}>Baseline {d.baselineRhr.toFixed(1)} bpm</div>
        </div>
      </div>

      <div className="card insight-card mt-12">
        <div className="row gap-8">
          <span className={`coach-dot ${score < 50 ? 'warning' : ''}`}><Leaf size={14} /></span>
          <span className="insight-card__title">{score < 45 ? 'Time to take it easy' : score >= 67 ? 'Recovery in your upper range' : 'Recovery is mid-range'}</span>
          <button
            className="icon-btn icon-btn--ghost"
            style={{ marginLeft: 'auto', width: 28, height: 28 }}
            onClick={() => setExpanded((v) => !v)}
            aria-label="Expand insight"
          >
            <ChevronDown size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
          </button>
        </div>
        <p className={`insight-card__body ${expanded ? '' : 'insight-card__body--clamped'}`}>{d.recoveryNarrative}</p>
      </div>

      <button className="link-row mt-12" onClick={() => setInfoOpen(true)}>
        <Info size={17} />
        <span>How this score is built</span>
        <ChevronRight size={17} className="chevron" style={{ marginLeft: 'auto' }} />
      </button>

      <div className="section">
        <div className="section-head">
          <div className="section-title">Recovery timeline</div>
          <div className="segmented">
            {([7, 14, 30] as const).map((r) => (
              <button key={r} className={`segmented__btn ${range === r ? 'segmented__btn--active' : ''}`} onClick={() => setRange(r)}>
                {r} days
              </button>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-card__head">
            <div>
              <div className="chart-card__title">Recovery score</div>
              <div className="caption">Morning reading · 1–100</div>
            </div>
            <span className="pill pill--sm pill--flat">Avg {Math.round(points.reduce((a, b) => a + b, 0) / Math.max(1, points.length))}</span>
          </div>
          <LineChart
            values={points}
            yMax={100}
            yTicks={[100, 75, 50, 25]}
            color={recoveryColor(score)}
            height={190}
            avg={points.reduce((a, b) => a + b, 0) / Math.max(1, points.length)}
            xLabels={[history[Math.max(0, history.length - range)]?.date.slice(5) ?? '', 'Today']}
          />
        </div>
      </div>

      <div className="section">
        <div className="section-title" style={{ marginBottom: 12 }}>Score breakdown</div>
        <div className="card">
          <div className="components-list">
            {d.recovery.components.map((c) => {
              const label = { sleep: 'Sleep score', hrv: 'HRV', rhr: 'Resting HR', temp: 'Temperature', respiratory: 'Respiratory' }[c.key];
              return (
                <div className="component-row" key={c.key}>
                  <span>{label}</span>
                  <div className="bar"><div className="bar__fill" style={{ width: `${c.score}%`, background: c.score >= 60 ? 'var(--lime)' : c.score >= 40 ? 'var(--amber)' : 'var(--orange)' }} /></div>
                  <strong>{c.score}</strong>
                </div>
              );
            })}
          </div>
          <p className="caption mt-12" style={{ lineHeight: 1.5 }}>
            Personal baseline from your last {d.recovery.baselineNights} nights. Exact weights are not public, so this build uses an independent,
            documented model (see docs/SCORING.md).
          </p>
        </div>
      </div>

      {infoOpen ? <RecoveryInfo onClose={() => setInfoOpen(false)} /> : null}
    </div>
  );
}

function RecoveryInfo({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="About Recovery" subtitle="One number for how ready your body is today." onClose={onClose}>
      <div className="list-card" style={{ boxShadow: 'none' }}>
        <div className="list-row">
          <div className="list-icon"><Waves size={16} /></div>
          <div className="grow"><div className="list-title">Overnight HRV</div><div className="list-sub">Measured inside your sleep window, not during the day</div></div>
        </div>
        <div className="list-row">
          <div className="list-icon"><Heart size={16} /></div>
          <div className="grow"><div className="list-title">Resting heart rate</div><div className="list-sub">Lower than your baseline generally means better recovery</div></div>
        </div>
        <div className="list-row">
          <div className="list-icon"><Leaf size={16} /></div>
          <div className="grow"><div className="list-title">Sleep, temperature, breathing, SpO₂</div><div className="list-sub">All compared with your own 28-night baseline</div></div>
        </div>
      </div>
      <p className="caption mt-16" style={{ lineHeight: 1.55 }}>
        Recovery requires two complete nights of staged sleep plus overnight HRV and resting heart rate. If any of those are missing, the score stays hidden rather
        than guessing. This is a wellness estimate, not a medical device.
      </p>
      <button className="btn btn--block mt-20" onClick={onClose}>Got it</button>
    </Sheet>
  );
}
