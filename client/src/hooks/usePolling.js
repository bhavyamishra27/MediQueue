import { useEffect, useRef } from 'react';

/**
 * Runs `callback` on an interval while the page is visible.
 *
 * Phase 6 uses REST polling instead of Socket.IO (which arrives in Phase 9).
 * Polling pauses while the browser tab is hidden and refreshes immediately
 * when the patient comes back, so a returning tab never shows stale data.
 */
export function usePolling(callback, intervalMs, { enabled = true } = {}) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;

    let cancelled = false;

    const tick = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      callbackRef.current?.();
    };

    const timer = window.setInterval(tick, intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, intervalMs]);
}
