// --- Formatting --------------------------------------------------------------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => (s == null ? '' : String(s).replace(/[&<>"']/g, c => ESC[c]));

export function localDate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const fmtDate = iso =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');

export function groupBy(items, key) {
  const m = new Map();
  for (const x of items) {
    const k = typeof key === 'function' ? key(x) : x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

// --- Seasons (NZ: a season starts in July and is labelled 2026-27) -------------

export const currentSeason = (d = new Date()) => (d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1);
export const seasonLabel = s => (s == null ? '' : `${s}-${String((s + 1) % 100).padStart(2, '0')}`);
export const seasonOfDate = iso => currentSeason(new Date(`${iso}T12:00:00`));

export function seasonOptions() {
  const out = [];
  for (let s = currentSeason() + 1; s >= 2000; s--) out.push({ value: s, label: seasonLabel(s) });
  return out;
}

// The season being viewed on Home / Plants / Tubers. Resets to the current
// season each time the app starts.
let viewSeason = currentSeason();
export const getSeason = () => viewSeason;
export const setSeason = s => { viewSeason = Number(s); };

export function seasonPicker() {
  return `<select class="season-pick" aria-label="Season">${seasonOptions()
    .map(o => `<option value="${o.value}"${o.value === viewSeason ? ' selected' : ''}>${o.label}</option>`)
    .join('')}</select>`;
}

export function bindSeasonPicker(el) {
  el.querySelector('.season-pick')?.addEventListener('change', e => {
    setSeason(e.target.value);
    window.dispatchEvent(new Event('hashchange'));
  });
}

// --- Plants & lists ----------------------------------------------------------

export const plantLabel = p => (p ? (p.name ? `${p.code} · ${p.name}` : p.code) : '—');

export function plantLink(p) {
  return p ? `<a href="#/plants/${p.id}">${esc(plantLabel(p))}</a>` : '<span class="muted">unknown</span>';
}

export function plantOptions(plants) {
  const cult = plants.filter(p => p.origin === 'cultivar')
    .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code));
  const own = plants.filter(p => p.origin === 'seedling').sort((a, b) => b.code.localeCompare(a.code));
  return [
    ...cult.map(p => ({ value: p.id, label: p.name ? `${p.name} (${p.code})` : p.code, group: 'Cultivars' })),
    ...own.map(p => ({ value: p.id, label: plantLabel(p), group: 'My seedlings' })),
  ];
}

export const listOptions = (items, current) =>
  items.filter(i => i.active || i.label === current)
    .map(i => ({ value: i.label, label: i.description ? `${i.label} (${i.description})` : i.label }));

export const TUBER_STATUS = {
  in_storage: 'In storage',
  planted: 'Planted',
  given_away: 'Given away / sold',
  lost: 'Lost / rotted',
};

// --- Feedback ----------------------------------------------------------------

let toastTimer;
export function toast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show${isErr ? ' err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, isErr ? 5000 : 2500);
}

export function friendlyError(e) {
  const m = e?.message || String(e);
  if (/plant_seasons_plant_id_season_key/.test(m)) return 'This plant already has a record for that season.';
  if (/violates foreign key constraint/.test(m) && /delete/.test(m)) return 'Can’t delete: other records still refer to this one.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection. Check your signal and try again.';
  return m;
}

export function errToast(e) {
  console.error(e);
  toast(friendlyError(e), true);
}

export const emptyState = (msg, href, label) =>
  `<div class="empty">${esc(msg)}${href ? `<br><a class="btn primary" href="${href}">${esc(label)}</a>` : ''}</div>`;

// --- Forms -------------------------------------------------------------------
// Field spec: { name, label, type, options, required, num, bool, default,
//               placeholder, help (html), showIf: [field, 'a|b'] }

function optionsHtml(opts, val) {
  let out = '';
  let group = null;
  for (const o of opts) {
    if (o.group !== undefined && o.group !== group) {
      if (group !== null) out += '</optgroup>';
      group = o.group;
      out += `<optgroup label="${esc(group)}">`;
    }
    out += `<option value="${esc(o.value)}"${String(o.value) === String(val) ? ' selected' : ''}>${esc(o.label)}</option>`;
  }
  if (group !== null) out += '</optgroup>';
  return out;
}

function traitsHtml(f, val) {
  const cur = val || {};
  return f.traits.map(t => {
    const opts = [['', '–'], ['good', t.good_label], ['poor', t.poor_label]];
    return `<div class="trait"><span>${esc(t.name)}</span><div class="seg seg-sm">${opts
      .map(([k, l]) => `<label class="${k}"><input type="radio" name="trait_${t.key}" value="${k}"${(cur[t.key] ?? '') === k ? ' checked' : ''}><span>${esc(l)}</span></label>`)
      .join('')}</div></div>`;
  }).join('');
}

function fieldHtml(f, v) {
  if (f.type === 'html') return f.html;
  let val = v[f.name];
  if (val === undefined || val === null) val = f.default ?? '';
  const attrs = `name="${f.name}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}`;
  let input;
  switch (f.type) {
    case 'textarea':
      input = `<textarea ${attrs} rows="3">${esc(val)}</textarea>`;
      break;
    case 'select':
      input = `<select ${attrs}>${f.blank === false ? '' : `<option value="">${esc(f.blank ?? '—')}</option>`}${optionsHtml(f.options, val)}</select>`;
      break;
    case 'segment':
      input = `<div class="seg">${f.options
        .map(o => `<label><input type="radio" name="${f.name}" value="${esc(o.value)}"${String(o.value) === String(val) ? ' checked' : ''}><span>${esc(o.label)}</span></label>`)
        .join('')}</div>`;
      break;
    case 'combo':
      input = `<input ${attrs} list="dl-${f.name}" value="${esc(val)}" autocomplete="off"><datalist id="dl-${f.name}">${f.options
        .map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
      break;
    case 'traits':
      input = traitsHtml(f, val);
      break;
    case 'number':
      input = `<input type="number" inputmode="${f.step ? 'decimal' : 'numeric'}" min="0"${f.step ? ` step="${f.step}"` : ''} ${attrs} value="${esc(val)}">`;
      break;
    default:
      input = `<input type="${f.type || 'text'}" ${attrs} value="${esc(val)}">`;
  }
  const tag = f.type === 'segment' || f.type === 'traits' ? 'div' : 'label';
  const show = f.showIf ? ` data-show-field="${f.showIf[0]}" data-show-value="${f.showIf[1]}"` : '';
  return `<div class="field" data-field="${f.name}"${show}><${tag} class="fl"><span class="lbl">${esc(f.label)}${f.required ? ' *' : ''}</span>${input}</${tag}>${f.help ? `<small>${f.help}</small>` : ''}</div>`;
}

export const formHtml = (fields, values = {}) => fields.map(f => fieldHtml(f, values)).join('');

export function bindShowIf(form) {
  const update = () => form.querySelectorAll('[data-show-field]').forEach(el => {
    const cur = form.elements[el.dataset.showField]?.value ?? '';
    el.hidden = !el.dataset.showValue.split('|').includes(cur);
  });
  form.addEventListener('change', update);
  update();
}

export function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (!f.name || f.type === 'html') continue;
    const hidden = form.querySelector(`[data-field="${f.name}"]`)?.hidden;
    if (f.type === 'traits') {
      const t = {};
      for (const d of f.traits) {
        const x = form.elements[`trait_${d.key}`]?.value;
        if (x) t[d.key] = x;
      }
      out[f.name] = { ...(f.keep || {}), ...t };
      for (const d of f.traits) if (!t[d.key]) delete out[f.name][d.key];
      continue;
    }
    const el = form.elements[f.name];
    if (!el) continue;
    let val = typeof el.value === 'string' ? el.value.trim() : el.value;
    if (hidden || val === '' || val == null) val = null;
    else if (f.num) val = Number(val);
    else if (f.bool) val = val === 'true';
    out[f.name] = val;
  }
  return out;
}

// Render a standard edit form page and wire up save / delete.
export function formView(ctx, { title, back, fields, values = {}, intro = '', onSave, onDelete }) {
  ctx.page({ title, back });
  if (!ctx.render(`${intro}<form class="form" novalidate>${formHtml(fields, values)}
      <div class="form-actions"><button class="btn primary" type="submit">Save</button>
      ${onDelete ? '<button class="btn danger" type="button" data-delete>Delete</button>' : ''}</div></form>`)) return null;
  const form = ctx.el.querySelector('form');
  bindShowIf(form);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = readForm(form, fields);
    const missing = fields.find(f => f.required && data[f.name] == null && !form.querySelector(`[data-field="${f.name}"]`)?.hidden);
    if (missing) return toast(`${missing.label} is required`, true);
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { await onSave(data, form); } catch (err) { errToast(err); } finally { btn.disabled = false; }
  });
  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm('Delete this record? This can’t be undone.')) return;
    try { await onDelete(); } catch (err) { errToast(err); }
  });
  return form;
}
