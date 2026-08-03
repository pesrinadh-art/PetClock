import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { suggestBreeds, type BreedSpecies } from '../lib/breeds';

// Accepts either the internal species tag ('dog'/'cat') or the human label used on the pet
// screens (AVATAR_LABELS[avatar], e.g. 'Dog', 'Cat', 'Rabbit'). Only dog/cat have breed data;
// anything else falls through to `undefined` and searches all breeds.
function normalizeSpecies(species?: string): BreedSpecies | undefined {
  if (!species) return undefined;
  const s = species.trim().toLowerCase();
  if (s === 'dog') return 'dog';
  if (s === 'cat') return 'cat';
  return undefined;
}

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  species?: string;
  style?: object;
};

export function BreedAutocomplete({ label, value, onChange, placeholder, species, style }: Props) {
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // On react-native-web, clicking a suggestion blurs the input BEFORE the Pressable's onPress
  // (click) fires — the DOM order is mousedown → blur → mouseup → click. Closing the popover
  // synchronously on blur would unmount the row mid-interaction and swallow the selection.
  // So we defer the blur-close by a tick; a successful pick cancels it and closes immediately.
  // We keep onPress (not onPressIn) so the row press still yields to a scroll gesture on native.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelBlurClose = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const normalized = normalizeSpecies(species);
  const suggestions = useMemo(() => suggestBreeds(value, normalized), [value, normalized]);

  // Show the dropdown while the field is focused, the user has typed, and hasn't just picked/closed.
  const open = focused && !dismissed && suggestions.length > 0;

  const pick = (name: string) => {
    cancelBlurClose();
    onChange(name);
    setDismissed(true);
    setFocused(false);
  };

  return (
    <View style={[styles.formGroup, style]}>
      {label ? <Text style={styles.formLabel}>{label}</Text> : null}
      {/* zIndex on the wrapper so the absolute dropdown paints above sibling fields on web. */}
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={(v) => {
            onChange(v);
            setDismissed(false);
          }}
          onFocus={() => {
            cancelBlurClose();
            setFocused(true);
            setDismissed(false);
          }}
          // Defer the close so a suggestion click (which blurs the input first on web) can win.
          onBlur={() => {
            cancelBlurClose();
            blurTimer.current = setTimeout(() => setFocused(false), 120);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.stoneLight}
          style={[styles.input, value ? styles.inputFilled : null]}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {open ? (
          // Solid opaque popover that fully occludes the fields behind it. A ScrollView with a
          // bounded maxHeight lets the full (uncapped) match list scroll inside the popover
          // instead of pushing layout. keyboardShouldPersistTaps keeps taps working while the
          // input is focused; nestedScrollEnabled lets it scroll inside the parent ScrollView.
          <View style={styles.dropdown}>
            <ScrollView
              style={styles.dropdownScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {suggestions.map((name, i) => (
                <Pressable
                  key={name}
                  // onPress after keyboardShouldPersistTaps means the tap always registers.
                  onPress={() => pick(name)}
                  role="button"
                  aria-label={`Use breed ${name}`}
                  style={({ pressed }) => [
                    styles.option,
                    i === suggestions.length - 1 && styles.optionLast,
                    pressed && styles.optionPressed,
                  ]}
                >
                  <Text style={styles.optionText}>{name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // position:'relative' + a high zIndex here so the whole field (and its absolute popover)
  // stacks ABOVE the sibling form fields rendered below it on react-native-web.
  formGroup: { marginBottom: 14, gap: 5, position: 'relative', zIndex: 1000 },
  formLabel: {
    fontSize: 11,
    fontFamily: fonts.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.stoneMid,
  },
  // Establishes the positioning context and stacking for the absolute dropdown.
  inputWrap: { position: 'relative', zIndex: 1000 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.stone,
  },
  inputFilled: { borderColor: colors.sage },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 240,
    // SOLID opaque surface — set explicitly (not via a shadow token) so the popover fully
    // occludes the fields behind it on every platform.
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    overflow: 'hidden',
    // Float above sibling fields: zIndex for web/iOS ordering, elevation for Android.
    ...shadow.card,
    zIndex: 1000,
    elevation: 1000,
  },
  dropdownScroll: { maxHeight: 240 },
  option: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.sagePale,
  },
  optionLast: { borderBottomWidth: 0 },
  optionPressed: { backgroundColor: colors.sagePale },
  optionText: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.stone },
});
