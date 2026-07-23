import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Builds the stable snooze key for a nudge — one entry per pet + slot pair. */
export function nudgeKey(petId: string, slotId: string) {
  return `${petId}:${slotId}`;
}

type NudgesContextValue = {
  /** Map of nudge key (`petId:slotId`) → epoch ms the snooze lasts until. */
  snoozes: Record<string, number>;
  snooze: (key: string, untilTimestamp: number) => void;
  isSnoozed: (key: string, now: Date) => boolean;
};

const NudgesContext = createContext<NudgesContextValue | null>(null);

/**
 * Global (in-memory) home for nudge snoozes, so dismissing a banner survives
 * tab switches and unmounts (D13). Persistence lands with the storage layer
 * in a later milestone.
 */
export function NudgesProvider({ children }: { children: ReactNode }) {
  const [snoozes, setSnoozes] = useState<Record<string, number>>({});

  const snooze = (key: string, untilTimestamp: number) => {
    setSnoozes((prev) => ({ ...prev, [key]: untilTimestamp }));
  };

  const isSnoozed = (key: string, now: Date) => (snoozes[key] ?? 0) > now.getTime();

  const value = useMemo(() => ({ snoozes, snooze, isSnoozed }), [snoozes]);

  return <NudgesContext.Provider value={value}>{children}</NudgesContext.Provider>;
}

export function useNudges() {
  const ctx = useContext(NudgesContext);
  if (!ctx) throw new Error('useNudges must be used within a NudgesProvider');
  return ctx;
}
