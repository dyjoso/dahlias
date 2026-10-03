import { sb, q, refs, graph, lotParents, resolveProducer } from '../db.js';
import {
  esc, plantLabel, plantLink, seasonLabel, seasonOptions, getSeason, fmtDate, localDate, pct,
  formView, toast, plantOptions, emptyState, groupBy,
} from '../ui.js';
import { lotSummary } from './plants.js';

const subnav = on => `<div class="subnav">
  <a href="#/crosses"${on === 'crosses' ? ' class="on"' : ''}>Crosses</a>
  <a href="#/seed"${on === 'seed' ? ' class="on"' : ''}>Seed</a></div>`;

const addCultivarHelp = back =>
  `Parent not listed? <a href="#/plants/new?origin=cultivar&return=${encodeURIComponent(back)}">Add a cultivar</a>.`;

function bySeasonHtml(items, itemHtml) {
  const groups = groupBy(items, 'season');
  return [...groups.keys()].sort((a, b) => b - a)
    .map(s => `<h3 class="group">${seasonLabel(s)}</h3><div class="list">${groups.get(s).map(itemHtml).join('')}</div>`)
    .join('');
}

function germ(sowings) {
  const done = sowings.filter(s => s.seeds_sown != null && s.germinated != null);
  const sown = done.reduce((a, s) => a + s.seeds_sown, 0);
  const up = done.reduce((a, s) => a + s.germinated, 0);
  return { sown, up, pct: pct(up, sown), any: done.length > 0 };
}

const crossParents = (c, g) =>
  `${esc(plantLabel(g.plantsById[c.seed_parent_id]))} × ${c.pollen_parent_id ? esc(plantLabel(g.plantsById[c.pollen_parent_id])) : 'open'}`;

// --- Crosses ---------------------------------------------------------------------

export async function crossList(ctx) {
  ctx.page({ title: 'Breeding', right: '<a class="hbtn plus" href="#/crosses/new" aria-label="New cross">+</a>' });
  const g = await graph();
  const lotsByCross = groupBy(g.lots.filter(l => l.cross_id), 'cross_id');
  ctx.render(subnav('crosses') + (g.crosses.length
    ? bySeasonHtml(g.crosses, c => {
      const lots = lotsByCross.get(c.id) || [];
      const seeds = lots.reduce((a, l) => a + (l.seed_count || 0), 0);
      return `<a class="item" href="#/crosses/${c.id}">
        <div class="body"><div class="title">${esc(c.code)} <span class="badge${c.type === 'hand' ? ' a' : ''}">${c.type === 'hand' ? 'Hand' : 'Open'}</span></div>
          <div class="sub">${crossParents(c, g)}</div></div>
        <div class="meta">${lots.length ? `${seeds} seeds` : ''}</div></a>`;
    })
    : emptyState('No crosses yet.', '#/crosses/new', 'Record a cross')));
}

export async function crossDetail(ctx) {
  const id = ctx.params.id;
  const [g, sowings] = await Promise.all([graph(), q(sb.from('sowings').select('*'))]);
  const c = g.crossesById[id];
  if (!c) throw new Error('Cross not found.');
  const lots = g.lots.filter(l => l.cross_id === id);
  const lotIds = new Set(lots.map(l => l.id));
  const kept = g.plants.filter(p => lotIds.has(p.seed_lot_id));
  const sowByLot = groupBy(sowings, 'seed_lot_id');

  ctx.page({ title: c.code, back: '#/crosses', right: `<a class="hbtn" href="#/crosses/${id}/edit">Edit</a>` });
  ctx.render(`
    <section class="card">
      <div class="kv"><span>Season</span><span>${seasonLabel(c.season)}</span></div>
      <div class="kv"><span>Type</span><span>${c.type === 'hand' ? 'Hand pollinated' : 'Open pollinated'}</span></div>
      <div class="kv"><span>♀ Seed parent</span>${plantLink(g.plantsById[c.seed_parent_id])}</div>
      <div class="kv"><span>♂ Pollen parent</span>${c.pollen_parent_id ? plantLink(g.plantsById[c.pollen_parent_id]) : '<span class="muted">open</span>'}</div>
      ${c.pollinated_on ? `<div class="kv"><span>Pollinated</span><span>${fmtDate(c.pollinated_on)}</span></div>` : ''}
      ${c.notes ? `<p class="notes">${esc(c.notes)}</p>` : ''}
    </section>
    <section class="card"><h2>Seed harvested <a href="#/seed/new?cross=${id}">+ Add</a></h2>
      ${lots.length ? lots.map(l => {
        const gm = germ(sowByLot.get(l.id) || []);
        return `<div class="kv"><a href="#/seed/${l.id}">${esc(l.code)}</a><span>${l.seed_count ?? '?'} seeds${gm.any ? ` · ${gm.pct} germ.` : ''}</span></div>`;
      }).join('') : '<p class="muted">No seed recorded yet.</p>'}
    </section>
    ${kept.length ? `<section class="card"><h2>Kept seedlings</h2>${kept.map(p => `<div class="kv">${plantLink(p)}<span>${esc(p.colour || '')}</span></div>`).join('')}</section>` : ''}
  `);
}

export async function crossForm(ctx) {
  const id = ctx.params.id;
  const g = await graph();
  const c = id ? g.crossesById[id] : null;
  if (id && !c) throw new Error('Cross not found.');
  const back = c ? `#/crosses/${id}` : '#/crosses';
  const opts = plantOptions(g.plants);

  const fields = [
    c ? { type: 'html', html: `<div class="field"><span class="lbl">Season</span><div class="static">${seasonLabel(c.season)}</div></div>` }
      : { name: 'season', label: 'Season', type: 'select', options: seasonOptions(), num: true, required: true, blank: false },
    { name: 'type', label: 'Pollination', type: 'segment', options: [{ value: 'hand', label: 'Hand' }, { value: 'open', label: 'Open' }] },
    { name: 'seed_parent_id', label: '♀ Seed parent', type: 'select', options: opts, num: true, required: true,
      help: addCultivarHelp(id ? `#/crosses/${id}/edit` : '#/crosses/new') },
    { name: 'pollen_parent_id', label: '♂ Pollen parent', type: 'select', options: opts, num: true, required: true, showIf: ['type', 'hand'] },
    { name: 'pollinated_on', label: 'Pollinated on', type: 'date' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const values = c ? { ...c } : { season: getSeason(), type: 'hand', pollinated_on: localDate() };

  formView(ctx, {
    title: c ? `Edit ${c.code}` : 'New cross', back, fields, values,
    intro: g.plants.length ? '' : '<div class="card muted">Add the parent plants first (as cultivars) so you can pick them here.</div>',
    onSave: async d => {
      if (d.type === 'open') d.pollen_parent_id = null;
      if (c) {
        await q(sb.from('crosses').update(d).eq('id', id));
        location.replace(back);
      } else {
        const row = await q(sb.from('crosses').insert(d).select().single());
        toast(`Saved as ${row.code}`);
        location.replace(`#/crosses/${row.id}`);
      }
    },
    onDelete: c ? async () => {
      await q(sb.from('crosses').delete().eq('id', id));
      location.replace('#/crosses');
    } : null,
  });
}

// --- Seed lots -------------------------------------------------------------------

export async function lotList(ctx) {
  ctx.page({ title: 'Breeding', right: '<a class="hbtn plus" href="#/seed/new" aria-label="New seed lot">+</a>' });
  const [g, r, sowings] = await Promise.all([graph(), refs(), q(sb.from('sowings').select('*'))]);
  const sowByLot = groupBy(sowings, 'seed_lot_id');
  const keptByLot = groupBy(g.plants.filter(p => p.seed_lot_id), 'seed_lot_id');
  ctx.render(subnav('seed') + (g.lots.length
    ? bySeasonHtml(g.lots, l => {
      const gm = germ(sowByLot.get(l.id) || []);
      const kept = (keptByLot.get(l.id) || []).length;
      return `<a class="item" href="#/seed/${l.id}">
        <div class="body"><div class="title">${esc(l.code)} <span class="badge${l.source === 'own' ? ' a' : ''}">${l.source === 'own' ? 'Own' : 'Bought'}</span></div>
          <div class="sub">${esc(lotSummary(l, g, r))}</div></div>
        <div class="meta">${[l.seed_count != null ? `${l.seed_count} seeds` : '', gm.any ? gm.pct : '', kept ? `${kept} kept` : ''].filter(Boolean).join(' · ')}</div></a>`;
    })
    : emptyState('No seed yet. Add seed harvested from a cross, or seed bought from a producer.', '#/seed/new', 'Add seed')));
}

export async function lotDetail(ctx) {
  const id = ctx.params.id;
  const [g, r, sowings] = await Promise.all([
    graph(), refs(),
    q(sb.from('sowings').select('*').eq('seed_lot_id', id).order('sown_on')),
  ]);
  const l = g.lotsById[id];
  if (!l) throw new Error('Seed lot not found.');
  const par = lotParents(l, g);
  const kept = g.plants.filter(p => p.seed_lot_id === id);
  const gm = germ(sowings);

  ctx.page({ title: `Seed ${l.code}`, back: '#/seed', right: `<a class="hbtn" href="#/seed/${id}/edit">Edit</a>` });
  ctx.render(`
    <section class="card">
      <div class="kv"><span>Season</span><span>${seasonLabel(l.season)}</span></div>
      <div class="kv"><span>Source</span><span>${l.source === 'own' ? 'My cross' : 'Bought'}</span></div>
      ${par.cross ? `<div class="kv"><span>Cross</span><a href="#/crosses/${par.cross.id}">${esc(par.cross.code)}</a></div>` : ''}
      ${l.producer_id ? `<div class="kv"><span>Producer</span><span>${esc(r.producerName(l.producer_id))}</span></div>` : ''}
      ${l.description ? `<div class="kv"><span>Description</span><span>${esc(l.description)}</span></div>` : ''}
      ${l.harvested_on ? `<div class="kv"><span>Harvested</span><span>${fmtDate(l.harvested_on)}</span></div>` : ''}
      ${l.purchased_on ? `<div class="kv"><span>Purchased</span><span>${fmtDate(l.purchased_on)}</span></div>` : ''}
      <div class="kv"><span>♀ Seed parent</span>${par.seed ? plantLink(g.plantsById[par.seed]) : '<span class="muted">unknown</span>'}</div>
      <div class="kv"><span>♂ Pollen parent</span>${par.pollen ? plantLink(g.plantsById[par.pollen]) : `<span class="muted">${par.open ? 'open' : 'unknown'}</span>`}</div>
      ${l.parentage ? `<div class="kv"><span>Parentage</span><span>${esc(l.parentage)}</span></div>` : ''}
      <div class="kv"><span>Seeds</span><span>${l.seed_count ?? '–'}</span></div>
      ${l.notes ? `<p class="notes">${esc(l.notes)}</p>` : ''}
    </section>
    <section class="card"><h2>Sowings <a href="#/seed/${id}/sowings/new">+ Add</a></h2>
      ${sowings.length ? sowings.map(s => `<a class="season" href="#/sowings/${s.id}/edit">
        <div class="row"><b>${s.sown_on ? fmtDate(s.sown_on) : 'Undated'}</b>
          <span class="badge">${s.seeds_sown ?? '?'} sown</span>
          ${s.germinated != null ? `<span class="badge g">${s.germinated} up · ${pct(s.germinated, s.seeds_sown)}</span>` : ''}</div>
        ${s.notes ? `<div class="sub">${esc(s.notes)}</div>` : ''}</a>`).join('')
        + (sowings.length > 1 && gm.any ? `<div class="kv"><span>Overall germination</span><b>${gm.up}/${gm.sown} · ${gm.pct}</b></div>` : '')
        : '<p class="muted">Not sown yet.</p>'}
    </section>
    <section class="card"><h2>Kept seedlings <a href="#/plants/new?lot=${id}">+ Add</a></h2>
      ${kept.length ? kept.map(p => `<div class="kv">${plantLink(p)}<span>${esc([p.form, p.colour].filter(Boolean).join(' · '))}</span></div>`).join('')
        : '<p class="muted">Add a seedling here once it has made it through its first year.</p>'}
    </section>
  `);
}

export async function lotForm(ctx) {
  const id = ctx.params.id;
  const [g, r] = await Promise.all([graph(), refs()]);
  const l = id ? g.lotsById[id] : null;
  if (id && !l) throw new Error('Seed lot not found.');
  const presetCross = ctx.query.cross ? g.crossesById[ctx.query.cross] : null;
  const back = l ? `#/seed/${id}` : presetCross ? `#/crosses/${presetCross.id}` : '#/seed';
  const crossOpts = [...g.crosses].sort((a, b) => b.code.localeCompare(a.code))
    .map(c => ({ value: c.id, label: `${c.code}: ${plantLabel(g.plantsById[c.seed_parent_id])} × ${c.pollen_parent_id ? plantLabel(g.plantsById[c.pollen_parent_id]) : 'open'}` }));
  const opts = plantOptions(g.plants);

  const fields = [
    l ? { type: 'html', html: `<div class="field"><span class="lbl">Code · Season</span><div class="static">${esc(l.code)} · ${seasonLabel(l.season)}</div></div>` }
      : { name: 'season', label: 'Season', type: 'select', options: seasonOptions(), num: true, required: true, blank: false,
        help: 'The season the seed was harvested or bought. Seedlings are numbered from this lot, e.g. 26-007-01.' },
    { name: 'source', label: 'Source', type: 'segment', options: [{ value: 'own', label: 'My cross' }, { value: 'bought', label: 'Bought' }] },
    { name: 'cross_id', label: 'Cross', type: 'select', options: crossOpts, num: true, required: true, showIf: ['source', 'own'],
      help: g.crosses.length ? '' : 'No crosses yet. <a href="#/crosses/new">Record one first</a>.' },
    { name: 'harvested_on', label: 'Harvested on', type: 'date', showIf: ['source', 'own'] },
    { name: 'producer_name', label: 'Producer', type: 'combo', options: r.producers.map(p => p.name), showIf: ['source', 'bought'],
      placeholder: 'Pick or type a new producer' },
    { name: 'description', label: 'Description', showIf: ['source', 'bought'], placeholder: 'e.g. Café au Lait OP mix' },
    { name: 'purchased_on', label: 'Purchased on', type: 'date', showIf: ['source', 'bought'] },
    { name: 'seed_parent_id', label: '♀ Seed parent (if known)', type: 'select', options: opts, num: true, showIf: ['source', 'bought'] },
    { name: 'pollen_parent_id', label: '♂ Pollen parent (if known)', type: 'select', options: opts, num: true, showIf: ['source', 'bought'] },
    { name: 'parentage', label: 'Parentage notes', showIf: ['source', 'bought'], placeholder: "e.g. OP of 'Penhill Dark Monarch'" },
    { name: 'seed_count', label: 'Number of seeds', type: 'number', num: true },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const values = l ? { ...l, producer_name: r.producerName(l.producer_id) } : {
    season: presetCross?.season ?? getSeason(),
    source: ctx.query.source === 'bought' ? 'bought' : 'own',
    cross_id: presetCross?.id,
  };

  formView(ctx, {
    title: l ? `Edit seed ${l.code}` : 'New seed lot', back, fields, values,
    onSave: async d => {
      d.producer_id = await resolveProducer(d.producer_name);
      delete d.producer_name;
      if (l) {
        await q(sb.from('seed_lots').update(d).eq('id', id));
        location.replace(back);
      } else {
        const row = await q(sb.from('seed_lots').insert(d).select().single());
        toast(`Saved as ${row.code}`);
        location.replace(`#/seed/${row.id}`);
      }
    },
    onDelete: l ? async () => {
      await q(sb.from('seed_lots').delete().eq('id', id));
      location.replace('#/seed');
    } : null,
  });
}

// --- Sowings ---------------------------------------------------------------------

export async function sowingForm(ctx) {
  let row = null;
  let lotId = ctx.params.id;
  if (ctx.params.sid) {
    row = await q(sb.from('sowings').select('*').eq('id', ctx.params.sid).single());
    lotId = row.seed_lot_id;
  }
  const lot = await q(sb.from('seed_lots').select('*').eq('id', lotId).single());
  const back = `#/seed/${lotId}`;
  const fields = [
    { name: 'sown_on', label: 'Sown on', type: 'date' },
    { name: 'seeds_sown', label: 'Seeds sown', type: 'number', num: true },
    { name: 'germinated', label: 'Germinated', type: 'number', num: true, help: 'Fill this in later, once they’re up.' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const values = row ? { ...row } : { sown_on: localDate(), seeds_sown: lot.seed_count };

  formView(ctx, {
    title: `Sowing · ${lot.code}`, back, fields, values,
    onSave: async d => {
      if (d.germinated != null && d.seeds_sown != null && d.germinated > d.seeds_sown) {
        return toast('Germinated can’t be more than seeds sown.', true);
      }
      if (row) await q(sb.from('sowings').update(d).eq('id', row.id));
      else await q(sb.from('sowings').insert({ ...d, seed_lot_id: lotId }));
      location.replace(back);
    },
    onDelete: row ? async () => {
      await q(sb.from('sowings').delete().eq('id', row.id));
      location.replace(back);
    } : null,
  });
}
