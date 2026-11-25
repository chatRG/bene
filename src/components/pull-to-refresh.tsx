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
  onSwipe,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  onSwipe?: (direction: 'left' | 'right') => void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const host = useRef<HTMLDivElement | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const axis = useRef<'pending' | 'horizontal' | 'vertical'>('pending');
  const busyRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  const swipeRef = useRef(onSwipe);

  busyRef.current = busy;
  refreshRef.current = onRefresh;
  swipeRef.current = onSwipe;

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;

    const reset = () => {
      startX.current = null;
      startY.current = null;
      axis.current = 'pending';
    };

    const start = (event: TouchEvent) => {
      if (busyRef.current || (!swipeRef.current && window.scrollY > 0)) return;
      const target = event.target;
      if (target instanceof Element && target.closest('[role="dialog"], .sheet-backdrop, input, textarea, select')) return;
      const touch = event.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      lastX.current = touch.clientX;
      lastY.current = touch.clientY;
      axis.current = 'pending';
    };

    const move = (event: TouchEvent) => {
      if (startY.current === null || startX.current === null || busyRef.current) return;
      const touch = event.touches[0];
      lastX.current = touch.clientX;
      lastY.current = touch.clientY;
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      if (axis.current === 'pending') {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
        axis.current = swipeRef.current && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'horizontal' : 'vertical';
      }

      if (axis.current === 'horizontal') {
        // Own the horizontal gesture before a card's synthetic click or the
        // WebView's navigation gesture can claim it.
        event.preventDefault();
        return;
      }

      if (dy <= 0 || window.scrollY > 0) {
        reset();
        setOffset(0);
        return;
      }
      event.preventDefault();
      setOffset(Math.min(MAX_PULL, dy * RESISTANCE));
    };

    const end = () => {
      if (startY.current === null || startX.current === null) return;
      const dx = lastX.current - startX.current;
      const dy = lastY.current - startY.current;
      const horizontal = axis.current === 'horizontal';
      reset();

      if (horizontal) {
        setOffset(0);
        if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy)) {
          swipeRef.current?.(dx < 0 ? 'left' : 'right');
        }
        return;
      }

      if (Math.min(MAX_PULL, dy * RESISTANCE) < THRESHOLD) {
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

    const cancel = () => {
      reset();
      setOffset(0);
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', cancel);

    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
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
      >
        {children}
      </div>
    </div>
  );
}
