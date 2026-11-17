const MINUTE_MS = 60 * 1000;

/**
 * Compact "how long ago" for log times on Home: "Just now", "12m ago", "1h ago",
 * "1h 38m ago", "3d ago". Minutes are shown under 10h only when they matter (≥ 5m).
 */
export function formatAgo(elapsedMs: number): string {
  const mins = Math.max(0, Math.floor(elapsedMs / MINUTE_MS));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return h < 10 && m >= 5 ? `${h}h ${m}m ago` : `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
