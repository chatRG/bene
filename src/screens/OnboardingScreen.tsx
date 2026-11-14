import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Check, ChevronRight, Heart, Moon, Shield, Sparkles, Watch } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CoachOrb } from '../components/ui';
import { showToast } from '../components/toast';
import type { Sex } from '../domain/types';

export function OnboardingScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('John Carter');
  const [sex, setSex] = useState<Sex>('male');
  const [birthDate, setBirthDate] = useState('1998-01-20');
  const [goal, setGoal] = useState<'recovery' | 'performance' | 'sleep' | 'fatloss' | 'general'>('performance');
  const [healthGranted, setHealthGranted] = useState(false);
  const [notifications, setNotifications] = useState(true);

  const finish = (demo: boolean) => {
    state.completeOnboarding(name, { sex, birthDate, goal, demo });
    navigate('/', { replace: true });
  };

  return (
    <div className="onboarding">
      <div className="onboarding__top">
        <div className="brand-mark">
          <span className="brand-mark__icon"><Sparkles size={16} /></span>
          Bevel
        </div>
        {step > 0 ? (
          <button className="icon-btn icon-btn--soft" onClick={() => setStep((s) => s - 1)} aria-label="Back"><ArrowLeft size={18} /></button>
        ) : (
          <button className="caption" onClick={() => finish(true)}>Skip</button>
        )}
      </div>

      <div className="onboarding__body">
        {step === 0 ? (
          <div className="fade-up">
            <div className="row" style={{ justifyContent: 'center', marginBottom: 26 }}>
              <CoachOrb size={96} />
            </div>
            <div className="onboarding__title">One app.<br />One clear view.</div>
            <p className="onboarding__sub">
              Recovery, sleep, strain and nutrition — read from the wearable you already own, explained in plain language by a coach that knows your numbers.
            </p>
            <div className="feature-list">
              {[
                [<Heart size={16} />, 'Recovery every morning, built from overnight HRV and RHR'],
                [<Moon size={16} />, 'Sleep stages, sleep bank and a smart alarm'],
                [<Activity size={16} />, 'Strain and training load that respect how you feel'],
                [<Sparkles size={16} />, 'A coach grounded in your own data — on device'],
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
            <div className="onboarding__title" style={{ fontSize: 32 }}>Connect your health data</div>
            <p className="onboarding__sub">Bevel reads what your devices already write. No wearable? Everything still works with manual logs.</p>
            <div className="col gap-8 mt-24">
              <button className={`status-option ${healthGranted ? 'status-option--active' : ''}`} onClick={() => setHealthGranted((v) => !v)}>
                <span className="status-option__icon"><Watch size={18} /></span>
                <span className="grow">
                  <span className="list-title">Apple Health / Health Connect</span>
                  <span className="list-sub">Sleep, heart rate, HRV, workouts, nutrition</span>
                </span>
                <span className={`switch ${healthGranted ? 'switch--on' : ''}`} />
              </button>
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
              <span>In this build everything stays on your device. You can revoke access at any time in system settings.</span>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="fade-up">
            <div className="onboarding__title" style={{ fontSize: 32 }}>Make it yours</div>
            <p className="onboarding__sub">A few details tune your zones, recovery baseline and Biological Age.</p>
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
            <div className="insight-unlock mt-20">
              <Sparkles size={17} />
              <span>Want to look around first? “Explore demo” loads a realistic 60-day history so every screen has data.</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="onboarding__footer">
        <div className="progress-dots">
          {[0, 1, 2].map((i) => <span key={i} className={i === step ? 'on' : ''} />)}
        </div>
        {step === 0 ? (
          <>
            <button className="btn btn--block" onClick={() => setStep(1)}>Get started <ChevronRight size={17} /></button>
            <button className="btn btn--soft btn--block" onClick={() => finish(true)}>Explore with demo data</button>
          </>
        ) : step === 1 ? (
          <>
            <button className="btn btn--block" onClick={() => { setStep(2); showToast(healthGranted ? 'Health access granted' : 'You can connect later'); }}>
              {healthGranted ? 'Looks good' : 'Continue'} <ChevronRight size={17} />
            </button>
            <button className="caption" onClick={() => setStep(2)}>Not now</button>
          </>
        ) : (
          <>
            <button className="btn btn--block" onClick={() => finish(false)} disabled={!name.trim()}>
              Start tracking <Check size={17} />
            </button>
            <button className="btn btn--soft btn--block" onClick={() => finish(true)}>Explore demo instead</button>
            <p className="caption" style={{ textAlign: 'center' }}>By continuing you agree to the Terms and Privacy Policy. Wellness use only.</p>
          </>
        )}
      </div>
    </div>
  );
}
