import {
  sb, q, refs, graph, plantParents, signedUrls, thumbPath, uploadPhoto, deletePhotoFiles,
} from '../db.js';
import {
  esc, plantLabel, plantLink, seasonLabel, seasonOptions, seasonOfDate, currentSeason,
  fmtDate, localDate, formView, toast, errToast, listOptions, emptyState, groupBy, TUBER_STATUS,
  comparePlants, traitControls,
} from '../ui.js';

// Current trial year: the season it was first grown is Year 1.
const trialYear = p => (p.origin === 'seedling' && p.first_season ? currentSeason() - p.first_season + 1 : null);

function lotSummary(lot, g, r) {
  if (lot.source === 'own') {
    const c = g.crossesById[lot.cross_id];
    if (!c) return 'own seed';
    const pollen = c.pollen_parent_id ? plantLabel(g.plantsById[c.pollen_parent_id]) : 'open';
    return `${c.code}: ${plantLabel(g.plantsById[c.seed_parent_id])} × ${pollen}`;
  }
  return [r.producerName(lot.producer_id), lot.description].filter(Boolean).join(' · ') || 'bought seed';
}
export { lotSummary };

// --- List ----------------------------------------------------------------------

const filt = { q: '', origin: 'all', year: '', form: '', colour: '' };

export async function list(ctx) {
  if (ctx.query.q !== undefined) filt.q = ctx.query.q;
  ctx.page({ title: 'Plants', right: '<a class="hbtn plus" href="#/plants/new" aria-label="New plant">+</a>' });

  const [plants, photos, r] = await Promise.all([
    q(sb.from('plants').select('id,code,name,origin,form,size,colour,first_season,count_growing').order('code')),
    q(sb.from('photos').select('plant_id,storage_path').order('created_at', { ascending: false })),
    refs(),
  ]);
  const latest = new Map();
  for (const ph of photos) if (!latest.has(ph.plant_id)) latest.set(ph.plant_id, thumbPath(ph.storage_path));
  const urls = latest.size ? await signedUrls([...latest.values()]) : {};

  const opt = (items, cur) => items.map(i => `<option${i.label === cur ? ' selected' : ''}>${esc(i.label)}</option>`).join('');
  if (!ctx.render(`<div class="toolbar">
      <input type="search" id="q" placeholder="Search code or name" value="${esc(filt.q)}">
      <div class="chips">
        ${[['all', 'All'], ['seedling', 'My seedlings'], ['cultivar', 'Cultivars']]
          .map(([v, l]) => `<button class="chip${filt.origin === v ? ' on' : ''}" data-origin="${v}">${l}</button>`).join('')}
      </div>
      <div class="selects">
        <select id="year"><option value="">Any year</option>${[1, 2, 3, 4, 5]
          .map(n => `<option value="${n}"${String(filt.year) === String(n) ? ' selected' : ''}>Year ${n}${n === 5 ? '+' : ''}</option>`).join('')}</select>
        <select id="form"><option value="">Any form</option>${opt(r.forms, filt.form)}</select>
        <select id="colour"><option value="">Any colour</option>${opt(r.colours, filt.colour)}</select>
      </div>
    </div>
    <div id="results"></div>`)) return;

  const el = ctx.el;

  const draw = () => {
    const s = filt.q.toLowerCase();
    const res = plants.filter(p => {
      if (filt.origin !== 'all' && p.origin !== filt.origin) return false;
      if (s && !p.code.toLowerCase().includes(s) && !(p.name || '').toLowerCase().includes(s)) return false;
      if (filt.form && p.form !== filt.form) return false;
      if (filt.colour && p.colour !== filt.colour) return false;
      if (filt.year) {
        const ty = trialYear(p);
        if (Number(filt.year) === 5 ? !(ty >= 5) : ty !== Number(filt.year)) return false;
      }
      return true;
    });
    res.sort(comparePlants);
    const item = p => {
      const url = urls[latest.get(p.id)];
      const ty = trialYear(p);
      const n = p.count_growing;
      const details = [p.form, p.size, p.colour].filter(Boolean).join(' · ');
      // Cultivars lead with their name; seedlings with their code.
      const title = p.origin === 'cultivar' && p.name
        ? `${esc(p.name)} <span class="name">${esc(p.code)}</span>`
        : `${esc(p.code)}${p.name ? ` <span class="name">${esc(p.name)}</span>` : ''}`;
      return `<a class="item" href="#/plants/${p.id}">
        <div class="thumb">${url ? `<img src="${esc(url)}" alt="" loading="lazy">` : '✿'}</div>
        <div class="body"><div class="title">${title}</div>
          <div class="sub">${esc(details || (p.origin === 'cultivar' ? 'Cultivar' : 'Seedling'))}</div></div>
        <div class="meta">${ty > 0 ? `<span class="badge a">Y${ty}</span>` : ''}${n ? `<span class="badge g">×${n}</span>` : ''}</div>
      </a>`;
    };
    const seedlings = res.filter(p => p.origin === 'seedling');
    const cultivars = res.filter(p => p.origin === 'cultivar');
    const group = (heading, items) => (items.length
      ? `${filt.origin === 'all' ? `<h3 class="group">${heading} (${items.length})</h3>` : ''}<div class="list">${items.map(item).join('')}</div>`
      : '');
    el.querySelector('#results').innerHTML = res.length
      ? `<div class="count">${res.length} plant${res.length === 1 ? '' : 's'}</div>${group('My seedlings', seedlings)}${group('Cultivars', cultivars)}`
      : plants.length ? '<div class="empty">No plants match these filters.</div>'
        : emptyState('No plants yet. Add the cultivars you use as parents, then your kept seedlings.', '#/plants/new?origin=cultivar', 'Add a cultivar');
  };

  el.querySelector('#q').addEventListener('input', e => { filt.q = e.target.value; draw(); });
  el.querySelectorAll('[data-origin]').forEach(b => b.addEventListener('click', () => {
    filt.origin = b.dataset.origin;
    el.querySelectorAll('[data-origin]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  }));
  for (const k of ['year', 'form', 'colour']) el.querySelector(`#${k}`).addEventListener('change', e => { filt[k] = e.target.value; draw(); });
  draw();
}

// --- Detail --------------------------------------------------------------------

function pedigreeHtml(p, g, r) {
  const par = plantParents(p, g);
  if (!par) return '';
  const gp = pid => {
    const pp = plantParents(g.plantsById[pid], g);
    if (!pp) return '';
    const pollen = pp.pollen ? plantLabel(g.plantsById[pp.pollen]) : pp.open ? 'open' : '?';
    return `<div class="gp">${esc(pp.seed ? plantLabel(g.plantsById[pp.seed]) : '?')} × ${esc(pollen)}</div>`;
  };
  const { lot } = par;
  return `<section class="card"><h2>Pedigree</h2>
    <div class="ped">
      <div><span class="sym">♀</span>${par.seed ? plantLink(g.plantsById[par.seed]) + gp(par.seed) : '<span class="muted">unknown</span>'}</div>
      <div><span class="sym">♂</span>${par.pollen ? plantLink(g.plantsById[par.pollen]) + gp(par.pollen) : `<span class="muted">${par.open ? 'open pollinated' : 'unknown'}</span>`}</div>
    </div>
    ${par.text ? `<p class="muted">${esc(par.text)}</p>` : ''}
    <div class="kv"><span>Seed lot</span><a href="#/seed/${lot.id}">${esc(lot.code)}${lot.source === 'bought' ? ` · ${esc(r.producerName(lot.producer_id) || 'bought')}` : ''}</a></div>
    ${par.cross ? `<div class="kv"><span>Cross</span><a href="#/crosses/${par.cross.id}">${esc(par.cross.code)}</a></div>` : ''}
  </section>`;
}

export async function detail(ctx) {
  const id = ctx.params.id;
  const [g, photos, tubers, r] = await Promise.all([
    graph(),
    q(sb.from('photos').select('*').eq('plant_id', id).order('taken_on', { ascending: false }).order('id', { ascending: false })),
    q(sb.from('tuber_lots').select('*').eq('plant_id', id).order('season', { ascending: false })),
    refs(),
  ]);
  const p = g.plantsById[id];
  if (!p) throw new Error('Plant not found.');
  const urls = photos.length ? await signedUrls(photos.map(ph => thumbPath(ph.storage_path))) : {};
  const here = encodeURIComponent(`#/plants/${id}`);

  ctx.page({ title: p.code, back: '#/plants', right: `<a class="hbtn" href="#/plants/${id}/edit">Edit</a>` });

  const asParent = g.crosses.filter(c => c.seed_parent_id === id || c.pollen_parent_id === id);
  const asLotParent = g.lots.filter(l => l.source === 'bought' && (l.seed_parent_id === id || l.pollen_parent_id === id));
  const photosBySeason = groupBy(photos, 'season');

  if (!ctx.render(`
    <section class="card summary">
      ${photos[0] ? `<button class="hero" data-photo="${photos[0].id}" aria-label="View photo"><img src="${esc(urls[thumbPath(photos[0].storage_path)] || '')}" alt=""></button>` : ''}
      <h2>${esc(p.name || p.code)}</h2>
      ${p.name ? `<div class="kv"><span>Code</span><b>${esc(p.code)}</b></div>` : ''}
      <div class="kv"><span>Type</span><span>${p.origin === 'seedling' ? 'My seedling' : 'Cultivar'}</span></div>
      ${p.form ? `<div class="kv"><span>Form</span><span>${esc(p.form)}</span></div>` : ''}
      ${p.size ? `<div class="kv"><span>Size</span><span>${esc(p.size)}</span></div>` : ''}
      ${p.colour ? `<div class="kv"><span>Colour</span><span>${esc(p.colour)}</span></div>` : ''}
      ${p.first_season ? `<div class="kv"><span>First season</span><span>${seasonLabel(p.first_season)}${trialYear(p) > 0 ? ` · now Year ${trialYear(p)}` : ''}</span></div>` : ''}
    </section>

    <section class="card" id="traits"><h2>Traits <small class="saved"></small></h2>
      ${traitControls(r.activeTraits, p.traits)}
      <small>Tap to update as you go. Changes save straight away.</small>
    </section>

    <section class="card"><h2>In the garden <small class="saved" id="garden-saved"></small></h2>
      <div class="kv"><span>Growing now</span>
        <span class="stepper"><button class="btn small" data-step="-1" aria-label="One fewer">−</button>
          <b id="count">${p.count_growing}</b>
          <button class="btn small" data-step="1" aria-label="One more">+</button></span></div>
      <div class="field" style="margin-top:10px"><label class="fl"><span class="lbl">Location</span>
        <input id="location" value="${esc(p.location || '')}" placeholder="e.g. Bed 2, back row"></label></div>
      <div class="field"><span class="lbl">Over winter</span><div class="seg" id="overwinter">
        ${[['', 'Not set'], ['dug', 'Dug'], ['left_in_ground', 'Left in ground']].map(([v, l]) =>
          `<label><input type="radio" name="overwinter" value="${v}"${(p.overwinter || '') === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}
      </div></div>
    </section>

    <section class="card"><h2>Notes <small class="saved" id="notes-saved"></small></h2>
      <textarea id="notes" rows="4" placeholder="Tap to add notes…">${esc(p.notes || '')}</textarea>
    </section>

    <section class="card"><h2>Photos <label>+ Add<input type="file" id="file" accept="image/*" multiple hidden></label></h2>
      <div id="upload-status" class="muted"></div>
      ${photos.length ? [...photosBySeason.entries()].map(([s, list]) => `
        <div class="photo-season">${s ? seasonLabel(s) : 'No season'}</div>
        <div class="photos">${list.map(ph => `<button data-photo="${ph.id}"><img src="${esc(urls[thumbPath(ph.storage_path)] || '')}" alt="" loading="lazy"></button>`).join('')}</div>`).join('')
        : '<p class="muted">No photos yet.</p>'}
    </section>

    ${pedigreeHtml(p, g, r)}

    <section class="card"><h2>Tubers <a href="#/tubers/new?plant=${id}&back=${here}">+ Add</a></h2>
      ${tubers.length ? tubers.map(t => `<a class="season" href="#/tubers/${t.id}/edit?back=${here}">
        <div class="row"><b>${seasonLabel(t.season)}</b><span class="badge">${t.quantity} × ${TUBER_STATUS[t.status]}</span>
          <span class="badge${t.source === 'bought' ? ' a' : ''}">${t.source === 'bought' ? 'Bought' : 'Grown'}</span></div>
        ${t.storage_location ? `<div class="sub">${esc(t.storage_location)}</div>` : ''}
      </a>`).join('') : '<p class="muted">No tubers recorded.</p>'}
    </section>

    ${asParent.length || asLotParent.length ? `<section class="card"><h2>Used as a parent</h2>
      ${asParent.map(c => `<div class="kv"><a href="#/crosses/${c.id}">${esc(c.code)}</a><span>${c.seed_parent_id === id ? '♀ seed parent' : '♂ pollen parent'}</span></div>`).join('')}
      ${asLotParent.map(l => `<div class="kv"><a href="#/seed/${l.id}">${esc(l.code)}</a><span>bought seed · ${l.seed_parent_id === id ? '♀' : '♂'}</span></div>`).join('')}
    </section>` : ''}
  `)) return;

  const el = ctx.el;
  // Save a change to this plant straight away, showing a brief "Saved" note.
  const save = async (patch, statusEl) => {
    try {
      await q(sb.from('plants').update(patch).eq('id', id));
      Object.assign(p, patch);
      if (statusEl) {
        statusEl.textContent = 'Saved ✓';
        clearTimeout(statusEl._t);
        statusEl._t = setTimeout(() => { statusEl.textContent = ''; }, 1800);
      }
    } catch (err) {
      errToast(err);
    }
  };

  const traitsCard = el.querySelector('#traits');
  traitsCard.addEventListener('change', () => {
    const traits = { ...(p.traits || {}) };  // keeps values for hidden traits
    for (const t of r.activeTraits) {
      const v = traitsCard.querySelector(`input[name="trait_${t.key}"]:checked`)?.value;
      if (v) traits[t.key] = v; else delete traits[t.key];
    }
    save({ traits }, traitsCard.querySelector('.saved'));
  });

  const gardenSaved = el.querySelector('#garden-saved');
  let countTimer;
  el.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const n = Math.max(0, Number(el.querySelector('#count').textContent) + Number(b.dataset.step));
    el.querySelector('#count').textContent = n;
    clearTimeout(countTimer);
    countTimer = setTimeout(() => save({ count_growing: n }, gardenSaved), 600);
  }));
  el.querySelector('#location').addEventListener('change', e => save({ location: e.target.value.trim() || null }, gardenSaved));
  el.querySelector('#overwinter').addEventListener('change', e => save({ overwinter: e.target.value || null }, gardenSaved));

  const notes = el.querySelector('#notes');
  let notesTimer;
  const saveNotes = () => {
    clearTimeout(notesTimer);
    const v = notes.value.trim() || null;
    if (v !== (p.notes || null)) save({ notes: v }, el.querySelector('#notes-saved'));
  };
  notes.addEventListener('input', () => { clearTimeout(notesTimer); notesTimer = setTimeout(saveNotes, 1200); });
  notes.addEventListener('blur', saveNotes);

  el.querySelector('#file').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    const status = ctx.el.querySelector('#upload-status');
    try {
      for (const [i, f] of files.entries()) {
        status.textContent = `Uploading ${i + 1} of ${files.length}…`;
        const taken = localDate(new Date(f.lastModified || Date.now()));
        await uploadPhoto(id, f, taken, seasonOfDate(taken));
      }
      toast(files.length === 1 ? 'Photo added' : `${files.length} photos added`);
    } catch (err) {
      errToast(err);
    }
    if (ctx.alive()) detail(ctx);
  });

  ctx.el.querySelectorAll('[data-photo]').forEach(b => b.addEventListener('click', () => {
    openPhoto(photos.find(ph => ph.id === Number(b.dataset.photo)), () => detail(ctx));
  }));
}

async function openPhoto(ph, onChange) {
  const lb = document.getElementById('lightbox');
  const close = () => { lb.hidden = true; lb.innerHTML = ''; };
  lb.innerHTML = '<div class="lb-img"><div class="muted">Loading…</div></div>';
  lb.hidden = false;
  try {
    const url = (await signedUrls([ph.storage_path]))[ph.storage_path];
    lb.innerHTML = `<div class="lb-img"><img src="${esc(url)}" alt=""></div>
      <div class="lb-bar">
        <div class="lb-cap">${esc(fmtDate(ph.taken_on))}${ph.caption ? ` — ${esc(ph.caption)}` : ''}</div>
        <button class="btn small" data-act="close">Close</button>
        <button class="btn small" data-act="caption">Caption</button>
        <button class="btn small danger" data-act="delete">Delete</button>
      </div>`;
  } catch (e) {
    errToast(e);
    return close();
  }
  lb.querySelector('.lb-img').addEventListener('click', close);
  lb.querySelector('[data-act=close]').addEventListener('click', close);
  lb.querySelector('[data-act=caption]').addEventListener('click', async () => {
    const caption = prompt('Caption', ph.caption || '');
    if (caption === null) return;
    try {
      await q(sb.from('photos').update({ caption: caption.trim() || null }).eq('id', ph.id));
      close(); onChange();
    } catch (e) { errToast(e); }
  });
  lb.querySelector('[data-act=delete]').addEventListener('click', async () => {
    if (!confirm('Delete this photo?')) return;
    try {
      await q(sb.from('photos').delete().eq('id', ph.id));
      await deletePhotoFiles([ph.storage_path]);
      close(); toast('Photo deleted'); onChange();
    } catch (e) { errToast(e); }
  });
}

// --- Plant form -----------------------------------------------------------------

export async function form(ctx) {
  const id = ctx.params.id;
  const [g, r] = await Promise.all([graph(), refs()]);
  const p = id ? g.plantsById[id] : null;
  if (id && !p) throw new Error('Plant not found.');
  const presetLot = ctx.query.lot ? g.lotsById[ctx.query.lot] : null;
  const back = ctx.query.return || (id ? `#/plants/${id}` : presetLot ? `#/seed/${presetLot.id}` : '#/plants');

  const lotOpts = [...g.lots].sort((a, b) => b.code.localeCompare(a.code))
    .map(l => ({ value: l.id, label: `${l.code} — ${lotSummary(l, g, r)}` }));

  const fields = p
    ? [{ type: 'html', html: `<div class="field"><span class="lbl">Code</span><div class="static">${esc(p.code)} · ${p.origin === 'seedling' ? 'my seedling' : 'cultivar'}</div></div>` }]
    : [
      { name: 'origin', label: 'Type', type: 'segment', options: [{ value: 'seedling', label: 'My seedling' }, { value: 'cultivar', label: 'Cultivar' }] },
      {
        name: 'seed_lot_id', label: 'Seed lot', type: 'select', options: lotOpts, num: true, required: true,
        showIf: ['origin', 'seedling'],
        help: g.lots.length ? 'The code is assigned automatically from the seed lot, e.g. 26-007-03.' : 'No seed lots yet. <a href="#/seed/new">Add one first</a>.',
      },
      { type: 'html', html: '<div class="field" data-show-field="origin" data-show-value="cultivar"><small>Cultivars are numbered C-001, C-002… automatically.</small></div>' },
    ];
  fields.push(
    { name: 'name', label: 'Name', placeholder: 'Memorable or registered name' },
    { name: 'form', label: 'Form', type: 'select', options: listOptions(r.forms, p?.form) },
    { name: 'size', label: 'Size', type: 'select', options: listOptions(r.sizes, p?.size) },
    { name: 'colour', label: 'Colour', type: 'select', options: listOptions(r.colours, p?.colour) },
    { name: 'first_season', label: 'First season', type: 'select', options: seasonOptions(), num: true, help: 'The season it was first grown — that season is Year 1.' },
  );
  // Notes, traits and garden details are edited directly on the plant page.
  if (!p) fields.push({ name: 'notes', label: 'Notes', type: 'textarea' });

  const values = p ? { ...p } : {
    origin: ctx.query.origin === 'cultivar' ? 'cultivar' : 'seedling',
    seed_lot_id: presetLot?.id,
    first_season: presetLot?.season ?? currentSeason(),
  };

  formView(ctx, {
    title: p ? `Edit ${p.code}` : 'New plant', back, fields, values,
    onSave: async d => {
      if (p) {
        await q(sb.from('plants').update(d).eq('id', id));
        location.replace(`#/plants/${id}`);
      } else {
        if (d.origin === 'cultivar') d.seed_lot_id = null;
        const row = await q(sb.from('plants').insert(d).select().single());
        toast(`Saved as ${row.code}`);
        location.replace(ctx.query.return || `#/plants/${row.id}`);
      }
    },
    onDelete: p ? async () => {
      const photos = await q(sb.from('photos').select('storage_path').eq('plant_id', id));
      await q(sb.from('plants').delete().eq('id', id));
      await deletePhotoFiles(photos.map(x => x.storage_path)).catch(console.error);
      toast('Plant deleted');
      location.replace('#/plants');
    } : null,
  });
}
