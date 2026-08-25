// PawClock redesign type system — Archivo (weights 400/500/600/700/800).
// The design uses tight tracking on headings (-.02em) and uppercase tracked
// section labels (.14em); those are applied at the component level (SectionLabel).
//
// Back-compat: every key the app already imports (regular/semiBold/bold/
// extraBold/black/mono) still resolves. `medium` is new. DM Mono stays only
// because history.tsx / Timeline / HouseholdSection still render monospaced
// timestamps — screen agents can migrate those later.
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
