import { sb, q, refs, graph, lotParents } from '../db.js';
import { esc, plantLink, pct, groupBy } from '../ui.js';

// Aggregate performance for a set of seed lots: seeds, germination, kept
// seedlings, survival into later years, and trait results.
function perf(lots, g, sowByLot, seasonsByPlant, traits) {
  const lotIds = new Set(lots.map(l => l.id));
  const seeds = lots.reduce((a, l) => a + (l.seed_count || 0), 0);
  let sown = 0, up = 0;
  for (const l of lots) for (const s of sowByLot.get(l.id) || []) {
    if (s.seeds_sown != null && s.germinated != null) { sown += s.seeds_sown; up += s.germinated; }
  }
  const kept = g.plants.filter(p => lotIds.has(p.seed_lot_id));
  const reached = n => kept.filter(p => (seasonsByPlant.get(p.id) || [])
    .some(s => p.first_season && s.season - p.first_season + 1 >= n)).length;
  const t = {};
  for (const d of traits) t[d.key] = { good: 0, n: 0 };
  for (const p of kept) for (const s of seasonsByPlant.get(p.id) || []) {
    for (const d of traits) {
      const v = s.traits?.[d.key];
      if (v) { t[d.key].n++; if (v === 'good') t[d.key].good++; }
    }
  }
  return { seeds, sown, up, kept: kept.length, y2: reached(2), y3: reached(3), traits: t };
}

function perfHtml(x, traits) {
  const traitRows = traits.filter(d => x.traits[d.key].n).map(d => {
    const { good, n } = x.traits[d.key];
    return `<div class="statline"><span>${esc(d.name)}</span><span>${good}/${n} ${esc(d.good_label.toLowerCase())}</span></div>
      <div class="bar"><i style="width:${(100 * good) / n}%"></i></div>`;
  }).join('');
  return `
    <div class="kv"><span>Seeds</span><span>${x.seeds}</span></div>
    <div class="kv"><span>Germination</span><span>${x.sown ? `${x.up}/${x.sown} · ${pct(x.up, x.sown)}` : '–'}</span></div>
    <div class="kv"><span>Seedlings kept</span><span>${x.kept}${x.kept ? ` → Y2 ${x.y2} → Y3 ${x.y3}` : ''}</span></div>
    ${traitRows ? `<div style="margin-top:8px">${traitRows}</div>` : ''}`;
}

export async function view(ctx) {
  ctx.page({ title: 'Parent stats', back: '#/more' });
  const [g, r, sowings, seasons] = await Promise.all([
    graph(), refs(),
    q(sb.from('sowings').select('*')),
    q(sb.from('plant_seasons').select('plant_id,season,traits')),
  ]);
  const sowByLot = groupBy(sowings, 'seed_lot_id');
  const seasonsByPlant = groupBy(seasons, 'plant_id');
  const traits = r.activeTraits;

  // Lots per parent, split by role.
  const roles = new Map();
  const add = (pid, role, lot) => {
    if (!pid) return;
    if (!roles.has(pid)) roles.set(pid, { seed: new Set(), pollen: new Set(), lots: new Map() });
    const e = roles.get(pid);
    e[role].add(lot.id);
    e.lots.set(lot.id, lot);
  };
  for (const l of g.lots) {
    const par = lotParents(l, g);
    add(par.seed, 'seed', l);
    add(par.pollen, 'pollen', l);
  }
  // Crosses with no seed yet still count as uses.
  const crossUses = new Map();
  for (const c of g.crosses) for (const pid of [c.seed_parent_id, c.pollen_parent_id]) {
    if (pid) crossUses.set(pid, (crossUses.get(pid) || 0) + 1);
  }

  const parents = [...new Set([...roles.keys(), ...crossUses.keys()])].map(pid => {
    const e = roles.get(pid) || { seed: new Set(), pollen: new Set(), lots: new Map() };
    return { pid, e, x: perf([...e.lots.values()], g, sowByLot, seasonsByPlant, traits) };
  }).sort((a, b) => b.x.kept - a.x.kept || b.x.seeds - a.x.seeds);

  const producers = [...groupBy(g.lots.filter(l => l.source === 'bought'), l => l.producer_id ?? 0).entries()]
    .map(([pid, lots]) => ({ name: r.producerName(pid) || 'Unknown producer', lots, x: perf(lots, g, sowByLot, seasonsByPlant, traits) }))
    .sort((a, b) => b.x.kept - a.x.kept);

  ctx.render(`
    <h3 class="group">Parents</h3>
    ${parents.length ? parents.map(({ pid, e, x }) => `<section class="card">
      <h2>${plantLink(g.plantsById[pid])}</h2>
      <div class="kv"><span>Used</span><span>${crossUses.get(pid) || 0} crosses · ♀ ${e.seed.size} / ♂ ${e.pollen.size} seed lots</span></div>
      ${perfHtml(x, traits)}</section>`).join('')
      : '<div class="empty">No crosses or seed with known parents yet.</div>'}
    <h3 class="group">Seed producers</h3>
    ${producers.length ? producers.map(p => `<section class="card"><h2>${esc(p.name)}</h2>
      <div class="kv"><span>Seed lots</span><span>${p.lots.length}</span></div>${perfHtml(p.x, traits)}</section>`).join('')
      : '<div class="empty">No bought seed yet.</div>'}
  `);
}
