import { useId } from 'react';
import type { SleepSession, Stage } from '../domain/types';
import { stageTotals } from '../domain/math';

/* ---------------- Sparkline ---------------- */

export function Sparkline({
  values,
  color = 'var(--accent)',
  width = 76,
  height = 34,
  fill = true,
  strokeWidth = 1.5,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  useId();
  if (values.length < 2 || !values.every((v) => Number.isFinite(v))) return <div style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return [x, y] as const;
  });
  const d = smoothPath(pts);
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {fill ? <path d={area} fill={color} opacity={0.08} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={last[0]} y1={last[1] - 5} x2={last[0]} y2={last[1] + 5} stroke={color} strokeWidth="1" opacity="0.45" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/* ---------------- Line chart ---------------- */

export function LineChart({
  values,
  height = 190,
  color = 'var(--accent)',
  yMax = 100,
  yTicks = [100, 67, 33],
  avg,
  avgLabel,
  band,
  xLabels,
  liveDot = true,
  showArea = true,
}: {
  values: number[];
  height?: number;
  color?: string;
  yMax?: number;
  yTicks?: number[];
  avg?: number | null;
  avgLabel?: string;
  band?: [number, number] | null;
  xLabels?: [string, string];
  liveDot?: boolean;
  showArea?: boolean;
}) {
  const id = useId().replace(/[:]/g, '');
  // A zero or non-finite axis collapses every y coordinate to NaN; render nothing.
  if (!(yMax > 0) || !values.every((v) => Number.isFinite(v))) return <div style={{ height }} />;
  const w = 320;
  const h = height;
  const padR = 34;
  const padT = 12;
  const padB = 22;
  const chartW = w - padR;
  const chartH = h - padT - padB;
  const ys = (v: number) => padT + chartH - (Math.min(yMax, Math.max(0, v)) / yMax) * chartH;
  const xs = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * chartW);
  const pts = values.map((v, i) => [xs(i), ys(v)] as const);
  const d = values.length >= 2 ? smoothPath(pts) : '';
  const area = d ? `${d} L ${chartW} ${padT + chartH} L 0 ${padT + chartH} Z` : '';
  const last = pts[pts.length - 1];

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" style={{ height }} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={`lc-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.1" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {band ? (
          <rect
            x={0}
            y={ys(band[1])}
            width={chartW}
            height={Math.max(4, ys(band[0]) - ys(band[1]))}
            fill={color}
            opacity="0.07"
            rx="2"
          />
        ) : null}

        {yTicks.map((t, i) => (
          <g key={t}>
            <line
              x1={0}
              y1={ys(t)}
              x2={chartW}
              y2={ys(t)}
              className="chart-grid"
              strokeDasharray={i === 0 ? undefined : '1 4'}
            />
            <text x={chartW + 8} y={ys(t) + 4} className="chart-label">
              {t}
            </text>
          </g>
        ))}

        {showArea && area ? <path d={area} fill={`url(#lc-${id})`} /> : null}

        {avg != null ? (
          <g>
            <line
              x1={0}
              y1={ys(avg)}
              x2={chartW}
              y2={ys(avg)}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="3 4"
              opacity="0.7"
            />
            <text x={chartW - 2} y={ys(avg) - 6} textAnchor="end" className="chart-label">
              {avgLabel ?? `Avg ${Math.round(avg)}%`}
            </text>
          </g>
        ) : null}

        {d ? <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}

        {liveDot && last ? (
          <g>
            <line x1={last[0]} y1={last[1] - 8} x2={last[0]} y2={last[1] + 8} stroke={color} strokeWidth="1" opacity="0.4" />
            <circle cx={last[0]} cy={last[1]} r="3" fill="var(--card)" stroke={color} strokeWidth="2" />
          </g>
        ) : null}

        {xLabels ? (
          <>
            <text x={0} y={h - 3} className="chart-label">{xLabels[0]}</text>
            <text x={chartW} y={h - 3} textAnchor="end" className="chart-label">{xLabels[1]}</text>
          </>
        ) : null}
      </svg>
    </div>
  );
}

/* ---------------- Hypnogram ---------------- */

const STAGE_META: Record<Stage, { label: string; color: string; row: number }> = {
  awake: { label: 'Awake', color: 'var(--sleep-awake)', row: 0 },
  rem: { label: 'REM', color: 'var(--sleep-rem)', row: 1 },
  core: { label: 'Core', color: 'var(--sleep-core)', row: 2 },
  deep: { label: 'Deep', color: 'var(--sleep-deep)', row: 3 },
};

const STAGE_ORDER: Stage[] = ['awake', 'rem', 'core', 'deep'];

export function Hypnogram({ sleep, height = 168 }: { sleep: SleepSession; height?: number }) {
  const totals = stageTotals(sleep);
  const total = Math.max(1, totals.inBedMin);
  const w = 340;
  const padL = 42;
  const padB = 24;
  const chartW = w - padL;
  const rowH = (height - padB) / 4;
  const blockH = Math.min(12, rowH - 6);
  const xs = (min: number) => padL + (min / total) * chartW;
  const ys = (stage: Stage) => STAGE_META[stage].row * rowH + rowH / 2;

  const startLabel = new Date(sleep.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endLabel = new Date(sleep.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const asleep = `${Math.floor(totals.asleepMin / 60)}h ${String(totals.asleepMin % 60).padStart(2, '0')}m`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="chart-svg" style={{ height }} role="img" aria-label="Sleep stages">
        {STAGE_ORDER.map((stage, i) => (
          <g key={stage}>
            <line
              x1={padL}
              y1={(i + 1) * rowH}
              x2={w}
              y2={(i + 1) * rowH}
              stroke="var(--hairline)"
              strokeDasharray="1 4"
            />
            <text x={0} y={ys(stage) + 3.5} className="chart-label" fontSize="10">
              {STAGE_META[stage].label}
            </text>
          </g>
        ))}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={padL + p * chartW}
            y1="0"
            x2={padL + p * chartW}
            y2={height - padB}
            stroke="var(--hairline)"
            strokeDasharray="1 5"
          />
        ))}
        {sleep.stages.map((b, i) => {
          const meta = STAGE_META[b.stage];
          const prev = sleep.stages[i - 1];
          return (
            <g key={`${b.stage}-${i}`}>
              {prev && prev.stage !== b.stage ? (
                <line
                  x1={xs(b.startMin)}
                  y1={ys(prev.stage)}
                  x2={xs(b.startMin)}
                  y2={ys(b.stage)}
                  stroke="var(--hairline-strong)"
                  strokeWidth="1"
                />
              ) : null}
              <rect
                x={xs(b.startMin)}
                y={ys(b.stage) - blockH / 2}
                width={Math.max(1.2, xs(b.endMin) - xs(b.startMin))}
                height={blockH}
                rx={2}
                fill={meta.color}
              />
            </g>
          );
        })}
        <line x1={padL} y1={height - padB} x2={w} y2={height - padB} stroke="var(--hairline-strong)" strokeWidth="1" />
        <text x={padL} y={height - 6} className="chart-label">{startLabel}</text>
        <text x={w} y={height - 6} textAnchor="end" className="chart-label">{endLabel}</text>
      </svg>
      <div className="row-between" style={{ marginTop: 6 }}>
        <span className="meta-mono">{asleep} asleep</span>
        <span className="meta-mono">{Math.round((totals.awakeMin / total) * 100)}% awake</span>
      </div>
    </div>
  );
}

/* ---------------- Semi gauge ---------------- */

export function SemiGauge({
  value,
  min,
  max,
  color = 'var(--accent)',
  labels,
  size = 250,
}: {
  value: number;
  min: number;
  max: number;
  color?: string;
  labels?: [string, string, string];
  size?: number;
}) {
  const w = size;
  const h = size * 0.64;
  const cx = w / 2;
  const cy = h - 18;
  const r = w * 0.4;
  const clamp = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const pct = clamp(value);
  const angle = Math.PI + pct * Math.PI;
  const point = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  const arc = (from: number, to: number) => {
    const a0 = Math.PI + from * Math.PI;
    const a1 = Math.PI + to * Math.PI;
    const p0 = { x: cx + Math.cos(a0) * r, y: cy + Math.sin(a0) * r };
    const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
  };
  return (
    <div style={{ position: 'relative', width: '100%', display: 'grid', placeItems: 'center' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: w }} role="img" aria-label="Age gauge">
        <path d={arc(0, 1)} fill="none" stroke="var(--hairline)" strokeWidth="1" />
        {Array.from({ length: 41 }, (_, i) => {
          const a = Math.PI + (i / 40) * Math.PI;
          const r1 = r + 8;
          const r2 = r + (i % 5 === 0 ? 15 : 12);
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * r1}
              y1={cy + Math.sin(a) * r1}
              x2={cx + Math.cos(a) * r2}
              y2={cy + Math.sin(a) * r2}
              stroke="var(--muted-2)"
              strokeWidth={i % 5 === 0 ? 1.1 : 0.6}
              opacity={i % 5 === 0 ? 0.6 : 0.3}
            />
          );
        })}
        <path d={arc(0, Math.max(0.001, pct))} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={point.x} y2={point.y} stroke={color} strokeWidth="1" opacity="0.35" />
        <circle cx={point.x} cy={point.y} r="5" fill={color} stroke="var(--card)" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="3" fill="var(--muted-2)" />
      </svg>
      {labels ? (
        <>
          <span className="meta-mono" style={{ position: 'absolute', left: 0, bottom: 0 }}>{labels[0]}</span>
          <span className="meta-mono" style={{ position: 'absolute', right: 0, bottom: 0 }}>{labels[1]}</span>
          <span className="meta-mono" style={{ position: 'absolute', bottom: 0 }}>{labels[2]}</span>
        </>
      ) : null}
    </div>
  );
}

/* ---------------- Dot matrix ---------------- */

export function DotMatrix({ pct, color, cols = 8, rows = 8 }: { pct: number; color: string; cols?: number; rows?: number }) {
  const total = cols * rows;
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * total);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 4,
        width: 72,
      }}
      aria-hidden
    >
      {Array.from({ length: total }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        // fill bottom-up, alternating column direction for a woven look
        const order = (rows - 1 - row) * cols + (row % 2 === 0 ? col : cols - 1 - col);
        const on = order < filled;
        return (
          <span
            key={i}
            style={{
              aspectRatio: '1',
              borderRadius: 1.5,
              background: on ? color : 'color-mix(in srgb, ' + color + ' 16%, transparent)',
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------------- Range bar ---------------- */

export function RangeBar({
  value,
  min,
  max,
  markerLabel,
}: {
  value: number;
  min: number;
  max: number;
  gradient?: string;
  markerLabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const zeroPct = Math.max(0, Math.min(100, ((0 - min) / (max - min)) * 100));
  const left = Math.min(pct, zeroPct);
  const width = Math.abs(pct - zeroPct);
  return (
    <div style={{ position: 'relative', paddingTop: markerLabel ? 24 : 0 }}>
      {markerLabel ? (
        <span
          className="meta-mono"
          style={{
            position: 'absolute',
            left: `${Math.max(6, Math.min(94, pct))}%`,
            top: 0,
            transform: 'translateX(-50%)',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}
        >
          {markerLabel}
        </span>
      ) : null}
      <div style={{ height: 8, borderRadius: 4, background: 'var(--field)', position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: `${left}%`,
            width: `${width}%`,
            top: 0,
            bottom: 0,
            background: 'var(--accent)',
            borderRadius: 4,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: `${zeroPct}%`,
            top: -3,
            bottom: -3,
            width: 1,
            background: 'var(--hairline-strong)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: `${pct}%`,
            top: -5,
            height: 18,
            width: 2,
            marginLeft: -1,
            borderRadius: 1,
            background: 'var(--text)',
          }}
        />
      </div>
      <div className="row-between" style={{ marginTop: 6 }}>
        <span className="meta-mono">{min}</span>
        <span className="meta-mono">0</span>
        <span className="meta-mono">{max}</span>
      </div>
    </div>
  );
}

/* ---------------- Energy bar ---------------- */

export function EnergyBar({ value }: { value: number }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 2, height: 10 }}>
        {Array.from({ length: 28 }, (_, i) => {
          const on = (i / 28) * 100 < value;
          return (
            <span
              key={i}
              style={{
                flex: 1,
                borderRadius: 1,
                background: on ? 'var(--accent)' : 'var(--field)',
                opacity: on ? 0.35 + (i / 27) * 0.65 : 1,
              }}
            />
          );
        })}
      </div>
      <div className="row-between" style={{ marginTop: 8 }}>
        <span className="meta-mono">Drained</span>
        <span className="meta-mono">Steady</span>
        <span className="meta-mono">Charged</span>
      </div>
    </div>
  );
}
