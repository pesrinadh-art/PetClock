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
export const ink = {
  primary: '#2a2724',
  muted: '#8a8276',
  faint: '#9a9184',
  faint2: '#a39b8c',
  onDark: '#ffffff',
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
} as const;

// ── Terracotta — food ─────────────────────────────────────────────────────────
export const terracotta = {
  primary: '#c9532f',
  tint: '#fbe9e1',
  ink: '#c9532f',
} as const;

// ── Amber — attention (bell dot, warnings) ────────────────────────────────────
export const amber = {
  primary: '#e8a33d',
  warnBg: '#fdf3e3', // "Not secured" / pending pill bg
  warnInk: '#a8741f',
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
  vetInk: '#3f7fa6',
  vaccineBg: '#e9f4f1',
  vaccineInk: '#3d8577',
  groomBg: '#f1ecf6',
  groomInk: '#7a5f9b',
  otherBg: '#f2efe6',
  otherInk: '#7b7365',
  // meal slots
  breakfastBg: '#fdf0e2',
  breakfastInk: '#c98a2f',
  dinnerBg: '#eceaf6',
  dinnerInk: '#5f5b96',
  // medication
  medBg: '#eaf1f7',
  medInk: '#3f7fa6',
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

  green: green.primary,
  greenMid: green.mid,
  greenTint: green.tint,
  greenGradientFrom: green.gradientFrom,
  greenGradientTo: green.gradientTo,

  terracotta: terracotta.primary,
  terracottaTint: terracotta.tint,

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
