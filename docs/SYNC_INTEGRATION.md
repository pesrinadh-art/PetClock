# Sync integration guide (BE-2)

How the client should consume realtime and delta-pull. Written for the frontend track —
this is the BE-2 handoff.

**Backing migration:** `supabase/migrations/0015_realtime_and_sync.sql`
**Tests:** `supabase/tests/007_sync.sql` (17 assertions)

---

## The one rule

**Realtime is an optimisation. The pull is the source of truth.**

Subscribing tells you about changes *from now on*. It does not tell you what you missed
while the app was closed, backgrounded, or between the socket dropping and reconnecting.

So the pattern is always **both**:

```
subscribe  →  pull  →  apply events as they arrive
```

Never subscribe alone. Never pull once and assume the socket covers the rest.

### Why this is not hypothetical

Verified against staging with three real users: an INSERT written immediately after
`SUBSCRIBED` was **silently missed**, then the very next event on the same channel arrived
fine. Re-running passed. It is a genuine race — `SUBSCRIBED` means the channel joined, not
that the server-side replication filter is live.

A client that trusts the socket alone will lose writes occasionally and have no idea.
Pulling right after subscribing closes the window, because the pull is cursor-based and
picks up anything the socket missed.

---

## What is published

| Table | Published | Why |
|---|---|---|
| `logs` | ✅ | the flagship — the partner's timeline updating live |
| `pets` | ✅ | renames, hold-time changes |
| `feed_times` | ✅ | schedule edits |
| `medications` | ✅ | schedule edits |
| `appointments` | ✅ | including child changes, see below |
| `prediction_state` | ❌ | **derive it locally** |
| `notifications` | ❌ | idempotency spine, not broadcast material |
| `notification_tokens` | ❌ | PII |
| `appointment_pets` | ❌ | surfaces through the parent |
| `appointment_reminders` | ❌ | surfaces through the parent |

### Two of those need explaining

**`prediction_state` is deliberately not published.** It changes on every log *and* every
dispatch, and the client already computes the identical prediction from the same inputs —
`lib/petSchedule.ts` and `app.recompute_prediction` implement the same algorithm, and that
parity is enforced by `003_prediction_math.sql`. Publishing it would roughly double channel
traffic to tell the client something it can derive the instant the log event lands.

**Appointment children surface through the parent.** Attaching a pet or adding a reminder
touches `appointments.updated_at`, so you get one event on the parent and re-read it whole.
`pull_changes` returns appointments with `pet_ids` and `reminder_offsets_minutes` already
attached, which is the shape `lib/db/models.ts` wants anyway.

---

## Subscribing

Get the household id first — it names the channel and filters the household-scoped tables:

```ts
const { data: householdId } = await supabase.rpc('my_household_id');
```

Returns `null` for an expired walker, who should not be subscribed to anything.

```ts
const channel = supabase
  .channel(`household:${householdId}`)
  // household-scoped tables can be filtered server-side
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'logs',
        filter: `household_id=eq.${householdId}` }, onRow)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'pets',
        filter: `household_id=eq.${householdId}` }, onRow)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'appointments',
        filter: `household_id=eq.${householdId}` }, onRow)
  // feed_times and medications are pet-scoped and have no household_id column, so they
  // cannot be filtered this way. Subscribe unfiltered — RLS still scopes every row to
  // your household, it just costs a per-row check instead of a server-side filter.
  .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_times' }, onRow)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'medications' }, onRow)
  .subscribe();
```

The client's JWT must be on the socket or RLS cannot be evaluated per subscriber.
`supabase-js` normally handles this, but after a token refresh call it explicitly:

```ts
supabase.realtime.setAuth(session.access_token);
```

---

## Pulling

One round trip for everything that changed:

```ts
const { data } = await supabase.rpc('pull_changes', { p_since: cursor ?? '1970-01-01T00:00:00Z' });

// { serverTime, pets[], feedTimes[], medications[], logs[], appointments[] }
await applyToLocalStore(data);
await saveCursor(data.serverTime);
```

### Store `serverTime`, never a device clock

The cursor comes back from the server precisely so a phone with a skewed clock cannot skip
or replay changes. Persist it; send it back next time.

### Deleted rows arrive, and that is the point

`pull_changes` **includes** soft-deleted rows. A row with `deleted_at` set is a
**tombstone** — the only signal that something was undone on another device. Apply it by
removing the row locally.

Filtering tombstones out would strand deleted logs on every device that was offline when
the delete happened.

```ts
for (const log of data.logs) {
  if (log.deleted_at) await local.logs.remove(log.id);
  else                await local.logs.upsert(toLogEntry(log));
}
```

---

## When to pull

| Moment | Why |
|---|---|
| **Right after `SUBSCRIBED`** | closes the subscribe race described above |
| **On app foreground** | the socket was likely dropped while backgrounded |
| **On realtime reconnect** | anything during the gap was missed |
| **After a failed write flush** | reconcile whatever the server actually accepted |

All four are cheap: with a current cursor the response is five empty arrays.

---

## Applying events

Realtime payloads carry the raw row, so run them through the same mappers as the pull —
`toLogEntry`, `toPet`, `toAppointment` in `lib/db/models.ts`. Don't hand-roll a second
translation.

Because `replica identity full` is set, UPDATE and DELETE payloads carry the complete old
row in `payload.old`, not just the primary key. Useful when a row moves out of scope and
you need to know what it used to be.

Treat every event as an upsert keyed on `id`. Ids are client-generated uuid v4, so an event
for a row you wrote locally is a confirmation, not a conflict — the ids match by
construction.

---

## Conflict handling

Last-write-wins on the server clock. There is no merge step.

- **Logs** are append-only immutable facts with client-generated ids, so there are no
  conflicts to resolve. Two people logging the same physical pee is a product question, not
  a data one.
- **Pets, appointments, schedules** are low-contention config edited a few times a month.
  Row-level LWW on the server's `updated_at` is sufficient, and the loss window is
  self-correcting on the next pull.

The server stamps `updated_at` by trigger. Never trust a device clock for ordering.

---

## What is not built yet

- **The outbox.** Offline writes queue and flush is still frontend work; the server side
  here is idempotent by construction (client-generated uuid primary keys), so replaying a
  queued write is always safe.
- **Realtime on `prediction_state`.** Deliberate — see above. If the app ever needs the
  server's prediction live rather than derived, that is a schema change (it has no
  `household_id` to filter on) plus a traffic decision.
