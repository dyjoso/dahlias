-- Migration 008 (2026-10-25): set Plant size and Stem length for cultivars from
-- published references (needs migration 007 first).
--
-- Plant size from the height listed on dahliasnz.com (NZ):
--   Small (45-90cm) -> Short, Medium (90-120cm) -> Average, Large (120-150cm) -> Tall
-- Stem length: Long only where a source explicitly says "long stems";
--   "strong"/"sturdy" stems -> Average. No source described short stems.
-- Not on dahliasnz.com: Jan van Schaffelaar (~90cm, "long, straight stems"),
--   Klara Zak (100-120cm, "long, sturdy stems"), Opal (90-120cm) from overseas
--   retailers; White Fubuki has no reliable reference -> Average.
-- Everything not listed below stays Average (the default; stored as no value).
--
-- Stored values: Short = 'poor', Long/Tall = 'good'.
-- Only fills traits you haven't already set yourself. Safe to re-run.
-- Run in Supabase > SQL Editor > New query > paste > Run.

with v(name, stem_length, plant_size) as (values
  ('American Dawn',        'good', 'poor'),   -- Small 45-90cm; "long, dark purple stems"
  ('Caitlin''s Joy',       'good', null),     -- Medium; "very long stems"
  ('Copper Boy',           null,   'poor'),   -- Small 45-90cm
  ('Cornel Bronze',        'good', 'poor'),   -- Small 45-90cm; "long, strong stems"
  ('Crème de Cassis',      null,   'poor'),   -- 50-70cm
  ('Daisy Duke',           null,   'poor'),   -- Small 45-90cm
  ('Hapet Coppery',        'good', null),     -- Medium; "long-stemmed"
  ('Iced Tea',             'good', null),     -- Medium; "long, exceptionally strong stems"
  ('Ivanetti',             'good', null),     -- Medium; "long, sturdy ... stems"
  ('Jan van Schaffelaar',  'good', null),     -- ~90cm; "long, straight stems"
  ('Klara Zak',            'good', null),     -- 100-120cm; "long, sturdy stems"
  ('Moor Place',           'good', null),     -- Medium; "long, sturdy stems"
  ('Nathalie G',           'good', null),     -- Medium; "long stems"
  ('Rocco',                null,   'poor'),   -- Small 45-90cm
  ('Ryecroft Brenda T',    null,   'good'),   -- Large 120-150cm
  ('Salmon Runner',        null,   'good'),   -- Large 120-150cm
  ('Snoho Jojo',           'good', 'good'),   -- Large 120-150cm; "long, strong stems"
  ('Sweet Nathalie',       'good', null),     -- Medium; "long, strong stems"
  ('Wizard of Oz',         null,   'poor')    -- Small 45-90cm
)
update plants p
set traits = p.traits
  || case when v.stem_length is not null and not (p.traits ? 'stem_length')
          then jsonb_build_object('stem_length', v.stem_length) else '{}'::jsonb end
  || case when v.plant_size is not null and not (p.traits ? 'plant_size')
          then jsonb_build_object('plant_size', v.plant_size) else '{}'::jsonb end
from v
where p.origin = 'cultivar'
  -- match names ignoring case, spaces, apostrophes and accents
  and lower(regexp_replace(p.name, '[^A-Za-z]', '', 'g'))
    = lower(regexp_replace(v.name, '[^A-Za-z]', '', 'g'));

select name,
       case traits->>'plant_size'  when 'good' then 'Tall' when 'poor' then 'Short' else 'Average' end as plant_size,
       case traits->>'stem_length' when 'good' then 'Long' when 'poor' then 'Short' else 'Average' end as stem_length
from plants
where origin = 'cultivar'
order by name;
