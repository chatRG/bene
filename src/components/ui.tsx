import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Dna, Dumbbell, House, Sparkles, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/* ---------------- Ring ---------------- */

export function Ring({
  value,
  size = 74,
  stroke = 7,
  color = 'var(--lime)',
  track = 'var(--field)',
  children,
  className = '',
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`ring ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      {children}
    </div>
  );
}

/* ---------------- Detail header ---------------- */

export function DetailHeader({
  title,
  subtitle,
  right,
  onBack,
  transparent,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  transparent?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="detail-head safe-top" style={{ paddingTop: 8 }}>
      <button
        className={`icon-btn ${transparent ? 'glass' : ''}`}
        onClick={() => (onBack ? onBack() : navigate(-1))}
        aria-label="Back"
        style={{ marginLeft: 0 }}
      >
        <ChevronLeft size={21} strokeWidth={2.2} />
      </button>
      <div>
        <div className="detail-head__title">{title}</div>
        {subtitle ? <div className="detail-head__sub">{subtitle}</div> : null}
      </div>
      <div className="detail-head__right">{right}</div>
    </div>
  );
}

/* ---------------- Bottom navigation ---------------- */

export function TabBar() {
  const activeTabs = useAppStore((s) => s.settings.activeTabs);
  const items: { to: string; label: string; icon: ReactNode; end: boolean; coach?: boolean }[] = [
    { to: '/', label: 'Home', icon: <House size={21} strokeWidth={2} />, end: true },
    ...(activeTabs.fitness ? [{ to: '/fitness', label: 'Fitness', icon: <Dumbbell size={21} strokeWidth={2} />, end: false }] : []),
    ...(activeTabs.journal ? [{ to: '/journal', label: 'Journal', icon: <BookOpen size={21} strokeWidth={2} />, end: false }] : []),
    ...(activeTabs.biology ? [{ to: '/biology', label: 'Biology', icon: <Dna size={21} strokeWidth={2} />, end: false }] : []),
    { to: '/intelligence', label: 'Coach', icon: <Sparkles size={15} color="#fff" strokeWidth={2.2} />, end: false, coach: true },
  ];
  return (
    <nav className="navbar" aria-label="Primary" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `nav-item ${item.coach ? 'nav-item--coach' : ''} ${isActive ? 'nav-item--active' : ''}`}
        >
          <span className="nav-item__icon">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/* ---------------- Sheet ---------------- */

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  full,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  full?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" style={full ? { maxHeight: '97dvh' } : undefined} role="dialog" aria-modal>
        <div className="sheet__grab" />
        {title ? (
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="sheet__title">{title}</div>
              {subtitle ? <div className="sheet__sub">{subtitle}</div> : null}
            </div>
            <button className="icon-btn icon-btn--soft" onClick={onClose} aria-label="Close" style={{ flex: '0 0 auto' }}>
              <X size={18} />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </>
  );
}

/* ---------------- Segmented ---------------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={`segmented__btn ${o.value === value ? 'segmented__btn--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Rows ---------------- */

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  onClick,
  danger,
  right,
  plain,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  right?: ReactNode;
  plain?: boolean;
}) {
  const content = (
    <>
      {icon ? <div className="list-icon">{icon}</div> : null}
      <div className="grow">
        <div className="list-title" style={danger ? { color: 'var(--red)' } : undefined}>
          {title}
        </div>
        {subtitle ? <div className="list-sub">{subtitle}</div> : null}
      </div>
      {value ? <div className="list-value">{value}</div> : null}
      {right ?? (onClick ? <ChevronRight size={17} className="chevron" /> : null)}
    </>
  );
  if (onClick) {
    return (
      <button className={`list-row ${plain ? 'list-row--plain' : ''}`} onClick={onClick} style={{ width: '100%', textAlign: 'left' }}>
        {content}
      </button>
    );
  }
  return <div className={`list-row ${plain ? 'list-row--plain' : ''}`}>{content}</div>;
}

/* ---------------- Misc ---------------- */

export function SectionHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-head">
      <div className="section-title">{title}</div>
      {action}
    </div>
  );
}

export function Avatar({ name, size }: { name: string; size?: 'lg' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return <div className={`avatar ${size === 'lg' ? 'avatar--lg' : ''}`}>{initials || 'B'}</div>;
}

export function ProgressBar({ value, color, height = 7 }: { value: number; color: string; height?: number }) {
  return (
    <div className="bar" style={{ height }}>
      <div className="bar__fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function CoachOrb({ size = 78, eyes = true }: { size?: number; eyes?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '999px',
        background:
          'radial-gradient(circle at 32% 26%, #ffffff 0%, #dbe6ff 18%, #a7b8ff 38%, #7a6cf0 64%, #4b3fa8 92%)',
        boxShadow: '0 12px 36px rgba(100, 90, 240, 0.4), inset 0 2px 10px rgba(255,255,255,0.5)',
        position: 'relative',
        flex: '0 0 auto',
        filter: 'saturate(1.05)',
      }}
    >
      {eyes ? (
        <>
          <span
            style={{
              position: 'absolute',
              left: '33%',
              top: '43%',
              width: size * 0.09,
              height: size * 0.15,
              borderRadius: '999px',
              background: '#fff',
              transform: 'rotate(8deg)',
              boxShadow: '0 1px 2px rgba(30,20,90,0.2)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '55%',
              top: '43%',
              width: size * 0.09,
              height: size * 0.15,
              borderRadius: '999px',
              background: '#fff',
              transform: 'rotate(8deg)',
              boxShadow: '0 1px 2px rgba(30,20,90,0.2)',
            }}
          />
        </>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="h3" style={{ color: 'var(--text)' }}>{title}</div>
      <p style={{ fontSize: 13.5, marginTop: 6, maxWidth: 300, marginInline: 'auto' }}>{body}</p>
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  unit,
  color,
  icon,
  delta,
  style,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  icon?: ReactNode;
  delta?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="card card--tight" style={style}>
      <div className="row gap-6 caption">
        {icon}
        {label}
      </div>
      <div className="row gap-6" style={{ alignItems: 'baseline', marginTop: 6 }}>
        <span className="mono-num" style={{ fontSize: 25, fontWeight: 750, letterSpacing: '-0.03em', color }}>
          {value}
        </span>
        {unit ? <span className="caption" style={{ fontWeight: 600 }}>{unit}</span> : null}
        {delta ? <span style={{ marginLeft: 'auto' }}>{delta}</span> : null}
      </div>
    </div>
  );
}

export function TrendTag({ value, suffix = '%', better = 'down' }: { value: number; suffix?: string; better?: 'up' | 'down' }) {
  const good = better === 'down' ? value <= 0 : value >= 0;
  return (
    <span className="pill pill--sm" style={{ background: good ? 'rgba(75,201,58,.12)' : 'rgba(255,122,51,.13)', color: good ? 'var(--green-deep)' : '#c05613' }}>
      {value > 0 ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
