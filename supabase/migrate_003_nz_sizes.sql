-- Migration 003 (2026-10-07): size classes exactly as listed by allthingsdahlia.nz
-- (https://www.allthingsdahlia.nz/types-and-sizes/). There are no "Ball" sizes:
-- balls use the ordinary size classes, and Large Pompon is for pompons only.
--
-- Run once: Supabase > SQL Editor > New query > paste > Run. (Safe to re-run.)

-- 1. Official classes, in the published order, with their millimetre limits
update lists set description = v.descr, sort_order = v.n, active = true
from (values
  ('Pompon',       'not exceeding 50mm',     1),
  ('Micro',        'not exceeding 60mm',     2),
  ('Large Pompon', '51-80mm, pompons only',  3),
  ('Miniature',    'not exceeding 115mm',    4),
  ('Small',        '115-155mm',              5),
  ('Medium',       '155-200mm',              6),
  ('Large',        '200-250mm',              7),
  ('Giant',        'over 250mm',             8)
) as v(label, descr, n)
where lists.kind = 'size' and lists.label = v.label;

-- 2. Re-size plants that used the old ball sizes, by their bloom diameter
--    Jowey Linda 12-15cm, Jowey Winnie 10-14cm, Wine Eyed Jill 10-15cm -> Small
--    Everything else (balls of roughly 5-11cm) -> Miniature
update plants set size = 'Small'
where size in ('Ball', 'Miniature Ball')
  and lower(name) in ('jowey linda', 'jowey winnie', 'wine eyed jill');

update plants set size = 'Miniature'
where size in ('Ball', 'Miniature Ball');

-- 3. Remove the non-standard sizes
delete from lists where kind = 'size' and label in ('Ball', 'Miniature Ball');

select label, description from lists where kind = 'size' order by sort_order;
