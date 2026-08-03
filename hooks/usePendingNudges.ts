import { useCallback, useEffect, useState } from 'react';
import type { FeedTime, LogEntry, Medication, Pet } from '../lib/db/models';
import { logYes, REASK_NO_MS, snoozeNudge, SNOOZE_15_MS } from '../lib/notifications/actions';
import { computePendingNudges, type PendingNudge } from '../lib/notifications/pending';
import { getActiveSnoozes, type SnoozeMap } from '../lib/notifications/snoozeStore';

/**
 * Shared plumbing for the in-app nudge surfaces (NudgeBanner + Notification Center): derive the
 * currently-due nudges from PREDICTION data and answer them through the SAME shared action logic
 * the headless notification handler uses (`logYes` / `snoozeNudge`). The only in-app difference is
 * provenance — a Yes here is `'manual'` (no push produced it) — and that answered/snoozed nudges
 * re-derive off the repo subscription (a new log) and the persisted snooze store.
 */
export function usePendingNudges(
  pets: Pet[],
  feedTimes: FeedTime[],
  medications: Medication[],
  logs: LogEntry[],
  now: Date,
): {
  nudges: PendingNudge[];
  onYes: (nudge: PendingNudge) => void;
  onNotYet: (nudge: PendingNudge) => void;
  onSnooze: (nudge: PendingNudge) => void;
} {
  const [snoozes, setSnoozes] = useState<SnoozeMap>({});

  const refreshSnoozes = useCallback(() => {
    getActiveSnoozes(Date.now())
      .then(setSnoozes)
      .catch(() => {
        /* best-effort — an empty map only risks briefly re-showing a snoozed nudge */
      });
  }, []);

  // Refresh on mount and on every `now` tick, so elapsed snoozes drop off and a snooze written by
  // the headless handler (partner's phone, background action) is reflected in-app.
  useEffect(() => {
    refreshSnoozes();
  }, [refreshSnoozes, now]);

  const nudges = computePendingNudges(pets, feedTimes, medications, logs, now, snoozes);

  const onYes = useCallback(
    (nudge: PendingNudge) => {
      // In-app "Yes" means it happened now — log at now so the prediction advances and the
      // nudge clears (logging at the stale predicted time leaves an overdue break still "due").
      void logYes(nudge.data, 'manual', new Date().toISOString()).then(refreshSnoozes);
    },
    [refreshSnoozes],
  );

  const onNotYet = useCallback(
    (nudge: PendingNudge) => {
      void snoozeNudge(nudge.data, Date.now() + REASK_NO_MS).then(refreshSnoozes);
    },
    [refreshSnoozes],
  );

  const onSnooze = useCallback(
    (nudge: PendingNudge) => {
      void snoozeNudge(nudge.data, Date.now() + SNOOZE_15_MS).then(refreshSnoozes);
    },
    [refreshSnoozes],
  );

  return { nudges, onYes, onNotYet, onSnooze };
}
