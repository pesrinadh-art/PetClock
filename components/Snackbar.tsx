import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { amber, green, ink, radius, shadow } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { Icon } from './Icon';

/** How long an undo snackbar stays on screen before auto-dismissing. */
const DISMISS_MS = 5000;

type SnackbarState = {
  /** Bumped per show so the same message re-triggers the enter animation + timer. */
  token: number;
  message: string;
  onUndo?: () => void;
};

type SnackbarContextValue = {
  /**
   * Show a transient snackbar. When `onUndo` is supplied an "Undo" action is rendered;
   * tapping it fires `onUndo` and dismisses. Auto-dismisses after ~5s otherwise.
   */
  show: (message: string, onUndo?: () => void) => void;
  hide: () => void;
};

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

/**
 * Provides the app-wide undo snackbar. Mount once at the root; every quick-log path calls
 * `useSnackbar().show(...)`. Renders a single bottom-anchored toast overlaid above the tree
 * (pointer-transparent except the toast itself, so it never blocks the UI beneath it).
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SnackbarState | null>(null);
  const tokenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setState(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, onUndo?: () => void) => {
      clearTimer();
      tokenRef.current += 1;
      setState({ token: tokenRef.current, message, onUndo });
      timerRef.current = setTimeout(() => setState(null), DISMISS_MS);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  const handleUndo = useCallback(() => {
    state?.onUndo?.();
    hide();
  }, [state, hide]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {state ? <SnackbarToast key={state.token} state={state} onUndo={handleUndo} /> : null}
    </SnackbarContext.Provider>
  );
}

function SnackbarToast({ state, onUndo }: { state: SnackbarState; onUndo: () => void }) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      // useNativeDriver is unsupported by react-native-web; keep it off so both render.
      useNativeDriver: Platform.OS !== 'web',
      speed: 18,
      bounciness: 6,
    }).start();
  }, [anim]);

  return (
    // Lifted to clear the tab bar + centre FAB so the toast never covers the thumb zone.
    <View pointerEvents="box-none" style={[styles.overlay, { paddingBottom: insets.bottom + 96 }]}>
      <Animated.View
        pointerEvents="box-none"
        style={{
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        }}
      >
        <View style={styles.bar} role="alert">
          <View style={styles.check}>
            <Icon name="check" size={14} color={ink.onDark} strokeWidth={3} />
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {state.message}
          </Text>
          {state.onUndo ? (
            <Pressable
              onPress={onUndo}
              role="button"
              aria-label={`Undo: ${state.message}`}
              hitSlop={6}
              style={({ pressed }) => [styles.undoBtn, pressed && styles.undoPressed]}
            >
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error('useSnackbar must be used within a SnackbarProvider');
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 420,
    minHeight: 56,
    backgroundColor: ink.primary,
    borderRadius: radius.button,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 8,
    ...shadow.card,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: green.mid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { flex: 1, fontSize: 14.5, lineHeight: 19, fontFamily: fonts.semiBold, color: ink.onDark },
  // >= 44px target; gold on charcoal is ~9:1 contrast (the old blue was ~2:1).
  undoBtn: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  undoPressed: { opacity: 0.6 },
  undoText: {
    fontSize: 15,
    fontFamily: fonts.extraBold,
    color: amber.gold,
  },
});
