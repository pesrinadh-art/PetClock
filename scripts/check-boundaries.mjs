#!/usr/bin/env node
/**
 * Care-modules boundary check (docs/CARE_MODULES_PLAN.md, "Guardrails" 1).
 *
 * Screens and components must not branch on break types or species: they read whatever the
 * pet's care modules provide. This fails (exit 1) when a file under app/** or components/**
 * (components/care/** is exempt, as is lib/**) contains:
 *   - the string literal 'pee' or 'poo'
 *   - a species string literal ('dog', 'cat', 'rabbit', 'hamster', 'bird', 'turtle', 'snake', 'fish')
 *   - a `.species` property access
 *
 * The codebase already has such usages, so scripts/boundaries-allowlist.json records today's
 * offending lines (file + trimmed line text + count; line numbers are deliberately NOT used, so
 * unrelated edits above a line don't break the check). Only NEW violations fail. Later stages
 * shrink the allowlist as screens move onto lib/care; stale entries are reported so they can be
 * deleted.
 *
 *   npm run check:boundaries                 # check
 *   node scripts/check-boundaries.mjs --update   # rewrite the allowlist from the current tree
 *                                               # (only to SHRINK it — review the diff)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// BOUNDARIES_ALLOWLIST overrides the allowlist path (used to exercise the failure path).
const ALLOWLIST_PATH = process.env.BOUNDARIES_ALLOWLIST
  ? path.resolve(process.env.BOUNDARIES_ALLOWLIST)
  : path.join(ROOT, 'scripts', 'boundaries-allowlist.json');
const SCAN_DIRS = ['app', 'components'];
const EXEMPT_PREFIXES = ['components/care/'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const SPECIES = ['dog', 'cat', 'rabbit', 'hamster', 'bird', 'turtle', 'snake', 'fish'];

const RULES = [
  { id: 'break-literal', re: /(['"`])(pee|poo)\1/, why: "string literal 'pee'/'poo'" },
  { id: 'species-literal', re: new RegExp(`(['"\`])(${SPECIES.join('|')})\\1`), why: 'species string literal' },
  { id: 'species-access', re: /\.species\b/, why: '`.species` access' },
];

/**
 * Narrow, documented exemptions: lines that match a rule textually but are not a break-type or
 * species branch. Each entry is one file + one line shape — keep this list tiny.
 *   - components/Icon.tsx: members of the `IconName` string union (e.g. `| 'poo'`). 'poo' there
 *     is a glyph NAME, not a log type, so renaming it across the app would buy nothing.
 */
const LINE_EXEMPTIONS = [
  { file: 'components/Icon.tsx', re: /^\|\s*'[A-Za-z][A-Za-z0-9]*'\s*(\/\/.*)?$/ },
];

function isExemptLine(rel, trimmed) {
  return LINE_EXEMPTIONS.some((e) => e.file === rel && e.re.test(trimmed));
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Map of "file\u0000trimmedLine" -> { file, line, count, firstLineNo, rules }. */
function collectViolations() {
  const found = new Map();
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d), []));
  for (const abs of files.sort()) {
    const rel = toPosix(path.relative(ROOT, abs));
    if (EXEMPT_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const hits = RULES.filter((r) => r.re.test(raw));
      if (hits.length === 0) return;
      const line = raw.trim();
      if (isExemptLine(rel, line)) return;
      const key = `${rel}\u0000${line}`;
      const prev = found.get(key);
      if (prev) prev.count += 1;
      else found.set(key, { file: rel, line, count: 1, firstLineNo: i + 1, rules: hits.map((h) => h.why) });
    });
  }
  return found;
}

function readAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) return new Map();
  const doc = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const map = new Map();
  for (const e of doc.entries ?? []) {
    const key = `${e.file}\u0000${e.line}`;
    map.set(key, (map.get(key) ?? 0) + (e.count ?? 1));
  }
  return map;
}

function writeAllowlist(found) {
  const entries = [...found.values()]
    .sort((a, b) => (a.file === b.file ? a.firstLineNo - b.firstLineNo : a.file < b.file ? -1 : 1))
    .map(({ file, line, count }) => (count > 1 ? { file, line, count } : { file, line }));
  const doc = {
    $comment:
      'Pre-existing care-module boundary violations (scripts/check-boundaries.mjs). Matched by file + trimmed line text. ' +
      'This list may only SHRINK: remove entries as screens move onto lib/care. Never add new entries to get a check to pass.',
    entries,
  };
  fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(doc, null, 2) + '\n');
  return entries.length;
}

const found = collectViolations();

if (process.argv.includes('--update')) {
  const n = writeAllowlist(found);
  console.log(`check:boundaries: wrote ${n} entries to ${toPosix(path.relative(ROOT, ALLOWLIST_PATH))}.`);
  console.log('Review the diff: the allowlist must only ever shrink.');
  process.exit(0);
}

const allowed = readAllowlist();
const failures = [];
for (const [key, v] of found) {
  const ok = allowed.get(key) ?? 0;
  if (v.count > ok) failures.push({ ...v, extra: v.count - ok });
}
const stale = [];
for (const [key, count] of allowed) {
  const now = found.get(key)?.count ?? 0;
  if (now < count) {
    const [file, line] = key.split('\u0000');
    stale.push({ file, line, unused: count - now });
  }
}

if (stale.length > 0) {
  console.log(`check:boundaries: ${stale.length} allowlist entr${stale.length === 1 ? 'y is' : 'ies are'} no longer needed (delete them from scripts/boundaries-allowlist.json):`);
  for (const s of stale) console.log(`  - ${s.file}: ${s.line}${s.unused > 1 ? `  (x${s.unused})` : ''}`);
}

if (failures.length > 0) {
  console.error(`\ncheck:boundaries: FAILED — ${failures.length} new boundary violation${failures.length === 1 ? '' : 's'} in app/** or components/**:\n`);
  for (const f of failures) {
    console.error(`  ${f.file}:${f.firstLineNo}  [${f.rules.join(', ')}]`);
    console.error(`      ${f.line}${f.extra > 1 ? `  (x${f.extra} new)` : ''}`);
  }
  console.error(
    '\nScreens must not branch on pee/poo or species. Read the value from the pet\'s care modules ' +
      '(lib/care/**, components/care/**) instead. See docs/CARE_MODULES_PLAN.md "Guardrails".',
  );
  process.exit(1);
}

const total = [...found.values()].reduce((n, v) => n + v.count, 0);
console.log(`check:boundaries: OK (${total} pre-existing allowlisted occurrence${total === 1 ? '' : 's'}, no new violations).`);
