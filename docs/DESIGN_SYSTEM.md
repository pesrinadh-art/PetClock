# PawClock design system (redesign foundation)

Phase-1 shared foundation for the visual redesign. Screen agents build on the
tokens, icons and primitives here — **do not re-derive colours or redraw icons**.
Source of truth for every value is the approved mockup HTML in the redesign
`design/` folder (`screen_2a` Home, `screen_2b` Pet profile, …).

Design principle (from the mockups): *liveliness comes from a progress ring,
soft depth and a paw watermark — not from more colour.* Colour carries **role**,
not decoration.

---

## Tokens — `theme/colors.ts`

Grouped named exports (prefer these). The flat `colors` map still exposes every
legacy key (`sage`, `food`, `apptVet`, `stone`, `cream`, …), now re-pointed at
the redesign palette, so old screens keep compiling. Migrate call sites to the
grouped tokens.

### Surfaces — `surface`
| token | value | use |
|---|---|---|
| `surface.app` | `#faf7f0` | screen background |
| `surface.card` | `#ffffff` | cards / sheets |
| `surface.tabBar` | `#fffdf8` | bottom bar, glass headers |
| `surface.chip` | `#f2ede1` | round icon buttons / chips |
| `surface.chipAlt` | `#f0ebdf` | warmer chip (back button) |
| `surface.field` | `#f7f4ec` | inset input / value wells |
| `surface.sheet` | `#2a2724` | scrim behind a modal sheet |

### Hairlines — `line`
`line.hairline` `#f1ece0` (in-card dividers) · `line.border` `#ece6d9` (bar/chip
outlines) · `line.dashed` `#d8d1c2` (dashed "add…") · `line.divider` `#e7e0d1`.

### Ink — `ink`
`ink.primary` `#2a2724` · `ink.muted` `#8a8276` · `ink.faint` `#9a9184` ·
`ink.faint2` `#a39b8c` · `ink.onDark` `#ffffff`.

### Green — pet & state — `green`
`green.primary` `#2f6b45` · `green.mid` `#417a55` · gradient
`green.gradientFrom` `#4b8a60` → `green.gradientTo` `#356b48` · `green.tint`
`#e8efe6` · `green.tintBorder` `#cfe0cd`.

### Terracotta — food — `terracotta`
`terracotta.primary` `#c9532f` · `terracotta.tint` `#fbe9e1`.

### Amber — attention — `amber`
`amber.primary` `#e8a33d` (bell dot) · `amber.warnBg` `#fdf3e3` ·
`amber.warnInk` `#a8741f`.

### Log tints — `logTint`
`peeBg` `#e6f0f6` / `peeInk` `#2f6483` · `pooBg` `#f3ece3` / `pooInk` `#7a5c3c`.

### Categories (appts / meals / meds) — `category`
vet `#eaf1f7`/`#3f7fa6` · vaccine `#e9f4f1`/`#3d8577` · groom `#f1ecf6`/`#7a5f9b`
· other `#f2efe6`/`#7b7365` · breakfast `#fdf0e2`/`#c98a2f` · dinner
`#eceaf6`/`#5f5b96` · med `#eaf1f7`/`#3f7fa6`.

### Radius — `radius`
`hero` 22 · `card` 18 · `sheet` 26 · `tile` 14 · `iconTile` 12 · `iconTileSm` 10
· `pill` 999. (Legacy `lg` 20 / `sm` 12 retained.)

### Shadow — `shadow`
`shadow.card` (≈ `0 4px 14px -10px rgba(42,39,36,.45)`) · `shadow.hero`
(≈ `0 10px 24px -14px rgba(53,107,72,.9)`) · `shadow.fab` · `shadow.sm`.
RN renders a single shadow, so these approximate the CSS.

---

## Type — `theme/fonts.ts`

Family: **Archivo** (loaded in `app/_layout.tsx`). Map:
`fonts.regular` 400 · `fonts.medium` 500 · `fonts.semiBold` 600 · `fonts.bold`
700 · `fonts.extraBold`/`fonts.black` 800 (design's heaviest). `fonts.mono`
(DM Mono) kept only for legacy monospaced timestamps.

Heading tracking is tight (`letterSpacing: -0.5`); section labels are uppercase,
tracked `~1.5`, 10.5px, weight 700, colour `ink.faint` (use `SectionLabel`).

---

## Icons — `components/Icon.tsx`

Drawn `react-native-svg` set replacing all emoji. Paths lifted verbatim from the
mockups. Style: 24×24, fill none, stroke currentColor, round caps/joins, ~2px.

```tsx
import { Icon } from '../components/Icon';
<Icon name="paw" size={20} color={green.mid} strokeWidth={2} />
<Icon name="paw" size={108} color="rgba(255,255,255,0.08)" filled /> // watermark
```

Props: `name`, `size` (=24), `color` (=`#2a2724`), `strokeWidth` (=2), `filled`.

Names: `home` `users` `calendar` `paw` `bell` `gear` `plus` `check`
`chevronRight` `chevronLeft` `close` `dots` `clock` `drop`(pee) `poo`
`bowl`(fed/food) `pill`(meds) `sun`(breakfast) `moon`(dinner) `vet`
`stethoscope`(=vet) `vaccine` `scissors`(groom) `mapPin` `lock` `mail` `eye`
`login` `user` `userPlus` `alert` `share` `copy` `key`.

---

## Primitives — `components/ui/`

Import from the barrel: `import { Card, HeroCard, ListRow, SectionLabel, Pill,
StatGroup, GlassSurface } from '../components/ui';`

- **`Card`** — white card, radius 18, `shadow.card`. Prop `padded` for the
  14/16 inset; omit when wrapping `ListRow`s.
- **`HeroCard`** — green gradient hero, radius 22, `shadow.hero`, paw watermark.
  Props: `title`, `subtitle`, `eyebrow` (uppercase-label variant, e.g. Appts),
  `stats: Stat[]`, `progress` (0–1 → ring-with-paw, Home), `leading` (custom
  node e.g. avatar), `gradient` (override, e.g. charcoal `['#3c3a46','#2a2833']`),
  `watermark`, `ringColor`.
- **`SectionLabel`** — the uppercase tracked group label. Optional `right` slot
  for a trailing action ("See all").
- **`ListRow`** — tinted icon tile + title/sub + right slot / chevron. Props:
  `icon` (IconName), `iconBg`, `iconColor`, `iconLarge`, `title`, `subtitle`,
  `right`, `showChevron`, `onPress`, `divider` (inset hairline — set on all but
  the last row in a Card).
- **`Pill`** — status/filter badge. Props: `label`, `bg`, `color`, `icon`,
  `size` (`sm`|`md`).
- **`StatGroup`** — the value/label stat row under a hero divider (also
  standalone). `variant` `onDark` (default) | `onLight`; per-stat `accent`.
- **`GlassSurface`** — "liquid glass" building block (tab bar, headers, sheets).
  True `BlurView` on iOS; graceful solid fallback on Android/web. Props:
  `intensity`, `tint`, `fallbackColor` (=`#fffdf8`), `fallbackOpacity`.

The **old `components/HeroCard.tsx`** (emoji watermark, string gradient) is left
in place for the current Home/Appointments/Food screens and is superseded by
`components/ui/HeroCard`. Screen agents migrate to the `ui/` version.

---

## Routing / tab bar — `app/(tabs)/_layout.tsx`

Bottom bar is **HOME · SHARED · APPTS · PETS** with drawn icons and a center
green **＋ FAB** (54px circle, `green.mid`, 4px bar-coloured ring, lifted above
the bar). Active tint `green.primary`, inactive `#a9a193`. Bar background opaque
`surface.tabBar`; swap in `<GlassSurface>` as `tabBarBackground` during Phase-2.

- New route **`app/(tabs)/shared.tsx`** — styled stub; a Phase-2 agent fills it
  (household UI largely exists in `components/HouseholdSection.tsx`).
- **Food tab retired** — meal logging moves into the pet profile. `food.tsx` is
  hidden from the bar (`href: null`) but kept; all meal logic/helpers
  (`lib/petSchedule.ts` `getTodaysMeals`, `FoodQuickLogButton`) are intact.

---

## Migration notes for Phase-2 screen agents

- Screens still import legacy `colors.*` aliases and render **emoji** (💧 💩 🍽️ ✅
  🐾) — swap emoji for `<Icon>` and legacy colour keys for grouped role tokens.
- Old `components/HeroCard`, `SectionTitle`, `TopNavBar`, `PetCard` etc. predate
  this system; re-skin using `ui/` primitives.
- `fonts.mono` (DM Mono) still used in `pet/[id]/history.tsx`, `Timeline.tsx`,
  `HouseholdSection.tsx` — replace with Archivo weights when restyling.
