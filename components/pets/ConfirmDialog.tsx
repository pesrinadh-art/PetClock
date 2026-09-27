import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ink, radius, space, surface, type Tone } from '../../theme/colors';
import { type } from '../../theme/fonts';
import { AppModal } from '../AppModal';
import { Button } from '../ui';
import type { IconName } from '../Icon';

type DialogAction = { label: string; onPress: () => void; tone?: Tone; icon?: IconName; accessibilityLabel?: string };

/**
 * Small centred confirm dialog used by the pet screens (remove pet, reset, early feed).
 * Presentation only: every handler is passed in by the screen. Buttons are the
 * design-system <Button> (48px), stacked so long pet names never squash them.
 */
export function ConfirmDialog({
  visible,
  onClose,
  title,
  body,
  leading,
  confirm,
  cancel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  /** Optional visual above the title (e.g. the pet's avatar). */
  leading?: React.ReactNode;
  confirm?: DialogAction;
  /** Cancel / dismiss button. Defaults to "Cancel" calling onClose. */
  cancel?: { label: string; onPress?: () => void; accessibilityLabel?: string };
}) {
  const cancelLabel = cancel?.label ?? 'Cancel';
  return (
    <AppModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <Text style={styles.title} role="heading">
            {title}
          </Text>
          {!!body && <Text style={styles.body}>{body}</Text>}
          <View style={styles.actions}>
            {confirm ? (
              <Button
                label={confirm.label}
                icon={confirm.icon}
                tone={confirm.tone ?? 'pet'}
                size="md"
                fullWidth
                onPress={confirm.onPress}
                accessibilityLabel={confirm.accessibilityLabel}
              />
            ) : null}
            <Button
              label={cancelLabel}
              variant={confirm ? 'ghost' : 'soft'}
              size="md"
              fullWidth
              onPress={cancel?.onPress ?? onClose}
              accessibilityLabel={cancel?.accessibilityLabel}
            />
          </View>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(42,39,36,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
  },
  leading: { marginBottom: space.sm },
  title: { ...type.title, fontSize: 20, lineHeight: 25, color: ink.primary, textAlign: 'center' },
  body: { ...type.body, color: ink.muted, textAlign: 'center', marginTop: space.xs },
  actions: { alignSelf: 'stretch', marginTop: space.xl, gap: space.xxs },
});

export default ConfirmDialog;
