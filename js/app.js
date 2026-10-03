import { sb } from './db.js';
import { esc } from './ui.js';
import * as Home from './views/home.js';
import * as Plants from './views/plants.js';
import * as Breeding from './views/breeding.js';
import * as Tubers from './views/tubers.js';
import * as Stats from './views/stats.js';
import * as Settings from './views/settings.js';
import * as Login from './views/login.js';

// [pattern, view, tab]. ":x" segments match numeric ids.
const routes = [
  ['', Home.view, 'home'],
  ['plants', Plants.list, 'plants'],
  ['plants/new', Plants.form, 'plants'],
  ['plants/:id', Plants.detail, 'plants'],
  ['plants/:id/edit', Plants.form, 'plants'],
  ['plants/:id/seasons/new', Plants.seasonForm, 'plants'],
  ['seasons/:sid/edit', Plants.seasonForm, 'plants'],
  ['crosses', Breeding.crossList, 'breeding'],
  ['crosses/new', Breeding.crossForm, 'breeding'],
  ['crosses/:id', Breeding.crossDetail, 'breeding'],
  ['crosses/:id/edit', Breeding.crossForm, 'breeding'],
  ['seed', Breeding.lotList, 'breeding'],
  ['seed/new', Breeding.lotForm, 'breeding'],
  ['seed/:id', Breeding.lotDetail, 'breeding'],
  ['seed/:id/edit', Breeding.lotForm, 'breeding'],
  ['seed/:id/sowings/new', Breeding.sowingForm, 'breeding'],
  ['sowings/:sid/edit', Breeding.sowingForm, 'breeding'],
  ['tubers', Tubers.list, 'tubers'],
  ['tubers/new', Tubers.form, 'tubers'],
  ['tubers/:tid/edit', Tubers.form, 'tubers'],
  ['more', Settings.more, 'more'],
  ['stats', Stats.view, 'more'],
  ['settings', Settings.view, 'more'],
];

function match(path) {
  const xs = path ? path.split('/') : [];
  for (const [pattern, fn, tab] of routes) {
    const ps = pattern ? pattern.split('/') : [];
    if (ps.length !== xs.length) continue;
    const params = {};
    const ok = ps.every((p, i) => {
      if (!p.startsWith(':')) return p === xs[i];
      if (!/^\d+$/.test(xs[i])) return false;
      params[p.slice(1)] = Number(xs[i]);
      return true;
    });
    if (ok) return { fn, tab, params };
  }
  return null;
}

const main = document.getElementById('main');
const top = document.getElementById('top');

function setHeader({ title = '', back = null, right = '' } = {}) {
  top.querySelector('h1').textContent = title;
  top.querySelector('.hl').innerHTML = back ? `<a class="back" href="${back}" aria-label="Back">‹</a>` : '';
  top.querySelector('.hr').innerHTML = right;
  document.title = title ? `${title} · Dahlias` : 'Dahlias';
}

function setTab(tab) {
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
}

let token = 0;
let recovering = false;

async function render() {
  const my = ++token;
  const { data: { session } } = await sb.auth.getSession();
  if (my !== token) return;

  const ctx = {
    el: main,
    params: {},
    query: {},
    alive: () => my === token,
    render: html => { if (my !== token) return false; main.innerHTML = html; return true; },
    page: opts => { if (my === token) setHeader(opts); },
  };

  if (!session || recovering) {
    document.body.classList.add('auth');
    return Login.view(ctx, { recovering, onRecovered: () => { recovering = false; location.hash = '#/'; render(); } });
  }
  document.body.classList.remove('auth');

  const raw = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
  const [path, qs] = raw.split('?');
  const m = match(path.replace(/\/$/, ''));
  setTab(m?.tab);
  if (!m) {
    setHeader({ title: 'Not found', back: '#/' });
    main.innerHTML = '<div class="empty">Page not found.</div>';
    return;
  }
  ctx.params = m.params;
  ctx.query = Object.fromEntries(new URLSearchParams(qs || ''));
  main.innerHTML = '<div class="loading">Loading…</div>';
  window.scrollTo(0, 0);
  try {
    await m.fn(ctx);
  } catch (e) {
    console.error(e);
    if (my === token) main.innerHTML = `<div class="empty err">${esc(e.message || e)}</div>`;
  }
}

sb.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') recovering = true;
  // Defer: Supabase calls inside this callback can deadlock.
  if (['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY'].includes(event)) setTimeout(render, 0);
});

window.addEventListener('hashchange', render);
render();
