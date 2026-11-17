/** The pet kinds offered when adding a pet; the emoji doubles as the default avatar. */
export const AVATAR_OPTIONS = ['🐶', '🐱', '🐰', '🐹', '🐦', '🐢', '🐍', '🐠'] as const;

export const AVATAR_LABELS: Record<string, string> = {
  '🐶': 'Dog',
  '🐱': 'Cat',
  '🐰': 'Rabbit',
  '🐹': 'Hamster',
  '🐦': 'Bird',
  '🐢': 'Turtle',
  '🐍': 'Snake',
  '🐠': 'Fish',
};

/** "Dog", "Cat", … for a pet's avatar emoji, or null when it isn't one of the offered kinds. */
export function kindLabel(avatarEmoji: string): string | null {
  return AVATAR_LABELS[avatarEmoji] ?? null;
}
