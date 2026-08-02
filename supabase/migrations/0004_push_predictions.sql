-- 0004_push_predictions.sql
-- The flagship feature's server-side state: where pushes are aimed (notification_tokens),
-- when they should fire (prediction_state), and what was actually sent (notifications).

-- ---------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------

create table public.notification_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  device_id       text not null,          -- stable per-install uuid held in SecureStore
  expo_push_token text not null,          -- 'ExponentPushToken[...]'
  platform        text not null check (platform in ('ios','android')),
  app_version     text,
  last_seen_at    timestamptz not null default now(),
  -- Set when Expo returns DeviceNotRegistered (check-receipts cron), or on logout.
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  -- Token rotation is an upsert on this key: same device, new token, same row.
  unique (user_id, device_id)
);
create index idx_tokens_user on public.notification_tokens(user_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- prediction_state — one row per (pet, pee|poo). The heart of the feature.
-- ---------------------------------------------------------------------------
--
-- Server-side mirror of lib/petSchedule.ts getUpcomingForPet()'s addHoldItem:
--   anchor    = most recent pee/poo log, else today's earliest feed time (household-local)
--   predicted = nextRepeating(anchor, hold_hours)
--   buffer    = clamp(round(hold * 60 * 0.15), 10, 45) minutes   [bufferMsFor()]
--   notify_at = predicted - buffer                               [the push fires here]
--
-- The client keeps computing this locally for instant optimistic UI; this table is the
-- authority, because pushes must fire with every device killed and two caregivers' logs
-- must feed one shared prediction.

create table public.prediction_state (
  pet_id               uuid not null references public.pets(id) on delete cascade,
  break_type           public.break_type not null,
  anchor_at            timestamptz,
  hold_hours           numeric(4,1),
  predicted_at         timestamptz,
  buffer_minutes       int,
  notify_at            timestamptz,
  snoozed_until        timestamptz,
  last_log_id          uuid references public.logs(id) on delete set null,
  last_notification_id uuid,                    -- FK added below, after notifications exists
  -- LOG_NO streak. 3 consecutive "not yet" answers is the drift signal that lets the
  -- nightly recalibrate stretch the hold time by +0.5h (BACKEND_PLAN §9.1).
  consecutive_no_count int not null default 0,
  updated_at           timestamptz not null default now(),
  primary key (pet_id, break_type)
);

-- The dispatcher's hot path: "what is due right now".
create index idx_prediction_due on public.prediction_state(notify_at)
  where notify_at is not null;

-- ---------------------------------------------------------------------------
-- notifications — audit trail AND the idempotency spine
-- ---------------------------------------------------------------------------

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  pet_id        uuid references public.pets(id) on delete cascade,
  kind          public.notif_kind not null,
  -- SEND-EXACTLY-ONCE. A replayed or concurrent cron tick hits this unique constraint
  -- (23505) and is silently skipped. Daily kinds embed the *household-local* date, which
  -- makes the 25-hour DST fall-back day safe automatically. Shapes:
  --   break:{pet_id}:{pee|poo}:{predicted_at ISO}
  --   meal:{feed_time_id}:{YYYY-MM-DD}
  --   med:{medication_id}:{YYYY-MM-DD}
  --   appt:{reminder_id}
  dedupe_key    text not null unique,
  title         text not null,
  body          text not null,
  data          jsonb not null default '{}',
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  -- Idempotency gate 1 lives here: log-action does a compare-and-set from 'sent' to
  -- 'actioned', so the second caregiver's tap on the same push is a benign replay.
  status        public.notif_status not null default 'sent',
  action        text check (action is null or action in ('LOG_YES','LOG_NO','SNOOZE_15','OPEN','DISMISS')),
  action_at     timestamptz,
  action_by     uuid references auth.users(id) on delete set null,
  expo_tickets  jsonb,                      -- [{token, ticketId|error}] for receipt checking
  created_at    timestamptz not null default now()
);
create index idx_notifications_household on public.notifications(household_id, created_at desc);
-- Supersede lookup in on_log_insert(), and the med-escalation sweep.
create index idx_notifications_pending on public.notifications(pet_id, kind, status)
  where status = 'sent';
-- Receipt checking picks up recently-sent rows that still carry tickets.
create index idx_notifications_tickets on public.notifications(sent_at)
  where expo_tickets is not null;

-- Deferred FKs: these two columns point at tables that did not exist yet when their
-- parent table was created.
alter table public.logs
  add constraint logs_notification_id_fkey
  foreign key (notification_id) references public.notifications(id) on delete set null;

alter table public.prediction_state
  add constraint prediction_state_last_notification_id_fkey
  foreign key (last_notification_id) references public.notifications(id) on delete set null;
