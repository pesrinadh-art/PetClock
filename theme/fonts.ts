import type { TextStyle } from 'react-native';

// PawClock redesign type system — Archivo (weights 400/500/600/700/800).
// The design uses tight tracking on headings (-.02em). Only Archivo + DM Mono
// are loaded in app/_layout.tsx — do NOT reference Nunito (installed but not
// loaded; it would silently fall back to the system font).
//
// Back-compat: every key the app already imports (regular/semiBold/bold/
// extraBold/black/mono) still resolves. DM Mono is legacy — prefer
// `type.caption` with tabular numbers for timestamps in new UI.
export const fonts = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semiBold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  // The design's heaviest weight is 800; extraBold and black both map to it.
  extraBold: 'Archivo_800ExtraBold',
  black: 'Archivo_800ExtraBold',
  mono: 'DMMono_500Medium',
} as const;

/**
 * Pet-owner type scale. Spread into a StyleSheet entry and add a colour:
 *   title: { ...type.title, color: ink.primary }
 *
 * Minimum readable size in the app is 12 (`caption`). Body copy is 15.
 * Avoid uppercase tracked labels for anything longer than 2 words — sentence
 * case reads faster (and is friendlier).
 */
export const type = {
  /** Hero / greeting headline — "Mochi's day". */
  display: { fontFamily: fonts.extraBold, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  /** Screen title in a ScreenHeader. */
  title: { fontFamily: fonts.extraBold, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  /** Section heading — "Quick log", "Coming up". */
  heading: { fontFamily: fonts.extraBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  /** Card / row title. */
  subhead: { fontFamily: fonts.bold, fontSize: 15.5, lineHeight: 20 },
  /** Default reading text. */
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  /** Secondary text under a title. */
  bodySm: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 19 },
  /** Button labels. */
  button: { fontFamily: fonts.extraBold, fontSize: 16, letterSpacing: -0.1 },
  /** Small meta — timestamps, pill text. Never smaller than this. */
  caption: { fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 17 },
  /** Uppercase eyebrow (<= 2 words). */
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;
