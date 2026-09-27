import type { Tone } from '../../theme/colors';
import type { IconName } from '../Icon';
import type { LogType } from '../../data/mockData';

/** Drawn icon + role tone per log type (used by the diary and the Timeline). */
const LOG_VISUAL: Record<LogType, { icon: IconName; tone: Tone }> = {
  pee: { icon: 'drop', tone: 'pee' },
  poo: { icon: 'poo', tone: 'poo' },
  food: { icon: 'bowl', tone: 'food' },
  medication: { icon: 'pill', tone: 'med' },
  vet: { icon: 'vet', tone: 'vet' },
  other: { icon: 'paw', tone: 'pet' },
};

export function logVisual(type: LogType | string): { icon: IconName; tone: Tone } {
  return LOG_VISUAL[type as LogType] ?? LOG_VISUAL.other;
}
