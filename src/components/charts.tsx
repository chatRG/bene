import { useId } from 'react';
import type { SleepSession, Stage } from '../domain/types';
import { stageTotals } from '../domain/math';

/* ---------------- Sparkline ---------------- */

export function Sparkline({
  values,
  color = 'var(--orange)',
  width = 76,
  height = 34,
  fill = true,
  strokeWidth = 2,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const id = useId().replace(/[:]/g, '');
  if (values.length < 2) return <div style={{ width, height }} />;
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
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#sp-${id})`} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.6} fill={color} stroke="var(--card)" strokeWidth={1.5} />
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
  color = 'var(--orange)',
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
  const w = 320;
  const h = height;
  const padR = 30;
  const padT = 12;
  const padB = 20;
  const chartW = w - padR;
  const chartH = h - padT - padB;
  const ys = (v: number) => padT + chartH - (Math.min(yMax, Math.max(0, v)) / yMax) * chartH;
  const xs = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * chartW);
  const pts = values.map((v, i) => [xs(i), ys(v)] as const);
  const d = smoothPath(pts);
  const area = `${d} L ${chartW} ${padT + chartH} L 0 ${padT + chartH} Z`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" style={{ height }} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={`lc-${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={color} stopOpacity="0.16" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={color} stopOpacity="0.55" />
            <stop offset="0.55" stopColor={color} stopOpacity="0.95" />
            <stop offset="1" stopColor={color} />
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
            rx="6"
          />
        ) : null}

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={0} y1={ys(t)} x2={chartW} y2={ys(t)} className="chart-grid" strokeDasharray={t === yTicks[0] ? undefined : '2 5'} />
            <text x={chartW + 8} y={ys(t) + 4} className="chart-label">
              {t}
            </text>
          </g>
        ))}

        {showArea ? <path d={area} fill={`url(#lc-${id})`} /> : null}

        {avg != null ? (
          <g>
            <line x1={0} y1={ys(avg)} x2={chartW} y2={ys(avg)} stroke={color} strokeWidth="1.4" strokeDasharray="2 5" opacity="0.75" />
            <rect x={chartW * 0.36} y={ys(avg) - 18} width={62} height={17} rx="8.5" fill={color} opacity="0.92" />
            <text x={chartW * 0.36 + 31} y={ys(avg) - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
              {avgLabel ?? `Avg. ${Math.round(avg)}%`}
            </text>
          </g>
        ) : null}

        <path d={d} fill="none" stroke={`url(#stroke-${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />

        {pts.filter((_, i) => i % Math.max(1, Math.round(pts.length / 8)) === 0).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.2" fill="var(--card)" stroke={color} strokeWidth="1.8" />
        ))}

        {liveDot && pts.length > 0 ? (
          <>
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="8" fill={color} opacity="0.18" />
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4.5" fill="var(--card)" stroke={color} strokeWidth="2.6" />
          </>
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
  awake: { label: 'Awake', color: '#f6a265', row: 0 },
  rem: { label: 'REM', color: '#9ac8ff', row: 1 },
  core: { label: 'Core', color: '#5f9df8', row: 2 },
  deep: { label: 'Deep', color: '#b0a0ff', row: 3 },
};

const STAGE_ORDER: Stage[] = ['awake', 'rem', 'core', 'deep'];

export function Hypnogram({ sleep, height = 168 }: { sleep: SleepSession; height?: number }) {
  const totals = stageTotals(sleep);
  const total = Math.max(1, totals.inBedMin);
  const w = 340;
  const rowH = (height - 28) / 4;
  const blockH = Math.min(14, rowH - 4);
  const xs = (min: number) => (min / total) * w;
  const ys = (stage: Stage) => STAGE_META[stage].row * rowH + rowH / 2;

  const startLabel = new Date(sleep.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endLabel = new Date(sleep.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="chart-svg" style={{ height }} role="img" aria-label="Sleep stages">
        {[1, 2, 3].map((i) => (
          <line key={i} x1="0" y1={(i * (height - 28)) / 4} x2={w} y2={(i * (height - 28)) / 4} stroke="var(--hairline)" strokeDasharray="2 6" />
        ))}
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={p * w} y1="0" x2={p * w} y2={height - 28} stroke="var(--hairline)" strokeDasharray="2 8" opacity="0.6" />
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
                  stroke={STAGE_META[b.stage].color}
                  strokeWidth="1.2"
                  opacity="0.55"
                />
              ) : null}
              <rect
                x={xs(b.startMin)}
                y={ys(b.stage) - blockH / 2}
                width={Math.max(1.2, xs(b.endMin) - xs(b.startMin))}
                height={blockH}
                rx={3}
                fill={meta.color}
                opacity={b.stage === 'awake' ? 0.9 : 0.95}
              />
            </g>
          );
        })}
        {STAGE_ORDER.map((stage) => (
          <text
            key={stage}
            x={w - 2}
            y={ys(stage) + 3.5}
            textAnchor="end"
            fontSize="9"
            fill="var(--muted)"
            opacity="0.8"
          >
            {STAGE_META[stage].label.slice(0, 1)}
          </text>
        ))}
      </svg>
      <div className="row-between" style={{ marginTop: 6 }}>
        <span className="pill pill--sm pill--flat">🌙 {startLabel}</span>
        <span className="pill pill--sm pill--flat">☀️ {endLabel}</span>
      </div>
    </div>
  );
}

/* ---------------- Semi gauge ---------------- */

export function SemiGauge({
  value,
  min,
  max,
  color = 'var(--teal)',
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
              strokeWidth={i % 5 === 0 ? 1.2 : 0.7}
              opacity={i % 5 === 0 ? 0.55 : 0.3}
            />
          );
        })}
        <path d={arc(0, Math.max(0.001, pct))} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" opacity="0.9" />
        <circle cx={point.x} cy={point.y} r="7" fill={color} stroke="var(--card)" strokeWidth="3" />
        <circle cx={cx} cy={cy} r="4" fill="var(--muted-2)" opacity="0.5" />
      </svg>
      {labels ? (
        <>
          <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 11, color: 'var(--muted)' }}>{labels[0]}</span>
          <span style={{ position: 'absolute', right: 4, bottom: 4, fontSize: 11, color: 'var(--muted)' }}>{labels[1]}</span>
          <span style={{ position: 'absolute', bottom: 2, fontSize: 11.5, color: 'var(--muted)' }}>{labels[2]}</span>
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
        width: 76,
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
              borderRadius: '999px',
              background: on ? color : 'color-mix(in srgb, ' + color + ' 16%, transparent)',
              opacity: on ? 1 : 0.55,
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
  gradient,
  markerLabel,
}: {
  value: number;
  min: number;
  max: number;
  gradient?: string;
  markerLabel?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ position: 'relative', paddingTop: markerLabel ? 22 : 0 }}>
      {markerLabel ? (
        <span
          style={{
            position: 'absolute',
            left: `${Math.max(4, Math.min(96, pct))}%`,
            top: 0,
            transform: 'translateX(-50%)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}
        >
          {markerLabel}
        </span>
      ) : null}
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: gradient ?? 'linear-gradient(90deg, #ff7a33, #ffd166 45%, #f7f4ec 55%, #9db7ff 75%, #6f7bf5)',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(100, pct))}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 18,
            height: 18,
            borderRadius: 999,
            background: 'var(--card)',
            border: '2px solid var(--text)',
            boxShadow: '0 2px 6px rgba(0,0,0,.15)',
          }}
        />
      </div>
      <div className="row-between" style={{ marginTop: 6, fontSize: 10.5, color: 'var(--muted)' }}>
        <span>{min}</span>
        <span>{Math.round((min + max) / 4)}</span>
        <span>0</span>
        <span>{Math.round((max * 3) / 4)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/* ---------------- Energy bar ---------------- */

export function EnergyBar({ value }: { value: number }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 2, height: 12 }}>
        {Array.from({ length: 28 }, (_, i) => {
          const on = (i / 28) * 100 < value;
          const hue = i < 10 ? '#ffd166' : i < 19 ? '#b6e35c' : '#5fd0a0';
          return (
            <span
              key={i}
              style={{
                flex: 1,
                borderRadius: 3,
                background: on ? hue : 'var(--field)',
                opacity: on ? 1 : 0.75,
              }}
            />
          );
        })}
      </div>
      <div className="row-between" style={{ marginTop: 7, fontSize: 11, color: 'var(--muted)' }}>
        <span>Drained</span>
        <span>Steady</span>
        <span>Charged</span>
      </div>
    </div>
  );
}
