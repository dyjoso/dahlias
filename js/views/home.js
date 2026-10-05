import { sb, q } from '../db.js';
import { getSeason, currentSeason, seasonPicker, bindSeasonPicker } from '../ui.js';

export async function view(ctx) {
  const season = getSeason();
  ctx.page({ title: 'Dahlias' });
  const [crosses, lots, tubers, plants] = await Promise.all([
    q(sb.from('crosses').select('id').eq('season', season)),
    q(sb.from('seed_lots').select('id,seed_count').eq('season', season)),
    q(sb.from('tuber_lots').select('quantity,status').eq('season', season)),
    q(sb.from('plants').select('id,origin,first_season,count_growing')),
  ]);
  // Growing / trial figures are "right now", whatever season is picked.
  const rows = plants.filter(p => p.count_growing > 0);
  const inGarden = rows.reduce((a, p) => a + p.count_growing, 0);
  const trial = { 1: 0, 2: 0, 3: 0 };
  for (const p of rows) {
    if (p.origin !== 'seedling' || !p.first_season) continue;
    const y = Math.min(3, currentSeason() - p.first_season + 1);
    if (y >= 1) trial[y]++;
  }
  const seeds = lots.reduce((a, l) => a + (l.seed_count || 0), 0);
  const stored = tubers.filter(t => t.status === 'in_storage').reduce((a, t) => a + t.quantity, 0);

  if (!ctx.render(`
    <div class="season-bar"><span class="muted">Season</span>${seasonPicker()}</div>
    <form class="searchbox" id="search"><input type="search" name="q" placeholder="Find a plant by code or name"></form>
    <div class="tiles">
      <a class="tile" href="#/plants"><div class="n">${inGarden}</div><div class="l">Plants growing now</div><div class="s">${rows.length} varieties/seedlings</div></a>
      <a class="tile" href="#/plants"><div class="n">${trial[1] + trial[2] + trial[3]}</div><div class="l">Seedlings on trial now</div><div class="s">Y1 ${trial[1]} · Y2 ${trial[2]} · Y3+ ${trial[3]}</div></a>
      <a class="tile" href="#/crosses"><div class="n">${crosses.length}</div><div class="l">Crosses</div></a>
      <a class="tile" href="#/seed"><div class="n">${lots.length}</div><div class="l">Seed lots</div><div class="s">${seeds} seeds</div></a>
      <a class="tile" href="#/tubers"><div class="n">${stored}</div><div class="l">Tubers in storage</div></a>
      <a class="tile" href="#/stats"><div class="n">📊</div><div class="l">Parent stats</div></a>
    </div>
    <h3 class="group">Quick add</h3>
    <div class="actions">
      <a class="btn" href="#/crosses/new">✚ Cross</a>
      <a class="btn" href="#/seed/new">✚ Seed lot</a>
      <a class="btn" href="#/seed">✚ Kept seedling</a>
      <a class="btn" href="#/plants/new?origin=cultivar">✚ Cultivar</a>
      <a class="btn" href="#/tubers/new">✚ Tubers</a>
      <a class="btn" href="#/plants">📷 Photos</a>
    </div>`)) return;

  bindSeasonPicker(ctx.el);
  ctx.el.querySelector('#search').addEventListener('submit', e => {
    e.preventDefault();
    location.hash = `#/plants?q=${encodeURIComponent(e.target.q.value.trim())}`;
  });
}
