import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ChevronRight,
  Database,
  FileText,
  Gift,
  HardDrive,
  Heart,
  Mail,
  MessageCircle,
  MessageSquare,
  Settings2,
  Shield,
  Trash2,
  User,
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
          {state.settings.demoMode ? <span className="pill pill--sm pill--flat">Demo dataset</span> : null}
        </div>
      </div>

      <button className="pro-banner" onClick={() => navigate('/settings/backup')}>
        <span className="status-option__icon" style={{ background: 'rgba(255,255,255,.12)', color: '#e0a184' }}><HardDrive size={18} /></span>
        <span className="grow">
          <span className="pro-banner__title">Backup and restore</span>
          <span className="pro-banner__sub">Keep a portable copy of your data</span>
        </span>
        <ChevronRight size={17} style={{ color: 'rgba(255,255,255,.5)' }} />
      </button>

      <div className="settings-group-label">Account</div>
      <div className="list-card">
        <ListRow icon={<User size={16} />} title="Personal details" subtitle="Name, sex, birth date, height and weight" onClick={() => navigate('/settings/account')} />
        <ListRow icon={<Mail size={16} />} title="Email" subtitle="Local profile · cannot be changed" value={state.profile.email} right={<span />} onClick={() => showToast('Email cannot be changed in the app')} />
        <ListRow icon={<Heart size={16} />} title="Activity status" subtitle={state.settings.activityStatus === 'active' ? 'Active · today' : state.settings.activityStatus} onClick={() => navigate('/settings/activity')} />
      </div>

      <div className="settings-group-label">Data & app</div>
      <div className="list-card">
        <ListRow icon={<Database size={16} />} title="Data sources" subtitle="No live adapters · sample data" onClick={() => navigate('/settings/data')} />
        <ListRow icon={<Settings2 size={16} />} title="Customization" subtitle="Goals, calculations, tabs" onClick={() => navigate('/settings/general')} />
      </div>

      <div className="settings-group-label">Local coach</div>
      <div className="list-card">
        <ListRow icon={<MessageCircle size={16} />} title="Coach settings" subtitle="Tone and ghost mode" onClick={() => navigate('/intelligence')} />
        <ListRow icon={<FileText size={16} />} title="Health Records" subtitle={`${state.healthRecords.length} documents`} onClick={() => navigate('/records')} />
      </div>

      <div className="settings-group-label">More</div>
      <div className="list-card">
        <ListRow icon={<Gift size={16} />} title="Invite a friend" subtitle="Share Bene with someone" onClick={() => showToast('Invite link copied')} right={<ArrowUpRight size={15} className="chevron" />} />
        <ListRow icon={<MessageSquare size={16} />} title="Report a bug" subtitle="Help improve the community build" onClick={() => showToast('Thanks — report noted')} />
        <ListRow icon={<Trash2 size={16} />} title="Delete all data" subtitle="Removes everything from this device" danger onClick={() => navigate('/settings/privacy')} />
      </div>

      <div className="settings-footer">
        Bene 0.1.2 · Local-first build<br />
        Health estimates are not medical advice.
      </div>
      <div className="row gap-6" style={{ justifyContent: 'center' }}>
        <span className="pill pill--sm pill--flat"><Shield size={11} /> On-device</span>
        <span className="pill pill--sm pill--flat">Source-available</span>
      </div>
    </div>
  );
}
