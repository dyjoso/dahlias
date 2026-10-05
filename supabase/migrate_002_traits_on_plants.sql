-- Migration 002 (2026-10-05): replace per-season records with current values on
-- each plant. Traits, number growing, location and dug/left-in-ground now live
-- directly on the plant and are simply updated as things change.
--
-- Run ONCE: Supabase > SQL Editor > New query > paste > Run.
-- The old plant_seasons table is left in place as a backup (no longer used).

alter table plants
  add column if not exists traits jsonb not null default '{}'::jsonb,
  add column if not exists count_growing int not null default 1 check (count_growing >= 0),
  add column if not exists location text,
  add column if not exists overwinter text check (overwinter in ('dug', 'left_in_ground'));

-- Copy each plant's most recent season record onto the plant
update plants p
set traits = s.traits,
    count_growing = s.count_growing,
    location = s.location,
    overwinter = s.overwinter
from (select distinct on (plant_id) * from plant_seasons order by plant_id, season desc) s
where s.plant_id = p.id;

-- Keep any season notes by adding them to the plant's notes, labelled by season
update plants p
set notes = concat_ws(E'\n\n', nullif(p.notes, ''), n.txt)
from (
  select plant_id,
         string_agg(season || '-' || lpad(((season + 1) % 100)::text, 2, '0') || ': ' || notes, E'\n' order by season) as txt
  from plant_seasons
  where coalesce(notes, '') <> ''
  group by plant_id
) n
where n.plant_id = p.id;

select code, name, count_growing, location, overwinter, traits from plants order by code;
