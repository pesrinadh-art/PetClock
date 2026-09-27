import type { Tone } from '../theme/colors';
import { formatClock } from '../lib/petSchedule';
import type { ScheduleRowItem } from '../lib/petSchedule';
import { Button, ListRow, Pill } from './ui';
import type { IconName } from './Icon';

/** A drawn icon for a meal/med row, picked from its name (the stored `icon` is an emoji). */
function iconFor(item: ScheduleRowItem, fallback: IconName): IconName {
  const n = item.name.toLowerCase();
  if (n.includes('breakfast') || n.includes('brunch')) return 'sunrise';
  if (n.includes('lunch')) return 'sun';
  if (n.includes('dinner') || n.includes('supper')) return 'moon';
  return fallback;
}

/**
 * One meal or medication row on a pet's plan: tone icon tile, name, "Around
 * 8:00 AM", and on the right either a green "Done" pill, a solid "Log it"
 * button (due now), or a quieter "Mark fed" button (later today). Rows without
 * `onLogNow` (meds) show a status pill only. Meant to sit inside a <Card>.
 */
export function ScheduleRow({
  item,
  tone = 'food',
  fallbackIcon = 'bowl',
  onLogNow,
  logAccessibilityLabel,
  logLabel = 'Mark fed',
  divider = false,
}: {
  item: ScheduleRowItem;
  tone?: Tone;
  fallbackIcon?: IconName;
  /**
   * One-tap logging for rows that aren't done yet — shown on both 'due' and 'upcoming' rows.
   * Once a covering log lands the row flips to "Done".
   */
  onLogNow?: () => void;
  /** aria-label for the mark-done control, e.g. "Mark Dinner as fed for Biscuit". */
  logAccessibilityLabel?: string;
  logLabel?: string;
  divider?: boolean;
}) {
  const done = item.status === 'done';
  const due = item.status === 'due';
  const canLog = !done && !!onLogNow;

  let right: React.ReactNode;
  if (done) {
    right = <Pill tone="pet" icon="check" label="Done" />;
  } else if (canLog) {
    right = (
      <Button
        label={due ? 'Log it' : logLabel}
        icon={due ? 'check' : undefined}
        tone={tone}
        variant={due ? 'primary' : 'soft'}
        size="md"
        onPress={onLogNow}
        accessibilityLabel={logAccessibilityLabel ?? `Mark ${item.name} as done`}
      />
    );
  } else if (due) {
    right = <Pill tone="attention" icon="clock" label="Due now" />;
  } else {
    right = <Pill tone="neutral" label="Later" />;
  }

  return (
    <ListRow
      icon={iconFor(item, fallbackIcon)}
      tone={done ? 'pet' : tone}
      title={item.name}
      subtitle={done ? `All done · usually ${formatClock(item.time)}` : `Around ${formatClock(item.time)}`}
      right={right}
      divider={divider}
    />
  );
}
