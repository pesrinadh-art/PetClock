import { Card, ListRow } from '../ui';
import type { Pet } from '../../lib/db/models';
import { carePlanSummary } from './goals';

/**
 * The pet profile's "Care plan" row: which care modules the pet gets help with, worded for its
 * species. Tapping it opens the wizard at the Goals step (the caller supplies `onPress`).
 */
export function CarePlanRow({ pet, onPress }: { pet: Pet; onPress: () => void }) {
  return (
    <Card>
      <ListRow icon="sparkle" iconLarge title="Goals" subtitle={carePlanSummary(pet)} showChevron onPress={onPress} />
    </Card>
  );
}
