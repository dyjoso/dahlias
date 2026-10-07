-- Dahlia Breeding App — database schema
-- Run once in a fresh Supabase project: Dashboard > SQL Editor > New query > paste > Run.
--
-- Security model: single user. Sign-ups are disabled in the dashboard, so the only
-- account that can ever sign in is the one created by hand. Every table allows
-- full access to `authenticated` and nothing to `anon`.
--
-- Seasons are stored as the starting year (2026 = the 2026-27 season).

-- ---------------------------------------------------------------------------
-- Reference lists
-- ---------------------------------------------------------------------------

create table lists (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('form', 'size', 'colour')),
  label       text not null,
  description text,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  unique (kind, label)
);

create table trait_defs (
  key         text primary key,
  name        text not null,
  good_label  text not null,
  poor_label  text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true
);

create table producers (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  website    text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plants, crosses, seed
-- ---------------------------------------------------------------------------

create table plants (
  id           bigint generated always as identity primary key,
  code         text unique,                -- set by trigger, never edited
  seq          int,                        -- set by trigger
  name         text,                       -- memorable / registered name
  origin       text not null check (origin in ('seedling', 'cultivar')),
  seed_lot_id  bigint,                     -- FK added below (circular)
  form         text,
  size         text,
  colour       text,
  first_season int,
  -- current state, updated as things change
  traits        jsonb not null default '{}'::jsonb,  -- { trait_key: 'good' | 'poor' }
  count_growing int  not null default 1 check (count_growing >= 0),
  location      text,
  overwinter    text check (overwinter in ('dug', 'left_in_ground')),
  notes        text,
  created_at   timestamptz not null default now(),
  check (origin = 'cultivar' or seed_lot_id is not null)
);

create table crosses (
  id               bigint generated always as identity primary key,
  code             text unique,
  seq              int,
  season           int  not null,
  type             text not null check (type in ('hand', 'open')),
  seed_parent_id   bigint not null references plants (id),
  pollen_parent_id bigint references plants (id),
  pollinated_on    date,
  notes            text,
  created_at       timestamptz not null default now(),
  -- hand crosses need a pollen parent; open-pollinated ones must not have one
  check ((type = 'hand') = (pollen_parent_id is not null))
);

create table seed_lots (
  id               bigint generated always as identity primary key,
  code             text unique,
  seq              int,
  season           int  not null,
  source           text not null check (source in ('own', 'bought')),
  -- own seed
  cross_id         bigint references crosses (id),
  harvested_on     date,
  -- bought seed
  producer_id      bigint references producers (id),
  description      text,
  purchased_on     date,
  seed_parent_id   bigint references plants (id),
  pollen_parent_id bigint references plants (id),
  parentage        text,
  seed_count       int check (seed_count >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  check (source = 'bought' or cross_id is not null)
);

alter table plants
  add constraint plants_seed_lot_fk foreign key (seed_lot_id) references seed_lots (id);

create table sowings (
  id          bigint generated always as identity primary key,
  seed_lot_id bigint not null references seed_lots (id) on delete cascade,
  sown_on     date,
  seeds_sown  int check (seeds_sown >= 0),
  germinated  int check (germinated >= 0),
  notes       text,
  created_at  timestamptz not null default now(),
  check (germinated is null or seeds_sown is null or germinated <= seeds_sown)
);

-- ---------------------------------------------------------------------------
-- Tubers, photos
-- ---------------------------------------------------------------------------

create table tuber_lots (
  id               bigint generated always as identity primary key,
  plant_id         bigint not null references plants (id) on delete cascade,
  season           int  not null,
  source           text not null check (source in ('grown', 'bought')),
  producer_id      bigint references producers (id),
  acquired_on      date,
  price            numeric(8, 2),
  quantity         int  not null default 1 check (quantity >= 0),
  storage_location text,
  status           text not null default 'in_storage'
                   check (status in ('in_storage', 'planted', 'given_away', 'lost')),
  notes            text,
  created_at       timestamptz not null default now()
);

create table photos (
  id           bigint generated always as identity primary key,
  plant_id     bigint not null references plants (id) on delete cascade,
  season       int,
  taken_on     date,
  caption      text,
  storage_path text not null unique,
  created_at   timestamptz not null default now()
);

create index on crosses (seed_parent_id);
create index on crosses (pollen_parent_id);
create index on seed_lots (cross_id);
create index on plants (seed_lot_id);
create index on tuber_lots (plant_id);
create index on tuber_lots (season);
create index on photos (plant_id);

-- ---------------------------------------------------------------------------
-- Automatic codes (fixed once assigned)
--   cross     X26-004
--   seed lot  26-007
--   seedling  26-007-03
--   cultivar  C-012
-- ---------------------------------------------------------------------------

create function yy(season int) returns text
language sql immutable as $$ select lpad((season % 100)::text, 2, '0') $$;

create function assign_cross_code() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.code := old.code; new.seq := old.seq; new.season := old.season;
    return new;
  end if;
  select coalesce(max(seq), 0) + 1 into new.seq from crosses where season = new.season;
  new.code := 'X' || yy(new.season) || '-' || lpad(new.seq::text, 3, '0');
  return new;
end $$;

create trigger crosses_code before insert or update on crosses
  for each row execute function assign_cross_code();

create function assign_seed_lot_code() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.code := old.code; new.seq := old.seq; new.season := old.season;
    return new;
  end if;
  select coalesce(max(seq), 0) + 1 into new.seq from seed_lots where season = new.season;
  new.code := yy(new.season) || '-' || lpad(new.seq::text, 3, '0');
  return new;
end $$;

create trigger seed_lots_code before insert or update on seed_lots
  for each row execute function assign_seed_lot_code();

create function assign_plant_code() returns trigger
language plpgsql as $$
declare
  lot_code text;
begin
  if tg_op = 'UPDATE' then
    new.code := old.code; new.seq := old.seq;
    new.origin := old.origin; new.seed_lot_id := old.seed_lot_id;
    return new;
  end if;
  if new.origin = 'seedling' then
    select code into lot_code from seed_lots where id = new.seed_lot_id;
    select coalesce(max(seq), 0) + 1 into new.seq
      from plants where seed_lot_id = new.seed_lot_id;
    new.code := lot_code || '-' || lpad(new.seq::text, 2, '0');
  else
    select coalesce(max(seq), 0) + 1 into new.seq
      from plants where origin = 'cultivar';
    new.code := 'C-' || lpad(new.seq::text, 3, '0');
  end if;
  return new;
end $$;

create trigger plants_code before insert or update on plants
  for each row execute function assign_plant_code();

-- ---------------------------------------------------------------------------
-- Row-level security: authenticated only
-- ---------------------------------------------------------------------------

alter table lists         enable row level security;
alter table trait_defs    enable row level security;
alter table producers     enable row level security;
alter table plants        enable row level security;
alter table crosses       enable row level security;
alter table seed_lots     enable row level security;
alter table sowings       enable row level security;
alter table tuber_lots    enable row level security;
alter table photos        enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'lists', 'trait_defs', 'producers', 'plants', 'crosses', 'seed_lots',
    'sowings', 'tuber_lots', 'photos'
  ] loop
    execute format(
      'create policy "authenticated full access" on %I for all to authenticated using (true) with check (true)',
      t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Photo storage (private bucket)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "photos: authenticated full access" on storage.objects
  for all to authenticated
  using (bucket_id = 'photos')
  with check (bucket_id = 'photos');

-- ---------------------------------------------------------------------------
-- Default lists (NZ classification) and traits
-- ---------------------------------------------------------------------------

insert into lists (kind, label, sort_order) values
  ('form', 'Ball', 1),
  ('form', 'Pompon', 2),
  ('form', 'Formal Decorative', 3),
  ('form', 'Informal Decorative', 4),
  ('form', 'Semi Cactus', 5),
  ('form', 'Cactus', 6),
  ('form', 'Fimbriated', 7),
  ('form', 'Waterlily', 8),
  ('form', 'Collarette', 9),
  ('form', 'Single', 10),
  ('form', 'Orchid', 11),
  ('form', 'Anemone', 12),
  ('form', 'Bellefleur', 13),
  ('form', 'Miscellaneous', 14),
  ('colour', 'White', 1),
  ('colour', 'Yellow', 2),
  ('colour', 'Orange', 3),
  ('colour', 'Peach', 4),
  ('colour', 'Bronze', 5),
  ('colour', 'Flame', 6),
  ('colour', 'Red', 7),
  ('colour', 'Dark Red', 8),
  ('colour', 'Pink', 9),
  ('colour', 'Lilac/Lavender', 10),
  ('colour', 'Purple', 11),
  ('colour', 'Blends', 12),
  ('colour', 'Bicolour', 13),
  ('colour', 'Variegated', 14);

insert into lists (kind, label, description, sort_order) values
  ('size', 'Pompon',       'not exceeding 5cm',    1),
  ('size', 'Micro',        'not exceeding 6cm',    2),
  ('size', 'Large Pompon', '5.1-8cm, pompons only', 3),
  ('size', 'Miniature',    'not exceeding 11.5cm',   4),
  ('size', 'Small',        '11.5-15.5cm',             5),
  ('size', 'Medium',       '15.5-20cm',             6),
  ('size', 'Large',        '20-25cm',             7),
  ('size', 'Giant',        'over 25cm',            8);

insert into trait_defs (key, name, good_label, poor_label, sort_order) values
  ('stem',     'Stem',        'Strong',     'Weak',       1),
  ('neck',     'Neck',        'Strong',     'Weak',       2),
  ('angle',    'Head angle',  'Faces up',   'Faces down', 3),
  ('vigour',   'Vigour',      'Good',       'Poor',       4),
  ('flowering','Flowering',   'Productive', 'Shy',        5),
  ('petals',   'Petal count', 'High',       'Low',        6),
  ('tubers',   'Tubers',      'Good',       'Poor',       7);
