import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Await a Supabase query builder and return its data, throwing on error.
export async function q(builder) {
  const { data, error } = await builder;
  if (error) throw error;
  return data;
}

// --- Reference data (lists, traits, producers), cached until edited ----------

let refCache = null;

export async function refs(force = false) {
  if (refCache && !force) return refCache;
  const [lists, traits, producers] = await Promise.all([
    q(sb.from('lists').select('*').order('sort_order').order('id')),
    q(sb.from('trait_defs').select('*').order('sort_order')),
    q(sb.from('producers').select('*').order('name')),
  ]);
  const kind = k => lists.filter(l => l.kind === k);
  refCache = {
    lists, traits, producers,
    forms: kind('form'), sizes: kind('size'), colours: kind('colour'),
    activeTraits: traits.filter(t => t.active),
    producerName: id => producers.find(p => p.id === id)?.name ?? '',
  };
  return refCache;
}

export const invalidateRefs = () => { refCache = null; };

// Find a producer by name (case-insensitive) or create it. Returns its id.
export async function resolveProducer(name) {
  if (!name) return null;
  const r = await refs();
  const hit = r.producers.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit.id;
  const row = await q(sb.from('producers').insert({ name }).select().single());
  invalidateRefs();
  return row.id;
}

// --- Breeding graph: plants, seed lots, crosses --------------------------------

export async function graph() {
  const [plants, lots, crosses] = await Promise.all([
    q(sb.from('plants').select('*').order('code')),
    q(sb.from('seed_lots').select('*').order('code')),
    q(sb.from('crosses').select('*').order('code')),
  ]);
  const idx = a => Object.fromEntries(a.map(x => [x.id, x]));
  return { plants, lots, crosses, plantsById: idx(plants), lotsById: idx(lots), crossesById: idx(crosses) };
}

// Parents of a seed lot: from its cross (own seed) or as recorded (bought seed).
export function lotParents(lot, g) {
  if (lot.source === 'own') {
    const c = g.crossesById[lot.cross_id];
    return { seed: c?.seed_parent_id ?? null, pollen: c?.pollen_parent_id ?? null, open: c?.type === 'open', cross: c };
  }
  return { seed: lot.seed_parent_id, pollen: lot.pollen_parent_id, open: false, text: lot.parentage };
}

export function plantParents(plant, g) {
  if (plant?.origin !== 'seedling') return null;
  const lot = g.lotsById[plant.seed_lot_id];
  return lot ? { lot, ...lotParents(lot, g) } : null;
}

// --- Photos ------------------------------------------------------------------

export const thumbPath = p => p.replace(/\.jpg$/, '_t.jpg');

const urlCache = new Map();

export async function signedUrls(paths) {
  const now = Date.now();
  const need = [...new Set(paths)].filter(p => !(urlCache.get(p)?.exp > now));
  if (need.length) {
    const data = await q(sb.storage.from('photos').createSignedUrls(need, 3600));
    for (const d of data) if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60000 });
  }
  return Object.fromEntries(paths.map(p => [p, urlCache.get(p)?.url]));
}

function resizeImage(file, max, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
    img.src = url;
  });
}

// Compress a photo (plus a thumbnail), upload both and record it.
export async function uploadPhoto(plantId, file, takenOn, season) {
  const [full, thumb] = await Promise.all([resizeImage(file, 1600, 0.82), resizeImage(file, 400, 0.75)]);
  const path = `${plantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const bucket = sb.storage.from('photos');
  await q(bucket.upload(path, full, { contentType: 'image/jpeg' }));
  await q(bucket.upload(thumbPath(path), thumb, { contentType: 'image/jpeg' }));
  return q(sb.from('photos').insert({ plant_id: plantId, storage_path: path, taken_on: takenOn, season }).select().single());
}

export async function deletePhotoFiles(paths) {
  if (!paths.length) return;
  await q(sb.storage.from('photos').remove(paths.flatMap(p => [p, thumbPath(p)])));
}
