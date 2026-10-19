// Authored sector catalogue.
//
// A sector is a stable address and a content boundary. `id` is the key that
// persistence and interactions use and must never change; `label` is
// presentation and may be renamed freely. `name` is the sector's word, read
// after its address (SX, 2026-10-01, of the locator's header: «мне не нравится,
// что куцая надпись, просто К ... Давай будет написано сектор К0,4 и название
// сектора ... без слова сектор»): the stretches of a coast, as a sea chart names
// them, each for what the sector is like (the start's SHALLOWS, the UNDERTOW
// round K-04's black hole in its middle, the ruins' DOLDRUMS and BACKWATER);
// the hidden sector's is playful, as its planets are. `col` / `row` place the sector on a
// grid, so neighbours are computed rather than hand-listed and a diagonal
// crossing is just a change in both.
//
// Celestial bodies and stations here are authored and stable: leave a sector,
// come back, and the station is at the same address. Asteroids are active
// simulation and are respawned per visit, which is why they carry a count
// rather than positions: `rocks` is the count as SX's layout has it, for a sector
// of the layout's size, and `asteroids` the count the game spawns, that density
// over the game's sector (src/worldScale.js; set below the catalogue).

import { mixHex } from './util.js';
import { LAYOUT_SECTOR, WORLD_SCALE } from './worldScale.js';
import { FIELD } from './field.js';

// Every place below is a fraction of the sector; the sector is the layout's, WORLD_SCALE times (src/worldScale.js).
export const SECTOR_SIZE = Object.freeze({ width: LAYOUT_SECTOR * WORLD_SCALE, height: LAYOUT_SECTOR * WORLD_SCALE });

// A planet's colour is authored once, as its lit tone (SX, 2026-09-30: "нужно
// больше разнообразия космосу цветные планеты"). Every painter takes its ramp
// from that one hue, and the dark end it mixes towards is derived here, so
// retuning a hue retunes the whole planet. Keep a hue clear of the reserved
// interface inks (route green #79A78F, caution orange #FF9D4D, danger red
// #E2603A): checks/planets.mjs holds each to a colour distance from all three.
const DARK_SHARE = 0.14;
export const planetHue = (tint) => ({ tint, dark: mixHex('#000000', tint, DARK_SHARE) });
const hue = planetHue;

// Planet names (`label`, shown quietly under the planet): one pronounceable
// word, never the plain colour word. Classic planets (the ASCII density ramp)
// take a matter, weather or measure word; block planets (labs/graphics/
// world-art.js) something assembled from pieces; the hidden sector may be
// playful. Names come from the copywriter, 2026-09-30.

// Planet sizes (SX, 2026-09-30: "планеты можно и покрупнее делать, сейчас они
// чаще всего мелкие слишком"). Every planet is 1.5 to 1.8 times what it was, the
// small ones by more than the big ones: the smallest is now 235 (was 130) and the
// biggest 450 (was 300). A ladder that narrows, because the window is about 1100
// tall and a planet much past 500 stops being a body and becomes a wall.
//   `radius` is how big a planet is drawn, and where its surface and its cushion
//   are. `pull` is the radius it pulls like (mass = pull^2 x 26, src/bodies.js):
//   the one it had before the size pass, so flying past a planet feels as it did.
// Positions moved only where the old spot could not hold the new size under the
// clearances of checks/planets.mjs (the sectors are packed with caches, signals,
// coins and signs); J-04 is the tightest, and TESSERA moved furthest for it.

// Positions follow SX's Exchange Ring × Braided Run choice (2026-10-10); all stable IDs, sector cells,
// body properties and station roles remain. WHARF is nudged east of the draft to clear CAIRN's orbit and refuge.
// Older dated comments below document earlier layouts, not the current coordinates.
export const SECTORS = [
  {
    id: 'sector-j04', label: 'J-04', name: 'SHALLOWS', col: 0, row: 0,
    planets: [
      { x: 0.32, y: 0.3, radius: 340, pull: 227, ...hue('#9AADDC'), seed: 46381, bands: 0.15, spin: 0.045, style: 'blocks', label: 'KELVIN' },
      { x: 0.63, y: 0.66, radius: 335, pull: 205, ...hue('#D0898C'), seed: 42256, bands: 0.62, spin: 0.085, label: 'AMBERGRIS' },
      // Nudged from the teal SX's table gave (#5FB7AE, 14 to the route green by
      // colour distance) to a slightly bluer one, 22 clear of it. Now in the
      // south-east, beside the hole and off the first route (DRY DOCK to RELAY 12
      // runs through the middle of the sector).
      // The planets after SX's notes on labs/graphics/sketches/planets-stations.html (2026-10-14, verbatim in docs/decisions/2026-10.md
      // "The planets after SX's sheet"): six replaced by the new types in their place and size (SORREL GLACIER, DAMASK STORM, TORTUGA
      // FACETS, FATHOM NIGHTSIDE, ISOBAR FORGE, CAIRN SHELL), TESSERA a calmer turquoise, MAGRATHEA grey, GLOAMING's and GREEN ROOM's
      // craters darker in their own tone, PARQUET in CAIRN's colour, CAMEO a lighter blue, PLANET EXPRESS smaller.
      { x: 0.84, y: 0.86, radius: 275, pull: 158, ...hue('#78B9C6'), seed: 43, bands: 0, spin: -0.062, label: 'TESSERA' },
    ],
    holes: [
      { id: 'hole-j04', x: 0.4, y: 0.84, horizon: 52, disc: 300, mass: 3.1e7, spinDir: 1 },
    ],
    // A station's `look` is its drawing, one of the twelve SX took from the stations sheet on
    // 2026-09-30 (labs/graphics/station-art.js; «Станции очень крутые берем»). What it does is `kind`.
    stations: [
      { id: 'station-drydock-j04', look: 'wheel', kind: 'garage', label: 'DRY DOCK', x: 0.72, y: 0.3 },
      // SX moved HOIST here from K-06 in his map layout of 2026-10-02 (labs/map-editor/layouts/2026-10-02-sx-second.json).
      { id: 'station-hoist-k06', look: 'spire', kind: 'ruin', becomes: 'garage', label: 'HOIST', x: 0.2, y: 0.7, cost: 2600 },
    ],
    rocks: 9,
  },
  {
    id: 'sector-j05', label: 'J-05', name: 'NARROWS', col: 1, row: 0,
    planets: [
      { x: 0.54, y: 0.51, radius: 405, pull: 249, ...hue('#B3B5BA'), seed: 86002, bands: 0.17, spin: -0.116, style: 'blocks', tint2: '#8D9097', label: 'MAGRATHEA' },
      // New with the colour pass (2026-09-30), in the open south-west.
      { x: 0.72, y: 0.88, radius: 400, pull: 233, ...hue('#DCEAF2'), seed: 80454, bands: 0.12, spin: 0.063, style: 'glacier', tint2: '#7FA6D9', label: 'SORREL' },
    ],
    holes: [
      // The smallest hole, 15 % larger since SX's word (2026-10-01: «Возьми самую маленькую черную дыру по размеру и
      // чуть-чуть ее увеличить на 15%»; it was 34 and 190). Its mass is as it was.
      { id: 'hole-j05', x: 0.78, y: 0.21, horizon: 39, disc: 219, mass: 1.5e7, spinDir: 1 },
    ],
    stations: [
      { id: 'station-relay-j05', look: 'array', kind: 'freight', label: 'RELAY 12', x: 0.28, y: 0.78 },
      // A ruin (src/ruins.js): a freight hub once, restored with the pilot's coins; the start's broken station of an older save
      // (START_STATIONS below: a new pilot's is any of the three). Moved out of the north-west corner on SX's word (2026-10-02:
      // «halycon слишком в углу находится и ты редко на него натыкаешься, поэтому двинь его куда нибудь, но чтобы между
      // станциями было равноудаленное пространство приблизительно»; it stood at 0.165, 0.114, 5,288 u from RELAY 12 and 8,721
      // from YARD 3), to a place about as far from RELAY 12 as from YARD 3. Map X (Codex, 2026-10-10, SX's pick of the Exchange
      // Ring with the Braided Run's crossings) put it at 0.8, 0.66 on the ring's east side; the measures of the place SX picked on
      // 2026-10-02 no longer hold. Its rules still do (checks/start-ruin.mjs: clear of the orbits, the seams, the caches, signals
      // and signs, and of a pull on a parked ship).
      { id: 'station-halcyon-j05', look: 'greenhouse', kind: 'ruin', becomes: 'freight', label: 'HALCYON', x: 0.8, y: 0.66, cost: 1900 },
      // The pilot's home (src/home.js, CONFIG.home; labs/graphics/garage-art.js; the S0 tile SX picked on
      // labs/graphics/sketches/garage-setting.html): the garage the shuttle was inherited with, where a new game starts.
      // Its berth opens to the south. SX put it in J-05, at (0.42, 0.44), in his map layout of 2026-10-02
      // (labs/map-editor/layouts/2026-10-02-sx-second.json; it stood in J-04's south-west corner), and START_SECTOR follows it.
      // Its id keeps J-04 in it: an id is a key and never changes. Not a look of the twelve (`look` names its drawing and its body);
      // it sends and receives no freight.
      { id: 'station-home-j04', look: 'home', kind: 'home', label: 'HOME', x: 0.24, y: 0.38 },
    ],
    rocks: 14,
  },
  {
    id: 'sector-k04', label: 'K-04', name: 'UNDERTOW', col: 0, row: 1,
    // The lower row had no planet at all (SX, 2026-09-30: more variety). Both
    // stand well away from the black hole in the middle, which is the way out
    // of a pirate fight, and off the edge current and the seams. Both stay off
    // the ground checks/pirates.mjs uses as open: a run west along y = 4200 and
    // a ship parked at (5000, 2000).
    planets: [
      { x: 0.32, y: 0.63, radius: 320, pull: 190, ...hue('#C79BC8'), seed: 1274, bands: 0.42, spin: -0.11, style: 'cratered', tint2: '#8C5E8D', label: 'GLOAMING' },
      { x: 0.68, y: 0.35, radius: 260, pull: 145, ...hue('#A6DED6'), seed: 163, bands: 0, spin: 0.09, label: 'BERYL' },
    ],
    holes: [
      { id: 'hole-k04', x: 0.5, y: 0.48, horizon: 58, disc: 330, mass: 3.4e7, spinDir: 1 },
    ],
    // The lower row had no station at all (SX, 2026-09-24: more deliveries).
    stations: [
      { id: 'station-depot-k04', look: 'depot', kind: 'freight', label: 'DEPOT 7', x: 0.76, y: 0.72 },
      // A ruined garage (src/ruins.js), rebuilt with the pilot's coins, in the
      // quiet west between DEPOT 7 and GLOAMING (0.7 % of a ship's thrust in pull).
      { id: 'station-foundry-k04', look: 'foundry', kind: 'ruin', becomes: 'garage', label: 'FOUNDRY 2', x: 0.28, y: 0.24, cost: 2000 },
    ],
    rocks: 18,
  },
  {
    id: 'sector-k05', label: 'K-05', name: 'LEEWARD', col: 1, row: 1,
    planets: [
      { x: 0.49, y: 0.48, radius: 520, pull: 330, ...hue('#D8B48E'), seed: 71, bands: 0, spin: 0.083, style: 'storm', tint2: '#B7A0C9', label: 'DAMASK' },
      { x: 0.76, y: 0.75, radius: 295, pull: 163, ...hue('#B9C2CC'), seed: 88, bands: 0, spin: 0.1, style: 'facets', label: 'TORTUGA' },
    ],
    // In the pink secret hole's place (SX, 2026-10-19: «Просто вырежи ее и вместо нее помести черную дыру. Которая между секторами
    // выкидывает»; «Да, строй кольцо с новой дырой в K-05»): an ordinary hole of the secret hole's size (SECRET_HOLE below), turning
    // the one way every ordinary hole turns, so both sectors open at the start have a hole and the ring of passages
    // (src/holePassage.js holeExit) leads somewhere from the first minute. In the quiet south-west, between the DEPOT 7 to WHARF 9
    // line (y 0.72) and the dead south edge, 3,000 u and more from every cache, signal, sign and lost cargo of the sector and
    // 7,300 from YARD 3, the opening's station; the north-east was taken by the freight lines and a ship-in-trouble area.
    holes: [
      { id: 'hole-k05', x: 0.2, y: 0.86, horizon: 46, disc: 256, mass: 2.5e7, spinDir: 1 },
    ],
    stations: [
      { id: 'station-yard-k05', look: 'lattice', kind: 'garage', label: 'YARD 3', x: 0.3, y: 0.22 },
    ],
    rocks: 7,
  },
  // Two sectors east of the first four (SX, 2026-09-30: «добавь еще два сектора, 4 станции сделай
  // открытыми остальные в руинах»): the six station looks that had no station yet, three to a
  // sector. All six are ruins since the v1 economy (ECONOMY_V1_HANDOFF.md, 2026-10-01): four
  // stations work from the start (DRY DOCK, RELAY 12, DEPOT 7, YARD 3) and eight wait to be
  // restored, each at its own fixed price (`cost`, CR), 25,700 in all since 2026-10-04 (Codex's economy study, proposal.json, SX's
  // «по экономике согласен»: the start's role 1,900, FOUNDRY 2 2,000, HOIST 2,600, COMMONS 3,000, SPOOL 8 3,400, PHAROS 3,800, APIARY
  // 4,300, WHARF 9 4,700, cheapest in the order the frontier makes them; 26,300 until then; an older save's ruins, src/storage.js v16). Their north, east and south edges are the grid's dead edges. Their
  // planets' hues fill the gaps the first nine left (ice, lime, ivory, orchid: 15 or more from every
  // other on the grid, 30 within a sector, checks/planets.mjs); the second of each is a block planet.
  {
    id: 'sector-j06', label: 'J-06', name: 'DOLDRUMS', col: 2, row: 0,
    planets: [
      { x: 0.53, y: 0.43, radius: 520, pull: 316, ...hue('#9FB3C8'), seed: 85534, bands: 0.2, spin: 0.055, style: 'nightside', tint2: '#6FA9E8', label: 'FATHOM' },
      { x: 0.67, y: 0.8, radius: 250, pull: 150, ...hue('#D080D0'), seed: 181, bands: 0, spin: -0.08, label: 'PARQUET' },
    ],
    holes: [],
    stations: [
      { id: 'station-commons-j06', look: 'ring', kind: 'ruin', becomes: 'freight', label: 'COMMONS', x: 0.24, y: 0.28, cost: 3000 },
      { id: 'station-spool-j06', look: 'spindle', kind: 'ruin', becomes: 'freight', label: 'SPOOL 8', x: 0.8, y: 0.66, cost: 3400 },
      { id: 'station-pharos-j06', look: 'beacon', kind: 'ruin', becomes: 'freight', label: 'PHAROS', x: 0.32, y: 0.8, cost: 3800 },
    ],
    rocks: 10,
  },
  {
    id: 'sector-k06', label: 'K-06', name: 'BACKWATER', col: 2, row: 1,
    planets: [
      { x: 0.43, y: 0.33, radius: 300, pull: 180, ...hue('#A8A3B4'), seed: 191, bands: 0.35, spin: 0.07, style: 'forge', tint2: '#B98CF2', label: 'ISOBAR' },
      { x: 0.64, y: 0.75, radius: 270, pull: 160, ...hue('#EBC3DE'), seed: 197, bands: 0, spin: -0.06, style: 'shell', tint2: '#E8A3D2', label: 'CAIRN' },
    ],
    holes: [
      { id: 'hole-k06', x: 0.56, y: 0.48, horizon: 44, disc: 250, mass: 2.4e7, spinDir: 1 },
    ],
    stations: [
      { id: 'station-apiary-k06', look: 'hive', kind: 'ruin', becomes: 'freight', label: 'APIARY', x: 0.24, y: 0.24, cost: 4300 },
      { id: 'station-wharf-k06', look: 'anchor', kind: 'ruin', becomes: 'garage', label: 'WHARF 9', x: 0.824, y: 0.72, cost: 4700 },
    ],
    rocks: 14,
  },
];

// The secret hole, the way into the hidden sector, at both ends of its passage: the one that roams the open sectors
// (src/secretHole.js; its way shut since 2026-10-19, CONFIG.blackHole.secret.way) and the one in O-08 are the same size (SX, 2026-10-02: «сделай их размер одинаковым и снаружи и
// внутри сектора я бы чуть увеличил размер снаружи»). 15 % over what O-08's hole was (40, 220, mass 2.0e7: now 46, 256,
// 2.5e7, so between the ordinary K-06's 44 / 250 and J-04's 52 / 300), the mass in the ordinary holes' proportion to
// the disc. It turns the other way from every ordinary hole (SX, 2026-10-01: «она, в отличие от других черных дыр,
// крутится в другую сторону»), its arms mirrored; the tell in its drawing is CONFIG.blackHole.secret.
export const SECRET_HOLE = Object.freeze({ horizon: 46, disc: 256, mass: 2.5e7, spinDir: -1 });

// The hidden sector (SX, 2026-09-26: "нарисуй там инопланетян и планеты, где
// стоят гуманоиды-инопланетяне"; PLANET EXPRESS among its planets). It sits off
// the grid, so no seam leads here and every edge is a dead edge: the only way in
// or out is a black hole passage (in by the secret hole, shut since 2026-10-19;
// out by its own hole, to the ring's first, src/holePassage.js). `hidden`
// tells navigation not to point across the grid from or into it.
SECTORS.push({
  id: 'sector-hidden', label: 'O-08', name: 'BACKSTAGE', col: 7, row: 7, hidden: true,
  planets: [
    // The aliens' worlds stay in the green family of the accepted sketch, but
    // one hue each, told apart and clear of the interface's route green: a
    // yellower one (CAMEO) and a bluer emerald (GREEN ROOM). GREEN ROOM's hue, and
    // PLANET EXPRESS's, is HALCYON's green, the route's since 2026-10-20
    // (src/palette.js); SX kept them as they are, the exceptions of checks/art.mjs's rule.
    { x: 0.28, y: 0.24, radius: 320, pull: 190, ...hue('#B8D6EC'), seed: 11621, bands: 0.4, spin: -0.114, style: 'blocks', tint2: '#C98A5E', label: 'CAMEO',
      aliens: { at: [-Math.PI / 2 - 0.5, -Math.PI / 2, -Math.PI / 2 + 0.5], waving: 1 } },
    { x: 0.80, y: 0.72, radius: 425, pull: 265, ...hue('#72A843'), seed: 9366, bands: 0, spin: -0.05, style: 'cratered', tint2: '#3F6427', label: 'GREEN ROOM',
      aliens: { at: [-2.4, -1.1, -0.2, 0.9, 2.2], waving: 3 } },
    // Smaller (SX, 2026-10-14: «поменьше бы планету сделать саму ... перерисовать а не заскейлить»): its body 330 where it was 415, drawn
    // on the same cells (a planet is drawn cell by cell at its radius, never scaled), its pull in the same proportion.
    { x: 0.70, y: 0.18, radius: 330, pull: 188, ...hue('#72A843'), seed: 127, bands: 0, spin: 0.12, style: 'ringed', tint2: '#D080D0',
      label: 'PLANET EXPRESS' },
  ],
  holes: [
    // The one hole that turns the other way, its arms mirrored (SX, 2026-10-01: «черная дыра в скрытом секторе, она, в
    // отличие от других черных дыр, крутится в другую сторону»); every other hole turns one way since. Its other end is
    // the secret hole of the open sectors (src/secretHole.js), the same size and the same look (SECRET_HOLE).
    { id: 'hole-hidden', x: 0.50, y: 0.48, ...SECRET_HOLE, secret: true },
  ],
  stations: [],
  rocks: 3,
});

// The rocks a sector spawns (World.spawnAsteroids): its layout's count at the layout's density over the game's sector, times the field's
// density (src/field.js FIELD.density: 3 since 2026-10-04, SX: «мало камней мало астероидов»; 4.5 since 2026-10-06, «асероидов ...
// маловато»; the map editor shows his count).
for (const s of SECTORS) s.asteroids = Math.round(s.rocks * WORLD_SCALE * WORLD_SCALE * FIELD.density);

// A new game starts at the pilot's home garage (src/home.js), and SX's layout of 2026-10-02 put HOME in J-05.
export const START_SECTOR = 'sector-j05';

const byId = new Map(SECTORS.map((s) => [s.id, s]));
const byGrid = new Map(SECTORS.map((s) => [`${s.col},${s.row}`, s]));

export function sectorById(id) {
  return byId.get(id) || null;
}

// Returns the sector one step away, or null when the grid ends there. A null
// is a legitimate answer, not an error: the world treats it as a boundary.
export function neighbourOf(sector, dx, dy) {
  if (!sector) return null;
  return byGrid.get(`${sector.col + dx},${sector.row + dy}`) || null;
}

const stationIndex = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) stationIndex.set(st.id, { ...st, sectorId: sec.id, sectorLabel: sec.label });
}

// The start's broken station (SX, 2026-10-02: «каждому игроку из 3 станций рандомно достается первая сломанная, я хочу
// короче чтобы в целом экспириенс прохождение по сторилайну у игроков отличался»). The three network stations of the two
// sectors open at the start: one of them is a ruin for each new pilot, the other two work. The one rolled keeps its name, look
// and place, and takes the start ruin's role, which the catalogue above gives HALCYON: a ruin at HALCYON's price that becomes
// what the station is (RELAY 12 a freight hub, YARD 3 a garage), with the two finds its restoration unlocks (src/rewards.js)
// and the sector it opens (src/frontier.js counts restorations). HALCYON, when not rolled, works as what it `becomes`.
// The pilot's roll is his ledger's (`startRuin`, src/contracts.js Progress), so it is each world's own (2026-10-05, chat E1's
// refactoring piece; until then one roll was put in force for the whole process). What reads a station's kind, its `becomes` or
// its cost for a pilot asks with his ledger: `stationDefById(id, ledger)`, `stationsOf(sector, ledger)`. Asked without one, they
// answer with the catalogue as authored, HALCYON the ruin: a new pilot's, an older save's, the map editor's. A station's place,
// name, look and sector are the same under every roll.
export const START_STATIONS = Object.freeze(['station-relay-j05', 'station-halcyon-j05', 'station-yard-k05']);
export const CATALOGUE_START_RUIN = 'station-halcyon-j05';
// The three as authored: each sector's own entry and the index's, from which each roll's are made.
const AUTHORED = new Map(START_STATIONS.map((id) => {
  const def = stationIndex.get(id), sector = byId.get(def.sectorId);
  return [id, { entry: sector.stations.find((s) => s.id === id), def }];
}));
const START_RUIN_COST = AUTHORED.get(CATALOGUE_START_RUIN).def.cost;

// The start ruin of the pilot whose ledger this is; the catalogue's, HALCYON, for none or one from before the roll.
export const startRuinOf = (ledger) => (START_STATIONS.includes(ledger?.startRuin) ? ledger.startRuin : CATALOGUE_START_RUIN);

// The catalogue under a start ruin: the index, and the lists of the sectors the three stand in, with each of the three as it is
// under that roll. Made once for each of the three and never changed after, so two worlds of two pilots read two values and
// neither writes the other's. The catalogue's own roll is the authored index and lists.
const CASTS = new Map([[CATALOGUE_START_RUIN, { index: stationIndex, lists: new Map() }]]);
function castOf(ledger) {
  const use = startRuinOf(ledger);
  let cast = CASTS.get(use);
  if (cast) return cast;
  cast = { index: new Map(stationIndex), lists: new Map() };
  for (const sid of START_STATIONS) {
    const { entry, def } = AUTHORED.get(sid);
    const { becomes, cost, ...base } = entry;
    const works = base.kind === 'ruin' ? becomes : base.kind;
    const next = sid === use ? { ...base, kind: 'ruin', becomes: works, cost: START_RUIN_COST } : { ...base, kind: works };
    cast.index.set(sid, { ...next, sectorId: def.sectorId, sectorLabel: def.sectorLabel });
    const list = cast.lists.get(def.sectorId) ?? [...byId.get(def.sectorId).stations];
    list[list.findIndex((x) => x.id === sid)] = next;
    cast.lists.set(def.sectorId, list);
  }
  CASTS.set(use, cast);
  return cast;
}

// Where a station lives, by its stable id, without loading its sector; under the pilot's start ruin when `ledger` is given.
export function stationDefById(id, ledger = null) {
  return (ledger ? castOf(ledger).index : stationIndex).get(id) || null;
}

// A sector's stations under the pilot's start ruin (`ledger`; none: as authored): what a world builds and the map draws.
export function stationsOf(sector, ledger = null) {
  return (ledger && castOf(ledger).lists.get(sector?.id)) || sector?.stations || [];
}

// Every station id, in catalogue order.
export function stationIds() {
  return [...stationIndex.keys()];
}

// The stations of the freight network, every one but the pilot's home (kind 'home', src/home.js): freight is neither
// sent from it nor received at it, and it is not one of the stations the pilot card counts as opened.
export function networkStationIds() {
  return stationIds().filter((id) => stationIndex.get(id).kind !== 'home');
}

// Black holes are passages (SX, 2026-09-24): a ship that falls into one comes
// out of another, never the one it fell into. Which one is the ring's
// (src/holePassage.js holeExit, SX's pick of 2026-10-19); until then it was
// rolled at random on every passage ("в рандомную дыру").
const holeIndex = new Map();
for (const sec of SECTORS) {
  for (const h of sec.holes || []) if (h.id) holeIndex.set(h.id, { ...h, sectorId: sec.id, sectorLabel: sec.label });
}

// A hole of the catalogue by its id, with the sector it stands in; null when there is none (the roaming secret hole
// is not in the catalogue: src/secretHole.js).
export function holeDef(id) {
  return holeIndex.get(id) || null;
}

// Human-facing address, e.g. "J-04". Presentation only; never a storage key.
export function addressOf(sector) {
  return sector ? sector.label : '--';
}

// The address and the name, "J-04 SHALLOWS": where a sector is announced (the locator's header, a seam, the
// notice on entering it). Presentation only.
export function sectorTitle(sector) {
  if (!sector) return '--';
  return sector.name ? `${sector.label} ${sector.name}` : sector.label;
}
