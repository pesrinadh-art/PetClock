-- 0012_edge_function_rpcs.sql
-- Public-schema wrappers for things the Edge Functions need to call.
--
-- PostgREST only exposes `public`, and `app` is deliberately unreachable (0001). Rather
-- than open up `app`, expose narrow wrappers here and grant them to service_role alone.

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
-- Takes seconds rather than an interval: supabase-js has no interval type, and
-- `p_window => '1 minute'` over PostgREST is fiddly to get right.

create or replace function public.check_rate_limit_public(
  p_key            text,
  p_limit          int,
  p_window_seconds int
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.check_rate_limit(p_key, p_limit, make_interval(secs => p_window_seconds));
end $$;

-- ---------------------------------------------------------------------------
-- Push receipt handling
-- ---------------------------------------------------------------------------
-- Expo's /send returns tickets (accepted), not deliveries. Only a later receipt says
-- whether it actually arrived — and DeviceNotRegistered is how we learn a token is dead.
-- Left alone, dead tokens accumulate forever and every household push wastes calls on
-- devices that no longer exist.

create or replace function public.revoke_push_token(p_token text) returns void
language sql security definer set search_path = public as $$
  update public.notification_tokens
     set revoked_at = now()
   where expo_push_token = p_token and revoked_at is null;
$$;

-- Notifications sent recently enough that Expo still holds their receipts (~24h).
create or replace function public.notifications_awaiting_receipts()
returns table (id uuid, expo_tickets jsonb)
language sql security definer stable set search_path = public as $$
  select n.id, n.expo_tickets
    from public.notifications n
   where n.expo_tickets is not null
     and n.sent_at > now() - interval '24 hours'
     and not (n.expo_tickets @> '[{"receiptChecked": true}]'::jsonb)
   limit 500;
$$;

create or replace function public.mark_receipts_checked(p_notification_id uuid)
returns void
language sql security definer set search_path = public as $$
  update public.notifications
     set expo_tickets = expo_tickets || '[{"receiptChecked": true}]'::jsonb
   where id = p_notification_id;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.check_rate_limit_public(text, int, int),
  public.revoke_push_token(text),
  public.notifications_awaiting_receipts(),
  public.mark_receipts_checked(uuid)
  from public, anon, authenticated;

grant execute on function
  public.check_rate_limit_public(text, int, int),
  public.revoke_push_token(text),
  public.notifications_awaiting_receipts(),
  public.mark_receipts_checked(uuid)
  to service_role;
