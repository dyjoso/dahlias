-- Migration 006 (2026-10-22): stronger keep-alive.
--
-- Supabase still flagged the project as inactive although keepalive() ran
-- daily. That function was SECURITY DEFINER, so its query ran as the admin
-- (postgres) role, which likely isn't counted as "user database activity".
-- Now the scheduled job reads AND writes a one-row heartbeat table as the
-- ordinary anon role. The table holds nothing but a timestamp and a counter.
--
-- Run in Supabase > SQL Editor > New query > paste > Run. (Safe to re-run.)

create table if not exists public.heartbeat (
  id        int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now(),
  pings     bigint not null default 0
);
insert into public.heartbeat (id) values (1) on conflict (id) do nothing;

alter table public.heartbeat enable row level security;
drop policy if exists "heartbeat read" on public.heartbeat;
drop policy if exists "heartbeat update" on public.heartbeat;
create policy "heartbeat read" on public.heartbeat
  for select to anon, authenticated using (true);
create policy "heartbeat update" on public.heartbeat
  for update to anon, authenticated using (id = 1) with check (id = 1);

-- Explicit grants (Supabase no longer auto-grants new tables)
revoke all on public.heartbeat from anon, authenticated;
grant select, update on public.heartbeat to anon, authenticated;
grant select, insert, update, delete on public.heartbeat to service_role;

-- keepalive() now runs as the caller (anon), not as the admin role
create or replace function public.keepalive()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.heartbeat set pinged_at = now(), pings = pings + 1 where id = 1;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

select * from public.heartbeat;
