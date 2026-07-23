import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Animated, Modal, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

// D26: React Native's Modal portals to the window root on web, escaping the
// 390×844 PhoneFrame in app/_layout.tsx. AppModal renders the native Modal
// unchanged on iOS/Android, but on web it teleports its content into
// AppModalHost — an absolutely-positioned overlay stack that lives inside the
// PhoneFrame — so dialogs stay within the frame.

type AppModalProps = {
  visible?: boolean;
  transparent?: boolean;
  animationType?: 'none' | 'slide' | 'fade';
  onRequestClose?: () => void;
  children?: React.ReactNode;
};

type HostEntry = { key: string; node: React.ReactNode };

type WebModalHost = {
  mount: (key: string, node: React.ReactNode) => void;
  unmount: (key: string) => void;
};

const WebModalContext = createContext<WebModalHost | null>(null);

/**
 * Renders web modals inside the PhoneFrame. Mount once in the root layout,
 * wrapping the navigator (inside the frame). Children render untouched; open
 * AppModals are appended as absolute-fill siblings so they paint on top but
 * stay clipped by the frame's `overflow: hidden`. Inert on native.
 */
export function AppModalHost({ children }: { children: React.ReactNode }) {
  const [modals, setModals] = useState<HostEntry[]>([]);

  const mount = useCallback((key: string, node: React.ReactNode) => {
    setModals((prev) => {
      const index = prev.findIndex((m) => m.key === key);
      if (index === -1) return [...prev, { key, node }];
      const next = prev.slice();
      next[index] = { key, node };
      return next;
    });
  }, []);

  const unmount = useCallback((key: string) => {
    setModals((prev) => (prev.some((m) => m.key === key) ? prev.filter((m) => m.key !== key) : prev));
  }, []);

  const hostRef = useRef<WebModalHost>({ mount, unmount });

  return (
    <WebModalContext.Provider value={hostRef.current}>
      {children}
      {modals.map((m) => (
        <ModalSurface key={m.key}>{m.node}</ModalSurface>
      ))}
    </WebModalContext.Provider>
  );
}

/** Absolute-fill layer for one open modal; fades in to match animationType="fade". */
function ModalSurface({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: false }).start();
  }, [opacity]);

  return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{children}</Animated.View>;
}

export function AppModal({
  visible = false,
  transparent = false,
  animationType = 'none',
  onRequestClose,
  children,
}: AppModalProps) {
  const host = useContext(WebModalContext);
  const id = useId();
  const useWebHost = Platform.OS === 'web' && host != null;

  // Web: close on Escape, mirroring RN Modal's onRequestClose behavior.
  useEffect(() => {
    if (!useWebHost || !visible || !onRequestClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [useWebHost, visible, onRequestClose]);

  // Web: (re)mount content into the host on every render so state-driven
  // updates inside the modal content keep flowing through.
  useEffect(() => {
    if (!useWebHost) return;
    if (!visible) {
      host.unmount(id);
      return;
    }
    host.mount(
      id,
      <View style={[styles.fill, !transparent && styles.opaqueBackground]}>{children}</View>
    );
  });

  useEffect(() => {
    if (!useWebHost) return;
    return () => host.unmount(id);
  }, [useWebHost, host, id]);

  if (useWebHost) return null;

  return (
    <Modal visible={visible} transparent={transparent} animationType={animationType} onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  opaqueBackground: { backgroundColor: colors.white },
});
