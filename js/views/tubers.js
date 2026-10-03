import { sb, q, refs, resolveProducer } from '../db.js';
import {
  esc, plantLabel, seasonLabel, seasonOptions, getSeason, localDate, formView, plantOptions,
  emptyState, TUBER_STATUS, seasonPicker, bindSeasonPicker, comparePlants,
} from '../ui.js';

const tf = { status: 'all', source: 'all' };

export async function list(ctx) {
  const season = getSeason();
  ctx.page({ title: 'Tubers', right: '<a class="hbtn plus" href="#/tubers/new" aria-label="Add tubers">+</a>' });
  const [rows, plants, r] = await Promise.all([
    q(sb.from('tuber_lots').select('*').eq('season', season)),
    q(sb.from('plants').select('id,code,name,origin')),
    refs(),
  ]);
  const plantById = Object.fromEntries(plants.map(p => [p.id, p]));
  rows.sort((a, b) => comparePlants(plantById[a.plant_id], plantById[b.plant_id]));
  const total = st => rows.filter(t => st === 'all' || t.status === st).reduce((a, t) => a + t.quantity, 0);

  if (!ctx.render(`
    <div class="season-bar"><span class="muted">Season</span>${seasonPicker()}</div>
    <div class="tiles">${Object.entries(TUBER_STATUS).map(([k, l]) => `<div class="tile"><div class="n">${total(k)}</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="toolbar"><div class="chips">
      ${[['all', 'All'], ...Object.entries(TUBER_STATUS)].map(([v, l]) => `<button class="chip${tf.status === v ? ' on' : ''}" data-status="${v}">${l}</button>`).join('')}
    </div><div class="chips">
      ${[['all', 'Grown & bought'], ['grown', 'Grown'], ['bought', 'Bought']].map(([v, l]) => `<button class="chip${tf.source === v ? ' on' : ''}" data-source="${v}">${l}</button>`).join('')}
    </div></div>
    <div id="results"></div>`)) return;

  const el = ctx.el;
  bindSeasonPicker(el);
  const draw = () => {
    const res = rows.filter(t => (tf.status === 'all' || t.status === tf.status) && (tf.source === 'all' || t.source === tf.source));
    el.querySelector('#results').innerHTML = res.length
      ? `<div class="count">${res.reduce((a, t) => a + t.quantity, 0)} tubers in ${res.length} entr${res.length === 1 ? 'y' : 'ies'}</div>
        <div class="list">${res.map(t => `<a class="item" href="#/tubers/${t.id}/edit">
          <div class="body"><div class="title">${esc(plantLabel(plantById[t.plant_id]))}</div>
            <div class="sub">${esc([TUBER_STATUS[t.status], t.storage_location, t.source === 'bought' ? r.producerName(t.producer_id) || 'bought' : 'grown'].filter(Boolean).join(' · '))}</div></div>
          <div class="meta"><span class="badge">×${t.quantity}</span></div></a>`).join('')}</div>`
      : rows.length ? '<div class="empty">Nothing matches these filters.</div>'
        : emptyState(`No tubers recorded for ${seasonLabel(season)}.`, '#/tubers/new', 'Add tubers');
  };
  el.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => {
    tf.status = b.dataset.status;
    el.querySelectorAll('[data-status]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  }));
  el.querySelectorAll('[data-source]').forEach(b => b.addEventListener('click', () => {
    tf.source = b.dataset.source;
    el.querySelectorAll('[data-source]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  }));
  draw();
}

export async function form(ctx) {
  const id = ctx.params.tid;
  const [row, plants, r] = await Promise.all([
    id ? q(sb.from('tuber_lots').select('*').eq('id', id).single()) : null,
    q(sb.from('plants').select('id,code,name,origin')),
    refs(),
  ]);
  const back = ctx.query.back || '#/tubers';
  const here = id ? `#/tubers/${id}/edit` : `#/tubers/new${ctx.query.plant ? `?plant=${ctx.query.plant}` : ''}`;

  const fields = [
    { name: 'plant_id', label: 'Variety / seedling', type: 'select', options: plantOptions(plants), num: true, required: true,
      help: `Not listed? <a href="#/plants/new?origin=cultivar&return=${encodeURIComponent(here)}">Add a cultivar</a>.` },
    { name: 'season', label: 'Season', type: 'select', options: seasonOptions(), num: true, required: true, blank: false },
    { name: 'source', label: 'Source', type: 'segment', options: [{ value: 'grown', label: 'Grown' }, { value: 'bought', label: 'Bought' }] },
    { name: 'producer_name', label: 'Producer', type: 'combo', options: r.producers.map(p => p.name), showIf: ['source', 'bought'],
      placeholder: 'Pick or type a new producer' },
    { name: 'acquired_on', label: 'Date lifted / bought', type: 'date' },
    { name: 'price', label: 'Price ($)', type: 'number', step: '0.01', showIf: ['source', 'bought'] },
    { name: 'quantity', label: 'Quantity', type: 'number', num: true, required: true },
    { name: 'storage_location', label: 'Stored where', placeholder: 'e.g. Garage, crate 3' },
    { name: 'status', label: 'Status', type: 'select', blank: false, options: Object.entries(TUBER_STATUS).map(([value, label]) => ({ value, label })) },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const values = row ? { ...row, producer_name: r.producerName(row.producer_id) } : {
    plant_id: ctx.query.plant ? Number(ctx.query.plant) : null,
    season: getSeason(), source: 'grown', quantity: 1, status: 'in_storage', acquired_on: localDate(),
  };

  formView(ctx, {
    title: row ? 'Edit tubers' : 'Add tubers', back, fields, values,
    onSave: async d => {
      d.producer_id = await resolveProducer(d.producer_name);
      delete d.producer_name;
      if (d.price != null) d.price = Number(d.price);
      if (row) await q(sb.from('tuber_lots').update(d).eq('id', id));
      else await q(sb.from('tuber_lots').insert(d));
      location.replace(back);
    },
    onDelete: row ? async () => {
      await q(sb.from('tuber_lots').delete().eq('id', id));
      location.replace(back);
    } : null,
  });
}
