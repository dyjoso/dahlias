import { sb, q, refs, invalidateRefs } from '../db.js';
import { esc, toast, errToast, localDate } from '../ui.js';

export function more(ctx) {
  ctx.page({ title: 'More' });
  ctx.render(`<div class="list">
    <a class="item" href="#/stats"><div class="body"><div class="title">Parent stats</div><div class="sub">Germination, survival and traits by parent and producer</div></div></a>
    <a class="item" href="#/settings"><div class="body"><div class="title">Settings</div><div class="sub">Forms, sizes, colours, traits, producers, backup</div></div></a>
  </div>`);
}

const LIST_KINDS = [['form', 'Forms'], ['size', 'Sizes'], ['colour', 'Colours']];
const TABLES = ['plants', 'crosses', 'seed_lots', 'sowings', 'plant_seasons', 'tuber_lots', 'photos', 'producers', 'lists', 'trait_defs'];

export async function view(ctx) {
  ctx.page({ title: 'Settings', back: '#/more' });
  const [r, { data: { user } }] = await Promise.all([refs(true), sb.auth.getUser()]);

  const listCard = (kind, title) => {
    const items = r.lists.filter(l => l.kind === kind);
    return `<section class="card"><h2>${title}</h2>
      ${items.map((l, i) => `<div class="edit-row${l.active ? '' : ' off'}">
        <input type="text" value="${esc(l.label)}" data-list-label="${l.id}" aria-label="Name">
        <button class="btn small" data-move="${l.id}" data-dir="-1"${i === 0 ? ' disabled' : ''} aria-label="Move up">↑</button>
        <button class="btn small" data-move="${l.id}" data-dir="1"${i === items.length - 1 ? ' disabled' : ''} aria-label="Move down">↓</button>
        <button class="btn small" data-toggle="${l.id}">${l.active ? 'Hide' : 'Show'}</button>
      </div>`).join('')}
      <form class="edit-row" data-add="${kind}"><input type="text" name="label" placeholder="Add…"><button class="btn small primary">Add</button></form>
    </section>`;
  };

  if (!ctx.render(`
    ${LIST_KINDS.map(([k, t]) => listCard(k, t)).join('')}
    <section class="card"><h2>Traits</h2>
      <small>Name · good label · poor label. Untick to hide a trait.</small>
      ${r.traits.map(t => `<div class="trait-row" data-trait="${esc(t.key)}">
        <input type="text" value="${esc(t.name)}" data-f="name" aria-label="Trait name">
        <input type="text" value="${esc(t.good_label)}" data-f="good_label" aria-label="Good label">
        <input type="text" value="${esc(t.poor_label)}" data-f="poor_label" aria-label="Poor label">
        <input type="checkbox" data-f="active"${t.active ? ' checked' : ''} aria-label="Active" style="width:22px">
      </div>`).join('')}
      <form class="trait-row" id="add-trait">
        <input type="text" name="tname" placeholder="New trait"><input type="text" name="good" placeholder="Good">
        <input type="text" name="poor" placeholder="Poor"><button class="btn small primary">Add</button>
      </form>
    </section>
    <section class="card"><h2>Producers</h2>
      ${r.producers.map(p => `<div class="edit-row">
        <input type="text" value="${esc(p.name)}" data-producer="${p.id}" data-f="name" aria-label="Name">
        <input type="text" value="${esc(p.website || '')}" data-producer="${p.id}" data-f="website" placeholder="Website" aria-label="Website">
      </div>`).join('') || '<p class="muted">Producers are added automatically when you record bought seed or tubers.</p>'}
      <form class="edit-row" id="add-producer"><input type="text" name="pname" placeholder="Add producer…"><button class="btn small primary">Add</button></form>
    </section>
    <section class="card"><h2>Backup</h2>
      <p class="muted">Download everything (except photo files) as a JSON file.</p>
      <div class="btn-row"><button class="btn" id="export">Export data</button></div>
    </section>
    <section class="card"><h2>Account</h2>
      <p class="muted">Signed in as ${esc(user?.email || '')}</p>
      <div class="btn-row"><button class="btn danger" id="signout">Sign out</button></div>
    </section>`)) return;

  const el = ctx.el;
  const run = async (fn, msg = 'Saved') => {
    try { await fn(); invalidateRefs(); toast(msg); } catch (e) { errToast(e); }
  };
  const reload = () => view(ctx);

  // Lists: rename (and update plants using the old name), reorder, hide, add.
  el.querySelectorAll('[data-list-label]').forEach(inp => inp.addEventListener('change', () => run(async () => {
    const item = r.lists.find(l => l.id === Number(inp.dataset.listLabel));
    const label = inp.value.trim();
    if (!label || label === item.label) return;
    await q(sb.from('lists').update({ label }).eq('id', item.id));
    await q(sb.from('plants').update({ [item.kind]: label }).eq(item.kind, item.label));
    item.label = label;
  }, 'Renamed')));
  el.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => run(async () => {
    const item = r.lists.find(l => l.id === Number(b.dataset.move));
    const items = r.lists.filter(l => l.kind === item.kind);
    const i = items.indexOf(item);
    const j = i + Number(b.dataset.dir);
    [items[i], items[j]] = [items[j], items[i]];
    await Promise.all(items.map((l, k) => q(sb.from('lists').update({ sort_order: k + 1 }).eq('id', l.id))));
    reload();
  }, 'Reordered')));
  el.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => run(async () => {
    const item = r.lists.find(l => l.id === Number(b.dataset.toggle));
    await q(sb.from('lists').update({ active: !item.active }).eq('id', item.id));
    reload();
  })));
  el.querySelectorAll('[data-add]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const label = f.elements.label.value.trim();
    if (!label) return;
    const kind = f.dataset.add;
    const max = Math.max(0, ...r.lists.filter(l => l.kind === kind).map(l => l.sort_order));
    run(async () => { await q(sb.from('lists').insert({ kind, label, sort_order: max + 1 })); reload(); }, 'Added');
  }));

  // Traits
  el.querySelectorAll('[data-trait] input').forEach(inp => inp.addEventListener('change', () => run(async () => {
    const key = inp.closest('[data-trait]').dataset.trait;
    const val = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
    if (val === '') return;
    await q(sb.from('trait_defs').update({ [inp.dataset.f]: val }).eq('key', key));
  })));
  el.querySelector('#add-trait').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const name = f.elements.tname.value.trim();
    if (!name || !f.good.value.trim() || !f.poor.value.trim()) return toast('Fill in the name and both labels.', true);
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `trait_${Date.now()}`;
    const max = Math.max(0, ...r.traits.map(t => t.sort_order));
    run(async () => {
      await q(sb.from('trait_defs').insert({ key, name, good_label: f.good.value.trim(), poor_label: f.poor.value.trim(), sort_order: max + 1 }));
      reload();
    }, 'Trait added');
  });

  // Producers
  el.querySelectorAll('[data-producer]').forEach(inp => inp.addEventListener('change', () => run(async () => {
    const val = inp.value.trim();
    if (inp.dataset.f === 'name' && !val) return;
    await q(sb.from('producers').update({ [inp.dataset.f]: val || null }).eq('id', Number(inp.dataset.producer)));
  })));
  el.querySelector('#add-producer').addEventListener('submit', e => {
    e.preventDefault();
    const name = e.target.elements.pname.value.trim();
    if (name) run(async () => { await q(sb.from('producers').insert({ name })); reload(); }, 'Added');
  });

  // Backup
  el.querySelector('#export').addEventListener('click', async () => {
    try {
      const data = { exported_at: new Date().toISOString() };
      for (const t of TABLES) data[t] = await q(sb.from(t).select('*'));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const file = new File([blob], `dahlias-backup-${localDate()}.json`, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Dahlias backup' });
      } else {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') errToast(e);
    }
  });

  el.querySelector('#signout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.hash = '#/';
  });
}
