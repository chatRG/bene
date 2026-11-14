import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, Sparkles, Shield } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { showToast } from '../components/toast';

export function PaywallScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const [plan, setPlan] = useState<'yearly' | 'monthly'>('yearly');
  return (
    <div className="paywall">
      <div className="row-between">
        <button className="icon-btn glass" onClick={() => navigate(-1)} aria-label="Close" style={{ color: '#fff' }}><ChevronLeft size={19} /></button>
        <span className="pill pill--sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}><Sparkles size={11} /> Bevel Pro</span>
        <span style={{ width: 40 }} />
      </div>

      <div className="paywall__title">Go deeper with<br /><span style={{ color: '#b7f06a' }}>Bevel Intelligence</span></div>
      <p className="paywall__sub">Unlimited coaching, health records, Biological Age and training plans built around your recovery.</p>

      <div className="col gap-6 mt-24">
        {[
          'AI coach grounded in your health data',
          'Health Records and biomarker extraction',
          'Biological Age with weekly updates',
          'Recovery-adaptive training plans',
          'Unlimited nutrition logging',
        ].map((p) => (
          <div className="perk" key={p}><span style={{ color: '#b7f06a', display: 'flex' }}><Check size={16} /></span>{p}</div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <button className={`plan-card ${plan === 'yearly' ? 'plan-card--active' : ''}`} onClick={() => setPlan('yearly')}>
        <span>
          <span className="plan-card__name" style={{ display: 'block' }}>Yearly</span>
          <span className="plan-card__sub" style={{ display: 'block' }}>Best value · save 44%</span>
        </span>
        <span className="plan-card__price">$99.99<small>$8.33 / month</small></span>
      </button>
      <button className={`plan-card ${plan === 'monthly' ? 'plan-card--active' : ''}`} onClick={() => setPlan('monthly')}>
        <span>
          <span className="plan-card__name" style={{ display: 'block' }}>Monthly</span>
          <span className="plan-card__sub" style={{ display: 'block' }}>Cancel any time</span>
        </span>
        <span className="plan-card__price">$14.99<small>per month</small></span>
      </button>

      <button
        className="btn btn--block mt-16"
        style={{ background: '#b7f06a', color: '#14220a' }}
        onClick={() => {
          state.setPro(true);
          showToast('Pro activated (demo)');
          navigate(-1);
        }}
      >
        Start 7-day free trial
      </button>
      <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 12, color: 'rgba(255,255,255,.5)', fontSize: 10.5 }}>
        <Shield size={12} /> Demo checkout · no payment is taken
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 14, fontSize: 10.5, color: 'rgba(255,255,255,.45)' }}>
        <button onClick={() => showToast('Purchases would be restored from the store')}>Restore</button>
        <button onClick={() => showToast('Terms of Service')}>Terms</button>
        <button onClick={() => showToast('Privacy Policy')}>Privacy</button>
      </div>
    </div>
  );
}
