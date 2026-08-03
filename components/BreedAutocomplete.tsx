import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

  const normalized = normalizeSpecies(species);
  const suggestions = useMemo(() => suggestBreeds(value, normalized), [value, normalized]);

  // Show the dropdown while the field is focused, the user has typed, and hasn't just picked/closed.
  const open = focused && !dismissed && suggestions.length > 0;

  const pick = (name: string) => {
    onChange(name);
    setDismissed(true);
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
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.stoneLight}
          style={[styles.input, value ? styles.inputFilled : null]}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {open ? (
          <View style={styles.dropdown}>
            {suggestions.map((name, i) => (
              <Pressable
                key={name}
                // onPressIn beats the input's onBlur on web/native, so the tap always registers.
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
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  formGroup: { marginBottom: 14, gap: 5 },
  formLabel: {
    fontSize: 11,
    fontFamily: fonts.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.stoneMid,
  },
  // Establishes the positioning context and stacking for the absolute dropdown.
  inputWrap: { position: 'relative', zIndex: 20 },
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
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.stoneLight,
    borderRadius: radius.sm,
    overflow: 'hidden',
    zIndex: 30,
    ...shadow.card,
  },
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
