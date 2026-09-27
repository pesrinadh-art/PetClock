/**
 * PawClock design tokens (Phase-1 redesign foundation).
 *
 * Values lifted directly from the approved redesign HTML (screen_2a / 2b …).
 * The design's restraint principle: liveliness comes from a progress ring, soft
 * depth and a paw watermark — NOT from more colour. Colour carries ROLE, not
 * decoration:
 *   green      = pet & state         terracotta = food
 *   amber      = attention           + incidental tints (pee blue, poo brown)
 *
 * BACK-COMPAT: the `colors` object still exposes every key the current screens
 * import (sage, food, apptVet, stone, cream …) so the app keeps compiling.
 * Those aliases now point at the redesign palette; screen agents migrate call
 * sites to the named role tokens below over Phase 2.
 */

// ── Surfaces ────────────────────────────────────────────────────────────────
export const surface = {
  app: '#faf7f0', // screen background
  card: '#ffffff', // cards / sheets content
  tabBar: '#fffdf8', // bottom bar + glass headers
  chip: '#f2ede1', // round icon buttons / chips
  chipAlt: '#f0ebdf', // slightly warmer chip (settings back button)
  field: '#f7f4ec', // inset input / value wells
  sheet: '#2a2724', // dimmed scrim behind a modal sheet
} as const;

// ── Hairlines / borders ───────────────────────────────────────────────────────
export const line = {
  hairline: '#f1ece0', // in-card dividers
  border: '#ece6d9', // tab bar / chip outlines
  dashed: '#d8d1c2', // dashed "add …" affordances
  divider: '#e7e0d1', // "or" separators
} as const;

// ── Ink (text) ────────────────────────────────────────────────────────────────
// Pet-owner redesign: muted/faint were darkened so every text role clears WCAG
// AA (4.5:1) on both `surface.app` and white. `placeholder` is for input
// placeholders / disabled glyphs only (not body copy).
export const ink = {
  primary: '#2a2724', // ~14:1
  muted: '#6f685d', // ~5.1:1 — secondary copy, subtitles
  faint: '#776f63', // ~4.6:1 — labels, timestamps
  faint2: '#7a7266', // ~4.4:1 app bg / 4.7:1 white — inset field labels
  placeholder: '#a39b8c', // placeholders + chevrons ONLY
  onDark: '#ffffff',
  onDarkMuted: 'rgba(255,255,255,0.82)',
} as const;

// ── Green — pet & state (primary brand) ───────────────────────────────────────
export const green = {
  primary: '#2f6b45', // headings, focused tab, "See all"
  mid: '#417a55', // FAB, primary buttons, active toggle
  gradientFrom: '#4b8a60',
  gradientTo: '#356b48',
  tint: '#e8efe6', // green pill background
  tintBorder: '#cfe0cd',
  ink: '#2f6b45',
  /** Pale wash behind a "win" / celebratory card. */
  wash: '#f1f6ef',
} as const;

// ── Terracotta — food ─────────────────────────────────────────────────────────
export const terracotta = {
  primary: '#c9532f', // fills, icons
  tint: '#fbe9e1',
  ink: '#a8432a', // text on white/tint (AA)
  tintBorder: '#f3d3c5',
} as const;

// ── Amber — attention (bell dot, warnings) ────────────────────────────────────
export const amber = {
  primary: '#e8a33d',
  warnBg: '#fdf3e3', // "Not secured" / pending pill bg
  warnInk: '#8a5d14', // AA on warnBg (was #a8741f)
  warnBorder: '#f5dfb8',
  /** Warm gold used for the hero progress ring + "win" sparkles. */
  gold: '#f3d27a',
} as const;

// ── Incidental log tints (pee / poo) ──────────────────────────────────────────
export const logTint = {
  peeBg: '#e6f0f6',
  peeInk: '#2f6483',
  pooBg: '#f3ece3',
  pooInk: '#7a5c3c',
} as const;

// ── Appointment / category roles (from sheet + appt screens) ──────────────────
export const category = {
  vetBg: '#eaf1f7',
  vetInk: '#2f6a8f',
  vaccineBg: '#e9f4f1',
  vaccineInk: '#2d6e62',
  groomBg: '#f1ecf6',
  groomInk: '#6c528c',
  otherBg: '#f2efe6',
  otherInk: '#6b6457',
  // meal slots
  breakfastBg: '#fdf0e2',
  breakfastInk: '#8f5e12',
  dinnerBg: '#eceaf6',
  dinnerInk: '#5f5b96',
  // medication
  medBg: '#eaf1f7',
  medInk: '#2f6a8f',
} as const;

// ── Radii ─────────────────────────────────────────────────────────────────────
export const radius = {
  hero: 22, // hero gradient card
  card: 18, // standard card
  sheet: 26, // bottom sheet top corners
  tile: 14, // quick-log tiles / buttons
  iconTile: 12, // 34px rounded icon tiles
  iconTileSm: 10, // 28-30px icon tiles
  pill: 999,
  button: 16, // primary / secondary buttons
  // back-compat with existing screens
  lg: 20,
  sm: 12,
} as const;

/**
 * Elevation. RN can only render a single shadow, so these approximate the
 * design's tight top-lit shadows. `card` ≈ `0 4px 14px -10px rgba(42,39,36,.45)`,
 * `hero` ≈ `0 10px 24px -14px rgba(53,107,72,.9)`.
 */
export const shadow = {
  card: {
    shadowColor: '#2a2724',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },
  hero: {
    shadowColor: '#356b48',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  fab: {
    shadowColor: '#417a55',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 8,
  },
  sm: {
    shadowColor: '#2a2724',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

// ── Spacing scale (4pt) ─────────────────────────────────────────────────────
/**
 * Pet-owner redesign spacing. Screens use `space.gutter` (20) for side padding,
 * `space.section` (24) between sections, `space.lg` (16) inside cards.
 */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 28,
  gutter: 20, // screen side padding
  section: 24, // gap between stacked sections
  /** Bottom padding for a tab screen's scroll content so the last card clears the tab bar + FAB. */
  tabScrollBottom: 120,
} as const;

// ── Tap targets ───────────────────────────────────────────────────────────────
/** Minimum sizes. Every tappable thing is >= `min` (48); primary CTAs use `primary`. */
export const tap = {
  min: 48,
  primary: 56,
  icon: 44, // round icon chips (plus hitSlop to reach 48+)
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

// ── Tones (colour-by-role presets) ────────────────────────────────────────────
/**
 * One place to look up a role's bg / ink / border / solid colour. Primitives
 * that take `tone` (Pill, Banner, Button, QuickActionTile, IconTile) read this.
 *   pet      = green (state, primary actions, wins)
 *   food     = terracotta (meals)
 *   attention= amber (due / overdue — gentle, never red)
 *   pee/poo  = incidental log tints
 *   vet/vaccine/groom/med/other = appointment + medication categories
 *   neutral  = warm chip grey
 */
export type Tone =
  | 'pet'
  | 'food'
  | 'attention'
  | 'pee'
  | 'poo'
  | 'vet'
  | 'vaccine'
  | 'groom'
  | 'med'
  | 'other'
  | 'neutral';

export const tones: Record<Tone, { bg: string; ink: string; border: string; solid: string }> = {
  pet: { bg: green.tint, ink: green.primary, border: green.tintBorder, solid: green.mid },
  food: { bg: terracotta.tint, ink: terracotta.ink, border: terracotta.tintBorder, solid: terracotta.primary },
  attention: { bg: amber.warnBg, ink: amber.warnInk, border: amber.warnBorder, solid: amber.primary },
  pee: { bg: logTint.peeBg, ink: logTint.peeInk, border: '#cfe0eb', solid: logTint.peeInk },
  poo: { bg: logTint.pooBg, ink: logTint.pooInk, border: '#e6d9c8', solid: logTint.pooInk },
  vet: { bg: category.vetBg, ink: category.vetInk, border: '#d3e2ee', solid: category.vetInk },
  vaccine: { bg: category.vaccineBg, ink: category.vaccineInk, border: '#cfe6df', solid: category.vaccineInk },
  groom: { bg: category.groomBg, ink: category.groomInk, border: '#e0d6ec', solid: category.groomInk },
  med: { bg: category.medBg, ink: category.medInk, border: '#d3e2ee', solid: category.medInk },
  other: { bg: category.otherBg, ink: category.otherInk, border: line.border, solid: category.otherInk },
  neutral: { bg: surface.chip, ink: ink.muted, border: line.border, solid: ink.primary },
};

/**
 * `colors` — the flat map the whole app imports today. New role tokens live at
 * the top; the block below preserves every legacy key (now re-pointed at the
 * redesign palette) so nothing breaks before screens migrate.
 */
export const colors = {
  // new role tokens (mirror the grouped exports above)
  appBg: surface.app,
  card: surface.card,
  tabBar: surface.tabBar,
  chip: surface.chip,
  field: surface.field,
  hairline: line.hairline,
  border: line.border,
  dashed: line.dashed,

  inkPrimary: ink.primary,
  inkMuted: ink.muted,
  inkFaint: ink.faint,
  inkFaint2: ink.faint2,
  inkPlaceholder: ink.placeholder,

  green: green.primary,
  greenMid: green.mid,
  greenTint: green.tint,
  greenGradientFrom: green.gradientFrom,
  greenGradientTo: green.gradientTo,

  terracotta: terracotta.primary,
  terracottaTint: terracotta.tint,
  terracottaInk: terracotta.ink,

  amber: amber.primary,
  amberWarnBg: amber.warnBg,
  amberWarnInk: amber.warnInk,

  peeBg: logTint.peeBg,
  peeInk: logTint.peeInk,
  pooBg: logTint.pooBg,
  pooInk: logTint.pooInk,

  // ── legacy aliases (kept so existing screens compile) ──
  sage: green.primary,
  sageLight: green.mid,
  sagePale: green.tint,
  pee: logTint.peeInk,
  poo: logTint.pooInk,
  pooLight: '#C4845A',
  food: terracotta.primary,
  foodLight: terracotta.tint,
  apptVet: category.vetInk,
  apptVetLight: category.vetBg,
  apptGroom: category.groomInk,
  apptGroomLight: category.groomBg,
  apptVaccine: category.vaccineInk,
  apptVaccineLight: category.vaccineBg,
  apptOther: category.otherInk,
  apptOtherLight: category.otherBg,
  medicine: category.medInk,
  medicineLight: category.medBg,
  cream: surface.app,
  stone: ink.primary,
  stoneMid: ink.muted,
  stoneLight: '#C8C3BA',
  white: '#FFFFFF',
  background: surface.app,
} as const;
