/** "Mochi" · "Mochi & Luna" · "Mochi, Luna & Peanut" — for headers and hero titles. */
export function joinPetNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}
