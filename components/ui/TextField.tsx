import * as React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { amber, green, ink, line, radius, space, surface } from '../../theme/colors';
import { fonts, type } from '../../theme/fonts';

/**
 * Labelled text input with helper / error text. The label sits ABOVE the
 * field in sentence case (readable), the field is >= 52px tall with a clear
 * focus ring. Errors are gentle amber, never red, and say how to fix it.
 *
 *   <TextField label="Pet's name" value={name} onChangeText={setName}
 *     placeholder="e.g. Mochi" hint="This is how we'll greet them." />
 *   <TextField label="Weight" suffix="kg" keyboardType="decimal-pad" ... />
 *   <TextField label="Email" error="That email looks a little off - check for typos?" ... />
 *
 * All other TextInput props pass through.
 */
export function TextField({
  label,
  hint,
  error,
  suffix,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...inputProps
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  suffix?: string;
  containerStyle?: ViewStyle;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={[styles.group, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          focused && styles.focused,
          !!error && styles.errored,
          inputProps.editable === false && styles.readonly,
        ]}
      >
        <TextInput
          placeholderTextColor={ink.placeholder}
          aria-label={label}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {error ? (
        <Text style={styles.error} role="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { ...type.subhead, fontSize: 14.5, color: ink.primary },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surface.card,
    borderWidth: 1.5,
    borderColor: line.border,
    borderRadius: radius.tile,
    paddingHorizontal: space.md,
  },
  focused: { borderColor: green.mid },
  errored: { borderColor: amber.primary, backgroundColor: amber.warnBg },
  readonly: { backgroundColor: surface.field },
  input: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: ink.primary,
    paddingVertical: 12,
  },
  suffix: { ...type.bodySm, fontFamily: fonts.bold, color: ink.muted, marginLeft: 6 },
  hint: { ...type.caption, color: ink.muted },
  error: { ...type.caption, color: amber.warnInk },
});

export default TextField;
