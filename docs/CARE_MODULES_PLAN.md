# Care modules: refined plan

## In one minute

- **Onboarding gets one new question, "What do you want help with?"** The answer is saved on each pet and can be changed later in pet settings. If the owner ticks everything, Today, Coming up, the + Log menu and every reminder behave exactly as they do now, and tests prove it before we change anything else.
- **Each kind of care is a small, self-contained "module":** potty, walks, meals, meds, vet visits and habitat cleaning. Screens show whatever the pet's modules provide and never check whether the pet is a dog or a cat. Adding a module means adding one file and one line in a list. Adding a species means adding one row in a table.
- **The pee/poo prediction and its push notification are not touched,** apart from an on/off switch. The flagship flow keeps its current code, database tables and notification format.
- **Your choices are saved as an explicit list on each pet, not as "use the defaults".** The server can't read the app's defaults table, so "use the defaults" would let the phone and the server disagree about whether a potty push should fire.
- **Existing pets keep exactly what they have today** (potty, meals, meds, visits). Walks and habitat cleaning are opt-in, so nobody gets surprise reminders after an update.
- **Before any new feature, we fix three places where the phone and the server already predict slightly different times.** We also add a test harness; the project has no test runner today.
- **Rollout order protects people on older app versions.** First we ship an app update that quietly ignores new kinds of log and notification. Only after that do we add them.

## Decisions made

| Decision | Choice | Why |
|---|---|---|
| Where care goals live | Per pet, editable by editors only (not walkers) | A cat and a fish in one household need different modules. `pets` already has editor-only RLS and is already synced. |
| Defaults vs stored list | Store an explicit list on every pet. The species table is read only when a pet is created and by a "Reset to suggested" button. | The server cannot read a TypeScript table, and a third copy of the logic is the drift CLAUDE.md warns about. |
| Backfill for existing pets | `{potty, meals, meds, visits}` | That is exactly today's behaviour. Backfilling walks/habitat would start new reminders when Phase 2 ships. |
| Module id type in Postgres | A text **domain** with a CHECK, not an enum | An enum value can never be removed and can't be used in the transaction that adds it. A domain CHECK can be redefined inside one migration. |
| Where potty is switched off on the server | Inside `app.recompute_prediction` | It is the single choke point. All four triggers, `due_break_predictions` and reconcile read `prediction_state`, so they inherit the gate. |
| `break_type`, `prediction_state`, `break:` dedupe key | Frozen | Widening them would ripple into every dispatch RPC and could re-send pushes. The client's `=== 'pee' ? … : poo` ternaries would show a walk as a poo break. |
| Cat litter visits | Reuse `pee`/`poo`; the species table supplies the wording | No server change. Log types name the action, not the species. |
| Habitat engine | Date-based "due on day N" (calendar-style), not the hold-hour rhythm | A 10–45 min buffer and a feed-time anchor make no sense for "clean the tank weekly". |
| Walk/habitat config storage | Typed columns on `pets` for now. A generic child table only when a third interval setting appears. | `pets` already has RLS, realtime and `pull_changes`. A new table would need all of that, and would need to avoid copying the hard-delete gap in `feed_times_write` (`0006:152`). |
| Hero priority | Strict fixed order (potty, walks, meds, meals, habitat, visits) | It reproduces today's hero exactly. "Most urgent first" can come later as one change to `heroFor`. |
| Does a walk count as a pee? | No, not in v1. A "Walk + pee" quick action writes two logs. | This follows the existing `'both'` precedent (`QuickLogMenu.tsx:70-72`). Modules never read each other's logs. |
| New push kind | One generic `care_due` kind, Done / Snooze | This is the last two-sided contract change for any future module. |
| Guardrail tooling | `scripts/check-boundaries.mjs` (grep), run as an npm script | There is no ESLint and no test runner in `package.json` today. |

## Architecture

### Config inputs

1. **Species profile.** `lib/care/species.ts` has one row per species, using the existing `Species` union in `lib/db/models.ts:16-17`. Each row lists the modules offered, the pre-ticked defaults, wording, and the habitat noun. The wording currently in `lib/petVoice.ts:139-160` (`pottyPlace`, `pottyBreakPhrase`) moves in here. Watch one thing: `pottyPlace('dog')` currently returns `'walk'`. Once a real Walks module exists that wording is ambiguous, so the potty copy for dogs becomes "potty break / potty walk", and "Walk" is reserved for the walks module.
2. **Care goals.** `Pet.careModules: CareModuleId[]` is non-null, and is written by `PetWizard` and pet settings through `repos.pets.update`.

### Module contract (pure TypeScript, no React)

```ts
// lib/care/types.ts
export type CareModuleId = 'potty'|'walks'|'meds'|'meals'|'habitat'|'visits';

export interface CareSnapshot {
  pet: Pet; feedTimes: FeedTime[]; meds: Medication[]; logs: LogEntry[];
  appts: Appointment[]; now: Date; profile: SpeciesProfile;
}

export interface CareModule {
  id: CareModuleId;
  priority: number;                       // potty 10, walks 20, meds 30, meals 40, habitat 50, visits 60
  appliesTo: readonly Species[];
  logTypes: readonly LogType[];           // the only log types this module may read or write
  status?(s: CareSnapshot): 'ready' | 'calibrating' | 'needsInfo';
  upcoming?(s: CareSnapshot): UpcomingItem[];
  hero?(s: CareSnapshot): HeroModel | null;          // data only: kicker, headline, progress, late
  quickLog?(s: CareSnapshot): QuickLogAction[];      // { key, icon, label, writes: NewLogInput[] }
  reminders?(s: CareSnapshot, prefs: NotificationPrefs): DesiredNotification[];
  nudges?(s: CareSnapshot, snoozes: Record<string, number>): PendingNudge[];
}
```

Every facet is optional, so a module implements only what it needs and the interface doesn't grow into one every module must fully satisfy. Settings UI sits outside the module, in `components/care/sections.tsx`, which maps each `CareModuleId` to a React section. That keeps `lib/care/**` testable in plain Node.

### Resolving the care plan

```ts
// lib/care/plan.ts
resolvePlan(pet) = REGISTRY
  .filter(m => m.appliesTo.includes(pet.species) && pet.careModules.includes(m.id))
  .sort(byPriority);
heroFor(plan, s)   = first non-null m.hero(s), else "all caught up"
petStatus(plan, s) = 'ready' if any module is ready
```

- Today `getPetStatus` (`petSchedule.ts:51`) gates the whole pet on `hasSchedule`, which requires both pee and poo holds (`:33-36`). That check moves into `potty.status()`. Without the move, a cat with potty switched off would read "calibrating" and then "needsInfo" forever.
- The PetCard hero currently hard-codes `.find(u => u.type !== 'food')` and `'Poo break' : 'Pee break'` (`PetCard.tsx:109-111`). That logic becomes `potty.hero()`.

### Engines (we re-organise existing code, we don't rewrite it)

- **Rhythm** (`lib/care/engines/rhythm.ts`): `nextRepeating` and `bufferMsFor` (`petSchedule.ts:143-154`), extracted verbatim. Buffer, clamp and anchor fallback become parameters the module supplies, and potty passes today's values. Potty's log-anchor branch (`predictBreak`, `:202-209`) and its fallback to the earliest feed time stay inside the potty module. `predictBreak` stays the single kernel for both the UI and the scheduler.
- **Schedule** (clock times): `getTodaysMeals` and `getUpcomingMedications`, unchanged.
- **Calendar** (dated items): appointments, plus habitat's "due on household-local date `lastCleaned + N days`". It fires at a fixed local hour and stays overdue, never rolling forward.

### How screens use it

- `useCareOutputs(petId)` returns `{ hero, upcoming, quickLog, status }` from one `useMemo` over the snapshot plus `useNow()`. The plan is memoised on `[pet.species, pet.careModules.join()]`.
- `app/(tabs)/index.tsx`, `PetCard`, `UpcomingSection` and `QuickLogMenu` read only from this hook.
- `QuickLogMenu` swaps its literal `dx/dy` values (`QuickLogMenu.tsx:27-31`) for `arcLayout(n, radius)`. The menu caps at 5 items, and the rest go to an "Other" sheet.
- The `['pee','poo']` loops at `scheduler.ts:255` and `pending.ts:101` become `plan.flatMap(m => m.reminders?.(s, prefs) ?? [])`. Mute, quiet hours, snooze and reconcile stay global and untouched.

## Species profiles

| Species | Offered | Pre-ticked | Wording | Notes |
|---|---|---|---|---|
| dog | potty, walks, meals, meds, visits | potty, walks, meals, meds, visits | "potty break", "walk" | The only species with walks |
| cat | potty, habitat, meals, meds, visits | habitat, meals, meds, visits | "litter box trip"; habitat = "litter tray" | Potty is offered but off by default. Litter trips reuse `pee`/`poo`. |
| rabbit | potty, habitat, meals, meds, visits | habitat, meals, meds, visits | "litter box"; habitat = "hutch" | |
| hamster | habitat, meals, meds, visits | same | habitat = "cage" | |
| bird | habitat, meals, meds, visits | same | habitat = "cage" | |
| fish | habitat, meals, visits | habitat, meals | habitat = "tank" | Default interval 7 days |
| turtle / snake | habitat, meals, meds, visits | habitat, meals, visits | habitat = "tank" / "enclosure" | |
| other | all six | meals, meds, visits | generic | |

These defaults apply **only to new pets**. Existing pets of any species keep the backfilled list, which includes potty. Today nothing checks species, so an existing cat with hold hours already gets pee/poo pushes, and it will keep getting them.

## Data and backend changes

Migrations are listed in order. Each enum addition sits alone in its own file: `supabase db push` wraps each file in a transaction, and a value added with `ALTER TYPE … ADD VALUE` can't be used in the transaction that added it.

**0018_prediction_parity.sql** (Phase 0.5, fixing an existing divergence). I verified this one. The client predicts `anchor + hold` after any real log (`petSchedule.ts:202-209`), and its comment claims this matches the server. But `recompute_prediction` still applies `if v_anchor > now() then v_predicted := v_anchor` to log anchors as well (`0017:196-200`). Restate the function in full so the `> now()` branch applies only to the feed-time fallback anchor. Add a pgTAP case with a future-dated log.

**0019_care_modules.sql** (Phase 1):

```sql
create domain public.care_module as text
  check (value in ('potty','walks','meals','meds','visits','habitat'));
alter table public.pets add column care_modules public.care_module[] not null
  default '{potty,meals,meds,visits}';
create function app.module_enabled(p_pet uuid, p_m public.care_module) returns boolean
  language sql stable security definer set search_path = public as
  $$ select coalesce((select p_m = any(care_modules) from public.pets where id = p_pet), false) $$;
-- recompute_prediction restated in full (0018 body + gate):
--   if not app.module_enabled(p_pet_id,'potty') then
--     delete from prediction_state where pet_id=p_pet_id and break_type=p_type; return; end if;
drop trigger trg_pets_schedule_change on public.pets;
create trigger trg_pets_schedule_change
  after update of pee_hold_hours, poop_hold_hours, archived_at, care_modules on public.pets ...;
-- in the trigger function: when 'potty' left the array,
--   update notifications set status='superseded'
--    where pet_id=new.id and kind='break_prediction' and status='sent';
```

The gate sits next to the existing null-hold exit (`0017:160-163`). No species logic goes into SQL, ever.

**0020_care_enums.sql** (Phase 2). It contains only these three lines:

```sql
alter type public.log_type   add value if not exists 'walk';
alter type public.log_type   add value if not exists 'habitat_clean';
alter type public.notif_kind add value if not exists 'care_due';
```

**0021_care_config.sql** (Phase 2):
- `pets.habitat_interval_days smallint check (habitat_interval_days between 1 and 90)`.
- `pets.walk_interval_hours numeric(4,1) check (walk_interval_hours between 0.5 and 24)`. Walks run on an interval, as decided below.
- A TypeScript adapter, `rhythmsForPet(pet)`, hides where each setting is stored.

**0022+ (Phase 3)**:
- A `care_state` table and `app.recompute_care`, using the same anchor-plus-one-interval, never-roll-forward rule.
- Dedupe key `care:{pet}:{module}:{household-local date}`.
- Dispatch only to tokens whose `notification_tokens.app_version` (already present, `0004:15`) is at or above the tolerant build.
- `prediction_state` and the `break:{pet}:{type}:{ts}[:rN]` key (`0017:93-97`) are not touched.

**Contract changes.** These are two-sided, and frontend and backend must both sign off.

- **Release N** (client only):
  - `toLogEntry` (`models.ts:287`) currently passes `r.type` through unchecked; it narrows unknown types to `'other'`.
  - `isPawClockPush` currently checks only `typeof d.kind === 'string'` (`notificationContracts.ts:146`); it will accept known kinds only.
  - `PendingNudge` gains `icon`, which removes the `subtitle.startsWith('Pee')` check (`NudgeBanner.tsx:83`).
  - One `lib/care/logTypes.ts` presentation table with an explicit `unknown` row replaces `LOG_VISUAL` (`history.tsx:42`) and `TYPE_STYLE` (`Timeline.tsx:12`). Both already fall back to `.other`, so old builds won't crash, but their `Record<LogType,…>` types hide that fallback.
- **After 0020:**
  - `LogType` gains `'walk' | 'habitat_clean'` (`models.ts:20`).
  - Add `CareModuleId` and a `care_due` payload `{careModule, petId, dueOn}`.
  - `PUSH_PAYLOAD_VERSION` stays at 1.
  - Regenerate `types.gen.ts`; never hand-edit it. The domain array comes out as `string[]`, so `models.ts` narrows it.

**What stays untouched:** `break_type` (`0002:23`), the `prediction_state` PK, `mark_break_dispatched`, `snooze_break`, `record_break_no`, `reask_seq`, the `break:` key shape, the `log-action` break path, and the `p_type::text::public.log_type` cast (`0017:178`).

## Guardrails that keep it from diverging

1. `scripts/check-boundaries.mjs`, run with `npm run check:boundaries`, fails if `app/**` or `components/**` contains the literals `'pee'`, `'poo'` or any species name, or accesses `.species`. `lib/care/**` and `components/care/**` are exempt.
2. `CarePlan` and `useCareOutputs` expose neither species nor log types, so a screen can't branch on them without a type error.
3. A module may read only the `logTypes` it declares, and a unit test asserts this for each module.
4. One file, `shared/fixtures/prediction_vectors.json`, drives Jest and a generated `supabase/tests/011_prediction_parity.sql`, so both copies of the algorithm are checked against identical inputs.
5. Every change to the contract files or to `species.ts` needs sign-off from both frontend and backend.
6. Update CLAUDE.md's "Current wiring state". It still says the app and backend are not connected, but `lib/repo/synced.ts` is live, so rollout order matters now.

## Testing

- **Characterization snapshots (Phase 0):** `npx expo install jest-expo jest @types/jest`. Snapshot these five outputs over `data/mockData.ts` at several pinned `now` values:
  - `getUpcomingForPet`
  - `computeDesiredNotifications`
  - `computePendingNudges`
  - QuickLogMenu items
  - the PetCard hero model

  They define "everything ticked behaves exactly like today" and must stay byte-identical through Phase 1.
- **Golden vectors:** (anchor, hold, feed times, household tz, device tz, now) → (predicted, buffer, notifyAt, overdueBy). They include a future-dated log, a pet with one hold set, and a case where the device timezone differs from the household timezone. That last case is a third divergence I verified: `activeFeedSlots` parses feed times in device-local time (`petSchedule.ts:22-28`), while the server uses `households.timezone` (`0017:184`).
- **New pgTAP suite `010_care_modules.sql`** checks that:
  - backfilled pets have potty, meals, meds and visits
  - switching potty off deletes `prediction_state` and supersedes a `'sent'` break push
  - switching it back on gives the same `predicted_at`
  - `due_break_predictions` is empty when potty is off
  - meals, meds and visits still dispatch when potty is off
  - a walker cannot update `care_modules`
  - the `break:` key for an existing pet is unchanged
- **Module unit tests** in plain Node, one per module.

## Rollout phases

| Phase | Scope | Files | Exit criteria |
|---|---|---|---|
| **0: Safety net** | Test runner, snapshots, golden vectors, boundary script, CLAUDE.md fix | `package.json`, `lib/__tests__/`, `shared/fixtures/`, `scripts/` | Snapshots green; nothing in behaviour changed |
| **0.5: Parity fixes** | Three separate PRs: server log-anchor `> now` (0018); per-type `hasSchedule`; feed-time timezone handled on the client | `petSchedule.ts`, `0018`, `003_prediction_math.sql` | Each PR includes a deliberate, reviewed snapshot update and a pgTAP case |
| **Release N** | Tolerance for unknown values (see Contract changes) | `models.ts`, `notificationContracts.ts`, `lib/care/logTypes.ts`, `NudgeBanner.tsx`, `pending.ts` | Shipped to the stores |
| **1: Foundation** | Migration 0019, `lib/care/**` wrapping today's code, goals step in `PetWizard` (STEPS at `:28` becomes About → Goals → Routine → Meds), Routine shows only enabled sections, settings section. Strangler order, one consumer per PR: logTypes → nudges → Timeline/history → QuickLogMenu → UpcomingSection → PetCard hero → scheduler loop → wizard. | `lib/care/*`, `components/care/*`, the screens listed, `0019`, `010_care_modules.sql` | Snapshots byte-identical with everything ticked; boundary script passes; pgTAP 003/004/006/010 green |
| **2: Walks + habitat** | 0020 (enums only), 0021 (config), both modules, local reminders behind a `care.rhythms` flag, existing pets opt in | `lib/care/modules/{walks,habitat}.ts`, `species.ts`, `models.ts` | Release N has been in the stores for at least one cycle; module tests green |
| **3: Server pushes** | `care_due` dispatch, `care_state`, `recompute_care`, Done/Snooze category, `log-action` gets a `care_due` branch (the break branch is untouched) | `0022+`, `supabase/functions/*`, `categories.ts` | Parity vectors green on both sides; app-version gate verified |

## Risks and how we handle them

- **The phone and the server disagree on whether a potty push exists.** We store an explicit module list (no read-time defaults) and gate in exactly one SQL function, mirrored by `potty.status()`/`reminders()` returning nothing.
- **Pushes keep firing after potty is switched off.** The trigger watches `care_modules`, and switching off supersedes in-flight `'sent'` pushes. pgTAP proves it.
- **Older app versions see unknown logs or pushes.** Release N tolerance ships first, server pushes are gated on app version, and enum values ship alone in their own file.
- **The refactor silently changes today's behaviour.** Characterization snapshots, strangler PRs, and parity fixes land in their own PRs, never inside a "refactor".
- **The interface bloats over time.** Facets are optional, modules are pure, and the UI lives elsewhere.
- **Walk and potty logs get tangled.** No cross-module reads. Any future "walk counts as pee" becomes an explicit `anchorTypes` declaration, mirrored in SQL.
- **Duplicate walk/habitat reminders across two caregivers in Phase 2.** Accepted: reminders are local only. A log from either caregiver syncs and reschedules both devices. Phase 3 fixes this server-side.

## Product owner decisions (answered 2026-11-19)

1. **Dog walks run on an interval:** "every N hours since the last walk". Walks use the rhythm engine, so migration 0021 adds `pets.walk_interval_hours`; the `pet_walk_times` table option is dropped.
2. **Cats: potty prediction is off by default, with an option to turn it on.** There are no existing cats to migrate, so new cats start without potty and the owner can tick it in onboarding or pet settings.
3. **Strict priority:** potty leads the Today card even when meds are late, as in the v1 order above.
4. **Habitat "due today" reminders fire at 10:00 household time.** One fixed time for now, adjustable later.

## Where the reviewers disagreed

- **Module ids as enum vs domain:** domain. It can be widened without a permanent value or a transaction trap.
- **Backfill four modules vs six:** four. Existing pets must not gain new reminders.
- **Generic `pet_rhythms` table vs typed columns:** typed columns on `pets` until a third interval setting exists, because `pets` already has RLS, sync and realtime.
- **Habitat on the rhythm engine vs date-based:** date-based. The hold-hour buffer is wrong for multi-day intervals.
- **Push kind name (`rhythm` / `rhythm_reminder` / `care_due`):** `care_due`, one generic kind.
- **"Old builds crash on `walk`":** they don't. `history.tsx:79` and `Timeline.tsx:56` already fall back, so Release N is small but still required, because `toLogEntry` and `isPawClockPush` don't narrow.
- **Add `app_version` to push tokens in Phase 2:** not needed. `notification_tokens.app_version` already exists (`0004:15`).

Key files verified: `C:\Users\srina\OneDrive\Desktop\work space\PetClock\lib\petSchedule.ts`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\supabase\migrations\0017_review_fixes.sql`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\supabase\migrations\0005_functions_triggers.sql`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\lib\notifications\scheduler.ts`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\lib\notifications\pending.ts`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\components\PetCard.tsx`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\components\QuickLogMenu.tsx`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\shared\notificationContracts.ts`, `C:\Users\srina\OneDrive\Desktop\work space\PetClock\lib\db\models.ts`.