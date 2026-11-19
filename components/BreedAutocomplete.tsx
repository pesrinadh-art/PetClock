import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { accent, glass, ink, radius, shadow, surface } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { breedSpeciesKey, suggestBreeds } from '../lib/breeds';

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

  const normalized = breedSpeciesKey(species);
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
      {/* zIndex on the wrapper so the absolute dropdown paints above sibling fields on web. */}
      <View style={styles.inputWrap}>
        <View style={[styles.cell, focused && styles.cellFocused]}>
          {label ? <Text style={styles.cellLabel}>{label}</Text> : null}
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
            placeholderTextColor={ink.placeholder}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="words"
          />
        </View>
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
  formGroup: { position: 'relative', zIndex: 1000 },
  // Establishes the positioning context and stacking for the absolute dropdown.
  inputWrap: { position: 'relative', zIndex: 1000 },
  // Glass input cell (Aurora `.input`): strong glass fill, hairline border, accent when focused.
  cell: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: glass.strong,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.tile,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cellFocused: { borderColor: accent.line },
  cellLabel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: ink.muted,
    marginBottom: 3,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: ink.primary,
    padding: 0,
  },
  // Opens UPWARD: the breed field sits low in the wizard, so a popover below it ran off the
  // bottom of the screen (and under the keyboard on a phone).
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: 6,
    maxHeight: 212,
    padding: 4,
    // SOLID opaque surface — glass would let the fields behind it bleed through.
    backgroundColor: surface.solid,
    borderWidth: 1,
    borderColor: glass.border,
    borderRadius: radius.sm + 2,
    overflow: 'hidden',
    // Upward-cast shadow (design: 0 -12px 30px -14px). zIndex/elevation float it above siblings.
    shadowColor: shadow.card.shadowColor,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    zIndex: 1000,
    elevation: 1000,
  },
  dropdownScroll: { maxHeight: 202 },
  option: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  optionLast: {},
  optionPressed: { backgroundColor: accent.soft },
  optionText: { fontFamily: fonts.regular, fontSize: 14, color: ink.primary },
});
