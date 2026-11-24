import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlarmClock, BedDouble, ChevronRight, Clock, Moon, Share2, Watch, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { deriveDay, sleepNeedFor } from '../domain/derive';
import { deepSleepTargetPct } from '../domain/scoring/sleep';
import { stageTotals } from '../domain/math';
import { Hypnogram, LineChart } from '../components/charts';
import { EmptyState, Ring, Sheet } from '../components/ui';
import { showToast } from '../components/toast';
import type { AlarmType } from '../domain/types';

const STAGE_INFO = [
  { key: 'awake', label: 'Awake', color: 'var(--sleep-awake)' },
  { key: 'rem', label: 'REM', color: 'var(--sleep-rem)' },
  { key: 'core', label: 'Core', color: 'var(--sleep-core)' },
  { key: 'deep', label: 'Deep', color: 'var(--sleep-deep)' },
] as const;

export function SleepScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const today = dateKey(new Date());
  const d = useMemo(() => deriveDay(state, today, new Date()), [state, today]);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);

  if (!d.sleep || !d.sleepScore || d.sleepScore.status !== 'scored') {
    return (
      <div>
        <div className="screen screen--detail sleep-page">
          <div className="detail-head">
            <button className="icon-btn glass" onClick={() => navigate(-1)} aria-label="Close"><X size={19} /></button>
            <div><div className="detail-head__title">Sleep</div></div>
            <div />
          </div>
          <div className="card mt-20">
            <EmptyState
              icon={<Moon size={24} />}
              title="No sleep data yet"
              body="Wear your watch or ring overnight. Sleep stages, HRV and resting heart rate unlock your first Sleep and Recovery scores."
            />
          </div>
        </div>
      </div>
    );
  }

  const sleep = d.sleep;
  const totals = stageTotals(sleep);
  const score = d.sleepScore;
  const hours = Math.floor(totals.asleepMin / 60);
  const mins = totals.asleepMin % 60;
  const startLabel = new Date(sleep.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const bankHours = Math.floor(Math.abs(d.sleepBankMin) / 60);
  const bankMins = Math.abs(d.sleepBankMin) % 60;
  const consistency = (() => {
    const starts = state.dayOrder
      .slice(-14)
      .map((date) => state.days[date]?.sleep?.start)
      .filter((start): start is string => !!start)
      .map((start) => {
        const d = new Date(start);
        return d.getHours() * 60 + d.getMinutes();
      });
    if (starts.length < 3) return null;
    // A bedtime is a point on a 24-hour circle, so both the mean and the
    // distances to it are circular: any linear re-anchoring just moves the
    // wraparound somewhere else (bedtimes at 17:55/18:00/18:05 broke at 18:00,
    // midnight-adjacent bedtimes broke at 00:00).
    const angles = starts.map((m) => (m / 1440) * 2 * Math.PI);
    const sinMean = angles.reduce((a, t) => a + Math.sin(t), 0) / angles.length;
    const cosMean = angles.reduce((a, t) => a + Math.cos(t), 0) / angles.length;
    const meanAngle = Math.atan2(sinMean, cosMean);
    const madRadians =
      angles.reduce((a, t) => {
        let diff = Math.abs(t - meanAngle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        return a + diff;
      }, 0) / angles.length;
    const madMinutes = (madRadians / (2 * Math.PI)) * 1440;
    return Math.round(Math.max(0, Math.min(100, 100 - madMinutes / 2)));
  })();

  // The last 14 day keys, kept in full so the x-axis stays truthful: labels are
  // computed from the nights actually plotted rather than hardcoded, so after
  // filtering empty nights the rightmost dot is never mislabelled as last night.
  const trendDays = state.dayOrder.slice(-14);
  const trend = trendDays.map((date) => {
    const s = state.days[date]?.sleep;
    return { date, hours: s ? Math.round(stageTotals(s).asleepMin / 6) / 10 : 0 };
  });
  const trendNights = trend.filter((t) => t.hours > 0);
  const trendValues = trendNights.map((t) => t.hours);
  const trendAvg = trendValues.length ? trendValues.reduce((a, b) => a + b, 0) / trendValues.length : 0;
  const trendLabels: [string, string] = [
    trendNights.length ? format(new Date(`${trendNights[0].date}T12:00:00`), 'M/d') : '',
    trendNights.length ? format(new Date(`${trendNights[trendNights.length - 1].date}T12:00:00`), 'M/d') : '',
  ];

  return (
    <div>
      <div className="screen screen--detail sleep-page">
        <div className="detail-head">
          <button className="icon-btn glass" onClick={() => navigate(-1)} aria-label="Close"><X size={19} /></button>
          <div>
            <div className="detail-head__title">Primary sleep</div>
            <div className="detail-head__sub">{format(new Date(`${sleep.date}T12:00:00`), 'M/d/yy')} at {startLabel}</div>
          </div>
          <div className="detail-head__right">
            <button className="icon-btn glass" onClick={() => setAlarmOpen(true)} aria-label="Alarm"><AlarmClock size={19} /></button>
          </div>
        </div>

        <div className="row gap-6 caption" style={{ justifyContent: 'center', marginTop: 6 }}>
          <Watch size={12} /> Tracked with {sleep.source}
        </div>

        <div className="sleep-hero">
          <div className="row gap-10" style={{ alignItems: 'baseline' }}>
            <span className="sleep-hero__score">{hours}<span style={{ fontSize: 24, fontWeight: 500 }}>h</span> {mins}<span style={{ fontSize: 24, fontWeight: 500 }}>m</span></span>
          </div>
          <div className="sleep-hero__label">asleep · {score.score}% sleep score</div>
          <button className="pill pill--sm pill--flat mt-8" onClick={() => setScoreOpen(true)}>
            {score.score >= 80 ? 'Restorative night' : score.score >= 70 ? 'Solid night' : 'Short on sleep'}
          </button>
        </div>

        <div className="card mt-16" style={{ padding: '16px 14px 12px' }}>
          <div className="row-between" style={{ padding: '0 4px 8px' }}>
            <span className="card-title">Sleep Stages</span>
            <button className="caption" onClick={() => setScoreOpen(true)}>Details</button>
          </div>
          <Hypnogram sleep={sleep} height={176} />
        </div>

        <div className="stage-grid mt-12">
          {STAGE_INFO.map((stage) => {
            const value = totals[`${stage.key}Min` as 'awakeMin' | 'remMin' | 'coreMin' | 'deepMin'];
            const pct = Math.round((value / totals.inBedMin) * 100);
            return (
              <div className="stage-card" key={stage.key}>
                <div>
                  <div className="stage-card__label">{stage.label}</div>
                  <div className="stage-card__value">{Math.floor(value / 60)}h {value % 60}m</div>
                  <div className="stage-card__pct" style={{ color: stage.color }}>{pct}%</div>
                </div>
                <Ring value={pct} size={44} stroke={5} color={stage.color} className="stage-ring" />
              </div>
            );
          })}
        </div>

        <div className="col gap-8 mt-16">
          <button className="sleep-row" onClick={() => setAlarmOpen(true)}>
            <span>Last night's sleep needed</span>
            <strong>
              {Math.floor(d.sleepNeedMin / 60)}h {d.sleepNeedMin % 60}m <ChevronRight size={14} />
            </strong>
          </button>
          <div className="sleep-row">
            <span>Time to fall asleep</span>
            <strong>{sleep.timeToFallAsleepMin != null ? `${sleep.timeToFallAsleepMin} minutes` : '—'}</strong>
          </div>
        </div>

        <div className="section">
          <div className="section-title" style={{ marginBottom: 12 }}>Sleep bank</div>
          <div className="card">
            <div className="row-between">
              <div>
                <div className="caption">7-day balance</div>
                <div className="mono-num" style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.01em', color: d.sleepBankMin < 0 ? 'var(--warn)' : 'var(--good)' }}>
                  {d.sleepBankMin < 0 ? '−' : '+'}{bankHours}h {bankMins}m
                </div>
              </div>
              <span className={`pill pill--sm ${d.sleepBankMin < 0 ? 'pill--orange' : 'pill--green'}`}>
                {d.sleepBankMin < 0 ? 'Sleep debt' : 'Surplus'}
              </span>
            </div>
            <p className="caption mt-8" style={{ lineHeight: 1.5 }}>
              A 7-day, recency-weighted look at sleep against your {Math.floor(state.settings.sleepGoalMin / 60)}h goal. Naps count toward the balance.
            </p>
          </div>
        </div>

        <div className="section">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <span className="section-title">Sleep trend</span>
            <span className="caption">Last 14 nights</span>
          </div>
          <div className="chart-card">
            {trendValues.length >= 2 ? (
              <LineChart values={trendValues} yMax={10} yTicks={[10, 7, 4]} color="var(--sleep)" height={150} avg={trendAvg} avgLabel={`Avg ${trendAvg.toFixed(1)}h`} xLabels={trendLabels} />
            ) : (
              <div className="empty" style={{ padding: '18px 12px' }}>Two nights of sleep unlock the trend.</div>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-title" style={{ marginBottom: 12 }}>Consistency</div>
          <div className="card">
            <div className="row-between">
              <div className="row gap-10">
                <span className="list-icon" style={{ background: 'rgba(109,124,247,.12)', color: 'var(--sleep)' }}><Clock size={16} /></span>
                <div>
                  <div className="card-title">Bedtime consistency</div>
                  <div className="card-sub">Within 30 min most nights</div>
                </div>
              </div>
              <strong className="mono-num" style={{ fontSize: 22 }}>{consistency == null ? '—' : `${consistency}%`}</strong>
            </div>
            <div className="row gap-3 mt-12">
              {Array.from({ length: 14 }, (_, i) => {
                // One cell per recent night, coloured only where a night was recorded.
                const night = state.dayOrder[state.dayOrder.length - 14 + i];
                const logged = night ? !!state.days[night]?.sleep : false;
                return (
                  <span
                    key={i}
                    style={{
                      flex: 1,
                      height: 24,
                      borderRadius: 2,
                      background: !logged
                        ? 'var(--field)'
                        : i > 10
                          ? 'var(--sleep)'
                          : 'color-mix(in srgb, var(--sleep) 55%, var(--field))',
                    }}
                  />
                );
              })}
            </div>
            <div className="row-between caption mt-8"><span>2 weeks ago</span><span>Last night</span></div>
          </div>
        </div>

        <button className="link-row mt-16" onClick={() => setAlarmOpen(true)}>
          <BedDouble size={17} />
          <span>Tonight's Sleep Needed</span>
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            {Math.floor(sleepNeedFor(state, today) / 60)}h {sleepNeedFor(state, today) % 60}m <ChevronRight size={15} />
          </span>
        </button>

        <div className="row gap-8 mt-16">
          <button className="btn btn--soft btn--block" onClick={() => showToast('Sleep share card copied')}><Share2 size={16} /> Share</button>
          <button className="btn btn--block" onClick={() => setAlarmOpen(true)}><AlarmClock size={16} /> Set alarm</button>
        </div>
      </div>

      {alarmOpen ? (
        <AlarmSheet
          initial={sleep.alarm}
          onClose={() => setAlarmOpen(false)}
          onSave={(alarm) => {
            const day = state.days[today];
            if (day?.sleep) {
              useAppStore.setState({
                days: { ...state.days, [today]: { ...day, sleep: { ...day.sleep, alarm } } },
              });
            }
            setAlarmOpen(false);
            showToast(alarm.type === 'none' ? 'Alarm removed' : 'Alarm saved to Apple Watch');
          }}
        />
      ) : null}

      {scoreOpen ? (
        <Sheet title="Sleep score" subtitle={`${score.score}/100 · a composite of duration, stages, efficiency, continuity and HR dip.`} onClose={() => setScoreOpen(false)}>
          <div className="components-list">
            {[
              ['Duration', score.durationScore],
              ['Stage balance', score.stageScore],
              ['Efficiency', score.efficiencyScore],
              ['Continuity', score.continuityScore],
              ['Heart-rate dip', score.dipScore],
            ].map(([label, value]) => (
              <div className="component-row" key={String(label)}>
                <span>{label}</span>
                <div className="bar"><div className="bar__fill" style={{ width: `${value}%`, background: 'var(--sleep)' }} /></div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="caption mt-16" style={{ lineHeight: 1.55 }}>
            {d.age != null
              ? `Deep sleep was ${score.deepPct.toFixed(0)}% against a ${deepSleepTargetPct(d.age, state.profile.sex).toFixed(0)}% target for your age`
              : `Deep sleep was ${score.deepPct.toFixed(0)}%`}
            ; REM was {score.remPct.toFixed(0)}% against 22%. Your efficiency was {score.efficiency}% with {Math.round(totals.awakeMin)}m awake.
          </p>
          <button className="btn btn--block mt-20" onClick={() => setScoreOpen(false)}>Close</button>
        </Sheet>
      ) : null}
    </div>
  );
}

function AlarmSheet({
  initial,
  onClose,
  onSave,
}: {
  initial: { type: AlarmType; time: string; windowMin: number } | null;
  onClose: () => void;
  onSave: (alarm: { type: AlarmType; time: string; windowMin: number; enabled: boolean }) => void;
}) {
  const [type, setType] = useState<AlarmType>(initial?.type ?? 'smart');
  const [time, setTime] = useState(initial?.time ?? '07:30');
  const [windowMin, setWindowMin] = useState(initial?.windowMin ?? 30);
  const options: { value: AlarmType; label: string; desc: string }[] = [
    { value: 'smart', label: 'Smart alarm', desc: 'Wake in your lightest phase within a window' },
    { value: 'regular', label: 'Regular alarm', desc: 'Wake at the same time every day' },
    { value: 'sleepNeed', label: 'Sleep needed', desc: 'Wake after your sleep target is met' },
    { value: 'none', label: 'No alarm', desc: 'Track sleep without waking you' },
  ];
  return (
    <Sheet title="Alarm" subtitle="Saved to your Apple Watch for haptics and Smart wake." onClose={onClose}>
      <div className="status-options">
        {options.map((o) => (
          <button key={o.value} className={`status-option ${type === o.value ? 'status-option--active' : ''}`} onClick={() => setType(o.value)}>
            <span className="status-option__icon"><AlarmClock size={18} /></span>
            <span className="grow"><span className="list-title">{o.label}</span><span className="list-sub">{o.desc}</span></span>
            {type === o.value ? <span className="status-dot" /> : null}
          </button>
        ))}
      </div>
      {type !== 'none' ? (
        <div className="row gap-12 mt-20">
          <div className="grow">
            <div className="field-label">Wake time</div>
            <input className="text-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div style={{ width: 120 }}>
            <div className="field-label">Window</div>
            <select className="text-input" value={String(windowMin)} onChange={(e) => setWindowMin(Number(e.target.value))}>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
            </select>
          </div>
        </div>
      ) : null}
      <p className="caption mt-16" style={{ lineHeight: 1.5 }}>
        Time to Fall Asleep is measured from when the Bene alarm is armed to your first detected sleep stage. Apple's Clock alarm does not count.
      </p>
      <button className="btn btn--block mt-20" onClick={() => onSave({ type, time, windowMin, enabled: type !== 'none' })}>
        Save to Watch
      </button>
    </Sheet>
  );
}
