# SYNC 4 — two phones, one household

The last unproven hop. Everything from a due prediction to Expo's API is verified against
staging; **no push has yet arrived on a physical device.**

This document is the handoff: what now exists in the repo, and the parts that need your
Apple and Google accounts and therefore cannot be done for you.

---

## What SYNC 4 turned out to be

The plan called it "a build command". It was not.

Two blockers made the two-phone test impossible, and both are fixed here:

**1. There was no way for a second phone to join the first one's household.**

`SessionContext` signs in anonymously, finds no membership, and creates a household. So
every device landed in its own. `create_invite` and `redeem_invite` shipped back in BE-1
with 20 pgTAP assertions behind them — nothing in the app ever called them.

**2. `expo-dev-client` was not installed**, while `eas.json` set `developmentClient: true`.

A third issue surfaced while reading: `SessionContext` resolved the household with an
**unordered `limit 1`** over `household_members`. Harmless with one household, non-
deterministic the moment a user has two.

---

## The ordering trap, and why `join_household` exists

`my_household_id()` resolves `order by joined_at limit 1`.

The household a phone auto-creates at first launch is **always joined first**. So a plain
`redeem_invite` leaves the user in two households with the *empty* one still winning. They
would join successfully, see an empty app, and conclude their pets had been deleted.

`join_household(code, previousId)` (migration `0016`) redeems **and** leaves in one
transaction. Two separate client calls could fail between them and strand the user in both
— exactly the state being prevented.

A failed leave does **not** roll the join back. If the old household still holds pets the
user genuinely belongs to two, and the client's cached id decides which opens. Losing the
join over a housekeeping step would be the worse outcome.

`leave_household` refuses when the caller is the last owner and pets or members remain.
Membership is the only route to a row under RLS, so an owner walking out strands everything
behind them permanently — there is no admin view to recover from.

---

## Verified without a device

| Check | Result |
|---|---|
| pgTAP `008_join_flow` | **22/22** |
| The `joined_at` regression is reproduced and asserted | ✅ test 4 |
| Empty household is garbage-collected on leave | ✅ |
| Last owner holding pets is refused | ✅ `LAST_OWNER_HAS_PETS` |
| Archived pets don't count toward the guard | ✅ |
| A failed leave still returns a successful join | ✅ `leftPrevious: false` |
| `anon` cannot reach either RPC | ✅ `42501` |
| Live: phone B joins, ends with **one** membership | ✅ |
| Live: one dispatch fans out to **both** device tokens | ✅ |

Backend total is now **139 pgTAP assertions across 8 suites**.

---

## What still needs you

### 1. Push credentials

EAS asks for these interactively on first build. Both need accounts I cannot sign into.

| Platform | What's needed | Where |
|---|---|---|
| iOS | APNs key (`.p8`) | Apple Developer account — EAS can generate it |
| Android | FCM v1 service account JSON | Firebase console → project settings → service accounts |

For Android, upload with:

```bash
eas credentials --platform android
```

Pick **Push Notifications: FCM V1** and supply the service account JSON. Without it the
build installs fine and **silently never receives a push** — the most confusing possible
failure, so do this before building.

### 2. Build the dev client

```bash
eas build --profile development --platform ios      # or android
```

`developmentClient: true` means EAS builds the native shell only. **JavaScript is bundled
by your local dev server**, so `.env.local` on your machine is what gets inlined — it does
not need to be committed or uploaded.

### 3. Point it at staging

`.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://cvnkqplgzpooqgypvohn.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
EXPO_PUBLIC_USE_SUPABASE=true
```

Then:

```bash
npx expo start --dev-client
```

---

## The test itself

**Phone 1**

1. Launch. It signs in anonymously and creates a household.
2. Add a pet with a feed time. (No feed time means no prediction — `recompute_prediction`
   mirrors the client's `hasSchedule()` and will not anchor without one.)
3. Settings → **Household** → *Invite a caregiver*. Share the 6-character code.

**Phone 2**

4. Launch, then Settings → **Household** → *Join a household*. Type the code.
5. Phone 1's pet should appear. This proves RLS reaches through the joined membership.

**Both**

6. Confirm both registered:

```sql
select u.email, t.platform, left(t.expo_push_token, 28)
  from notification_tokens t join auth.users u on u.id = t.user_id
 where t.revoked_at is null;
```

7. Log a pee on phone 1, then force the prediction due:

```sql
update prediction_state set notify_at = now() - interval '30 seconds'
 where pet_id = '<pet id>' and break_type = 'pee';
```

8. Within a minute the cron dispatcher fires. **Both phones should buzz.**
9. Tap **✅ Yes** on either. Do not open the app — that is the whole point.
10. Confirm exactly one log, and that the other phone's notification is superseded:

```sql
select count(*) from logs where pet_id = '<pet id>' and type = 'pee'
  and occurred_at > now() - interval '5 minutes';
```

### What "pass" looks like

- Both phones show **✅ Yes / ❌ Not yet / ⏰ Snooze** as OS buttons on the lock screen.
- One tap, app never opened, **exactly one log** written.
- The second phone's copy stops asking.

---

## Known gaps this does not close

- **No realtime yet.** `createSyncedRepos` still uses an in-process emitter (`synced.ts:26`).
  Phone 2's *screen* will not live-update on phone 1's write until it re-pulls. The push
  itself fans out correctly — that is what SYNC 4 proves. Live screen sync is SYNC 3.
- **Ownership transfer** does not exist, so the last owner of a household with pets cannot
  leave at all. BE-4.
- **`revokePushToken` is still unwired** — there is no sign-out flow to call it from.
- **A user legitimately in two households** always opens the cached one. There is no
  household switcher.
