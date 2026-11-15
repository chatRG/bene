import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Check, ChevronRight, Heart, MessageCircle, Moon, Shield } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { BeneMark, Ring } from '../components/ui';
import type { Sex } from '../domain/types';

export function OnboardingScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('John Carter');
  const [sex, setSex] = useState<Sex>('male');
  const [birthDate, setBirthDate] = useState('1998-01-20');
  const [goal, setGoal] = useState<'recovery' | 'performance' | 'sleep' | 'fatloss' | 'general'>('performance');
  const [notifications, setNotifications] = useState(true);

  const finish = (demo: boolean) => {
    state.completeOnboarding(name, { sex, birthDate, goal, demo });
    navigate('/', { replace: true });
  };

  return (
    <div className="onboarding">
      <div className="onboarding__top">
        <div className="brand-mark">
          <span className="brand-mark__icon"><BeneMark size={18} /></span>
          Bene
        </div>
        {step > 0 ? (
          <button className="icon-btn icon-btn--soft" onClick={() => setStep((s) => s - 1)} aria-label="Back"><ArrowLeft size={18} /></button>
        ) : <span />}
      </div>

      <div className="onboarding__body">
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
            <h1 className="onboarding__title" style={{ fontSize: 32 }}>Stay in the loop</h1>
            <p className="onboarding__sub">Bene works from your manual logs today. Native health sync is planned for a later build.</p>
            <div className="col gap-8 mt-24">
              <button className={`status-option ${notifications ? 'status-option--active' : ''}`} onClick={() => setNotifications((v) => !v)}>
                <span className="status-option__icon"><Shield size={18} /></span>
                <span className="grow">
                  <span className="list-title">Notifications</span>
                  <span className="list-sub">Morning report, wind-down, journal</span>
                </span>
                <span className={`switch ${notifications ? 'switch--on' : ''}`} />
              </button>
            </div>
            <div className="insight-unlock mt-16">
              <Shield size={17} />
              <span>Everything stays on this device. You can revoke access at any time in system settings.</span>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="fade-up">
            <h1 className="onboarding__title" style={{ fontSize: 32 }}>Make it yours</h1>
            <p className="onboarding__sub">These details tune your heart-rate zones, recovery baseline and age estimate.</p>
            <div className="mt-24">
              <div className="field-label">Name</div>
              <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
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
            <p className="caption mt-20" style={{ lineHeight: 1.5 }}>
              You can look around with a sample day before connecting anything.
            </p>
          </div>
        ) : null}
      </div>

      <div className="onboarding__footer">
        <div className="progress-dots" aria-hidden>
          {[0, 1, 2].map((i) => <span key={i} className={i === step ? 'on' : ''} />)}
        </div>
        {step === 0 ? (
          <>
            <button className="btn btn--block" onClick={() => setStep(1)}>Continue <ChevronRight size={17} /></button>
            <button className="onboarding__link" onClick={() => finish(true)}>See a sample day</button>
          </>
        ) : step === 1 ? (
          <>
            <button className="btn btn--block" onClick={() => setStep(2)}>
              Continue <ChevronRight size={17} />
            </button>
            <button className="onboarding__link" onClick={() => setStep(2)}>Not now</button>
          </>
        ) : (
          <>
            <button className="btn btn--block" onClick={() => finish(false)} disabled={!name.trim()}>
              Start tracking <Check size={17} />
            </button>
            <button className="onboarding__link" onClick={() => finish(true)}>See a sample day</button>
            <p className="caption" style={{ textAlign: 'center' }}>By continuing you agree to the Terms and Privacy Policy. Wellness use only.</p>
          </>
        )}
      </div>
    </div>
  );
}
