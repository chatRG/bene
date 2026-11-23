import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronRight, Heart, Loader2, RefreshCw, Settings2, Smartphone } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ListRow } from './ui';
import { showToast } from './toast';
import { openSettings, platform, platformLabel, type HealthPlatform } from '../native/health';
import { connectAndImport, initialLink, probeAccess, readAndImport, statusWord, type HealthLink } from '../native/link';

/**
 * The one health-source card. Onboarding and Settings both mount this, so the
 * button, the status and the sentence under it can never drift apart.
 *
 * Four states, all read off the bridge:
 *   unavailable — no health store in this build (browser, or HK/HC off)
 *   denied      — the store exists but read access was not granted
 *   connected   — merged N real days, or an honest "store is empty"
 *   idle        — headless permission sheet failed; nothing imported
 */
export function HealthSourceCard({
  variant = 'settings',
  probe = false,
  onStateChange,
}: {
  variant?: 'settings' | 'onboarding';
  /** Check existing access on mount without prompting (Settings). */
  probe?: boolean;
  onStateChange?: (link: HealthLink) => void;
}) {
  const importHealthDays = useAppStore((s) => s.importHealthDays);
  const [link, setLink] = useState<HealthLink>(() => initialLink());
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const publish = useCallback(
    (next: HealthLink) => {
      setLink(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  useEffect(() => {
    mounted.current = true;
    if (probe && platform() !== 'unavailable') {
      probeAccess()
        .then((next) => mounted.current && publish(next))
        .catch(() => mounted.current && publish(initialLink()));
    }
    return () => {
      mounted.current = false;
    };
  }, [probe, publish]);

  const run = async (mode: 'connect' | 'sync') => {
    if (busy) return;
    setBusy(true);
    try {
      const next = mode === 'connect' ? await connectAndImport(importHealthDays) : await readAndImport(importHealthDays);
      if (!mounted.current) return;
      publish(next);
      if (next.phase === 'connected') {
        showToast(next.days ? `Imported ${next.days} ${next.days === 1 ? 'day' : 'days'}` : 'Connected — nothing to import yet');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const p: HealthPlatform = link.platform;
  const name = platformLabel(p);

  const pillClass = useMemo(() => {
    if (link.phase === 'connected') return 'pill pill--sm pill--green';
    if (link.phase === 'denied') return 'pill pill--sm pill--orange';
    return 'pill pill--sm pill--flat';
  }, [link.phase]);

  /* ---- the honest "no data invented" banner ---------------------------- */
  const bannerTone = link.phase === 'connected' && link.days > 0 ? 'insight-unlock insight-unlock--ok' : 'insight-unlock';
  const bannerIcon =
    link.phase === 'connected' && link.days > 0 ? <Check size={17} /> : link.phase === 'checking' ? <Loader2 size={17} className="spin" /> : <AlertCircle size={17} />;
  const bannerStrong =
    link.phase === 'unavailable'
      ? 'No health store on this device.'
      : link.phase === 'denied'
        ? 'Permission not granted.'
        : link.phase === 'connected'
          ? ''
          : link.phase === 'checking'
            ? 'Checking the health store…'
            : 'Not connected.';

  return (
    <div className="health-source">
      <div className={bannerTone} role="status" aria-live="polite">
        {bannerIcon}
        <span>
          {bannerStrong ? <strong>{bannerStrong}</strong> : null} {link.detail}
        </span>
      </div>

      {p === 'unavailable' ? null : (
        <div className="list-card mt-12">
          <ListRow
            icon={<Smartphone size={16} />}
            title={name}
            subtitle={link.phase === 'connected' ? 'Read on this device · read-only' : 'Sleep, HRV, resting heart rate, steps, workouts'}
            right={<span className={pillClass}>{statusWord(link)}</span>}
          />
        </div>
      )}

      {link.phase === 'unavailable' ? (
        <p className="caption mt-16" style={{ lineHeight: 1.6 }}>
          Bene runs on this browser with no health store behind it, so the connect action stays honest rather than pretending. On a phone
          it reads Apple Health on iOS and Health Connect on Android, straight from the device. Anything you log by hand is real, stored on
          this device, and needs no account.
        </p>
      ) : (
        <div className="health-source__actions">
          {link.phase === 'connected' ? (
            <button className="btn btn--soft btn--block" onClick={() => run('sync')} disabled={busy}>
              {busy ? <><Loader2 size={16} className="spin" /> Syncing…</> : <><RefreshCw size={16} /> Sync now</>}
            </button>
          ) : (
            <button className="btn btn--block" onClick={() => run('connect')} disabled={busy || link.phase === 'checking'}>
              {busy ? <><Loader2 size={16} className="spin" /> Reading…</> : <><Heart size={16} /> Connect {name}</>}
            </button>
          )}
          {p === 'health-connect' ? (
            <button
              className="btn btn--soft btn--block mt-8"
              onClick={() => {
                openSettings().catch(() => showToast('Could not open Health Connect settings'));
              }}
            >
              <Settings2 size={16} /> Open Health Connect settings
            </button>
          ) : null}
          {variant === 'settings' && link.syncedAt ? (
            <p className="caption mt-12" style={{ textAlign: 'center' }}>
              Last read {new Date(link.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A compact row for the Settings index that shows live state. */
export function HealthSourceRow({ onClick }: { onClick: () => void }) {
  const [link, setLink] = useState<HealthLink | null>(null);
  useEffect(() => {
    let live = true;
    probeAccess()
      .then((next) => live && setLink(next))
      .catch(() => live && setLink(initialLink()));
    return () => {
      live = false;
    };
  }, []);
  const subtitle = !link
    ? 'Apple Health and Health Connect · manual logs'
    : link.phase === 'connected'
      ? `${link.platformLabel} connected`
      : link.phase === 'unavailable'
        ? 'No health store · manual logs'
        : 'Not connected · manual logs';
  return <ListRow icon={<Heart size={16} />} title="Data sources" subtitle={subtitle} right={<ChevronRight size={17} className="chevron" />} onClick={onClick} />;
}
