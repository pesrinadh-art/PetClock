# Backend tasks — email-OTP onboarding + household member names

Two backend items the frontend now depends on. **Task 1 is a hard blocker** (the app can't be entered without it); Task 2 is an enhancement that unlocks showing real people's names in the UI.

Frontend is already built for both; this doc is only the backend/Supabase side.

---

## Task 1 — Make email one-time-code (OTP) sign-in actually deliver  🔴 BLOCKER

### Why
The redesigned app gates first launch behind a **mandatory** email + 6-digit code. There is no "skip" and no anonymous fallback in production. Until codes actually arrive by email, **nobody can get into the app** — including TestFlight testers.

### What the frontend does (already implemented — for context)
```ts
// 1. send the code
supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
// 2. verify the code the user typed
supabase.auth.verifyOtp({ email, token: code, type: 'email' })
```
No magic-link redirect is used — this is a **code** flow (the user types the 6 digits).

### What backend must configure (Supabase → Authentication)
1. **Providers → Email:** enabled, with **email OTP / passwordless** allowed and **email signups enabled** (`shouldCreateUser: true` must be permitted).
2. **Email templates → the template must send the CODE, not just a link.** Supabase's default email renders `{{ .ConfirmationURL }}` (a magic link). For our code flow the template must include the token:
   - Edit the **"Magic Link"** template (used by `signInWithOtp`) to display **`{{ .Token }}`** (the 6-digit code).
   - Also add `{{ .Token }}` to the **"Confirm signup"** template (a brand-new email may get that one first).
   - If `{{ .Token }}` is missing, users receive a link instead of a code and verification fails.
3. **Custom SMTP (required for real testers).** The built-in Supabase email sender is heavily rate-limited (a few/hour) and effectively only reaches project members — **not usable for a tester group.** Configure a real SMTP provider (SendGrid / Resend / Postmark / SES / etc.) with a verified sender domain under **Auth → SMTP settings**.
4. **Confirm email = ON** (email verification required), so a session is only considered valid after the code is verified.
5. **Rate limits:** leave the default OTP send limits; the app already enforces a resend cooldown, so defaults are fine.

### Acceptance test
- Request a code to a real external inbox (not a project member) → a **6-digit code** arrives (not only a link) within seconds.
- Entering it in the app signs the user in and lands them in a household.
- Repeat from a second, non-team email address to confirm SMTP isn't limited to team members.

> Note: the `pawclock://` + web redirect URLs from the earlier auth PR (#33) are still needed for the *magic-link recovery* path, but are **not** required for this code flow.

---

## Task 2 — Expose household members' display names to their co-members

### Why
The UI wants to show **who** did something — "Logged by Rohan" on Home, and real names in the **Shared** (household) members list. Right now the client can only read `household_members` (`user_id`, `role`, `member_expires_at`, `joined_at`) — **no names**. Names live in `auth.users` (email / `raw_user_meta_data.full_name`), which is **not readable by clients** (the `auth` schema isn't exposed via the API, by design). So today the app shows "by you / by a caregiver" and members appear by role only.

We need a client-readable **display name per member, visible only to other members of the same household.**

### Option A — pragmatic, recommended (fits what we already do)
Store the name **on the membership row**, which co-members can already read via the existing `members_select` policy.

1. Add a column:
   ```sql
   alter table public.household_members add column display_name text;
   ```
2. Populate it where memberships are created (the FE already collects the user's name at onboarding):
   - In `create_household_with_membership` and `redeem_invite`, accept an optional `p_display_name` and set it on the inserted `household_members` row; **or**
   - Expose a tiny RPC the client can call for its own row:
     ```sql
     create or replace function public.set_my_display_name(p_household uuid, p_name text)
     returns void language sql security invoker as $$
       update public.household_members
         set display_name = p_name
         where household_id = p_household and user_id = auth.uid();
     $$;
     ```
3. No new read policy needed — `members_select` (`using app.is_member(household_id)`) already lets co-members read the whole row, now including `display_name`.

**Result:** the FE reads `display_name` from the members list it already fetches, and builds a `user_id → name` map to render both the Shared members list and "by \<name\>" log attribution. **This single change covers both UI needs.**

_Trade-off:_ the name is per-membership (duplicated if someone is ever in two households) and set at join time (won't auto-update if the user later renames). Fine for our two-caregiver use case.

### Option B — robust (single source of truth, updatable)
A `public.profiles` table keyed by `auth.users.id` (`full_name`), populated by an `auth.users` trigger (copying `raw_user_meta_data.full_name`) or by the client writing its own row (`id = auth.uid()`). RLS: a member may `select` a profile **if that profile's user shares a household with the caller** (an `exists (...)` over `household_members m_me, m_them` with the same `household_id`). More correct and updatable, but more moving parts (table + trigger/upsert + a household-overlap RLS helper).

### Recommendation
Ship **Option A** first (unblocks names quickly, matches the onboarding name capture we just added). Move to **Option B** later if names need to be editable / shared across multiple households.

### Acceptance test
- Two accounts in one household: each can read the other's `display_name` (Option A) or `profiles.full_name` (Option B).
- A user NOT in the household cannot read those names.
- The app then shows real names in the Shared members list and in log attribution.

---

## Summary
| Task | Blocker? | Backend work |
|------|----------|--------------|
| 1. Email-OTP delivery | 🔴 Yes — app unusable without it | Email provider + template with `{{ .Token }}` + real SMTP + Confirm email ON |
| 2. Member display names | No — enhancement | Add `display_name` to `household_members` (Option A) or a `profiles` table (Option B) |
