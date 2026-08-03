// Realistic default times for empty TimePickerField instances, in the same
// "h:mm AM/PM" display format the picker's slots use. These only position the
// list on open — they never pre-fill a field. Plain module, no React.

export const BREAKFAST = '8:00 AM';
export const LUNCH = '12:00 PM';
export const DINNER = '6:00 PM';
export const MED_MORNING = '8:00 AM';
export const MED_EVENING = '8:00 PM';

// Suggested feed time for the Nth feeding slot (0-based).
export function defaultFeedTime(index: number): string {
  switch (index) {
    case 0:
      return BREAKFAST; // first feeding of the day
    case 1:
      return DINNER; // evening feeding
    case 2:
      return LUNCH; // midday feeding
    default:
      return BREAKFAST;
  }
}
