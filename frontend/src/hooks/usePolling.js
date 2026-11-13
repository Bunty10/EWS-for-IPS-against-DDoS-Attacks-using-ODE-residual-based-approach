import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../api/ews';

// Generic "fetch on mount + poll every N ms" hook, used by the Dashboard and the
// Live Monitor so their views track live-capture results without manual refresh.
// Pass enabled=false to pause polling (e.g. once analysis is done).
export default function usePolling(fetcher, intervalMs = 3000, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const savedFetcher = useRef(fetcher);
  savedFetcher.current = fetcher;

  const tick = useCallback(async () => {
    try {
      const d = await savedFetcher.current();
      setData(d);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [tick, intervalMs, enabled]);

  return { data, error, loading, refresh: tick };
}
