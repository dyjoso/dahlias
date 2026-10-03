-- Add cultivars (2026-10-03). Paste into Supabase > SQL Editor > Run.
-- Safe to re-run: existing names are skipped. Codes C-001… are assigned automatically.
--
-- Classification source: dahliasnz.com product pages (NZ), except where noted.
-- Their "BA – Ball (over 8cm)" and "MB – Miniature Ball (51–80mm)" size codes
-- don't exist in our size list yet, so two sizes are added first.

-- 1. Ball sizes, slotted in after the pompon sizes
insert into lists (kind, label, description, sort_order)
select 'size', v.label, v.descr, 0
from (values ('Miniature Ball', '51-80mm'), ('Ball', 'over 80mm')) as v(label, descr)
where not exists (select 1 from lists where kind = 'size' and label = v.label);

update lists set sort_order = o.n
from (values ('Pompon', 1), ('Large Pompon', 2), ('Miniature Ball', 3), ('Ball', 4),
             ('Micro', 5), ('Miniature', 6), ('Small', 7), ('Medium', 8),
             ('Large', 9), ('Giant', 10)) as o(label, n)
where lists.kind = 'size' and lists.label = o.label;

-- 2. Cultivars, inserted one at a time in name order so codes run alphabetically
do $$
declare r record;
begin
  for r in select * from (values
  ('Alloway Candy',        'Miscellaneous',       'Medium',         'Pink',           'Stellar form (no Stellar class in list). NZ-bred, Jock Stitt 1970.'),
  ('American Dawn',        'Informal Decorative', 'Small',          'Blends',         'Peach/mango with plum highlights. Formal vs informal not stated by NZ source.'),
  ('Black Jack',           'Semi Cactus',         'Large',          'Dark Red',       null),
  ('Blyton Everest',       'Ball',                'Ball',           'White',          'White with lavender flush.'),
  ('Bride to Be',          'Waterlily',           'Small',          'White',          null),
  ('Café au Lait',         'Informal Decorative', 'Large',          'Blends',         'Blush/peach to creamy beige.'),
  ('Caitlin''s Joy',       'Ball',                'Ball',           'Red',            'Metallic raspberry.'),
  ('Copper Boy',           'Ball',                'Ball',           'Bronze',         null),
  ('Coralie',              'Formal Decorative',   'Small',          'Blends',         'Champagne/blush pink. Formal vs informal not stated by NZ source.'),
  ('Cornel Bronze',        'Ball',                'Ball',           'Bronze',         null),
  ('Crème de Cassis',      'Waterlily',           'Small',          'Blends',         'Lavender-pink face, wine-red reverse.'),
  ('Daisy Duke',           'Formal Decorative',   'Miniature',      'Blends',         'Coral/salmon/pink.'),
  ('Hapet Coppery',        'Ball',                'Ball',           'Blends',         'Coppery pink.'),
  ('Heather',              'Ball',                'Ball',           'Lilac/Lavender', null),
  ('Iced Tea',             'Formal Decorative',   'Miniature',      'Blends',         'Orange/amber/peach ombré.'),
  ('Ivanetti',             'Ball',                'Ball',           'Dark Red',       'Deep plum / wine red.'),
  ('Jan van Schaffelaar',  'Pompon',              'Pompon',         'Pink',           'Not on dahliasnz.com; classed from international sources.'),
  ('Jowey Linda',          'Ball',                'Ball',           'Orange',         'Apricot-orange, 12-15cm.'),
  ('Jowey Winnie',         'Ball',                'Ball',           'Blends',         'Apricot/raspberry/salmon.'),
  ('Klara Zak',            'Informal Decorative', 'Small',          'Blends',         'Not on dahliasnz.com; classed from international sources (~14cm).'),
  ('Koko Puff',            'Pompon',              'Pompon',         'Blends',         'Smoky mauve / lavender-pink.'),
  ('Molly Raven',          'Informal Decorative', 'Small',          'Blends',         'Formal vs informal not stated by NZ source.'),
  ('Moor Place',           'Pompon',              'Pompon',         'Purple',         'Maroon-purple.'),
  ('Nathalie G',           'Ball',                'Ball',           'Blends',         'Salmon/peach/pink. Some overseas sources class it as formal decorative.'),
  ('Opal',                 'Ball',                'Miniature Ball', 'Pink',           'Not on dahliasnz.com; classed from international sources (~7.5cm).'),
  ('Polventon Kristobel',  'Formal Decorative',   'Miniature',      'Blends',         'Rosy pink / dusky red, gold-tipped.'),
  ('Rocco',                'Pompon',              'Pompon',         'Purple',         null),
  ('Ryecroft Brenda T',    'Formal Decorative',   'Small',          'White',          'Creamy white, lavender centre.'),
  ('Salmon Runner',        'Formal Decorative',   'Small',          'Blends',         'Coral/salmon.'),
  ('Sebastian',            'Informal Decorative', 'Miniature',      'Blends',         'Melon to peach-lavender. Formal vs informal not stated by NZ source.'),
  ('Small World',          'Pompon',              'Pompon',         'White',          null),
  ('Snoho Jojo',           'Ball',                'Ball',           'Blends',         'Bronzy rose-pink.'),
  ('Sweet Nathalie',       'Informal Decorative', 'Small',          'Blends',         'Cream/blush. Formal vs informal not stated by NZ source.'),
  ('Wine Eyed Jill',       'Ball',                'Ball',           'Blends',         'Cream/peach with wine eye.'),
  ('White Fubuki',         'Fimbriated',          'Small',          'White',          'Not on dahliasnz.com; assumed white Fubuki (fimbriated) type — please check.'),
  ('Wizard of Oz',         'Ball',                'Miniature Ball', 'Pink',           null)
  ) as v(name, form, size, colour, notes) order by name loop
    if not exists (select 1 from plants where lower(name) = lower(r.name)) then
      insert into plants (origin, name, form, size, colour, notes)
      values ('cultivar', r.name, r.form, r.size, r.colour, r.notes);
    end if;
  end loop;
end $$;

select code, name, form, size, colour from plants where origin = 'cultivar' order by code;
