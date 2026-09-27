import * as React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../AppModal';
import { GlassSurface, IconTile } from '../ui';
import { Icon, type IconName } from '../Icon';
import { ink, line, radius, space, surface, tap, terracotta, green, type Tone } from '../../theme/colors';
import { fonts, type } from '../../theme/fonts';

/**
 * Centered confirm dialog shared by the Family and Settings screens.
 *
 * Same modal mechanics as before (AppModal + dimmed overlay that closes on tap, inner card
 * that swallows taps). Presentation only: a tone icon, a 22px title, calm body copy, an
 * optional slot for an input, and two 52px buttons stacked for the thumb. The confirm
 * button sits on top; `destructive` paints it in the deep terracotta "careful" ink so it
 * never reads like the everyday green action.
 */
export function ConfirmDialog({
  visible,
  onClose,
  icon,
  tone = 'pet',
  title,
  body,
  children,
  confirmLabel,
  confirmAccessibilityLabel,
  onConfirm,
  confirmDisabled = false,
  loading = false,
  destructive = false,
  cancelLabel = 'Not now',
}: {
  visible: boolean;
  onClose: () => void;
  icon?: IconName;
  tone?: Tone;
  title: string;
  body?: string;
  children?: React.ReactNode;
  confirmLabel: string;
  confirmAccessibilityLabel?: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  cancelLabel?: string;
}) {
  const inactive = confirmDisabled || loading;
  const confirmBg = destructive ? terracotta.ink : green.mid;
  return (
    <AppModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.wrap}>
          <GlassSurface fallbackColor={surface.card} fallbackOpacity={1} style={styles.dialog}>
            {icon ? (
              <IconTile icon={icon} tone={destructive ? 'food' : tone} size={48} style={styles.icon} />
            ) : null}
            <Text style={styles.title} role="heading">
              {title}
            </Text>
            {!!body && <Text style={styles.body}>{body}</Text>}
            {children ? <View style={styles.slot}>{children}</View> : null}
            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  if (!inactive) onConfirm();
                }}
                disabled={inactive}
                role="button"
                aria-label={confirmAccessibilityLabel ?? confirmLabel}
                aria-disabled={inactive}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: confirmBg },
                  inactive && styles.disabled,
                  pressed && !inactive && styles.pressed,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={ink.onDark} />
                ) : (
                  <View style={styles.btnRow}>
                    {destructive ? (
                      <Icon name="alert" size={18} color={ink.onDark} strokeWidth={2.3} />
                    ) : null}
                    <Text style={styles.confirmText}>{confirmLabel}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={onClose}
                role="button"
                aria-label={cancelLabel}
                style={({ pressed }) => [styles.btn, styles.cancel, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </Pressable>
            </View>
          </GlassSurface>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(42,39,36,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  wrap: { width: '100%', maxWidth: 360 },
  dialog: { borderRadius: radius.sheet, padding: space.xl + 2 },
  icon: { marginBottom: space.sm },
  title: { ...type.title, color: ink.primary },
  body: { ...type.body, color: ink.muted, marginTop: space.xs },
  slot: { marginTop: space.lg },
  actions: { marginTop: space.xl, gap: space.xs },
  btn: {
    minHeight: tap.min + 4,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmText: { ...type.button, color: ink.onDark },
  cancel: { backgroundColor: surface.card, borderWidth: 1.5, borderColor: line.border },
  cancelText: { ...type.button, fontFamily: fonts.bold, color: ink.primary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});

export default ConfirmDialog;
