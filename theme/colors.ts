/**
 * PawClock design tokens — Aurora Minimal (design v2).
 *
 * One violet accent on a light aurora field (sky → lilac → peach → mint), hairline
 * glass panels, Geist type and Geist Mono for every time and number. Colour carries
 * ROLE only: accent = action/state, warn = attention, danger = destructive/errors.
 * Everything else is ink on glass.
 *
 * BACK-COMPAT: every export and key the app imported under the v3 (green) palette
 * still exists. `green.*` now means "the accent" and the per-type tints (pee, poo,
 * food, vet …) all collapse onto the accent's soft tint, per the one-accent rule.
 * New code should import `accent`, `glass`, `danger`, `aurora`.
 */

// ── Accent (the only colour) ────────────────────────────────────────────────
export const accent = {
  primary: '#6D5DF6', // fills: primary buttons, active tab icon, toggles, FAB
  ink: '#5544E0', // accent TEXT on white/glass (AA ≥ 4.5:1)
  soft: '#EEEBFE', // icon tiles, selected chips (≈ rgba(109,93,246,.10) on white)
  line: 'rgba(109,93,246,0.34)', // focused input / selected outline
  glow: 'rgba(109,93,246,0.16)',
  onAccent: '#FFFFFF',
} as const;

// ── Aurora field (screen background) ─────────────────────────────────────────
export const aurora = {
  base: '#F3EEFB', // solid fallback when a flat colour is needed
  gradient: ['#DDE9FF', '#E9E2FF', '#FFE8D9', '#D9F5E7'] as const,
  gradientStops: [0, 0.28, 0.58, 1] as const,
  orbBlue: 'rgba(110,160,255,0.45)', // top-right glow
  orbPink: 'rgba(255,150,190,0.35)', // bottom-left glow
  page: '#EDEEF2', // web backdrop behind the phone frame
} as const;

// ── Glass ────────────────────────────────────────────────────────────────────
export const glass = {
  fill: 'rgba(255,255,255,0.62)', // standard panel
  strong: 'rgba(255,255,255,0.9)', // inputs, sheets, raised controls
  highlight: 'rgba(255,255,255,0.95)', // 1px inner top highlight
  border: 'rgba(14,14,20,0.08)',
  border2: 'rgba(14,14,20,0.15)',
  scrim: 'rgba(244,244,247,0.62)', // light scrim behind menus
  scrimDark: 'rgba(14,14,20,0.35)', // dim behind modal sheets
} as const;

// ── Status ───────────────────────────────────────────────────────────────────
export const warn = {
  primary: '#E89B28',
  ink: '#A86100',
  soft: '#FBF0DF',
  line: 'rgba(232,155,40,0.42)',
} as const;
export const danger = { primary: '#D63B40', soft: '#FBE7E8' } as const;

// ── Surfaces ────────────────────────────────────────────────────────────────
export const surface = {
  app: aurora.base, // screens draw <AuroraBackground/>; this is the flat fallback
  card: glass.fill,
  tabBar: 'rgba(255,255,255,0.72)',
  chip: glass.fill,
  chipAlt: glass.fill,
  field: glass.strong,
  sheet: '#0E0E14',
  solid: '#FFFFFF', // when content must be fully opaque (sheets, dialogs)
} as const;

// ── Hairlines / borders ───────────────────────────────────────────────────────
export const line = {
  hairline: glass.border,
  border: glass.border,
  dashed: glass.border2,
  divider: glass.border,
} as const;

// ── Ink (text) ────────────────────────────────────────────────────────────────
export const ink = {
  primary: '#0E0E14',
  muted: '#5F6070', // secondary copy (AA on glass)
  faint: '#5F6070', // labels, timestamps (kept AA; the design's #9A9BA8 is for icons only)
  faint2: '#5F6070',
  placeholder: '#9A9BA8', // placeholders + chevrons ONLY
  onDark: '#FFFFFF',
} as const;

// ── Legacy role groups, re-pointed at the accent ──────────────────────────────
/** @deprecated name kept for back-compat: this is the accent now. */
export const green = {
  primary: accent.ink, // headings / links / focused tab → accent text
  mid: accent.primary, // FAB, primary buttons, active toggle
  gradientFrom: '#7E70F8',
  gradientTo: '#5B4BE8',
  tint: accent.soft,
  tintBorder: accent.line,
  ink: accent.ink,
} as const;

/** Food used terracotta; one accent now. `ink` stays readable text. */
export const terracotta = {
  primary: accent.primary,
  tint: accent.soft,
  ink: accent.ink,
} as const;

export const amber = {
  primary: warn.primary,
  warnBg: warn.soft,
  warnInk: warn.ink,
} as const;

export const logTint = {
  peeBg: accent.soft,
  peeInk: accent.ink,
  pooBg: accent.soft,
  pooInk: accent.ink,
} as const;

export const category = {
  vetBg: accent.soft,
  vetInk: accent.ink,
  vaccineBg: accent.soft,
  vaccineInk: accent.ink,
  groomBg: accent.soft,
  groomInk: accent.ink,
  otherBg: 'rgba(14,14,20,0.05)',
  otherInk: ink.muted,
  breakfastBg: accent.soft,
  breakfastInk: accent.ink,
  dinnerBg: accent.soft,
  dinnerInk: accent.ink,
  medBg: accent.soft,
  medInk: accent.ink,
} as const;

// ── Radii ─────────────────────────────────────────────────────────────────────
export const radius = {
  hero: 24,
  card: 24, // glass panels / lists (--r-lg)
  sheet: 28,
  tile: 18, // buttons, tiles (--r)
  iconTile: 11, // 34px icon tiles
  iconTileSm: 10,
  pill: 999,
  lg: 24,
  sm: 12,
} as const;

/**
 * Elevation. The design is mostly flat glass with one soft, wide shadow
 * (`0 14px 34px -14px rgba(30,30,70,.16)`); RN renders a single shadow.
 */
export const shadow = {
  card: {
    shadowColor: '#1E1E46',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 2,
  },
  hero: {
    shadowColor: '#1E1E46',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 3,
  },
  fab: {
    shadowColor: accent.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  sm: {
    shadowColor: '#1E1E46',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
} as const;

/** The flat map older call sites import. Keys preserved; values re-pointed. */
export const colors = {
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

  // ── legacy aliases ──
  sage: green.primary,
  sageLight: green.mid,
  sagePale: green.tint,
  pee: logTint.peeInk,
  poo: logTint.pooInk,
  pooLight: accent.primary,
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
  stoneLight: '#C8C9D2',
  white: '#FFFFFF',
  background: surface.app,
} as const;
