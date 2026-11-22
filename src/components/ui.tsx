import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Dna, Dumbbell, House, MessageCircle, X } from 'lucide-react';
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
    <div className="detail-head">
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
  const items: { to: string; label: string; icon: ReactNode; end: boolean }[] = [
    { to: '/', label: 'Home', icon: <House size={20} strokeWidth={1.5} />, end: true },
    ...(activeTabs.fitness ? [{ to: '/fitness', label: 'Fitness', icon: <Dumbbell size={20} strokeWidth={1.5} />, end: false }] : []),
    ...(activeTabs.journal ? [{ to: '/journal', label: 'Journal', icon: <BookOpen size={20} strokeWidth={1.5} />, end: false }] : []),
    ...(activeTabs.biology ? [{ to: '/biology', label: 'Biology', icon: <Dna size={20} strokeWidth={1.5} />, end: false }] : []),
    { to: '/intelligence', label: 'Coach', icon: <MessageCircle size={20} strokeWidth={1.5} />, end: false },
  ];
  // Hide the bar while reading downwards, bring it back on any upward scroll.
  // A small threshold stops a one-pixel jitter from flickering it.
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY.current) < 8) return;
      // Always show near the top, so the bar is never stranded off-screen.
      setHidden(y > 96 && y > lastY.current);
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`navbar ${hidden ? 'navbar--hidden' : ''}`} aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
        >
          <span className="nav-item__icon">{item.icon}</span>
          <span className="nav-item__label">{item.label}</span>
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

/** The product mark: a circular opening cut clean through a square field. */
export function BeneMark({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      className={className}
      aria-hidden
      fill="none"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M64 32h128a32 32 0 0 1 32 32v128a32 32 0 0 1-32 32H64a32 32 0 0 1-32-32V64a32 32 0 0 1 32-32Zm64 60a52 52 0 0 0 0 104 52 52 0 0 0 0-104Z"
      />
    </svg>
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
