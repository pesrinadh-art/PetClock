/**
 * petVoice — pure copy helpers that make the UI talk about the owner's pet.
 *
 * PURE FUNCTIONS ONLY: no React, no context, no repo. Everything is derived
 * from fields that already exist on a Pet (name, species, breed, birthdate)
 * plus a `now` Date the caller passes in (use `useNow()` in screens so the
 * copy re-renders as time passes).
 *
 * Voice rules (see the design brief): warm, short, pet-first, never guilt-y.
 * Overdue = "a little late", not "OVERDUE". Celebrate small wins.
 */

/** Species union mirrored locally (kept structural so this file imports nothing). */
export type VoiceSpecies =
  | 'dog'
  | 'cat'
  | 'rabbit'
  | 'hamster'
  | 'bird'
  | 'turtle'
  | 'snake'
  | 'fish'
  | 'other';

type PetLike = { name: string; species?: string | null; breed?: string | null; birthdate?: string | null };

function asSpecies(species: string | null | undefined): VoiceSpecies {
  switch (species) {
    case 'dog':
    case 'cat':
    case 'rabbit':
    case 'hamster':
    case 'bird':
    case 'turtle':
    case 'snake':
    case 'fish':
      return species;
    default:
      return 'other';
  }
}

// ── Names ────────────────────────────────────────────────────────────────────

/** "Mochi" -> "Mochi's", "Gus" -> "Gus'". Empty/blank -> "your pet's". */
export function possessive(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return "your pet's";
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

/** Joins pet names naturally: ["Mochi"] -> "Mochi", ["A","B"] -> "A & B", 3+ -> "A, B & C". */
export function joinNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return 'your pets';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} & ${clean[clean.length - 1]}`;
}

// ── Time of day ──────────────────────────────────────────────────────────────

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(now: Date = new Date()): DayPart {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

/** "Good morning" / "Good afternoon" / "Good evening" / "Late night check-in". */
export function greeting(now: Date = new Date()): string {
  switch (dayPart(now)) {
    case 'morning':
      return 'Good morning';
    case 'afternoon':
      return 'Good afternoon';
    case 'evening':
      return 'Good evening';
    default:
      return 'Late-night check-in';
  }
}

/** Title for the home hero: "Mochi's day" (or "Mochi's night" late at night). */
export function petDayTitle(name: string, now: Date = new Date()): string {
  return dayPart(now) === 'night' ? `${possessive(name)} night` : `${possessive(name)} day`;
}

// ── Species vocabulary ───────────────────────────────────────────────────────

/** Friendly noun: dog -> "pup", cat -> "kitty", fallback "pet". */
export function speciesNoun(species: string | null | undefined): string {
  switch (asSpecies(species)) {
    case 'dog':
      return 'pup';
    case 'cat':
      return 'kitty';
    case 'rabbit':
      return 'bunny';
    case 'hamster':
      return 'hammy';
    case 'bird':
      return 'birdie';
    case 'turtle':
      return 'shell-buddy';
    case 'fish':
      return 'fishy';
    default:
      return 'pet';
  }
}

/** Plain species label for meta lines: "Dog", "Cat", "Pet". */
export function speciesLabel(species: string | null | undefined): string {
  const s = asSpecies(species);
  if (s === 'other') return 'Pet';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A tiny flavour word for celebrations: dog "Woof!", cat "Purrfect!", else "Yay!". */
export function speciesCheer(species: string | null | undefined): string {
  switch (asSpecies(species)) {
    case 'dog':
      return 'Woof!';
    case 'cat':
      return 'Purrfect!';
    case 'rabbit':
      return 'Hop hop!';
    case 'bird':
      return 'Tweet!';
    default:
      return 'Yay!';
  }
}

/** Where potty happens: dog "walk", cat/rabbit/hamster "litter box", else "potty". */
export function pottyPlace(species: string | null | undefined): string {
  switch (asSpecies(species)) {
    case 'dog':
      return 'walk';
    case 'cat':
    case 'rabbit':
      return 'litter box';
    case 'hamster':
      return 'cage';
    default:
      return 'potty';
  }
}

/**
 * The owner's natural phrase for a potty break.
 * dog -> "potty walk", cat -> "litter box trip", else "potty break".
 */
export function pottyBreakPhrase(species: string | null | undefined): string {
  switch (asSpecies(species)) {
    case 'dog':
      return 'potty walk';
    case 'cat':
    case 'rabbit':
      return 'litter box trip';
    default:
      return 'potty break';
  }
}

/** The question on the quick-log card: "Did Mochi go?" */
export function didPetGo(name: string): string {
  return `Did ${name.trim() || 'your pet'} go?`;
}

/** "Time for Mochi's dinner" / "Time for Mochi's walk". */
export function timeFor(name: string, what: string): string {
  return `Time for ${possessive(name)} ${what}`;
}

// ── Age / birthday ───────────────────────────────────────────────────────────

/** "3 yrs", "7 mos", "5 wks", or null when the birthdate is missing/invalid/future. */
export function friendlyAge(birthdate: string | null | undefined, now: Date = new Date()): string | null {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime()) || b.getTime() > now.getTime()) return null;
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months >= 24) return `${Math.floor(months / 12)} yrs`;
  if (months >= 12) return '1 yr';
  if (months >= 2) return `${months} mos`;
  const weeks = Math.floor((now.getTime() - b.getTime()) / (7 * 24 * 3600 * 1000));
  if (weeks >= 1) return `${weeks} wk${weeks === 1 ? '' : 's'}`;
  return 'Newborn';
}

/** True when today is the pet's birthday (month + day match). */
export function isBirthday(birthdate: string | null | undefined, now: Date = new Date()): boolean {
  if (!birthdate) return false;
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return false;
  return b.getMonth() === now.getMonth() && b.getDate() === now.getDate();
}

/** Meta line: "Shiba Inu · 3 yrs" / "Cat · 7 mos" / "Dog". */
export function petMeta(pet: PetLike, now: Date = new Date()): string {
  const first = pet.breed?.trim() || speciesLabel(pet.species);
  const age = friendlyAge(pet.birthdate, now);
  return age ? `${first} · ${age}` : first;
}

// ── Relative time ────────────────────────────────────────────────────────────

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Past: "just now", "12 min ago", "2h ago", "yesterday", "3 days ago". */
export function friendlyAgo(when: Date | string | number, now: Date = new Date()): string {
  const t = new Date(when).getTime();
  const diff = now.getTime() - t;
  if (!Number.isFinite(diff)) return '';
  if (diff < 0) return friendlyIn(when, now);
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} min ago`;
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    const m = Math.floor((diff % HOUR) / MIN);
    return m >= 10 && h < 3 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/** Future: "any minute", "in 20 min", "in 2h 15m", "tomorrow", "in 3 days". */
export function friendlyIn(when: Date | string | number, now: Date = new Date()): string {
  const t = new Date(when).getTime();
  const diff = t - now.getTime();
  if (!Number.isFinite(diff)) return '';
  if (diff <= 0) return friendlyAgo(when, now);
  if (diff < 2 * MIN) return 'any minute';
  if (diff < HOUR) return `in ${Math.round(diff / MIN)} min`;
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    const m = Math.round((diff % HOUR) / MIN);
    return m > 0 && h < 6 ? `in ${h}h ${m}m` : `in ${h}h`;
  }
  const days = Math.round(diff / DAY);
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * Gentle lateness copy (NEVER alarming). `minutesLate` <= 0 returns "right on time".
 * 1-14 -> "a few minutes late", 15-59 -> "a little late", 60+ -> "running late".
 */
export function gentleLate(minutesLate: number): string {
  if (minutesLate <= 0) return 'right on time';
  if (minutesLate < 15) return 'a few minutes late';
  if (minutesLate < 60) return 'a little late';
  return 'running late';
}

// ── Encouragement ────────────────────────────────────────────────────────────

/**
 * Warm line after a log: "Nice! Mochi's potty walk is logged." Uses the
 * species cheer so it feels like the pet, not a database.
 */
export function loggedLine(
  pet: PetLike,
  what: 'pee' | 'poo' | 'both' | 'food' | 'medication' | string,
): string {
  const name = pet.name?.trim() || 'your pet';
  const cheer = speciesCheer(pet.species);
  switch (what) {
    case 'pee':
      return `${cheer} Pee logged for ${name}.`;
    case 'poo':
      return `${cheer} Poo logged for ${name}.`;
    case 'both':
      return `${cheer} ${possessive(name)} ${pottyBreakPhrase(pet.species)} is logged.`;
    case 'food':
      return `Yum! ${name} has been fed.`;
    case 'medication':
      return `Done — ${possessive(name)} meds are logged.`;
    default:
      return `Logged for ${name}.`;
  }
}

/**
 * A short, positive progress line for "N of M done" (meals, meds, tasks).
 * 0 of M -> "Nothing yet — you've got this", all -> "All done today!".
 */
export function progressLine(done: number, total: number): string {
  if (total <= 0) return 'Nothing scheduled';
  if (done >= total) return 'All done today!';
  if (done === 0) return "Nothing yet — you've got this";
  if (total - done === 1) return 'Just one to go';
  return `${done} of ${total} done`;
}

/** Streak copy: 0 -> null, 1 -> "First day!", n -> "3-day streak". */
export function streakLine(days: number): string | null {
  if (days <= 0) return null;
  if (days === 1) return 'First day!';
  return `${days}-day streak`;
}
