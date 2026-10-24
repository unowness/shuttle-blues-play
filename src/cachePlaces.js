import { CONFIG } from './config.js';
import { CHASSIS, DEFAULT_CHASSIS } from './chassis.js';
import { SECTOR_SIZE, sectorById } from './sectors.js';
import { CATALOGUE, findsFor, isClaimed, ruleUnlocked } from './rewards.js';
import { SIGNALS } from './progression.js';
import { FIXTURE_SIGNS } from './signs.js';
import { LOOK_FINDS } from './looks.js';
import { STRANGERS } from './strangers.js';
import { secretHoleAt } from './secretHole.js';
import { openSectorIds, sectorOpen } from './frontier.js';
import { KEEP_OUT } from './keepOut.js';
import { contentAreas, insideContentArea } from './mapContent.js';
import { TERRA } from './terra.js';

// Where a find is laid when it becomes the pilot's to find (SX, 2026-10-02: «у нас тайники же тоже не сразу открыты они
// открываются по мере починки секторов но новые тайники не обязательно должны в новом секторе быть, понимаешь я расставил их
// изначально на карте, но тут нужно интереснее сгенерировать логику»; of the options, «Противовесы» and «Пул хороших мест»).
//
// A find opens by the rule (src/rewards.js ruleUnlocked: four paints and three souvenirs from the start, the fourth with the
// first sector the frontier opens, two with each ruin restored). It is then laid once, and stays until opened (the ledger's `placed`, saved):
//   the sector  any open one, drawn by weight: 1 / (1 + crowd × the caches already waiting there), times `here` for the one
//               the pilot is in, so new caches spread over the open world and seldom land under the pilot's nose;
//   the place   one of SX's places in that sector (the catalogue's 24, each clear of planets, holes, stations, signals and
//               signs, checks/rewards.mjs) that no cache has taken, `apart` from every waiting cache and `hole` from the secret
//               hole; with none left, a clear place drawn as the catalogue's were made.
// A find the pilot already knew where it lay (an older save: come up to, or marked) and whose catalogue place is open stays
// there. Nothing here runs in a World of a check unless asked (World.placeCaches): its finds lie at the catalogue's places.

const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
const P = () => CONFIG.cache.place;

// The finds still to open that already lie somewhere, and where (world units of their sector).
function waiting(ledger) {
  const out = [];
  for (const [id, p] of ledger.placed) if (!ledger.found.has(id)) out.push({ id, sector: p.sector, x: p.x * W, y: p.y * H });
  return out;
}

// Why a cache cannot lie at (x, y) of `sectorId` (world units), or null (and a check's: checks/special-quests.mjs's section clipper, TERRA's place). `made`: a drawn place, asked of everything a pilot
// must reach a cache across; one of SX's places is clear of the catalogue's things by its check, so only the waiting caches,
// the secret hole, the places already taken and the stations' menu reach are asked of it.
export function issue(sectorId, x, y, ledger, made) {
  const c = P();
  for (const w of waiting(ledger)) if (w.sector === sectorId && Math.hypot(w.x - x, w.y - y) < c.apart) return 'by a waiting cache';
  for (const p of ledger.placed.values()) if (p.sector === sectorId && Math.hypot(p.x * W - x, p.y * H - y) < c.taken) return 'taken';
  const hole = secretHoleAt(sectorId);
  if (hole && Math.hypot(hole.x * W - x, hole.y * H - y) < c.hole) return 'by the secret hole';
  const s = sectorById(sectorId), reach = CONFIG.cache.interactRadius, orbit = CONFIG.planet.orbit.height;
  // One of SX's places out of every station's menu reach too (its keep-out, src/keepOut.js; SX, 2026-10-07: «давай ... сундуки, не
  // будут сильно близко к станциям»): all of them stand 1,546 u and more off one today, so this holds a layout to come; a drawn place
  // keeps the ring below, wider.
  if (!made) {
    for (const st of s?.stations ?? []) if (Math.hypot(x - st.x * W, y - st.y * H) < KEEP_OUT) return 'in a station\'s reach';
    return null;
  }
  if (x < c.edge * W || y < c.edge * H || x > (1 - c.edge) * W || y > (1 - c.edge) * H) return 'at the edge';
  for (const p of [...(s.planets ?? []), ...(ledger.terra?.sector === sectorId ? [{ ...ledger.terra, radius: TERRA.radius }] : [])]) {
    if (Math.hypot(x - p.x * W, y - p.y * H) < p.radius + 2 * orbit + reach + 100) return 'by a planet';
  }
  const thrust = CHASSIS[DEFAULT_CHASSIS].thrust;
  for (const h of s.holes ?? []) {
    const pull = Math.sqrt(h.mass / (thrust * CONFIG.stranded.gravityShare));
    if (Math.hypot(x - h.x * W, y - h.y * H) < Math.max(h.disc, pull) + orbit + reach + 100) return 'by a hole';
  }
  for (const st of s.stations ?? []) if (Math.hypot(x - st.x * W, y - st.y * H) < CONFIG.station.interactRadius + reach + 200) return 'in a station\'s ring';
  const points = [
    ...SIGNALS.filter((g) => g.sector === sectorId).map((g) => [g.x, g.y, 800]),
    ...FIXTURE_SIGNS.filter((g) => g.sector === sectorId).map((g) => [g.x, g.y, CONFIG.sign.objectClear + CONFIG.sign.spacing]),
    ...LOOK_FINDS.filter((g) => g.sector === sectorId).map((g) => [g.x, g.y, 1000]),
    ...STRANGERS.filter((g) => g.sector === sectorId).map((g) => [g.x, g.y, 800]),
    ...CATALOGUE.filter((g) => g.sector === sectorId).map((g) => [g.x, g.y, 1000]),
  ];
  for (const [fx, fy, min] of points) if (Math.hypot(x - fx * W, y - fy * H) < min) return 'by something to reach';
  return null;
}

// A draw by weight: the index, or -1 when every weight is 0.
function drawn(weights, rng) {
  const total = weights.reduce((s, w) => s + w, 0);
  if (!(total > 0)) return -1;
  let u = rng() * total;
  for (let i = 0; i < weights.length; i++) { u -= weights[i]; if (u < 0) return i; }
  return weights.length - 1;
}

// A place in `sectorId`: one of SX's that is free, drawn, else a clear one made; null when neither is found.
function placeIn(sectorId, ledger, rng) {
  const legal = CATALOGUE.filter((g) => g.sector === sectorId && !issue(sectorId, g.x * W, g.y * H, ledger, false));
  const areas = contentAreas('cache-pool', ledger, { sectorId });
  const preferred = legal.filter(g => insideContentArea(g, areas));
  const pool = preferred.length ? preferred : legal;
  if (pool.length) { const g = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]; return { sector: sectorId, x: g.x, y: g.y }; }
  for (let i = 0; i < P().tries; i++) {
    const fx = P().edge + (1 - 2 * P().edge) * rng(), fy = P().edge + (1 - 2 * P().edge) * rng();
    if (!issue(sectorId, fx * W, fy * H, ledger, true)) return { sector: sectorId, x: fx, y: fy };
  }
  return null;
}

// Where one find is laid: a sector drawn by the counterweights, then a place in it; the next sector by weight when one has
// no room. Null when no open sector has room (it is asked again at the next settling).
function layFind(f, ledger, rng, here = null) {
  const open = openSectorIds(ledger);
  const crowd = new Map(open.map((id) => [id, 0]));
  for (const w of waiting(ledger)) if (crowd.has(w.sector)) crowd.set(w.sector, crowd.get(w.sector) + 1);
  const weights = open.map((id) => (1 / (1 + P().crowd * crowd.get(id))) * (id === here ? P().here : 1));
  while (weights.some((w) => w > 0)) {
    const i = drawn(weights, rng);
    const place = placeIn(open[i], ledger, rng);
    if (place) return Object.freeze(place);
    weights[i] = 0;
  }
  return null;
}

// Every find the rule has opened and that lies nowhere yet is laid, in the catalogue's order (the four paints of a new game
// one after another, so the counterweights spread them). `here`: the sector the pilot is in. Returns the ids laid now.
export function settlePlaces(ledger, rng, here = null) {
  const laid = [];
  for (const f of findsFor(ledger)) {
    if (ledger.placed.has(f.id) || isClaimed(f, ledger) || !ruleUnlocked(f, ledger)) continue;
    // An older save's find the pilot knew where it lay stays there, if that sector is open.
    const known = ledger.reached.has(f.id) || ledger.marked === f.id;
    const place = known && sectorOpen(ledger, f.sector) ? Object.freeze({ sector: f.sector, x: f.x, y: f.y }) : layFind(f, ledger, rng, here);
    if (!place) continue;
    ledger.placed.set(f.id, place);
    laid.push(f.id);
  }
  return laid;
}
