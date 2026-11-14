import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Bell,
  ChevronRight,
  Database,
  FileText,
  Gift,
  Globe,
  Heart,
  Mail,
  MessageSquare,
  RefreshCw,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  User,
  Watch,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { DetailHeader, ListRow } from '../components/ui';
import { showToast } from '../components/toast';

export function ProfileScreen() {
  const navigate = useNavigate();
  const state = useAppStore();
  const initials = state.profile.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="screen screen--detail">
      <DetailHeader
        title="Profile"
        right={<button className="icon-btn icon-btn--soft" onClick={() => navigate('/settings/general')} aria-label="Settings"><Settings2 size={18} /></button>}      />

      <div className="profile-head">
        <div className="avatar avatar--lg" style={{ width: 72, height: 72, fontSize: 22 }}>{initials}</div>
        <div className="profile-name">{state.profile.name}</div>
        <div className="profile-email">{state.profile.email}</div>
        <div className="row gap-6 mt-8">
          <span className="pill pill--sm pill--flat"><Shield size={11} /> Local-first</span>
          <span className="pill pill--sm pill--dark">Pro</span>
        </div>
      </div>

      <button className="pro-banner" onClick={() => navigate('/paywall')}>
        <span className="status-option__icon" style={{ background: 'rgba(255,255,255,.12)', color: '#b7f06a' }}><Sparkles size={18} /></span>
        <span className="grow">
          <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Bevel Pro</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(255,255,255,.6)' }}>Intelligence, Health Records and Biological Age</span>
        </span>
        <ChevronRight size={17} style={{ color: 'rgba(255,255,255,.5)' }} />
      </button>

      <div className="settings-group-label">Account</div>
      <div className="list-card">
        <ListRow icon={<User size={16} />} title="Personal details" subtitle="Name, sex, birth date, height and weight" onClick={() => navigate('/settings/account')} />
        <ListRow icon={<Mail size={16} />} title="Email" subtitle="Used to sign in — cannot be changed" value={state.profile.email} right={<span />} onClick={() => showToast('Email cannot be changed in the app')} />
        <ListRow icon={<Heart size={16} />} title="Activity Status" subtitle={state.settings.activityStatus === 'active' ? 'Active · until changed' : state.settings.activityStatus} onClick={() => navigate('/settings/activity')} />
      </div>

      <div className="settings-group-label">Data & app</div>
      <div className="list-card">
        <ListRow icon={<Database size={16} />} title="Data Sources" subtitle="Apple Health, Oura, Garmin, CGM" onClick={() => navigate('/settings/data')} />
        <ListRow icon={<Settings2 size={16} />} title="Customization" subtitle="Goals, units, calculations, tabs" onClick={() => navigate('/settings/general')} />
        <ListRow icon={<Bell size={16} />} title="Notifications" subtitle="Recovery, sleep, journal and coach" onClick={() => navigate('/settings/notifications')} />
        <ListRow icon={<Globe size={16} />} title="Language" subtitle="English (US)" onClick={() => navigate('/settings/language')} />
        <ListRow icon={<Watch size={16} />} title="Apple Watch & widgets" subtitle="Complications, Smart Alarm, Live Sync" onClick={() => showToast('Manage widgets from the iOS app')} />
      </div>

      <div className="settings-group-label">Bevel Intelligence</div>
      <div className="list-card">
        <ListRow icon={<Sparkles size={16} />} title="Coach settings" subtitle="Model, personality, Ghost Mode" onClick={() => navigate('/intelligence')} />
        <ListRow icon={<FileText size={16} />} title="Health Records" subtitle={`${state.healthRecords.length} documents`} onClick={() => navigate('/records')} />
      </div>

      <div className="settings-group-label">More</div>
      <div className="list-card">
        <ListRow icon={<Gift size={16} />} title="Invite & Earn Rewards" subtitle="Give a month, get a month" onClick={() => showToast('Invite link copied')} right={<ArrowUpRight size={15} className="chevron" />} />
        <ListRow icon={<MessageSquare size={16} />} title="Report a bug" subtitle="Help improve the community build" onClick={() => showToast('Thanks — report noted')} />
        <ListRow icon={<RefreshCw size={16} />} title="Clear cache & reload data" subtitle="Re-seeds the local demo dataset" onClick={() => { state.resetDemo(); showToast('Demo data reloaded'); }} />
        <ListRow icon={<Trash2 size={16} />} title="Delete all data" subtitle="Removes everything from this device" danger onClick={() => navigate('/settings/privacy')} />
      </div>

      <div className="settings-footer">
        Bevel Community 0.1.0 · Unofficial clean-room build<br />
        Not affiliated with Finerpoint, Inc. Health estimates are not medical advice.
      </div>
      <div className="row gap-6" style={{ justifyContent: 'center' }}>
        <span className="pill pill--sm pill--flat"><Shield size={11} /> On-device</span>
        <span className="pill pill--sm pill--flat">MIT licensed</span>
      </div>
    </div>
  );
}
