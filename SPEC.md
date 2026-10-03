# Dahlia Breeding App — Spec (draft v0.2, 2026-10-03)

A personal web app for running a small dahlia breeding programme from an iPhone.

## 1. Decisions from interview

| Topic | Decision |
|---|---|
| Platform | Web app (PWA) saved to the iPhone home screen |
| Hosting | GitHub Pages (static files only) |
| Data + photos | Supabase free tier (Postgres + Storage + login) |
| Users | Single user (me) |
| Devices | iPhone only |
| Connectivity | Mostly online; no offline sync needed for v1 |
| Existing data | Starting fresh. DahliaGens CSV/XLSX import may come later |
| Scale | < 100 seedlings per season |
| Pollination | Hand-pollinated (both parents known) and open-pollinated (seed parent only). No backcrosses or selfs |
| Seed sources | My own crosses **and** seed bought from different producers |
| Naming | Automatic code (not editable) **plus** an optional memorable name |
| Seasons | Shown as `2026-27` (NZ season Sept–May). Codes use the start year (`26`) |
| Classification | New Zealand form, size and colour classes, as editable lists |
| Evaluation | Binary trait toggles + free notes. No numeric scores, no keep/cull status |
| Location | Free-text field per plant per season |
| Tubers | Separate inventory section for tubers I've grown or bought |
| Cultivars | Bought varieties (parents, bought tubers) get plant records too |
| Form/size/colour | Set once per plant, editable |

## 2. Workflow the app supports

```
Own cross (hand / open) --\
                           >-- Seed lot -> Sowing & germination (batch counts)
Bought seed (producer) ---/                          |
                                       first-year selection (outside app)
                                                     v
                           Plant record (code + memorable name)
                                                     v
        Each season: count growing, location, traits, photos, dug / left in ground
                                                     v
                   Year 1 -> Year 2 -> Year 3 ... (trial year auto-calculated)

Tubers (grown from my plants or bought) -> stored -> planted / given away / lost
```

Crosses, seed and sowings are tracked as **batches**, using counts only. An
individual **plant record** is created only for seedlings kept after their first year.

## 3. Data model

**crosses**
- `code`: auto `X{yy}-{nnn}` (e.g. `X26-004`)
- `season`, `type` (hand | open)
- `seed_parent_id` (required) and `pollen_parent_id` (null when open-pollinated)
- `pollinated_on`, `notes`

**seed_lots** (every packet or batch of seed, whatever its source)
- `code`: auto `{yy}-{nnn}` (e.g. `26-007`). Seedlings are numbered from this
- `season`, `source` (own cross | bought)
- Own cross: `cross_id`, `harvested_on`
- Bought: `producer`, `description` (e.g. "Café au Lait OP mix"), `purchased_on`,
  optional known `seed_parent_id` / `pollen_parent_id`, optional free-text parentage
- `seed_count`, `notes`

**producers** (seed and tuber suppliers): `name`, `website`, `notes`

**sowings**
- `seed_lot_id`, `sown_on`, `seeds_sown`, `germinated`, `notes`
- Germination % is calculated

**plants** (my seedlings *and* bought cultivars)
- `code`: automatic, not editable. Seedling `{lot}-{nn}` (e.g. `26-007-03`),
  cultivar `C-{nnn}`
- `name`: optional memorable name (registered name for cultivars). Search finds
  plants by code or name, and the name is shown alongside the code everywhere
- `origin` (my seedling | cultivar), `seed_lot_id` (for seedlings)
- `form`, `size`, `colour` (from the NZ lists), `first_season`, `notes`

**plant_seasons** (one row per plant per season)
- `season`, `trial_year` (calculated: season − first_season + 1)
- `count_growing` (how many plants of this code are in the garden)
- `location` (text)
- Overwintering: `dug` | `left_in_ground`, plus `survived` (yes / no / unknown)
- Binary traits. Each is unset, good or poor:
  - Stem: strong / weak
  - Neck (head-to-stem): strong / weak
  - Head angle: faces up / faces down
  - Vigour: good / poor
  - Flowering: productive / shy
  - Petal count: high / low
  - Tuber production: good / poor
- `notes`

**tuber_lots** (tuber inventory)
- `plant_id` (which variety or seedling), `season`
- `source` (grown — lifted or divided from my plants | bought), `producer`,
  `acquired_on`, `price` (optional)
- `quantity`, `storage_location` (text)
- `status` (in storage | planted | given away / sold | lost / rotted)
- `notes`

**photos**
- `plant_id`, `season`, `taken_on`, `caption`, storage path
- Several per plant per season. Compressed on the phone before upload (~1600px JPEG)

**lists** (editable in Settings): forms, sizes, colours, trait definitions

## 4. NZ classification (seed lists)

Source: [allthingsdahlia.nz](https://www.allthingsdahlia.nz/types-and-sizes/). Forms
and colours reviewed by me 2026-10-03.

- **Forms:** Ball, Pompon, Formal Decorative, Informal Decorative, Semi Cactus,
  Cactus, Fimbriated, Waterlily, Collarette, Single, Orchid, Anemone, Bellefleur,
  Miscellaneous
- **Sizes:** Pompon (≤50mm), Large Pompon (51–80), Micro (≤60), Miniature (≤115),
  Small (115–155), Medium (155–200), Large (200–250), Giant (>250)
- **Colours:** White, Yellow, Orange, Peach, Bronze, Flame, Red, Dark Red, Pink,
  Lilac/Lavender, Purple, Blends, Bicolour, Variegated

## 5. Screens

1. **Home**: current season, quick actions (new cross, add seed, add photo, find plant)
2. **Plants**: searchable list (by code or name) filtered by trial year, form,
   colour and "in garden this season"
3. **Plant detail**: pedigree (parents and grandparents), season timeline, traits,
   photo gallery, its tubers
4. **Crosses**: list and detail
5. **Seed**: seed lots from own crosses and producers, with sowing and germination
6. **Tubers**: inventory by season and status, with grown and bought filters and totals
7. **Parent stats**: for each parent, crosses, seeds, germination %, seedlings
   kept, survival into year 2, 3 and later, and % "good" for each trait.
   Germination is also compared by producer
8. **Settings**: edit the lists and producers, export all data (CSV/JSON backup), sign out

## 6. Tech approach

- Plain HTML, CSS and JS (ES modules) with no build step. `supabase-js` comes from a CDN
- Deployed to GitHub Pages from this repo
- Login with **email + password**; the session persists on the phone. (Magic links
  open in Safari, not the home-screen app, and OTP-code emails need custom SMTP on
  the free plan.) Sign-ups disabled, and row-level security limits data to
  signed-in users
- Photos go to a private Supabase Storage bucket, viewed through signed URLs

### Supabase free-tier caveats
- About 500 MB database and 1 GB file storage. With compression that is roughly 3,000+ photos.
- **Projects pause after ~1 week of no activity** (e.g. over winter). Fix: a small
  scheduled GitHub Action that pings it weekly.
- In-app export gives an offline backup.
