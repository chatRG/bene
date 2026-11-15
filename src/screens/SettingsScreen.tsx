import { useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Bell,
  Check,
  ChevronRight,
  Database,
  Download,
  FileText,
  Globe,
  HardDrive,
  Heart,
  Info,
  MessageCircle,
  Lock,
  Moon,
  RefreshCw,
  RotateCcw,
  Settings2,
  Shield,
  Smartphone,
  Target,
  Trash2,
  Upload,
  User,
  Watch,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { BeneMark, DetailHeader, ListRow, Sheet, Segmented } from '../components/ui';
import { Glyph } from '../components/glyphs';
import { showToast } from '../components/toast';
import { snapshotInfo } from '../domain/backup';
import type { ActivityStatus, ThemeMode, UnitSystem } from '../domain/types';

const SECTION_TITLES: Record<string, string> = {
  general: 'Customization',
  account: 'Account',
  data: 'Data sources',
  notifications: 'Notifications',
  goals: 'Goals and units',
  calculations: 'Calculations',
  coach: 'Local coach',
  privacy: 'Privacy and data',
  activity: 'Activity status',
  language: 'Language',
  about: 'About',
  backup: 'Backup and restore',
};

export function SettingsScreen() {
  const { section } = useParams();
  const navigate = useNavigate();
  const state = useAppStore();
  const s = state.settings;

  if (!section) {
    return (
      <div className="screen screen--detail">
        <DetailHeader title="Settings" />
        <p className="caption" style={{ margin: '2px 4px 0' }}>Stored on this device. No sign-in, no cloud sync.</p>

        <GroupLabel>You</GroupLabel>
        <div className="list-card">
          <ListRow icon={<User size={16} />} title="Profile and plan" subtitle="Name, body metrics, subscription" onClick={() => navigate('/settings/account')} />
          <ListRow icon={<Heart size={16} />} title="Activity status" subtitle={s.activityStatus === 'active' ? 'Active' : s.activityStatus === 'break' ? 'On a break' : s.activityStatus[0].toUpperCase() + s.activityStatus.slice(1)} onClick={() => navigate('/settings/activity')} />
        </div>

        <GroupLabel>Data and privacy</GroupLabel>
        <div className="list-card">
          <ListRow icon={<Database size={16} />} title="Data sources" subtitle="No live adapters · demo and manual logs" onClick={() => navigate('/settings/data')} />
          <ListRow icon={<Shield size={16} />} title="Privacy and permissions" subtitle="Export, delete, access" onClick={() => navigate('/settings/privacy')} />
          <ListRow icon={<HardDrive size={16} />} title="Backup and restore" subtitle={s.lastBackupAt ? `Last backup ${format(new Date(s.lastBackupAt), 'MMM d, h:mm a')}` : 'Create your first local backup'} onClick={() => navigate('/settings/backup')} />
        </div>

        <GroupLabel>Preferences</GroupLabel>
        <div className="list-card">
          <ListRow icon={<Settings2 size={16} />} title="Customization" subtitle="Tabs, appearance, units, calculations" onClick={() => navigate('/settings/general')} />
          <ListRow icon={<Target size={16} />} title="Goals" subtitle={`Sleep ${Math.floor(s.sleepGoalMin / 60)}h ${s.sleepGoalMin % 60}m · ${s.calorieGoal} kcal`} onClick={() => navigate('/settings/goals')} />
          <ListRow icon={<Bell size={16} />} title="Notifications" subtitle="Morning report and reminders" onClick={() => navigate('/settings/notifications')} />
          <ListRow icon={<MessageCircle size={16} />} title="Local coach" subtitle="Rule-based, on this device" onClick={() => navigate('/settings/coach')} />
          <ListRow icon={<Globe size={16} />} title="Language" subtitle="English (US)" onClick={() => navigate('/settings/language')} />
        </div>

        <GroupLabel>App</GroupLabel>
        <div className="list-card">
          <ListRow icon={<Info size={16} />} title="About" subtitle="Version 0.1.1 · Noncommercial" onClick={() => navigate('/settings/about')} />
        </div>

        <div className="settings-footer">Bene is a local-first health app.<br />Health estimates are wellness only, not medical advice.</div>
      </div>
    );
  }

  return (
    <div className="screen screen--detail">
      <DetailHeader title={SECTION_TITLES[section] ?? 'Settings'} />
      {section === 'general' ? <General /> : null}
      {section === 'account' ? <Account /> : null}
      {section === 'data' ? <DataSourceScreen /> : null}
      {section === 'notifications' ? <Notifications /> : null}
      {section === 'goals' ? <Goals /> : null}
      {section === 'calculations' ? <Calculations /> : null}
      {section === 'coach' ? <CoachSettings /> : null}
      {section === 'privacy' ? <Privacy /> : null}
      {section === 'backup' ? <Backup /> : null}
      {section === 'activity' ? <ActivitySettings /> : null}
      {section === 'language' ? <Language /> : null}
      {section === 'about' ? <About /> : null}
      <div style={{ height: 30 }} />
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="settings-group-label">{children}</div>;
}

function SwitchRow({ title, subtitle, on, onChange }: { title: string; subtitle?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="list-row">
      <div className="grow">
        <div className="list-title">{title}</div>
        {subtitle ? <div className="list-sub">{subtitle}</div> : null}
      </div>
      <button className={`switch ${on ? 'switch--on' : ''}`} onClick={() => onChange(!on)} aria-label={title} />
    </div>
  );
}

function General() {
  const state = useAppStore();
  const navigate = useNavigate();
  const s = state.settings;
  return (
    <>
      <GroupLabel>Appearance</GroupLabel>
      <div className="card">
        <div className="row-between">
          <span className="card-title">Theme</span>
          <Segmented<ThemeMode>
            options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
            value={s.theme}
            onChange={(v) => state.updateSettings({ theme: v })}
          />
        </div>
        <div className="divider" />
        <div className="row-between">
          <span className="card-title">Units</span>
          <Segmented<UnitSystem>
            options={[{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }]}
            value={s.units}
            onChange={(v) => state.updateSettings({ units: v })}
          />
        </div>
      </div>

      <GroupLabel>Tab visibility</GroupLabel>
      <div className="list-card">
        <SwitchRow title="Fitness" subtitle="Workouts, Training Load, Strength Builder" on={s.activeTabs.fitness} onChange={() => state.toggleTab('fitness')} />
        <SwitchRow title="Journal" subtitle="Habits, mood, quick logs" on={s.activeTabs.journal} onChange={() => state.toggleTab('journal')} />
        <SwitchRow title="Biology" subtitle="Biological Age, biomarkers, records" on={s.activeTabs.biology} onChange={() => state.toggleTab('biology')} />
      </div>
      <p className="caption" style={{ margin: '8px 4px 0' }}>Disabling a tab also hides every card and notification that belongs to it.</p>

      <GroupLabel>Home screen</GroupLabel>
      <div className="list-card">
        <ListRow icon={<Settings2 size={16} />} title="Edit Home" subtitle="Hide, add and reorder cards" onClick={() => useAppStore.getState() && showToast('Use Edit Home at the bottom of the Home tab')} />
        <ListRow icon={<RefreshCw size={16} />} title="Restore default Home" subtitle={`${s.homeOrder.length} cards visible`} onClick={() => { state.saveHomeLayout(['scores', 'coach', 'stress', 'sleep', 'timeline', 'nutrition', 'journal']); showToast('Home restored'); }} />
      </div>

      <GroupLabel>Calculations</GroupLabel>
      <div className="list-card">
        <ListRow title="HRV and RHR method" subtitle={`${s.hrvMethod === 'sdnn' ? 'SDNN' : 'RMSSD'} · ${s.hrvWindow === 'entireSleep' ? 'entire sleep' : 'REM + deep'}`} onClick={() => navigate('/settings/calculations')} />
        <ListRow title="Heart-rate zones" subtitle={s.hrZoneMethod === 'manual' ? `Manual · ${s.manualMaxHr} bpm` : s.hrZoneMethod === 'hrReserve' ? 'Heart-rate reserve' : 'Max heart rate'} onClick={() => navigate('/settings/calculations')} />
      </div>

      <GroupLabel>Advanced</GroupLabel>
      <div className="list-card">
        <ListRow icon={<RefreshCw size={16} />} title="Reload demo data" subtitle="Rebuild the 60-day sample dataset" onClick={() => { state.resetDemo(); showToast('Demo data rebuilt'); }} />
        <ListRow icon={<Shield size={16} />} title="Data loading window" subtitle="60 days in this build" onClick={() => showToast('Native builds load up to 2 years')} />
      </div>
    </>
  );
}

function Account() {
  const state = useAppStore();
  const [name, setName] = useState(state.profile.name);
  const [height, setHeight] = useState(state.profile.heightCm);
  const [weight, setWeight] = useState(state.profile.weightKg);
  return (
    <>
      <div className="profile-head" style={{ paddingTop: 8 }}>
        <div className="avatar avatar--lg" style={{ width: 64, height: 64, fontSize: 20 }}>{name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}</div>
        <div className="profile-name" style={{ fontSize: 21 }}>{name}</div>
        <div className="profile-email">{state.profile.email}</div>
      </div>
      <div className="list-card">
        <div className="list-row">
          <div className="grow"><div className="list-title">Name</div></div>
          <input className="text-input" style={{ width: 170, minHeight: 38 }} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Email</div><div className="list-sub">Cannot be changed</div></div>
          <span className="list-value">{state.profile.email}</span>
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Sex</div></div>
          <Segmented
            options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'unspecified', label: 'Other' }]}
            value={state.profile.sex}
            onChange={(v) => state.updateProfile({ sex: v })}
          />
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Birth date</div><div className="list-sub">Used for zones and Biological Age</div></div>
          <input className="text-input" style={{ width: 150, minHeight: 38 }} type="date" value={state.profile.birthDate} onChange={(e) => state.updateProfile({ birthDate: e.target.value })} />
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Height</div></div>
          <div className="row gap-6"><input className="text-input" style={{ width: 70, minHeight: 38 }} type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} /><span className="caption">cm</span></div>
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Weight</div></div>
          <div className="row gap-6"><input className="text-input" style={{ width: 70, minHeight: 38 }} type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} /><span className="caption">kg</span></div>
        </div>
      </div>
      <button className="btn btn--block mt-16" onClick={() => { state.updateProfile({ name, heightCm: height, weightKg: weight }); showToast('Profile saved'); }}>Save changes</button>
    </>
  );
}

const SOURCES = [
  { id: 'apple', name: 'Apple Health', icon: <Watch size={16} />, status: 'Not connected', live: false, detail: 'Synthetic dataset · no HealthKit adapter in this build', note: 'This build does not link HealthKit. The dashboard uses a synthetic 60-day dataset; manual logs are real.' },
  { id: 'oura', name: 'Oura', icon: <Moon size={16} />, status: 'Not connected', live: false, detail: 'Placeholder · no Oura API connection', note: 'Oura data would arrive through Apple Health or a native bridge. Neither is included yet.' },
  { id: 'garmin', name: 'Garmin', icon: <Watch size={16} />, status: 'Not connected', live: false, detail: 'Placeholder · no Garmin connection', note: 'Requires Garmin Connect → Apple Health or a native adapter.' },
  { id: 'strava', name: 'Strava', icon: <Zap size={16} />, status: 'Not connected', live: false, detail: 'Placeholder · no Strava OAuth', note: 'Imported workouts are read-only by design; the integration is not built.' },
  { id: 'google', name: 'Google Health', icon: <Heart size={16} />, status: 'Not connected', live: false, detail: 'Placeholder · no Health Connect adapter', note: 'Health Connect is the Android path; it is not included in this iteration.' },
  { id: 'amazfit', name: 'Amazfit', icon: <Watch size={16} />, status: 'Not connected', live: false, detail: 'Placeholder · no Amazfit connection', note: 'Some body-weight load is excluded when data arrives.' },
  { id: 'cgm', name: 'CGM · Dexcom / Lingo / Stelo', icon: <Zap size={16} />, status: 'Not connected', live: false, detail: 'Placeholder · no CGM SDK', note: 'Glucose impact and Net Energy glucose inputs are not wired.' },
  { id: 'polar', name: 'Bluetooth HR sensor', icon: <Heart size={16} />, status: 'Not connected', live: false, detail: 'Placeholder · no BLE bridge', note: 'Live HR requires a native Bluetooth adapter and Health write permission.' },
];

function DataSourceScreen() {
  const [selected, setSelected] = useState<(typeof SOURCES)[number] | null>(null);

  return (
    <>
      <div className="insight-unlock mt-8">
        <Info size={17} />
        <span>
          <strong>No live sensor connection is active yet.</strong> The dashboard runs on a synthetic demo dataset; anything you log manually and
          every backup you create are real and stay on this device.
        </span>
      </div>
      <GroupLabel>Sources</GroupLabel>
      <div className="list-card">
        {SOURCES.map((src) => (
          <button key={src.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setSelected(src)}>
            <div className="list-icon">{src.icon}</div>
            <div className="grow"><div className="list-title">{src.name}</div><div className="list-sub">{src.detail}</div></div>
            <span className="pill pill--sm pill--flat">{src.status}</span>
            <ChevronRight size={16} className="chevron" />
          </button>
        ))}
      </div>
      <GroupLabel>Duplicates</GroupLabel>
      <div className="list-card">
        <SwitchRow title="Hide duplicate sources" subtitle="Show one workout when several devices record it" on={false} onChange={() => showToast('Available once a live source is connected')} />
        <ListRow title="Apple Health permissions" subtitle="No permission is requested in this build" value="Not active" onClick={() => showToast('HealthKit is not included in this iteration')} />
      </div>
      {selected ? (
        <Sheet title={selected.name} subtitle={selected.status} onClose={() => setSelected(null)}>
          <p className="body" style={{ lineHeight: 1.6 }}>{selected.note}</p>
          <div className="divider" />
          <div className="list-card" style={{ boxShadow: 'none' }}>
            <div className="list-row"><div className="grow"><div className="list-title">Data it would provide</div><div className="list-sub">{selected.detail}</div></div></div>
            <div className="list-row"><div className="grow"><div className="list-title">History</div><div className="list-sub">{selected.id === 'oura' ? 'Limited to 1 month in Bene' : 'Up to 2 years'}</div></div></div>
          </div>
          <button
            className="btn btn--soft btn--block mt-20"
            onClick={() => {
              setSelected(null);
              showToast('Adapter not included in this build');
            }}
          >
            Adapter not included in this build
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

function Notifications() {
  const state = useAppStore();
  const n = state.settings.notifications;
  return (
    <>
      <div className="list-card">
        <SwitchRow title="Morning report" subtitle="Recovery, sleep and today's target" on={n.morningReport} onChange={(v) => state.updateNotifications({ morningReport: v })} />
        <SwitchRow title="Recovery alerts" subtitle="When recovery drops below 35%" on={n.recovery} onChange={(v) => state.updateNotifications({ recovery: v })} />
        <SwitchRow title="Strain check-in" subtitle="Late-afternoon target reminder" on={n.strain} onChange={(v) => state.updateNotifications({ strain: v })} />
        <SwitchRow title="Sleep reminders" subtitle="Wind-down and bedtime" on={n.sleep} onChange={(v) => state.updateNotifications({ sleep: v })} />
        <SwitchRow title="Journal reminders" subtitle="Per-tag reminders" on={n.journal} onChange={(v) => state.updateNotifications({ journal: v })} />
        <SwitchRow title="Coach check-ins" subtitle="Bene Intelligence nudges" on={n.intelligence} onChange={(v) => state.updateNotifications({ intelligence: v })} />
        <SwitchRow title="Weekly digest" subtitle="Sunday evening review" on={n.weeklyDigest} onChange={(v) => state.updateNotifications({ weeklyDigest: v })} />
        <SwitchRow title="Bedtime alarm" subtitle="Smart alarm requires Apple Watch" on={n.bedtime} onChange={(v) => state.updateNotifications({ bedtime: v })} />
      </div>
      <p className="caption mt-12" style={{ lineHeight: 1.5 }}>Notifications are local. Times use your device timezone and respect Focus modes.</p>
    </>
  );
}

function Goals() {
  const state = useAppStore();
  const s = state.settings;
  const [sleepH, setSleepH] = useState(Math.floor(s.sleepGoalMin / 60));
  const [sleepM, setSleepM] = useState(s.sleepGoalMin % 60);
  const [kcal, setKcal] = useState(s.calorieGoal);
  const [protein, setProtein] = useState(s.proteinGoalG);
  const [units, setUnits] = useState(s.nutritionUnits);
  return (
    <>
      <GroupLabel>Sleep</GroupLabel>
      <div className="card">
        <div className="row-between">
          <div><div className="card-title">Sleep goal</div><div className="card-sub">Drives Sleep Needed and Sleep Bank</div></div>
          <strong>{sleepH}h {sleepM}m</strong>
        </div>
        <div className="row gap-8 mt-12">
          <input type="range" min={6} max={10} value={sleepH} onChange={(e) => setSleepH(Number(e.target.value))} style={{ flex: 1 }} />
          <select className="text-input" style={{ width: 90, minHeight: 40 }} value={sleepM} onChange={(e) => setSleepM(Number(e.target.value))}>
            {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m}m</option>)}
          </select>
        </div>
      </div>
      <GroupLabel>Nutrition</GroupLabel>
      <div className="list-card">
        <div className="list-row">
          <div className="grow"><div className="list-title">Calorie goal</div><div className="list-sub">Daily intake target</div></div>
          <input className="text-input" style={{ width: 100, minHeight: 38 }} type="number" value={kcal} onChange={(e) => setKcal(Number(e.target.value))} />
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Protein goal</div><div className="list-sub">Grams per day</div></div>
          <input className="text-input" style={{ width: 100, minHeight: 38 }} type="number" value={protein} onChange={(e) => setProtein(Number(e.target.value))} />
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Show macros as</div></div>
          <Segmented options={[{ value: 'g', label: 'Grams' }, { value: 'percent', label: 'Percent' }]} value={units} onChange={setUnits} />
        </div>
      </div>
      <GroupLabel>Targets & limits</GroupLabel>
      <div className="list-card">
        <ListRow title="Target nutrients" subtitle="Reach at least — fiber, protein, omega-3" value="2 set" onClick={() => showToast('Target nutrients editor')} />
        <ListRow title="Limit nutrients" subtitle="Stay under — sodium, added sugar" value="2 set" onClick={() => showToast('Limit nutrients editor')} />
        <ListRow title="Excluded contributors" subtitle={`${s.excludedContributors.length} excluded from score`} onClick={() => showToast('Exclude contributors for allergies or preferences')} />
      </div>
      <button className="btn btn--block mt-20" onClick={() => { state.updateSettings({ sleepGoalMin: sleepH * 60 + sleepM, calorieGoal: kcal, proteinGoalG: protein, nutritionUnits: units }); showToast('Goals saved'); }}>Save goals</button>
    </>
  );
}

function Calculations() {
  const state = useAppStore();
  const s = state.settings;
  return (
    <>
      <div className="list-card">
        <ListRow title="HRV method" subtitle="SDNN and RMSSD are not interchangeable" value={<Segmented options={[{ value: 'sdnn', label: 'SDNN' }, { value: 'rmssd', label: 'RMSSD' }]} value={s.hrvMethod} onChange={(v) => state.updateSettings({ hrvMethod: v })} />} />
        <ListRow title="Use HRV from" subtitle="Overnight window only" value={<Segmented options={[{ value: 'entireSleep', label: 'All sleep' }, { value: 'remDeep', label: 'REM+Deep' }]} value={s.hrvWindow} onChange={(v) => state.updateSettings({ hrvWindow: v })} />} />
        <ListRow title="Use RHR from" subtitle="Resting heart rate window" value={<select className="pill pill--flat" value={s.rhrWindow} onChange={(e) => state.updateSettings({ rhrWindow: e.target.value as typeof s.rhrWindow })}><option value="entireSleep">All sleep</option><option value="remDeep">REM+Deep</option><option value="entireDay">Entire day</option></select>} />
        <ListRow title="Temperature method" subtitle="Wrist is more sensitive to illness" value={<Segmented options={[{ value: 'wrist', label: 'Wrist' }, { value: 'body', label: 'Body' }]} value={s.tempMethod} onChange={(v) => state.updateSettings({ tempMethod: v })} />} />
      </div>

      <GroupLabel>Heart-rate zones</GroupLabel>
      <div className="list-card">
        <div className="list-row"><div className="grow"><div className="list-title">Method</div><div className="list-sub">Zones 1–5 at 50/60/70/80/90%</div></div>
          <Segmented options={[{ value: 'maxHr', label: 'Max' }, { value: 'hrReserve', label: 'Reserve' }, { value: 'manual', label: 'Manual' }]} value={s.hrZoneMethod === 'lactate' ? 'manual' : s.hrZoneMethod} onChange={(v) => state.updateSettings({ hrZoneMethod: v })} />
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Manual max HR</div><div className="list-sub">Used when method is Manual</div></div>
          <input className="text-input" style={{ width: 90, minHeight: 38 }} type="number" value={s.manualMaxHr} onChange={(e) => state.updateSettings({ manualMaxHr: Number(e.target.value) })} />
        </div>
        <div className="list-row">
          <div className="grow"><div className="list-title">Lactate threshold HR</div><div className="list-sub">Estimated max = LTHR ÷ 0.85</div></div>
          <input className="text-input" style={{ width: 90, minHeight: 38 }} type="number" value={s.lactateThresholdHr} onChange={(e) => state.updateSettings({ lactateThresholdHr: Number(e.target.value) })} />
        </div>
      </div>
      <p className="caption mt-12" style={{ lineHeight: 1.5 }}>
        Max HR defaults to the Tanaka estimate (208 − 0.7 × age). The method and the manual override are explicit here rather than implied.
      </p>
    </>
  );
}

function CoachSettings() {
  const state = useAppStore();
  const s = state.settings;
  return (
    <>
      <div className="list-card">
        <SwitchRow title="Local coach" subtitle="Turn the coach on or off" on={s.aiEnabled} onChange={(v) => state.updateSettings({ aiEnabled: v })} />
        <SwitchRow title="Ghost mode by default" subtitle="New chats disappear after the retention window" on={s.ghostDefault} onChange={(v) => state.updateSettings({ ghostDefault: v })} />
        <SwitchRow title="Follow-up suggestions" subtitle="Show suggested questions after each reply" on={s.suggestedFollowUps} onChange={(v) => state.updateSettings({ suggestedFollowUps: v })} />
        <SwitchRow title="Show reasoning steps" subtitle="Adds a short method note to replies" on={s.expandedThinking} onChange={(v) => state.updateSettings({ expandedThinking: v })} />
      </div>
      <GroupLabel>Reply depth</GroupLabel>
      <div className="card">
        <div className="row-between">
          <div><div className="card-title">Reply depth</div><div className="card-sub">Detailed replies use more of the weekly allowance</div></div>
          <Segmented options={[{ value: 'standard', label: 'Standard' }, { value: 'upgraded', label: 'Detailed' }]} value={s.aiModel} onChange={(v) => state.updateSettings({ aiModel: v })} />
        </div>
      </div>
      <GroupLabel>Ghost retention</GroupLabel>
      <div className="row gap-8">
        {[30, 60, 360, 1440].map((m) => (
          <button key={m} className={`pill ${s.ghostRetentionMin === m ? 'pill--dark' : 'pill--flat'}`} onClick={() => state.updateSettings({ ghostRetentionMin: m as 30 | 60 | 360 | 1440 })}>
            {m < 60 ? `${m}m` : `${m / 60}h`}
          </button>
        ))}
      </div>
      <GroupLabel>Tone</GroupLabel>
      <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
        {(['supportive', 'direct', 'analytical', 'playful'] as const).map((p) => (
          <button key={p} className={`pill ${s.aiPersonality === p ? 'pill--dark' : 'pill--flat'}`} onClick={() => state.updateSettings({ aiPersonality: p })}>{p}</button>
        ))}
      </div>
      <p className="caption mt-16" style={{ lineHeight: 1.5 }}>In this build the coach runs a rule-based responder on this device and answers from your metrics. No data leaves the device.</p>
    </>
  );
}

function Backup() {
  const state = useAppStore();
  const navigate = useNavigate();
  const [info, setInfo] = useState(snapshotInfo());
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmFile, setConfirmFile] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = (json: string) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bene-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const createBackup = () => {
    state.backupNow();
    download(state.exportBackupJson());
    setInfo(snapshotInfo());
    showToast('Backup created and downloaded');
  };

  const workoutCount = Object.values(state.days).reduce((a, d) => a + d.workouts.length, 0);
  const mealCount = Object.values(state.days).reduce((a, d) => a + d.meals.length, 0);

  return (
    <>
      <div className="credit-card">
        <div className="row-between">
          <div>
            <div className="credit-card__label">Protected · on-device backup</div>
            <div className="credit-card__value" style={{ fontSize: 24 }}>
              {info.exists ? 'Backed up' : 'Not created yet'}
            </div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', marginTop: 4 }}>
              {info.exportedAt ? `Last saved ${format(new Date(info.exportedAt), 'MMM d, h:mm a')}` : 'Your data is local until you back it up'}
            </div>
          </div>
          <span style={{ width: 46, height: 46, borderRadius: 999, background: 'rgba(255,255,255,.1)', display: 'grid', placeItems: 'center' }}>
            <HardDrive size={22} />
          </span>
        </div>
        <div className="credit-bar"><span style={{ width: info.exists ? '100%' : '8%', background: info.exists ? '#f3ede1' : '#d3a04a' }} /></div>
        <div className="row-between mt-8" style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)' }}>
          <span>{info.exists ? `${info.sizeKb} KB snapshot` : 'No snapshot'}</span>
          <span>{state.dayOrder.length} days · {workoutCount} workouts</span>
        </div>
      </div>

      <div className="row gap-8 mt-16">
        <button className="btn btn--block" onClick={createBackup}><Download size={16} /> Create backup</button>
        <button className="btn btn--soft btn--block" disabled={!info.exists} onClick={() => setConfirmRestore(true)}><RotateCcw size={16} /> Restore snapshot</button>
      </div>

      <GroupLabel>Protection</GroupLabel>
      <div className="list-card">
        <SwitchRow
          title="Daily automatic snapshot"
          subtitle="Saved to this device once every 24 hours"
          on={state.settings.autoBackup}
          onChange={(v) => state.updateSettings({ autoBackup: v })}
        />
        <ListRow
          icon={<Upload size={16} />}
          title="Restore from a file"
          subtitle="Choose a Bene backup .json"
          onClick={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            setConfirmFile(text);
            e.target.value = '';
          }}
        />
        <ListRow
          icon={<Info size={16} />}
          title="What's included"
          subtitle={`${state.dayOrder.length} days · ${mealCount} meals · ${state.chats.length} chats · records`}
        />
      </div>

      <GroupLabel>About local storage</GroupLabel>
      <div className="card card--flat" style={{ background: 'transparent' }}>
        <p className="caption" style={{ lineHeight: 1.6 }}>
          This first iteration is fully offline: there is no Bene account and no cloud. Your data lives in this browser or app container, so clearing site data
          or uninstalling the app removes it. A backup file is the portable copy — keep it in Files, iCloud Drive, Google Drive or any folder you trust.
        </p>
      </div>
      <div className="insight-unlock mt-12" style={{ background: 'rgba(245,166,35,.1)' }}>
        <Lock size={17} style={{ color: '#d98600' }} />
        <span>Backups are plain, unencrypted JSON. Store them somewhere private — they contain your health history.</span>
      </div>

      {confirmRestore ? (
        <Sheet title="Restore latest backup?" subtitle={info.exportedAt ? format(new Date(info.exportedAt), 'MMM d, h:mm a') : ''} onClose={() => setConfirmRestore(false)}>
          <p className="body">This replaces everything currently in the app with the last on-device snapshot. Create a fresh backup first if you are unsure.</p>
          <button
            className="btn btn--block mt-20"
            onClick={() => {
              const result = state.restoreLatestBackup();
              setConfirmRestore(false);
              if (!result.ok) {
                showToast(result.error ?? 'Could not restore');
                return;
              }
              setInfo(snapshotInfo());
              showToast('Backup restored');
              navigate('/');
            }}
          >
            Restore backup
          </button>
          <button className="btn btn--soft btn--block mt-8" onClick={() => setConfirmRestore(false)}>Cancel</button>
        </Sheet>
      ) : null}

      {confirmFile ? (
        <Sheet title="Restore from file?" subtitle="This replaces the current app data." onClose={() => setConfirmFile(null)}>
          <p className="body">The backup will be validated first. If it was made by a newer version or is incomplete, nothing will change.</p>
          <button
            className="btn btn--block mt-20"
            onClick={() => {
              const result = state.importBackupJson(confirmFile);
              setConfirmFile(null);
              if (!result.ok) {
                showToast(result.error ?? 'Could not restore');
                return;
              }
              setInfo(snapshotInfo());
              showToast('Backup restored');
              navigate('/');
            }}
          >
            Restore this file
          </button>
          <button className="btn btn--soft btn--block mt-8" onClick={() => setConfirmFile(null)}>Cancel</button>
        </Sheet>
      ) : null}
    </>
  );
}

function Privacy() {
  const state = useAppStore();
  const [confirm, setConfirm] = useState(false);
  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bene-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export downloaded');
  };
  return (
    <>
      <div className="insight-unlock">
        <Lock size={17} />
        <span>All health data in this build lives in local storage. There is no Bene account, no cloud sync and no analytics.</span>
      </div>
      <GroupLabel>Your data</GroupLabel>
      <div className="list-card">
        <ListRow icon={<Download size={16} />} title="Export everything" subtitle="JSON with all days, meals, workouts and chats" onClick={exportData} />
        <ListRow icon={<FileText size={16} />} title="Download health records" subtitle={`${state.healthRecords.length} files`} onClick={() => showToast('Records are local PDFs/images')} />
        <ListRow icon={<Trash2 size={16} />} title="Delete all data" subtitle="Cannot be undone" danger onClick={() => setConfirm(true)} />
      </div>
      <GroupLabel>Permissions</GroupLabel>
      <div className="list-card">
        <SwitchRow title="Health & fitness access" subtitle="Sleep, HR, HRV, workouts, nutrition" on onChange={() => showToast('Managed in system settings on device')} />
        <SwitchRow title="Notifications" subtitle="Local only" on onChange={() => showToast('Managed in system settings')} />
        <SwitchRow title="Analytics" subtitle="Always off in the community build" on={false} onChange={() => showToast('Analytics are disabled')} />
      </div>
      {confirm ? (
        <Sheet title="Delete all data?" subtitle="This removes the local dataset and resets the demo." onClose={() => setConfirm(false)}>
          <p className="body">Your profile, 60 days of health data, meals, workouts, chats and records will be removed from this device. This cannot be undone.</p>
          <button className="btn btn--block mt-20" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => { state.resetDemo(); setConfirm(false); showToast('All data reset'); }}>Delete everything</button>
          <button className="btn btn--soft btn--block mt-8" onClick={() => setConfirm(false)}>Cancel</button>
        </Sheet>
      ) : null}
    </>
  );
}

function ActivitySettings() {
  const state = useAppStore();
  const s = state.settings;
  const [status, setStatus] = useState<ActivityStatus>(s.activityStatus);
  const [note, setNote] = useState(s.activityStatusNote);
  return (
    <>
      <div className="status-options">
        {[
          ['active', 'Active', 'Training as planned', '🟢'],
          ['sick', 'Sick', 'Lower targets while you recover', '🤒'],
          ['injured', 'Injured', 'Strain limited, Target Strain hidden', '🩹'],
          ['break', 'On a Break', 'Pause training guidance', '🌴'],
        ].map(([value, label, desc, icon]) => (
          <button key={value} className={`status-option ${status === value ? 'status-option--active' : ''}`} onClick={() => setStatus(value as ActivityStatus)}>
            <span className="status-option__icon"><Glyph emoji={icon} size={20} /></span>
            <span className="grow"><span className="list-title">{label}</span><span className="list-sub">{desc}</span></span>
            {status === value ? <Check size={18} /> : null}
          </button>
        ))}
      </div>
      <div className="field-label" style={{ marginTop: 18 }}>Note</div>
      <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional context for your coach" />
      <button className="btn btn--block mt-20" onClick={() => { state.setActivityStatus(status, null, note); showToast('Activity status saved'); }}>Save</button>
      <p className="caption mt-12" style={{ lineHeight: 1.5 }}>Sick status may be set automatically by the sickness detector when overnight signals deviate sharply. Expiry returns you to Active.</p>
    </>
  );
}

function Language() {
  const languages = ['English (US)', 'Deutsch', 'Español', 'Français', 'Italiano', 'Nederlands', 'Polski', 'Português', 'Русский', 'Tiếng Việt', '日本語', '简体中文', '繁體中文'];
  const [selected, setSelected] = useState('English (US)');
  return (
    <>
      <div className="list-card">
        {languages.map((lang) => (
          <button key={lang} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setSelected(lang); showToast('Language saved · restart to apply'); }}>
            <div className="grow"><div className="list-title">{lang}</div></div>
            {selected === lang ? <Check size={18} style={{ color: 'var(--green-deep)' }} /> : null}
          </button>
        ))}
      </div>
      <p className="caption mt-12">Some changes may require restarting the app to take full effect.</p>
    </>
  );
}

function About() {
  return (
    <>
      <div className="card" style={{ textAlign: 'center', padding: 26 }}>
        <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--text)', color: 'var(--bg)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
          <BeneMark size={28} />
        </div>
        <div className="h2">Bene</div>
        <div className="caption mt-4">Version 0.1.1 · local-first build</div>
        <div className="row gap-6 mt-12" style={{ justifyContent: 'center' }}>
          <span className="pill pill--sm pill--flat"><Shield size={11} /> Local-first</span>
          <span className="pill pill--sm pill--flat">Noncommercial</span>
        </div>
      </div>
      <div className="list-card mt-16">
        <ListRow icon={<Info size={16} />} title="Scoring methodology" subtitle="docs/SCORING.md in the repository" onClick={() => showToast('Open docs/SCORING.md in the repo')} />
        <ListRow icon={<FileText size={16} />} title="Third-party licenses" subtitle="React, Capacitor, Inter, Lucide" onClick={() => showToast('See NOTICE.md for attribution')} />
        <ListRow icon={<Smartphone size={16} />} title="Native builds" subtitle="iOS and Android via Capacitor" onClick={() => showToast('Run npm run cap:ios / cap:android')} />
        <ListRow icon={<Globe size={16} />} title="Community" subtitle="Issues and discussions welcome" onClick={() => showToast('Add your repository URL before release')} />
      </div>
      <p className="caption mt-16" style={{ lineHeight: 1.6 }}>
        Bene is a local-first, source-available health app. Health estimates are for wellness only and are not medical advice. See NOTICE.md for
        third-party attribution and the full health disclaimer.
      </p>
    </>
  );
}
