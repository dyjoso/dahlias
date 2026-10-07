-- Migration 004 (2026-10-07): show size limits in centimetres instead of mm.
-- Run in Supabase > SQL Editor > New query > paste > Run. (Safe to re-run.)

update lists set description = v.descr
from (values
  ('Pompon',       'not exceeding 5cm'),
  ('Micro',        'not exceeding 6cm'),
  ('Large Pompon', '5.1-8cm, pompons only'),
  ('Miniature',    'not exceeding 11.5cm'),
  ('Small',        '11.5-15.5cm'),
  ('Medium',       '15.5-20cm'),
  ('Large',        '20-25cm'),
  ('Giant',        'over 25cm')
) as v(label, descr)
where lists.kind = 'size' and lists.label = v.label;

select label, description from lists where kind = 'size' order by sort_order;
