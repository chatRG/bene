import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ChevronRight,
  FileText,
  Gift,
  HardDrive,
  Heart,
  MessageCircle,
  MessageSquare,
  Settings2,
  Shield,
  Trash2,
  User,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { DetailHeader, ListRow } from '../components/ui';
import { HealthSourceRow } from '../components/health-source';
import { showToast } from '../components/toast';

const REPO = 'https://github.com/chatRG/bene';

/**
 * The published Android build, addressed by tag. GitHub's `releases/latest`
 * shortcut cannot point at a file, so the tag is named explicitly — bump it
 * together with `versionName` in android/app/build.gradle.
 */
const RELEASE_VERSION = '0.2.0';
const DOWNLOAD_URL = `${REPO}/releases/download/v${RELEASE_VERSION}/bene-v${RELEASE_VERSION}-release.apk`;

async function inviteAFriend() {
  const text = `Bene — a local-first health and recovery coach. Download for Android:\n${DOWNLOAD_URL}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Bene', text, url: DOWNLOAD_URL });
      return;
    } catch (error) {
      // A dismissed share sheet is not a failure worth interrupting.
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(DOWNLOAD_URL);
    showToast('Download link copied');
  } catch {
    window.open(DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
  }
}

function reportBug() {
  window.open(`${REPO}/issues`, '_blank', 'noopener,noreferrer');
  showToast('Opening issues on GitHub');
}

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
        <div className="row gap-6 mt-8">
          <span className="pill pill--sm pill--flat"><Shield size={11} /> Local-first</span>
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
        <ListRow icon={<Heart size={16} />} title="Activity status" subtitle={state.settings.activityStatus === 'active' ? 'Active · today' : state.settings.activityStatus} onClick={() => navigate('/settings/activity')} />
      </div>

      <div className="settings-group-label">Data & app</div>
      <div className="list-card">
        <HealthSourceRow onClick={() => navigate('/settings/data')} />
        <ListRow icon={<Settings2 size={16} />} title="Customization" subtitle="Tabs, appearance, Home layout" onClick={() => navigate('/settings/general')} />
      </div>

      <div className="settings-group-label">Local coach</div>
      <div className="list-card">
        <ListRow icon={<MessageCircle size={16} />} title="Coach settings" subtitle="Tone and ghost mode" onClick={() => navigate('/intelligence')} />
        <ListRow icon={<FileText size={16} />} title="Health Records" subtitle={`${state.healthRecords.length} documents`} onClick={() => navigate('/records')} />
      </div>

      <div className="settings-group-label">More</div>
      <div className="list-card">
        <ListRow icon={<Gift size={16} />} title="Invite a friend" subtitle="Share the Android download link" onClick={() => void inviteAFriend()} right={<ArrowUpRight size={15} className="chevron" />} />
        <ListRow icon={<MessageSquare size={16} />} title="Report a bug" subtitle="Opens GitHub issues for this project" onClick={reportBug} right={<ArrowUpRight size={15} className="chevron" />} />
        <ListRow icon={<Trash2 size={16} />} title="Delete all data" subtitle="Removes everything from this device" danger onClick={() => navigate('/settings/privacy')} />
      </div>

      <div className="settings-footer">
        Bene 0.2.0<br />
        Health estimates are not medical advice.
      </div>
      <div className="row gap-6" style={{ justifyContent: 'center' }}>
        <span className="pill pill--sm pill--flat"><Shield size={11} /> On-device</span>
      </div>
    </div>
  );
}
