// PawClock type system — Aurora Minimal: Geist (400/500/600) + Geist Mono.
// The design never goes above 600: headings are 500 with tight tracking
// (≈ -0.035em), emphasis is 600. Every time, date and number is Geist Mono.
//
// Back-compat: every key the app already imports still resolves. bold/extraBold/
// black all map to 600 — the heaviest weight the design uses.
export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semiBold: 'Geist_600SemiBold',
  bold: 'Geist_600SemiBold',
  extraBold: 'Geist_600SemiBold',
  black: 'Geist_600SemiBold',
  mono: 'GeistMono_500Medium',
  monoRegular: 'GeistMono_400Regular',
} as const;
