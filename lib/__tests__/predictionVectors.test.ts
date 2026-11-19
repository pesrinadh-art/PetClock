/// <reference types="jest" />
/// <reference types="node" />
/**
 * Golden prediction vectors — the client half (docs/CARE_MODULES_PLAN.md, Phase 0).
 *
 * shared/fixtures/prediction_vectors.json is the single source of inputs for BOTH copies of the
 * prediction algorithm: this suite checks lib/petSchedule.ts predictBreak() against it, and
 * scripts/gen-prediction-parity-sql.js turns the same file into the pgTAP suite
 * supabase/tests/011_prediction_parity.sql for app.recompute_prediction().
 *
 * `expected` is the CURRENT client output. Vectors marked `knownDivergence` are places the
 * client and server disagree; they still assert the client's current value here. Phase 0.5
 * resolved the three original divergences (future-dated log / 0018, per-type hold, feed-time
 * household timezone), so none are marked today.
 *
 * To regenerate after a deliberate behaviour change:  UPDATE_VECTORS=1 npx jest predictionVectors
 * (then review the JSON diff by hand, and regenerate the SQL with
 * `node scripts/gen-prediction-parity-sql.js`).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { FeedTime, LogEntry } from '../db/models';
import { predictBreak, type BreakPrediction } from '../petSchedule';
import { mkFeed, mkLog, mkPet } from './helpers/fixtures';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateParitySql } = require('../../scripts/gen-prediction-parity-sql.js') as {
  generateParitySql: (doc: VectorsDoc) => string;
};

type VectorLog = { type: 'pee' | 'poo' | 'food'; occurredAt: string; deleted?: boolean };

type Expected = {
  anchor: string;
  predicted: string;
  bufferMs: number;
  notifyAt: string;
  overdueBy: number;
};

type Vector = {
  id: string;
  description: string;
  householdTz: string;
  deviceTz: string;
  now: string;
  breakType: 'pee' | 'poo';
  peeHoldHours: number | null;
  poopHoldHours: number | null;
  feedTimes: { localTime: string; active: boolean }[];
  logs: VectorLog[];
  expected: Expected | null;
  knownDivergence?: string;
  server?: Record<string, unknown>;
};

type VectorsDoc = { version: number; vectors: Vector[] };

const ROOT = path.resolve(__dirname, '..', '..');
const VECTORS_PATH = path.join(ROOT, 'shared', 'fixtures', 'prediction_vectors.json');
const SQL_PATH = path.join(ROOT, 'supabase', 'tests', '011_prediction_parity.sql');

const doc = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8')) as VectorsDoc;

/**
 * Runs the client kernel for a vector. By default it passes the vector's householdTz, as the
 * server resolves feed times in households.timezone (Phase 0.5). `deviceLocal` omits it, which
 * is what every app caller does today (no household tz known on the client yet).
 */
function runClient(v: Vector, deviceLocal = false): Expected | null {
  const pet = mkPet({
    id: `pet-${v.id}`,
    name: v.id,
    peeHoldHours: v.peeHoldHours,
    poopHoldHours: v.poopHoldHours,
  });
  const feeds: FeedTime[] = v.feedTimes.map((f, i) => mkFeed(`${v.id}-f${i}`, pet.id, f.localTime, f.active));
  const logs: LogEntry[] = v.logs.map((l, i) =>
    mkLog(`${v.id}-l${i}`, pet.id, l.type, l.occurredAt, l.deleted ? { deletedAt: v.now } : {}),
  );
  const p: BreakPrediction | null = predictBreak(
    pet,
    feeds,
    logs,
    v.breakType,
    new Date(v.now),
    deviceLocal ? undefined : v.householdTz,
  );
  if (!p) return null;
  return {
    anchor: p.anchor.toISOString(),
    predicted: p.predictedAt.toISOString(),
    bufferMs: p.bufferMs,
    notifyAt: p.notifyAt.toISOString(),
    overdueBy: p.overdueBy,
  };
}

const UPDATE = process.env.UPDATE_VECTORS === '1';

describe('prediction vectors (client)', () => {
  test('device timezone matches the pinned jest TZ', () => {
    for (const v of doc.vectors) expect({ id: v.id, deviceTz: v.deviceTz }).toEqual({ id: v.id, deviceTz: process.env.TZ });
  });

  test('vector ids are unique', () => {
    const ids = doc.vectors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  if (UPDATE) {
    test('UPDATE_VECTORS: rewrite expected values from the current client', () => {
      for (const v of doc.vectors) v.expected = runClient(v);
      fs.writeFileSync(VECTORS_PATH, JSON.stringify(doc, null, 2) + '\n');
    });
    return;
  }

  for (const v of doc.vectors) {
    test(`${v.id}${v.knownDivergence ? ' (known client/server divergence)' : ''}`, () => {
      expect(runClient(v)).toEqual(v.expected);
    });
  }

  // Without a household tz the client falls back to device-local parsing (today's app
  // behaviour). Where the two zones coincide, that fallback must give the same answer.
  for (const v of doc.vectors.filter((x) => x.householdTz === x.deviceTz)) {
    test(`${v.id} (device-local fallback, household tz == device tz)`, () => {
      expect(runClient(v, true)).toEqual(v.expected);
    });
  }

  test('supabase/tests/011_prediction_parity.sql is up to date with the vectors', () => {
    const onDisk = fs.readFileSync(SQL_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(generateParitySql(doc));
  });
});
