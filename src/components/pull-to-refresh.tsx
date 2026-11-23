import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Pull the page down from the top to refetch.
 *
 * The gesture is only taken when the page is already scrolled to the very top,
 * so an ordinary scroll never turns into a refresh. While pulling, the move
 * listener calls preventDefault to keep the WebView's own overscroll out of the
 * way — it would rubber-band underneath the indicator and make the pull feel
 * like it is slipping.
 *
 * Native apps put this on a scroll container. Bene scrolls the document, so the
 * scroll position is read from the window and the content is translated
 * instead, which is the same visual result without restructuring every screen.
 */
const THRESHOLD = 64;
const MAX_PULL = 96;
/** Half the finger travel: a pull that tracks 1:1 feels weightless. */
const RESISTANCE = 0.5;

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const host = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const busyRef = useRef(false);
  const refreshRef = useRef(onRefresh);

  offsetRef.current = offset;
  busyRef.current = busy;
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;

    const start = (event: TouchEvent) => {
      if (busyRef.current || window.scrollY > 0) return;
      startY.current = event.touches[0].clientY;
      setDragging(true);
    };

    const move = (event: TouchEvent) => {
      if (startY.current === null || busyRef.current) return;

      const delta = event.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        startY.current = null;
        setDragging(false);
        setOffset(0);
        return;
      }

      event.preventDefault();
      setOffset(Math.min(MAX_PULL, delta * RESISTANCE));
    };

    const end = () => {
      if (startY.current === null) return;
      startY.current = null;
      setDragging(false);

      if (offsetRef.current < THRESHOLD) {
        setOffset(0);
        return;
      }

      setBusy(true);
      setOffset(THRESHOLD);
      void (async () => {
        try {
          await refreshRef.current();
        } finally {
          setBusy(false);
          setOffset(0);
        }
      })();
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);

    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, []);

  const progress = Math.min(1, offset / THRESHOLD);

  return (
    <div ref={host} className="ptr">
      <div
        className="ptr__indicator"
        style={{ height: offset, opacity: offset > 0 || busy ? 1 : 0 }}
        aria-hidden={offset === 0 && !busy}
      >
        <Loader2
          size={18}
          className={busy ? 'spin' : undefined}
          style={{
            opacity: busy ? 1 : progress,
            transform: busy ? undefined : `rotate(${offset * 2.4}deg)`,
          }}
        />
      </div>
      <div
        className="ptr__content"
        style={{
          transform: `translateY(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.22s var(--ease)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
