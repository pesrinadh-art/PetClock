#!/usr/bin/env node
/**
 * Generates supabase/tests/011_prediction_parity.sql from shared/fixtures/prediction_vectors.json.
 *
 * One vectors file drives both copies of the prediction algorithm (docs/CARE_MODULES_PLAN.md,
 * "Guardrails" 4): lib/__tests__/predictionVectors.test.ts checks the client against it, and the
 * SQL this script emits checks app.recompute_prediction(). The jest suite also fails when the
 * committed SQL is stale, so edit the JSON and re-run:
 *
 *   node scripts/gen-prediction-parity-sql.js
 *
 * Time handling: the client vectors pin an absolute `now`; pgTAP cannot fake now(), so the SQL
 * places every log at `now() + (occurredAt - vector.now)` and asserts offsets from now().
 * Log-anchored vectors are therefore exact. Feed-anchored vectors depend on the real time of
 * day, so they assert the algorithm's shape instead: the anchor is today's earliest active feed
 * time in households.timezone, predicted = anchor if it is still ahead else anchor + hold, and
 * the buffer/notify_at maths.
 *
 * CommonJS on purpose: jest requires it directly (no ESM interop needed).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VECTORS_PATH = path.join(ROOT, 'shared', 'fixtures', 'prediction_vectors.json');
const SQL_PATH = path.join(ROOT, 'supabase', 'tests', '011_prediction_parity.sql');

const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const MIN_MS = 60 * 1000;

function q(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function num(n) {
  return n == null ? 'null' : String(n);
}

function pad(n) {
  return String(n).padStart(12, '0');
}

function minutesBetween(iso, nowIso, what) {
  const diff = (new Date(iso).getTime() - new Date(nowIso).getTime()) / MIN_MS;
  if (!Number.isInteger(diff)) {
    throw new Error(`${what}: offset from now must be a whole number of minutes, got ${diff}`);
  }
  return diff;
}

/** What the SERVER is expected to produce for a vector (see header comment). */
function serverExpectation(v) {
  if (v.server) return v.server;
  if (v.expected == null) return { exists: false };
  const liveOfType = v.logs.filter((l) => l.type === v.breakType && !l.deleted);
  const bufferMinutes = v.expected.bufferMs / MIN_MS;
  if (liveOfType.length > 0) {
    return {
      exists: true,
      anchor: 'log',
      anchorOffsetMinutes: minutesBetween(v.expected.anchor, v.now, `${v.id} anchor`),
      predictedOffsetMinutes: minutesBetween(v.expected.predicted, v.now, `${v.id} predicted`),
      bufferMinutes,
    };
  }
  const earliest = v.feedTimes
    .filter((f) => f.active)
    .map((f) => f.localTime)
    .sort()[0];
  return { exists: true, anchor: 'feed', anchorLocal: earliest, bufferMinutes };
}

function vectorSql(v, index) {
  const n = index + 1;
  const hh = `01100000-0000-0000-0000-${pad(n)}`;
  const pet = `01100000-0000-0000-0001-${pad(n)}`;
  const bt = `${q(v.breakType)}::public.break_type`;
  const label = (s) => q(`${v.id}: ${s}`);
  const row = `from prediction_state where pet_id = ${q(pet)} and break_type = ${bt}`;
  const s = serverExpectation(v);
  const out = [];

  out.push('-- ---------------------------------------------------------------------------');
  out.push(`-- ${v.id}`);
  out.push(`-- ${v.description}`);
  if (v.knownDivergence) {
    out.push('-- KNOWN DIVERGENCE (client != server today). This asserts the SERVER\'s current value;');
    out.push('-- the client value is recorded in shared/fixtures/prediction_vectors.json.');
    out.push(`-- ${v.knownDivergence}`);
  }
  out.push('-- ---------------------------------------------------------------------------');
  out.push('');
  out.push(
    `insert into public.households (id, name, timezone) values (${q(hh)}, ${q(`Parity ${v.id}`)}, ${q(v.householdTz)});`,
  );
  out.push(
    `insert into public.pets (id, household_id, name, species, pee_hold_hours, poop_hold_hours)` +
      ` values (${q(pet)}, ${q(hh)}, ${q(`V${n}`)}, 'dog', ${num(v.peeHoldHours)}, ${num(v.poopHoldHours)});`,
  );
  for (const f of v.feedTimes) {
    out.push(
      `insert into public.feed_times (pet_id, local_time, active) values (${q(pet)}, ${q(f.localTime)}, ${f.active});`,
    );
  }
  v.logs.forEach((l, i) => {
    const off = minutesBetween(l.occurredAt, v.now, `${v.id} log ${i}`);
    out.push(
      `insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at)` +
        ` values (gen_random_uuid(), ${q(hh)}, ${q(pet)}, ${q(l.type)}, now() + make_interval(mins => ${off}),` +
        ` ${q(ALICE)}, ${l.deleted ? 'now()' : 'null'});`,
    );
  });
  // Triggers already recomputed on each insert; call once more so the final state never
  // depends on trigger ordering.
  out.push(`select app.recompute_prediction(${q(pet)}, ${bt});`);
  out.push('');

  if (!s.exists) {
    out.push(`insert into _tap(line) select is(`);
    out.push(`  (select count(*)::int ${row}),`);
    out.push(`  0, ${label('no prediction')});`);
    out.push('');
    return out.join('\n');
  }

  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select count(*)::int ${row}),`);
  out.push(`  1, ${label('a prediction exists')});`);

  if (s.anchor === 'log') {
    out.push(`insert into _tap(line) select is(`);
    out.push(`  (select round(extract(epoch from (anchor_at - now())) / 60)::int ${row}),`);
    out.push(`  ${s.anchorOffsetMinutes}, ${label(`anchor is the latest live log (${s.anchorOffsetMinutes} min from now)`)});`);
    out.push(`insert into _tap(line) select is(`);
    out.push(`  (select round(extract(epoch from (predicted_at - now())) / 60)::int ${row}),`);
    out.push(`  ${s.predictedOffsetMinutes}, ${label(`predicted_at is ${s.predictedOffsetMinutes} min from now`)});`);
    out.push(`insert into _tap(line) select ok(`);
    out.push(`  (select last_log_id is not null ${row}),`);
    out.push(`  ${label('anchored on a log')});`);
  } else {
    out.push(`insert into _tap(line) select is(`);
    out.push(`  (select to_char(anchor_at at time zone ${q(v.householdTz)}, 'HH24:MI') ${row}),`);
    out.push(`  ${q(s.anchorLocal)}, ${label(`anchor is the earliest active feed time (${s.anchorLocal}) in household time`)});`);
    out.push(`insert into _tap(line) select is(`);
    out.push(`  (select (anchor_at at time zone ${q(v.householdTz)})::date ${row}),`);
    out.push(`  (now() at time zone ${q(v.householdTz)})::date, ${label('anchor is on today\'s household-local date')});`);
    out.push(`insert into _tap(line) select ok(`);
    out.push(`  (select predicted_at = case when anchor_at > now() then anchor_at`);
    out.push(`                              else anchor_at + hold_hours::double precision * interval '1 hour' end ${row}),`);
    out.push(`  ${label('predicted = feed anchor if still ahead, else anchor + hold (one step, no roll-forward)')});`);
    out.push(`insert into _tap(line) select ok(`);
    out.push(`  (select last_log_id is null ${row}),`);
    out.push(`  ${label('no log anchor')});`);
  }

  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select buffer_minutes ${row}),`);
  out.push(`  ${s.bufferMinutes}, ${label(`buffer is ${s.bufferMinutes} min`)});`);
  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select round(extract(epoch from (predicted_at - notify_at)) / 60)::int ${row}),`);
  out.push(`  ${s.bufferMinutes}, ${label('notify_at = predicted_at - buffer')});`);
  out.push('');
  return out.join('\n');
}

function generateParitySql(doc) {
  const header = [
    '-- 011_prediction_parity.sql',
    '-- GENERATED by scripts/gen-prediction-parity-sql.js from shared/fixtures/prediction_vectors.json.',
    '-- Do not edit by hand: edit the vectors and re-run `node scripts/gen-prediction-parity-sql.js`.',
    '-- lib/__tests__/predictionVectors.test.ts fails when this file is stale.',
    '--',
    '-- The server half of the golden prediction vectors: app.recompute_prediction() against the',
    '-- same inputs lib/__tests__/predictionVectors.test.ts runs through the client predictBreak().',
    '-- Logs sit at now() + (occurredAt - vector.now), so log-anchored vectors assert exact offsets;',
    '-- feed-anchored vectors depend on the real time of day and assert the algorithm\'s shape.',
    '--',
    '-- Vectors marked KNOWN DIVERGENCE assert the server\'s CURRENT value (Phase 0.5 fixes them).',
    '--',
    '-- Run (after 000_helpers.sql):',
    '--   supabase db query --linked -f supabase/tests/011_prediction_parity.sql',
    '',
    'begin;',
    '',
    'create temp table _tap (seq serial primary key, line text) on commit drop;',
    'grant all on _tap to public;',
    'grant all on sequence _tap_seq_seq to public;',
    'select * from no_plan();',
    'select tests.seed_fixtures();',
    '',
  ];
  const body = doc.vectors.map(vectorSql);
  const footer = [
    '-- ---------------------------------------------------------------------------',
    '-- Report',
    '-- ---------------------------------------------------------------------------',
    '',
    'select',
    '  (select count(*) from _tap)                                  as tests_run,',
    "  (select count(*) from _tap where line like 'not ok%')         as failed,",
    '  coalesce((select string_agg(line, \' | \' order by seq)',
    "              from _tap where line like 'not ok%'), 'ALL PASS') as failures;",
    '',
    'rollback;',
    '',
  ];
  return [...header, ...body, ...footer].join('\n');
}

module.exports = { generateParitySql, serverExpectation };

if (require.main === module) {
  const doc = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'));
  fs.writeFileSync(SQL_PATH, generateParitySql(doc));
  console.log(`wrote ${path.relative(ROOT, SQL_PATH)} (${doc.vectors.length} vectors)`);
}
