#!/usr/bin/env node
/**
 * Writes the GENERATED block of supabase/tests/012_care_pushes.sql from
 * shared/fixtures/care_vectors.json.
 *
 * One vectors file drives both copies of the walks / habitat due maths (docs/CARE_MODULES_PLAN.md,
 * "Guardrails" 4 and Phase 3 "Parity vectors green on both sides"): lib/__tests__/careVectors.test.ts
 * checks the client (predictWalk / habitatDue) against it, and the SQL this script emits checks
 * app.recompute_care() (migration 0022). The jest suite fails when the committed block is stale,
 * so edit the JSON and re-run:
 *
 *   node scripts/gen-care-parity-sql.js
 *
 * Only the text between the BEGIN/END GENERATED markers is replaced; the rest of 012 is
 * hand-written. Every vector instant is absolute — neither due time depends on now() — so the
 * server assertions are exact.
 *
 * CommonJS on purpose: jest requires it directly (no ESM interop needed).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VECTORS_PATH = path.join(ROOT, 'shared', 'fixtures', 'care_vectors.json');
const SQL_PATH = path.join(ROOT, 'supabase', 'tests', '012_care_pushes.sql');

const BEGIN = '-- BEGIN GENERATED care vectors (scripts/gen-care-parity-sql.js) — do not edit by hand';
const END = '-- END GENERATED care vectors';

const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';

function q(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function num(n) {
  return n == null ? 'null' : String(n);
}

function pad(n) {
  return String(n).padStart(12, '0');
}

function vectorSql(v, index) {
  const n = index + 1;
  const hh = `01200000-0000-0000-0000-${pad(n)}`;
  const pet = `01200000-0000-0000-0001-${pad(n)}`;
  const label = (s) => q(`${v.id}: ${s}`);
  const row = `from public.care_state where pet_id = ${q(pet)} and module = ${q(v.module)}`;
  const out = [];

  out.push('-- ---------------------------------------------------------------------------');
  out.push(`-- ${v.id}`);
  out.push(`-- ${v.description}`);
  out.push('-- ---------------------------------------------------------------------------');
  out.push('');
  out.push(
    `insert into public.households (id, name, timezone) values (${q(hh)}, ${q(`Care ${v.id}`)}, ${q(v.householdTz)});`,
  );
  out.push(
    `insert into public.pets (id, household_id, name, species, care_modules, walk_interval_hours, habitat_interval_days)` +
      ` values (${q(pet)}, ${q(hh)}, ${q(`C${n}`)}, 'other', ${q(`{${v.module},meals}`)}, ${num(v.walkIntervalHours)}, ${num(v.habitatIntervalDays)});`,
  );
  for (const l of v.logs) {
    out.push(
      `insert into public.logs (id, household_id, pet_id, type, occurred_at, created_by, deleted_at)` +
        ` values (gen_random_uuid(), ${q(hh)}, ${q(pet)}, ${q(l.type)}, ${q(l.occurredAt)}::timestamptz,` +
        ` ${q(ALICE)}, ${l.deleted ? 'now()' : 'null'});`,
    );
  }
  // Triggers already recomputed on each insert; call once more so the final state never depends
  // on trigger ordering.
  out.push(`select app.recompute_care(${q(pet)}, ${q(v.module)});`);
  out.push('');

  if (v.expected == null) {
    out.push(`insert into _tap(line) select is(`);
    out.push(`  (select count(*)::int ${row}),`);
    out.push(`  0, ${label('nothing is due')});`);
    out.push('');
    return out.join('\n');
  }

  const e = v.expected;
  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select count(*)::int ${row}),`);
  out.push(`  1, ${label('a care_state row exists')});`);
  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select anchor_at ${row}),`);
  out.push(`  ${q(e.anchor)}::timestamptz, ${label(`anchor is the latest live log (${e.anchor})`)});`);
  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select due_at ${row}),`);
  out.push(`  ${q(e.dueAt)}::timestamptz, ${label(`due_at = ${e.dueAt} (client parity)`)});`);
  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select notify_at ${row}),`);
  out.push(`  ${q(e.notifyAt)}::timestamptz, ${label(`notify_at = ${e.notifyAt}`)});`);
  out.push(`insert into _tap(line) select is(`);
  out.push(`  (select buffer_minutes ${row}),`);
  out.push(`  ${e.bufferMinutes}, ${label(`buffer is ${e.bufferMinutes} min`)});`);
  out.push('');
  return out.join('\n');
}

/** The generated block, markers included. */
function generateCareParityBlock(doc) {
  return [BEGIN, '', ...doc.vectors.map(vectorSql), END].join('\n');
}

/** `sql` with its generated block replaced (line endings normalised to LF). */
function spliceCareParity(sql, doc) {
  const text = sql.replace(/\r\n/g, '\n');
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) {
    throw new Error(`012_care_pushes.sql is missing the generated-block markers`);
  }
  return text.slice(0, start) + generateCareParityBlock(doc) + text.slice(end + END.length);
}

/** The generated block as it currently sits in `sql` (LF-normalised), or null. */
function extractCareParity(sql) {
  const text = sql.replace(/\r\n/g, '\n');
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < start) return null;
  return text.slice(start, end + END.length);
}

module.exports = { generateCareParityBlock, spliceCareParity, extractCareParity };

if (require.main === module) {
  const doc = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'));
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  fs.writeFileSync(SQL_PATH, spliceCareParity(sql, doc));
  console.log(`updated ${path.relative(ROOT, SQL_PATH)} (${doc.vectors.length} care vectors)`);
}
