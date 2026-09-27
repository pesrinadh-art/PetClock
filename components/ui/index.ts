// PawClock design-system primitives (pet-owner redesign foundation).
// Import from here: `import { Card, HeroCard, ListRow, Button } from '../components/ui';`

// Surfaces & structure
export { Card } from './Card';
export { HeroCard, type Stat } from './HeroCard';
export { StatGroup } from './StatGroup';
export { GlassSurface } from './GlassSurface';
export { Screen, StickyFooter } from './Screen';

// Headers & headings
export { PetGreeting } from './PetGreeting';
export { ScreenHeader } from './ScreenHeader';
export { SectionLabel } from './SectionLabel';

// Rows, badges, feedback
export { ListRow } from './ListRow';
export { Pill } from './Pill';
export { IconTile } from './IconTile';
export { Banner } from './Banner';
export { ProgressBar } from './ProgressBar';
export { PetEmptyState } from './PetEmptyState';

// Actions & inputs
export { Button, type ButtonVariant } from './Button';
export { IconButton } from './IconButton';
export { QuickActionTile } from './QuickActionTile';
export { ChoiceChip, ChoiceChipRow } from './ChoiceChip';
export { TextField } from './TextField';

// Haptics (no-op on web)
export { tapFeedback, successFeedback } from './haptics';
