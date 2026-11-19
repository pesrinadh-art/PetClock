/// <reference types="jest" />
/// <reference types="node" />
/**
 * Phase 1 consumer wiring (docs/CARE_MODULES_PLAN.md, "How screens use it").
 *
 * The "+ Log" menu now takes its items from the care plan (`useCareOutputs(...).quickLog`) and
 * lays them out with `arcLayout(n)`. With today's modules ticked that must reproduce the old
 * hard-coded menu exactly: the same four items, in the same order, at the same four positions
 * (the literal dx/dy table QuickLogMenu.tsx had before Phase 1).
 */
import { buildSnapshot, planQuickLog, resolvePlan } from '../care/plan';
import { mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// QuickLogMenu.tsx is imported only for its pure `arcLayout`; stub its native / app-state deps.
jest.mock('expo-haptics', () => ({}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('../repo/types', () => ({ repos: {} }));
jest.mock('../../context/LogsContext', () => ({ useLogs: () => ({}) }));
jest.mock('../care/useCareOutputs', () => ({ useCareOutputs: () => null }));
jest.mock('../../components/Snackbar', () => ({ useSnackbar: () => ({}) }));
jest.mock('../../components/AppModal', () => ({ AppModal: () => null }));
jest.mock('../../components/Icon', () => ({ Icon: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { arcLayout, QUICK_LOG_MAX } = require('../../components/QuickLogMenu') as typeof import('../../components/QuickLogMenu');

/** QuickLogMenu.tsx ITEMS before Phase 1, verbatim (key, icon, label, verb, dx, dy). */
const LEGACY_MENU = [
  { key: 'pee', icon: 'drop', label: 'Pee', verb: 'pee', dx: -108, dy: -96 },
  { key: 'poo', icon: 'poo', label: 'Poo', verb: 'poo', dx: -46, dy: -162 },
  { key: 'both', icon: 'drop', label: 'Both', verb: 'go', dx: 46, dy: -162 },
  { key: 'fed', icon: 'bowl', label: 'Fed', verb: 'eat', dx: 108, dy: -96 },
];

describe('arcLayout', () => {
  test('n = 4 reproduces the original design positions exactly', () => {
    expect(arcLayout(4)).toEqual(LEGACY_MENU.map(({ dx, dy }) => ({ dx, dy })));
  });

  test('every n up to the cap: n points, left to right, mirror-symmetric, above the button', () => {
    expect(arcLayout(0)).toEqual([]);
    for (let n = 1; n <= QUICK_LOG_MAX; n++) {
      const pts = arcLayout(n);
      expect(pts).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        expect(pts[i].dy).toBeLessThan(0);
        expect(pts[i].dx + pts[n - 1 - i].dx).toBe(0);
        expect(pts[i].dy).toBe(pts[n - 1 - i].dy);
        if (i > 0) expect(pts[i].dx).toBeGreaterThan(pts[i - 1].dx);
      }
    }
    expect(arcLayout(1)).toEqual([{ dx: 0, dy: -171 }]);
  });

  test('circles (58px) never overlap at any n up to the cap', () => {
    for (let n = 2; n <= QUICK_LOG_MAX; n++) {
      const pts = arcLayout(n);
      for (let i = 1; i < n; i++) {
        const d = Math.hypot(pts[i].dx - pts[i - 1].dx, pts[i].dy - pts[i - 1].dy);
        expect(d).toBeGreaterThanOrEqual(58);
      }
    }
  });
});

describe('quick-log menu from the care plan', () => {
  const now = new Date('2026-06-15T15:00:00.000Z');
  const menuFor = (careModules: Parameters<typeof mkPet>[0]['careModules']) => {
    const pet = mkPet({ id: 'p1', name: 'Mochi', careModules });
    const s = buildSnapshot({ pet, feedTimes: [], meds: [], logs: [], appts: [], now });
    const actions = planQuickLog(resolvePlan(pet), s).slice(0, QUICK_LOG_MAX);
    const pos = arcLayout(actions.length);
    return actions.map((a, i) => ({ key: a.key, icon: a.icon, label: a.label, verb: a.verb, ...pos[i] }));
  };

  test("today's modules ticked: exactly the old menu, items and positions", () => {
    expect(menuFor(['potty', 'meals', 'meds', 'visits'])).toEqual(LEGACY_MENU);
  });

  test('potty off: only Fed, centred', () => {
    expect(menuFor(['meals', 'meds', 'visits'])).toEqual([
      { key: 'fed', icon: 'bowl', label: 'Fed', verb: 'eat', dx: 0, dy: -171 },
    ]);
  });
});
