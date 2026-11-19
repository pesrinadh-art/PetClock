/**
 * Jest config — Phase 0 safety net (docs/CARE_MODULES_PLAN.md).
 *
 * TZ is pinned BEFORE any worker starts so every Date-based snapshot is identical on every
 * machine: lib/petSchedule.ts parses feed/med times in the DEVICE timezone, so an unpinned TZ
 * would make the characterization snapshots depend on where the tests run.
 */
process.env.TZ = 'America/Chicago';

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/lib/__tests__/**/*.test.ts'],
};
