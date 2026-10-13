-- Migration 005 (2026-10-14): a keep-alive function for the scheduled GitHub Action.
--
-- Supabase pauses free projects after ~7 days without "sufficient activity".
-- The old ping was rejected (anon has no table access), which evidently didn't
-- count. This function runs a real query but returns nothing, so it is safe
-- for anyone to call.
--
-- Run in Supabase > SQL Editor > New query > paste > Run. (Safe to re-run.)

create or replace function public.keepalive()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from plants limit 1;
end $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

select public.keepalive();
