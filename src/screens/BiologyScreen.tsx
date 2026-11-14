import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Dna, Dumbbell, FileText, HeartPulse, Info, Moon, MoreHorizontal, Share2, Sparkles, Upload, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { dateKey } from '../domain/seed';
import { biologicalAge, biomarkerStatus, sumContributors, vo2MaxFromDays, nextMondayDays } from '../domain/scoring/biology';
import { ageFromBirthDate } from '../domain/math';
import { SemiGauge, LineChart } from '../components/charts';
import { SectionHead, Sheet } from '../components/ui';
import { showToast } from '../components/toast';

const CATEGORY_LABEL: Record<string, string> = {
  metabolic: 'Metabolic',
  inflammation: 'Inflammation',
  blood: 'Blood count',
  lipids: 'Lipids',
  vitamins: 'Vitamins',
  liver: 'Liver',
  kidney: 'Kidney',
};

export function BiologyScreen() {
  const state = useAppStore();
  const navigate = useNavigate();
  const today = dateKey(new Date());
  const [infoOpen, setInfoOpen] = useState(false);
  const [projectionOpen, setProjectionOpen] = useState(false);

  const bio = useMemo(() => {
    const chronologicalAge = ageFromBirthDate(state.profile.birthDate, today);
    const days = state.dayOrder.slice(-35).map((d) => state.days[d]);
    const vo2 = vo2MaxFromDays(days, state.profile.sex) ?? 52;
    const lastLab = state.biomarkers.length
      ? Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${state.biomarkers[0].recordedAt}T12:00:00`).getTime()) / 86400000)
      : null;
    return biologicalAge({
      profile: state.profile,
      chronologicalAge,
      days,
      biomarkers: state.biomarkers,
      vo2max: vo2,
      today,
      lastLabDaysAgo: lastLab,
    });
  }, [state, today]);

  const contributors = bio.contributors.filter((c) => c.key !== 'bloodwork');
  const share = async () => {
    const text = bio.age
      ? `My biological age is ${bio.age} — ${Math.abs(bio.deltaYears)} years ${bio.deltaYears < 0 ? 'younger' : 'older'} than my chronological age.`
      : 'Tracking my biological age with Bene.';
    try {
      if (navigator.share) await navigator.share({ title: 'My Biological Age', text });
      else {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
      }
    } catch {
      showToast('Share cancelled');
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, typeof state.biomarkers>();
    for (const b of state.biomarkers) {
      const list = map.get(b.category) ?? [];
      list.push(b);
      map.set(b.category, list);
    }
    return [...map.entries()];
  }, [state.biomarkers]);

  return (
    <div className="screen biology-page">
      <div className="detail-head safe-top" style={{ paddingTop: 8, gridTemplateColumns: '1fr auto 1fr' }}>
        <div />
        <div>
          <div className="detail-head__title">Biological Age</div>
          <div className="detail-head__sub">As of {format(new Date(), 'MMM d')}</div>
        </div>
        <div className="detail-head__right">
          <div className="row gap-6">
            <button className="icon-btn icon-btn--soft" onClick={share} aria-label="Share"><Share2 size={17} /></button>
            <button className="icon-btn icon-btn--soft" onClick={() => setInfoOpen(true)} aria-label="More"><MoreHorizontal size={18} /></button>
          </div>
        </div>
      </div>

      <div className="bio-hero">
        <div className="row gap-6" style={{ alignItems: 'baseline' }}>
          <span className="bio-age">{bio.status === 'scored' ? bio.age?.toFixed(1) : '—'}</span>
          <span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 600 }}>yrs</span>
        </div>
        {bio.status === 'scored' ? (
          <div className="bio-delta">
            {Math.abs(bio.deltaYears).toFixed(1)} years {bio.deltaYears <= 0 ? 'younger' : 'older'}
          </div>
        ) : (
          <div className="bio-delta" style={{ color: 'var(--amber)' }}>Calibrating</div>
        )}
        <button className="bio-week-pill" onClick={() => setInfoOpen(true)}>
          <span style={{ color: 'var(--teal)', fontWeight: 700 }}>▼ −0.2</span> from last week <ChevronRight size={13} className="chevron" />
        </button>
      </div>

      <SemiGauge
        value={bio.age ?? bio.chronologicalAge}
        min={bio.chronologicalAge - 5}
        max={bio.chronologicalAge + 5}
        color="var(--teal)"
        labels={[
          (bio.chronologicalAge - 5).toFixed(1),
          (bio.chronologicalAge + 5).toFixed(1),
          bio.chronologicalAge.toFixed(1),
        ]}
      />

      <div className="bio-update">
        Chronological age {bio.chronologicalAge.toFixed(1)} · gauge spans ±5 years
      </div>
      <div className="bio-update" style={{ marginTop: 2 }}>
        Next age update is in <strong>{Math.max(1, nextMondayDays(today))} days</strong> · weekly on Monday
      </div>

      <button className="bio-confidence" onClick={() => setInfoOpen(true)}>
        <span className="bio-confidence__badge"><Sparkles size={16} /></span>
        <span className="grow" style={{ textAlign: 'left' }}>
          <span className="card-title" style={{ color: 'var(--green-deep)' }}>{bio.confidence}% confidence</span>
          <span className="card-sub" style={{ display: 'block' }}>{bio.confidenceLabel}</span>
        </span>
        <ChevronRight size={17} className="chevron" />
      </button>

      <div className="section">
        <SectionHead title="What's moving your age" action={<span className="caption">This week</span>} />
        <div className="col gap-8">
          {contributors.map((c) => {
            const good = c.years <= 0;
            const Icon = c.key === 'sleep' ? Moon : c.key === 'activity' ? Activity : Dumbbell;
            return (
              <button key={c.key} className="bio-contributor" onClick={() => setProjectionOpen(true)}>
                <span className={`bio-contributor__icon ${good ? '' : 'bio-contributor__icon--warn'}`}><Icon size={18} /></span>
                <span className="grow">
                  <span className="bio-contributor__title" style={{ display: 'block' }}>{c.label}</span>
                  <span className="bio-contributor__sub" style={{ display: 'block', color: good ? 'var(--teal)' : '#d98600' }}>
                    {Math.abs(c.years).toFixed(1)} years {good ? 'younger' : 'older'}
                  </span>
                </span>
                <span className="caption" style={{ maxWidth: 120, textAlign: 'right' }}>{c.detail}</span>
                <ChevronRight size={16} className="chevron" />
              </button>
            );
          })}
        </div>
        <p className="caption mt-10" style={{ lineHeight: 1.5 }}>
          Contributors should add up to your total difference ({sumContributors(bio.contributors) >= 0 ? '+' : ''}{sumContributors(bio.contributors).toFixed(1)} yrs). Bloodwork markers add {bio.markerDelta.toFixed(1)} yrs.
        </p>
      </div>

      <div className="section">
        <SectionHead
          title="Biomarkers"
          action={<button className="pill pill--sm pill--flat" onClick={() => navigate('/records')}><Upload size={11} /> Upload</button>}
        />
        <div className="card">
          {groups.slice(0, 4).map(([category, items]) => (
            <div key={category} style={{ marginBottom: 12 }}>
              <div className="tiny" style={{ marginBottom: 2 }}>{CATEGORY_LABEL[category] ?? category}</div>
              {items.slice(0, 4).map((b) => {
                const status = biomarkerStatus(b);
                return (
                  <div className="marker-row" key={b.id}>
                    <span className="marker-dot" style={{ background: status === 'optimal' ? 'var(--green)' : status === 'borderline' ? 'var(--amber)' : 'var(--red)' }} />
                    <div className="grow">
                      <div className="marker-row__name">{b.name}</div>
                      <div className="marker-row__range">{b.optimalLow}–{b.optimalHigh} {b.unit} optimal</div>
                    </div>
                    <div className="marker-row__value">
                      {b.value} <span>{b.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <button className="link-row mt-10" onClick={() => navigate('/records')}>
          <Dna size={17} />
          <span>View all {state.biomarkers.length} biomarkers</span>
          <ChevronRight size={17} className="chevron" style={{ marginLeft: 'auto' }} />
        </button>
      </div>

      <div className="section">
        <SectionHead
          title="Health Records"
          action={<button className="pill pill--sm pill--flat" onClick={() => navigate('/records')}><Upload size={11} /> Add</button>}
        />
        <div className="card">
          {state.healthRecords.slice(0, 2).map((r) => (
            <div className="records-row" key={r.id}>
              <div className="file-icon"><FileText size={18} /></div>
              <div className="grow">
                <div className="list-title">{r.name}</div>
                <div className="list-sub">{format(new Date(r.uploadedAt), 'MMM d, yyyy')} · {r.status === 'analyzing' ? 'Analyzing…' : `${r.biomarkerCount} biomarkers`}</div>
              </div>
              <ChevronRight size={16} className="chevron" />
            </div>
          ))}
          <button className="list-row list-row--plain" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate('/records')}>
            <div className="list-icon"><Upload size={16} /></div>
            <div className="grow"><div className="list-title">Upload blood tests</div><div className="list-sub">PDF, image or text · up to 5 MB</div></div>
            <ChevronRight size={16} className="chevron" />
          </button>
        </div>
      </div>

      <div className="section">
        <SectionHead title="Age Projection" action={<button className="caption" onClick={() => setProjectionOpen(true)}>Explore</button>} />
        <button className="card" style={{ width: '100%', textAlign: 'left' }} onClick={() => setProjectionOpen(true)}>
          <div className="row gap-12">
            <span className="bio-contributor__icon"><HeartPulse size={18} /></span>
            <div className="grow">
              <div className="card-title">See where your habits lead</div>
              <div className="card-sub">Projection up to 20 years based on today's inputs</div>
            </div>
            <ChevronRight size={17} className="chevron" />
          </div>
        </button>
      </div>

      {infoOpen ? <BioInfo bio={bio} onClose={() => setInfoOpen(false)} /> : null}
      {projectionOpen ? (
        <Sheet title="Age Projection" subtitle="If your current habits stay the same." onClose={() => setProjectionOpen(false)}>
          <div className="chart-card" style={{ boxShadow: 'none', padding: 0 }}>
            <LineChart
              values={Array.from({ length: 11 }, (_, i) => Number(((bio.age ?? bio.chronologicalAge) + (bio.deltaYears / 10) * i).toFixed(1)))}
              yMax={(bio.age ?? 30) + 10}
              yTicks={[Math.round((bio.age ?? 30) + 10), Math.round((bio.age ?? 30) + 5), Math.round(bio.age ?? 30)]}
              color="var(--teal)"
              height={200}
              xLabels={['2026', '2036']}
            />
          </div>
          <div className="row gap-12 mt-16">
            <div className="card card--tight grow"><div className="caption">In 5 years</div><div className="h2">{((bio.age ?? 30) + (bio.deltaYears / 10) * 5).toFixed(1)}</div></div>
            <div className="card card--tight grow"><div className="caption">In 10 years</div><div className="h2">{((bio.age ?? 30) + bio.deltaYears).toFixed(1)}</div></div>
          </div>
          <p className="caption mt-16">A projection, not a prediction. Biological age responds to sleep, activity, fitness and blood markers.</p>
          <button className="btn btn--block mt-20" onClick={() => setProjectionOpen(false)}>Done</button>
        </Sheet>
      ) : null}
    </div>
  );
}

function BioInfo({ bio, onClose }: { bio: ReturnType<typeof biologicalAge>; onClose: () => void }) {
  return (
    <Sheet title="About Biological Age" subtitle={`Updated Monday · ${bio.confidence}% confidence`} onClose={onClose}>
      <p className="body" style={{ lineHeight: 1.6 }}>
        Biological Age estimates how your body is ageing relative to your calendar age. It combines nine PhenoAge blood markers with sleep,
        activity and fitness signals from your wearable.
      </p>
      <div className="divider" />
      <div className="list-card" style={{ boxShadow: 'none' }}>
        <div className="list-row"><div className="list-icon"><Info size={16} /></div><div className="grow"><div className="list-title">Why it updates weekly</div><div className="list-sub">Blood markers are stable; lifestyle signals are averaged over the week.</div></div></div>
        <div className="list-row"><div className="list-icon"><HeartPulse size={16} /></div><div className="grow"><div className="list-title">What lowers confidence</div><div className="list-sub">New tracking, missing bloodwork, or gaps in wearable data.</div></div></div>
        <div className="list-row"><div className="list-icon"><Sparkles size={16} /></div><div className="grow"><div className="list-title">Not a diagnosis</div><div className="list-sub">A wellness estimate — discuss health decisions with a clinician.</div></div></div>
      </div>
      <p className="caption mt-16">This community build uses an independent, documented model. the reference app’s exact coefficients are not public.</p>
      <button className="btn btn--block mt-20" onClick={onClose}>Got it</button>
    </Sheet>
  );
}
