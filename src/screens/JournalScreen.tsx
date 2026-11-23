import { useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { Check, ChevronRight, Flame, Info, Lock, Pin, Plus, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { deriveDay } from '../domain/derive';
import { format as fmt } from 'date-fns';
import { SectionHead, Sheet } from '../components/ui';
import { Glyph } from '../components/glyphs';
import { showToast } from '../components/toast';
import type { JournalTag, JournalValue } from '../domain/types';

const CATEGORIES: { key: JournalTag['category']; label: string }[] = [
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'mind', label: 'Mind' },
  { key: 'custom', label: 'Custom' },
];

export function JournalScreen() {
  const state = useAppStore();
  const today = dateKey(new Date());
  const d = useMemo(() => deriveDay(state, today, new Date()), [state, today]);
  const [activeTag, setActiveTag] = useState<JournalTag | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const entriesToday = d.record.journal;
  const streak = (() => {
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const key = dateKey(subDays(new Date(), i));
      if ((state.days[key]?.journal.length ?? 0) > 0) n++;
      else break;
    }
    return n;
  })();

  const pinned = state.journalTags.filter((t) => t.pinned);
  const correlations = useMemo(() => {
    const dates = state.dayOrder.slice(-30);
    return state.journalTags
      .filter((t) => t.kind !== 'numeric')
      .map((tag) => {
        const yes: number[] = [];
        const no: number[] = [];
        for (const date of dates) {
          const entry = state.days[date]?.journal.find((j) => j.tagId === tag.id);
          if (!entry || typeof entry.value === 'number' || entry.value === 'neutral') continue;
          const rec = deriveDay(state, date).recovery.score;
          if (rec == null) continue;
          if (entry.value === 'yes') yes.push(rec);
          else no.push(rec);
        }
        const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
        return { tag, yesCount: yes.length, noCount: no.length, yesAvg: avg(yes), noAvg: avg(no) };
      })
      .filter((c) => c.yesCount >= 5 && c.noCount >= 5 && Math.abs(c.yesAvg - c.noAvg) >= 2)
      .sort((a, b) => Math.abs(b.yesAvg - b.noAvg) - Math.abs(a.yesAvg - a.noAvg))
      .slice(0, 2);
  }, [state]);

  const save = (tag: JournalTag, value: JournalValue) => {
    state.addJournal(today, tag.id, value);
    setActiveTag(null);
    showToast(`${tag.label} logged`);
  };

  const grouped = CATEGORIES.map((c) => ({
    ...c,
    tags: state.journalTags.filter((t) => t.category === c.key && !t.pinned),
  })).filter((g) => g.tags.length > 0);

  return (
    <div className="screen screen--enter">
      <div className="app-header">
        <div>
          <div className="h1">Journal</div>
          <div className="caption" style={{ marginTop: 2 }}>{fmt(new Date(), 'EEEE, MMMM d')}</div>
        </div>
        <div className="row gap-8">
          <span className="pill pill--sm pill--flat"><Flame size={12} /> {streak} day streak</span>
          <button className="icon-btn icon-btn--soft" onClick={() => setAddOpen(true)} aria-label="Add tag"><Plus size={19} /></button>
        </div>
      </div>

      <div className="card mt-16" style={{ padding: 16 }}>
        <div className="row-between">
          <div>
            <div className="card-title">Today's check-in</div>
            <div className="card-sub">{entriesToday.length} of {state.journalTags.length} tags logged</div>
          </div>
          <span className={`pill pill--sm ${entriesToday.length >= 4 ? 'pill--green' : 'pill--orange'}`}>
            {entriesToday.length >= 4 ? 'Nice work' : 'Keep going'}
          </span>
        </div>
        <div className="bar mt-12">
          <div className="bar__fill" style={{ width: `${Math.min(100, (entriesToday.length / Math.max(1, pinned.length)) * 100)}%`, background: 'var(--green)' }} />
        </div>
      </div>

      <div className="section">
        <SectionHead title="Pinned" action={<span className="caption">Tap to log</span>} />
        <div className="journal-grid">
          {pinned.map((tag) => {
            const entry = entriesToday.find((j) => j.tagId === tag.id);
            return (
              <button key={tag.id} className={`journal-card ${entry ? 'journal-card--logged' : ''}`} onClick={() => setActiveTag(tag)}>
                <div className="journal-card__top">
                  <span className="journal-card__emoji"><Glyph emoji={tag.icon} size={18} /></span>
                  <span className="journal-card__label grow">{tag.label}</span>
                  {entry ? <Check size={14} style={{ color: 'var(--green-deep)' }} /> : null}
                </div>
                <span className="journal-card__value">
                  {entry ? (typeof entry.value === 'number' ? `${entry.value} ${tag.unit ?? ''}` : entry.value === 'yes' ? 'Yes' : entry.value === 'no' ? 'No' : 'Neutral') : 'Not logged yet'}
                </span>
                <div className="journal-tri" style={{ pointerEvents: 'none' }}>
                  <span className={entry?.value === 'yes' ? 'on-yes' : ''}>Yes</span>
                  {tag.kind === 'yesneutralno' ? <span className={entry?.value === 'neutral' ? 'on-neutral' : ''}>Neutral</span> : null}
                  <span className={entry?.value === 'no' ? 'on-no' : ''}>No</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="section">
        <SectionHead title="Insights" action={<span className="caption">Last 30 days</span>} />
        {correlations.length ? (
          <div className="col gap-10">
            {correlations.map((c) => {
              const delta = c.yesAvg - c.noAvg;
              return (
                <div className="card correlation-card" key={c.tag.id}>
                  <div className="row gap-8">
                    <span className="journal-emoji"><Glyph emoji={c.tag.icon} /></span>
                    <span className="card-title">{c.tag.label} days</span>
                    <span className="pill pill--sm pill--flat" style={{ marginLeft: 'auto' }}>Correlation</span>
                  </div>
                  <p className="body" style={{ fontSize: 13, marginTop: 6 }}>
                    Recovery averages <strong>{Math.round(c.yesAvg)}%</strong> on days you log {c.tag.label.toLowerCase()} — {delta >= 0 ? 'higher' : 'lower'} than your {Math.round(c.noAvg)}% average without it.
                  </p>
                  <div className="correlation-bar">
                    <span>Without {Math.round(c.noAvg)}%</span>
                    <div className="correlation-bar__track">
                      <span className="correlation-bar__fill" style={{ left: `${Math.min(50, Math.max(0, (Math.min(c.noAvg, c.yesAvg) / 100) * 100))}%`, width: `${Math.max(4, (Math.abs(delta) / 100) * 100)}%`, background: delta >= 0 ? 'var(--green)' : 'var(--orange)' }} />
                    </div>
                    <span>With {Math.round(c.yesAvg)}%</span>
                  </div>
                  <div className="caption mt-8">{c.yesCount} yes days · {c.noCount} no days · based on your last 30 days</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="insight-unlock">
            <Lock size={18} />
            <span>
              Correlations unlock after <strong>5 “Yes” and 5 “No”</strong> entries for a habit. Keep logging — your first insight is close.
            </span>
          </div>
        )}
        <div className="card card--tight mt-10" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Info size={15} className="chevron" />
          <span className="caption" style={{ flex: 1 }}>Sleeping noise (50+ dB) is detected automatically and can’t be logged by hand.</span>
        </div>
      </div>

      {grouped.map((group) => (
        <div className="section" key={group.key}>
          <SectionHead title={group.label} action={<span className="caption">{group.tags.length} tags</span>} />
          <div className="list-card">
            {group.tags.map((tag) => {
              const entry = entriesToday.find((j) => j.tagId === tag.id);
              return (
                <button key={tag.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setActiveTag(tag)}>
                  <div className="list-icon" style={{ fontSize: 17 }}><Glyph emoji={tag.icon} /></div>
                  <div className="grow">
                    <div className="list-title">{tag.label}</div>
                    <div className="list-sub">
                      {tag.autoOnly ? 'Auto-detected only' : tag.kind === 'numeric' ? `Numeric${tag.unit ? ` · ${tag.unit}` : ''}` : tag.kind === 'yesneutralno' ? 'Yes / Neutral / No' : 'Yes / No'}
                    </div>
                  </div>
                  {entry ? (
                    <span className="pill pill--sm pill--green">{typeof entry.value === 'number' ? `${entry.value}${tag.unit ?? ''}` : entry.value}</span>
                  ) : (
                    <ChevronRight size={16} className="chevron" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {activeTag ? (
        <TagSheet
          tag={activeTag}
          current={entriesToday.find((j) => j.tagId === activeTag.id)?.value}
          history={state.dayOrder.slice(-14).map((date) => ({
            date,
            value: state.days[date]?.journal.find((j) => j.tagId === activeTag.id)?.value,
          }))}
          onClose={() => setActiveTag(null)}
          onSave={(v) => save(activeTag, v)}
          onPin={() => {
            state.togglePinTag(activeTag.id);
            setActiveTag({ ...activeTag, pinned: !activeTag.pinned });
          }}
        />
      ) : null}

      {addOpen ? (
        <AddTagSheet
          onClose={() => setAddOpen(false)}
          onAdd={(label, kind, unit) => {
            state.addJournalTag(label, kind, unit);
            setAddOpen(false);
            showToast('Custom tag added');
          }}
        />
      ) : null}
    </div>
  );
}

function TagSheet({
  tag,
  current,
  history,
  onClose,
  onSave,
  onPin,
}: {
  tag: JournalTag;
  current?: JournalValue;
  history: { date: string; value?: JournalValue }[];
  onClose: () => void;
  onSave: (v: JournalValue) => void;
  onPin: () => void;
}) {
  const [num, setNum] = useState(typeof current === 'number' ? current : (tag.min ?? 1));
  return (
    <Sheet title={tag.label} subtitle="How did this feel today?" onClose={onClose}>
      {tag.kind === 'numeric' ? (
        <div>
          <div className="row gap-12" style={{ alignItems: 'center' }}>
            <input
              className="text-input"
              type="number"
              min={tag.min}
              max={tag.max}
              step="0.1"
              value={num}
              onChange={(e) => setNum(Number(e.target.value))}
              style={{ fontSize: 26, fontWeight: 500, textAlign: 'center' }}
            />
            <span className="pill pill--flat">{tag.unit ?? ''}</span>
          </div>
          <input type="range" min={tag.min ?? 0} max={tag.max ?? 10} step="0.1" value={num} onChange={(e) => setNum(Number(e.target.value))} style={{ width: '100%', marginTop: 20 }} />
          <button className="btn btn--block mt-20" onClick={() => onSave(Math.max(tag.min ?? 0, Math.min(tag.max ?? 999, num)))}>Save entry</button>
        </div>
      ) : (
        <div className="col gap-8">
          <button className={`status-option ${current === 'yes' ? 'status-option--active' : ''}`} onClick={() => onSave('yes')}>
            <span className="status-option__icon" style={{ background: 'rgba(75,201,58,.14)', color: 'var(--green-deep)' }}><Check size={20} /></span>
            <span className="grow"><span className="list-title">Yes</span><span className="list-sub">I did this today</span></span>
          </button>
          {tag.kind === 'yesneutralno' ? (
            <button className={`status-option ${current === 'neutral' ? 'status-option--active' : ''}`} onClick={() => onSave('neutral')}>
              <span className="status-option__icon">😐</span>
              <span className="grow"><span className="list-title">Neutral</span><span className="list-sub">Somewhere in between</span></span>
            </button>
          ) : null}
          <button className={`status-option ${current === 'no' ? 'status-option--active' : ''}`} onClick={() => onSave('no')}>
            <span className="status-option__icon" style={{ background: 'rgba(255,90,95,.12)', color: 'var(--red)' }}><X size={20} /></span>
            <span className="grow"><span className="list-title">No</span><span className="list-sub">I didn’t do this today</span></span>
          </button>
        </div>
      )}

      <div className="divider" />
      <div className="row-between">
        <span className="card-title">Last 14 days</span>
        <button className="pill pill--sm pill--flat" onClick={onPin}><Pin size={11} /> {tag.pinned ? 'Unpin' : 'Pin to top'}</button>
      </div>
      <div className="row gap-2 mt-12" style={{ justifyContent: 'space-between' }}>
        {history.map((h) => (
          <div key={h.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: h.value == null ? 'var(--field)' : h.value === 'yes' ? 'var(--green)' : h.value === 'no' ? 'var(--red)' : h.value === 'neutral' ? 'var(--muted-2)' : 'var(--indigo)',
                opacity: h.value == null ? 1 : 0.9,
              }}
            />
            <span style={{ fontSize: 8, color: 'var(--muted)' }}>{format(new Date(`${h.date}T12:00:00`), 'd')}</span>
          </div>
        ))}
      </div>
      <p className="caption mt-16">Journal insights appear after 5 Yes and 5 No entries for this habit.</p>
    </Sheet>
  );
}

function AddTagSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (label: string, kind: JournalTag['kind'], unit?: string) => void }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<JournalTag['kind']>('yesno');
  const [unit, setUnit] = useState('');
  return (
    <Sheet title="New tag" subtitle="Custom tags can be yes/no or numeric." onClose={onClose}>
      <div className="field-label">Name</div>
      <input className="text-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Cold plunge" autoFocus />
      <div className="field-label" style={{ marginTop: 18 }}>Type</div>
      <div className="row gap-8">
        {[
          ['yesno', 'Yes / No'],
          ['yesneutralno', 'Yes / Neutral / No'],
          ['numeric', 'Numeric'],
        ].map(([v, l]) => (
          <button key={v} className={`pill ${kind === v ? 'pill--dark' : 'pill--flat'}`} onClick={() => setKind(v as JournalTag['kind'])}>{l}</button>
        ))}
      </div>
      {kind === 'numeric' ? (
        <>
          <div className="field-label" style={{ marginTop: 18 }}>Unit</div>
          <input className="text-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. min, /10" />
        </>
      ) : null}
      <button className="btn btn--block mt-24" disabled={!label.trim()} onClick={() => onAdd(label.trim(), kind, unit || undefined)}>
        Add tag
      </button>
    </Sheet>
  );
}
