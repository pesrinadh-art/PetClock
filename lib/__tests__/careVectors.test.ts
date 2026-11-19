/// <reference types="jest" />
/// <reference types="node" />
/**
 * Golden care vectors — the client half (docs/CARE_MODULES_PLAN.md, Phase 3: "Parity vectors
 * green on both sides").
 *
 * shared/fixtures/care_vectors.json is the single source of inputs for BOTH copies of the walks /
 * habitat due maths: this suite checks predictWalk (lib/care/modules/walks.ts) and habitatDue
 * (lib/care/modules/habitat.ts), and scripts/gen-care-parity-sql.js writes the same vectors into
 * the generated block of supabase/tests/012_care_pushes.sql for app.recompute_care (0022).
 *
 * If a vector fails here, the phone and the server push disagree about when a walk or clean is
 * due. Change both copies together, then regenerate the SQL with
 * `node scripts/gen-care-parity-sql.js`.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { LogEntry } from '../db/models';
import { habitatDue } from '../care/modules/habitat';
import { predictWalk, WALK_BUFFER } from '../care/modules/walks';
import { mkLog, mkPet } from './helpers/fixtures';

jest.mock('expo-notifications', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractCareParity, generateCareParityBlock } = require('../../scripts/gen-care-parity-sql.js') as {
  extractCareParity: (sql: string) => string | null;
  generateCareParityBlock: (doc: VectorsDoc) => string;
};

type VectorLog = { type: 'walk' | 'habitat_clean' | 'pee' | 'food'; occurredAt: string; deleted?: boolean };

type Expected = {
  anchor: string;
  dueAt: string;
  notifyAt: string;
  bufferMinutes: number;
  overdueBy: number;
};

type Vector = {
  id: string;
  description: string;
  module: 'walks' | 'habitat';
  householdTz: string;
  now: string;
  walkIntervalHours: number | null;
  habitatIntervalDays: number | null;
  logs: VectorLog[];
  expected: Expected | null;
};

type VectorsDoc = { version: number; vectors: Vector[] };

const ROOT = path.resolve(__dirname, '..', '..');
const VECTORS_PATH = path.join(ROOT, 'shared', 'fixtures', 'care_vectors.json');
const SQL_PATH = path.join(ROOT, 'supabase', 'tests', '012_care_pushes.sql');

const doc = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8')) as VectorsDoc;

const MIN_MS = 60 * 1000;

function runClient(v: Vector): Expected | null {
  const pet = mkPet({
    id: `pet-${v.id}`,
    name: v.id,
    species: 'other',
    careModules: [v.module, 'meals'],
    walkIntervalHours: v.walkIntervalHours,
    habitatIntervalDays: v.habitatIntervalDays,
  });
  const logs: LogEntry[] = v.logs.map((l, i) =>
    mkLog(`${v.id}-l${i}`, pet.id, l.type, l.occurredAt, l.deleted ? { deletedAt: v.now } : {}),
  );
  const now = new Date(v.now);

  if (v.module === 'walks') {
    const p = predictWalk(pet, logs, now);
    if (!p) return null;
    return {
      anchor: p.anchor.toISOString(),
      dueAt: p.predictedAt.toISOString(),
      notifyAt: p.notifyAt.toISOString(),
      bufferMinutes: p.bufferMs / MIN_MS,
      overdueBy: p.overdueBy,
    };
  }

  // The household zone is always known on the server, so the client is given it too. No species
  // profile: habitat vectors always set an interval (a null one is species-resolved on the client
  // only — see 0022's header).
  const d = habitatDue(pet, logs, now, v.householdTz, null);
  if (!d) return null;
  return {
    anchor: d.lastCleanedAt.toISOString(),
    dueAt: d.dueAt.toISOString(),
    // The habitat reminder fires AT the due instant (habitat.ts reminders: fireAt = dueAt).
    notifyAt: d.dueAt.toISOString(),
    bufferMinutes: 0,
    overdueBy: d.overdueBy,
  };
}

describe('care vectors: client parity', () => {
  test('the vectors file is well-formed', () => {
    expect(doc.version).toBe(1);
    const ids = doc.vectors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of doc.vectors) {
      if (v.module === 'habitat') {
        // A null habitat interval would be species-resolved on the client but have no server row.
        expect(v.habitatIntervalDays).not.toBeNull();
      }
    }
  });

  test.each(doc.vectors.map((v) => [v.id, v] as const))('%s', (_id, v) => {
    expect(runClient(v)).toEqual(v.expected);
  });

  test('never rolls forward: every past-due vector keeps due = anchor + one interval', () => {
    for (const v of doc.vectors) {
      const r = runClient(v);
      if (!r || r.overdueBy === 0) continue;
      expect(new Date(r.dueAt).getTime()).toBeLessThan(new Date(v.now).getTime());
      expect(new Date(v.now).getTime() - new Date(r.dueAt).getTime()).toBe(r.overdueBy);
    }
  });

  test('the walk buffer is the 10% / 5–20 min spec mirrored in 0022', () => {
    expect(WALK_BUFFER).toEqual({ fraction: 0.1, minMinutes: 5, maxMinutes: 20 });
  });

  test('supabase/tests/012_care_pushes.sql carries the current generated block', () => {
    const sql = fs.readFileSync(SQL_PATH, 'utf8');
    expect(extractCareParity(sql)).toBe(generateCareParityBlock(doc));
  });
});
