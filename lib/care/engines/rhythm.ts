/**
 * Rhythm engine — "the next occurrence of something that repeats every N hours".
 *
 * `nextRepeating` and `bufferMsFor` are extracted VERBATIM from lib/petSchedule.ts (which now
 * imports them from here), so the potty prediction is byte-for-byte what it was. The buffer
 * fraction and clamp are parameters a module supplies; their defaults are today's potty values,
 * which are also what app.recompute_prediction hard-codes on the server — a module that wants
 * different values must not be the potty module.
 *
 * Never roll a missed prediction forward (CLAUDE.md, Δ7): `nextRepeating` steps at most one
 * interval past the anchor and reports `overdueBy` instead.
 */

const HOUR_MS = 60 * 60 * 1000;

export type RepeatingPrediction = { predicted: Date; overdueBy: number };

/**
 * Finds the next occurrence of an event repeating every `intervalHours`, anchored to `anchor`.
 * Steps at most one interval past the anchor — a prediction whose time has already passed stays
 * put and reports `overdueBy` (ms past predicted, 0 when still ahead) rather than silently
 * rolling forward to the following interval and masking the miss.
 */
export function nextRepeating(anchor: Date, intervalHours: number, now: Date): RepeatingPrediction {
  const intervalMs = intervalHours * HOUR_MS;
  const predicted =
    anchor.getTime() > now.getTime() ? new Date(anchor) : new Date(anchor.getTime() + intervalMs);
  return { predicted, overdueBy: Math.max(0, now.getTime() - predicted.getTime()) };
}

/** The uncertainty-window shape: a fraction of the interval, clamped to [min, max] minutes. */
export type BufferSpec = { fraction: number; minMinutes: number; maxMinutes: number };

/** Today's potty buffer (and the server's): ~15% of the hold, clamped to 10–45 min. */
export const POTTY_BUFFER: BufferSpec = { fraction: 0.15, minMinutes: 10, maxMinutes: 45 };

/** Uncertainty window around a predicted hold-time break: ~15% of the hold duration, clamped to 10-45 min. */
export function bufferMsFor(holdHours: number, spec: BufferSpec = POTTY_BUFFER): number {
  const minutes = Math.min(spec.maxMinutes, Math.max(spec.minMinutes, Math.round(holdHours * 60 * spec.fraction)));
  return minutes * 60 * 1000;
}
