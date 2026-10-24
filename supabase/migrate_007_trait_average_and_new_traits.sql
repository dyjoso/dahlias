-- Migration 007 (2026-10-25): traits get a middle "Average" option (the default,
-- handled in the app: a trait with no value counts as Average), plus two new
-- descriptive traits.
--
-- "neutral" traits are descriptive rather than good/bad: they show as
-- low / Average / high with no green/red colouring. For these, poor_label is the
-- low end and good_label the high end.
--
-- Run in Supabase > SQL Editor > New query > paste > Run. (Safe to re-run.)

alter table trait_defs add column if not exists neutral boolean not null default false;

insert into trait_defs (key, name, good_label, poor_label, sort_order, neutral) values
  ('stem_length', 'Stem length', 'Long', 'Short', 2, true),
  ('plant_size',  'Plant size',  'Tall', 'Short', 6, true)
on conflict (key) do update
  set name = excluded.name, good_label = excluded.good_label, poor_label = excluded.poor_label,
      neutral = true, active = true;

-- Slot the new traits in next to related ones
update trait_defs set sort_order = v.n
from (values ('stem', 1), ('stem_length', 2), ('neck', 3), ('angle', 4), ('vigour', 5),
             ('plant_size', 6), ('flowering', 7), ('petals', 8), ('tubers', 9)) as v(k, n)
where trait_defs.key = v.k;

select key, name, poor_label, good_label, neutral, sort_order from trait_defs order by sort_order;
