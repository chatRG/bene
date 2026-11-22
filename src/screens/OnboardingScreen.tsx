import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Check, ChevronRight, Heart, MessageCircle, Moon, Shield, Smartphone } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { BeneMark, Ring } from '../components/ui';
import { platform, platformLabel } from '../native/health';
import { connectAndImport, describe } from '../native/link';
import type { Sex } from '../domain/types';

const STEPS = 3;

export function OnboardingScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState<'recovery' | 'performance' | 'sleep' | 'fatloss' | 'general'>('performance');
  const [connecting, setConnecting] = useState(false);
  const [connectNote, setConnectNote] = useState<string | null>(null);

  const healthPlatform = platform();
  const canConnect = healthPlatform !== 'unavailable';

  const finish = () => {
    state.completeOnboarding(name, {
      sex,
      birthDate: birthDate || undefined,
      goal,
      heightCm: Number(height) || undefined,
      weightKg: Number(weight) || undefined,
    });
    navigate('/', { replace: true });
  };

  const go = (next: number) => setStep(Math.max(0, Math.min(STEPS - 1, next)));

  /* ---- swipe ---------------------------------------------------------
     A horizontal drag past 56px moves one step; a shorter drag snaps back.
     Vertical drags are ignored so a scroll is never read as a page turn. */
  const touch = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [drag, setDrag] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touch.current.active) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    // Vertical intent wins: stop tracking and let the page scroll.
    if (Math.abs(dy) > Math.abs(dx)) {
      touch.current.active = false;
      setDrag(0);
      return;
    }
    setDrag(dx);
  };
  const onTouchEnd = () => {
    if (!touch.current.active) {
      setDrag(0);
      return;
    }
    const dx = drag;
    touch.current.active = false;
    setDrag(0);
    if (dx <= -56) go(step + 1);
    else if (dx >= 56) go(step - 1);
  };

  const connect = async () => {
    setConnecting(true);
    setConnectNote(null);
    try {
      const next = await connectAndImport(state.importHealthDays);
      setConnectNote(
        next.phase === 'connected'
          ? describe(next.days)
          : next.detail,
      );
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding__top">
        <div className="brand-mark">
          <span className="brand-mark__icon"><BeneMark size={18} /></span>
          Bene
        </div>
        {step > 0 ? (
          <button className="icon-btn icon-btn--soft" onClick={() => go(step - 1)} aria-label="Back"><ArrowLeft size={18} /></button>
        ) : <span />}
      </div>

      <div
        className="onboarding__body"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: drag ? `translate3d(${drag * 0.35}px, 0, 0)` : undefined,
          transition: drag ? 'none' : 'transform 180ms var(--ease)',
        }}
      >
        {step === 0 ? (
          <div className="fade-up">
            <h1 className="onboarding__title">How ready is your body today?</h1>
            <p className="onboarding__sub">
              Bene reads last night’s sleep, heart-rate variability and resting heart rate, then gives you one
              recovery number and a strain target for the day.
            </p>

            <div className="onboarding__art">
              <div className="card" style={{ padding: 16 }}>
                <div className="row-between">
                  <span className="meta-mono">Sample morning · 8:12 AM</span>
                </div>
                <div className="row gap-16 mt-12" style={{ alignItems: 'center' }}>
                  <Ring value={41} size={92} stroke={5} color="var(--amber)" track="var(--field)">
                    <div className="ring__center">
                      <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em' }}>41</span>
                      <span className="ring__label">Recovery</span>
                    </div>
                  </Ring>
                  <div className="grow">
                    <div className="card-title">Low</div>
                    <p className="caption" style={{ marginTop: 4 }}>
                      HRV is 6% below baseline and sleep scored 78%. Today’s target is 34% strain.
                    </p>
                  </div>
                </div>
                <div className="row gap-16 mt-16">
                  <div className="grow"><div className="caption">Sleep</div><strong style={{ fontWeight: 500 }}>7h 03m</strong></div>
                  <div className="grow"><div className="caption">Strain</div><strong style={{ fontWeight: 500 }}>12%</strong></div>
                  <div className="grow"><div className="caption">Target strain</div><strong style={{ fontWeight: 500 }}>34%</strong></div>
                </div>
              </div>
            </div>

            <div className="feature-list">
              {[
                [<Heart size={16} key="heart" />, 'One recovery score from overnight HRV, resting heart rate and sleep'],
                [<Moon size={16} key="moon" />, 'Sleep stages, a seven-night balance and a wake-up window'],
                [<Activity size={16} key="activity" />, 'A daily strain target that follows your recovery'],
                [<MessageCircle size={16} key="coach" />, 'A local coach that answers from your own numbers'],
              ].map(([icon, text]) => (
                <div className="feature-item" key={String(text)}>
                  <span className="feature-item__icon">{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="fade-up">
            <h1 className="onboarding__title" style={{ fontSize: 32 }}>Connect your health data</h1>
            <p className="onboarding__sub">
              {canConnect
                ? `Bene reads sleep, heart rate and workouts from ${platformLabel(healthPlatform)}. One connection covers every watch, ring and strap that writes into it.`
                : 'This build has no health store to read. You can log everything by hand instead.'}
            </p>

            {canConnect ? (
              <div className="mt-24">
                <div className="list-card">
                  <div className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="list-icon"><Smartphone size={17} /></div>
                    <div className="grow">
                      <div className="list-title">{platformLabel(healthPlatform)}</div>
                      <div className="list-sub">Sleep stages, HRV, resting heart rate, steps, workouts</div>
                    </div>
                  </div>
                </div>
                <button className="btn btn--block mt-16" onClick={connect} disabled={connecting}>
                  {connecting ? 'Reading…' : `Connect ${platformLabel(healthPlatform)}`}
                </button>
                <button className="onboarding__link" onClick={() => go(2)}>Skip for now</button>
                {connectNote ? (
                  <p className="caption mt-12" style={{ textAlign: 'center' }}>{connectNote}</p>
                ) : null}
              </div>
            ) : (
              <div className="mt-24">
                <div className="insight-unlock">
                  <Shield size={17} />
                  <span>Health data is only available in the iOS and Android app, not in the browser.</span>
                </div>
              </div>
            )}

            <div className="insight-unlock mt-24">
              <Shield size={17} />
              <span>Read on this device and stored locally. No account, no cloud, nothing uploaded.</span>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="fade-up">
            <h1 className="onboarding__title" style={{ fontSize: 32 }}>Make it yours</h1>
            <p className="onboarding__sub">These details tune your heart-rate zones, recovery baseline and age estimate.</p>
            <div className="mt-24">
              <div className="field-label">Name</div>
              <input
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                autoCapitalize="words"
              />
              <div className="row gap-8 mt-12">
                <div className="grow">
                  <div className="field-label">Birth date</div>
                  <input className="text-input" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                </div>
                <div style={{ width: 120 }}>
                  <div className="field-label">Sex</div>
                  <select className="text-input" value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="unspecified">Other</option>
                  </select>
                </div>
              </div>
              <div className="row gap-8 mt-12">
                <div className="grow">
                  <div className="field-label">Height</div>
                  <div className="input-with-unit">
                    <input
                      className="text-input"
                      type="number"
                      inputMode="numeric"
                      min={80}
                      max={250}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="e.g. 178"
                    />
                    <span className="input-unit">cm</span>
                  </div>
                </div>
                <div className="grow">
                  <div className="field-label">Weight</div>
                  <div className="input-with-unit">
                    <input
                      className="text-input"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={20}
                      max={400}
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="e.g. 74.5"
                    />
                    <span className="input-unit">kg</span>
                  </div>
                </div>
              </div>
              <div className="field-label" style={{ marginTop: 16 }}>Primary goal</div>
              <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
                {[
                  ['recovery', 'Recovery'],
                  ['performance', 'Performance'],
                  ['sleep', 'Sleep'],
                  ['fatloss', 'Body composition'],
                  ['general', 'General health'],
                ].map(([v, label]) => (
                  <button key={v} className={`pill ${goal === v ? 'pill--dark' : 'pill--flat'}`} onClick={() => setGoal(v as typeof goal)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="onboarding__footer">
        <div className="progress-dots" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => <span key={i} className={i === step ? 'on' : ''} />)}
        </div>
        {step === 0 ? (
          <button className="btn btn--block" onClick={() => go(1)}>Continue <ChevronRight size={17} /></button>
        ) : step === 1 ? (
          <button className="btn btn--block" onClick={() => go(2)}>Continue <ChevronRight size={17} /></button>
        ) : (
          <>
            <button className="btn btn--block" onClick={finish} disabled={!name.trim()}>
              Start tracking <Check size={17} />
            </button>
            <p className="caption" style={{ textAlign: 'center' }}>By continuing you agree to the Terms and Privacy Policy. Wellness use only.</p>
          </>
        )}
      </div>
    </div>
  );
}
