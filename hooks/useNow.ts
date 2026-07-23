import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Returns the current time, re-rendering the consumer every `intervalMs`
 * and whenever the app returns to the foreground — so time-derived UI
 * (countdowns, "x min ago" labels, due states) never freezes. (D2)
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [intervalMs]);

  return now;
}
