import { CONFIG } from './config.js';
import { sectorById, stationDefById, SECTOR_SIZE } from './sectors.js';
import { reachableStationIds, formatCR } from './ruins.js';
import { questSectors } from './spots.js';
import { drawCraft } from './traffic.js';
import { clamp } from './util.js';
import { payFor } from './pacing.js';
import { restSide } from './sideSlot.js';
import { planetWords, PLANET_ASKS, PLANET_THANKS } from './voices.js';
import { QUEST_LINES as QL } from './questLines.js';

// A planet's errand: the blue quest of QUESTS_V2_HANDOFF.md (SX, 2026-10-02: «может быть, квест у планеты, ты
// подлетаешь, с тобой общаются через вот такой бабл, как мы подписываем разговоры, там тремя строками просят привезти
// какой-то там чемодан, откуда ты, ты получаешь этот квест, и летишь за чемоданом, потом возвращаешься обратно, по пути
// на тебя нападают пираты. Какое-то количество, надо выжить, и привести доставку»). A side quest of the one slot
// (src/quests.js), in three stages:
//
//   ask      the planet has a request: its plate leads to it, and a pilot within `reach` u of its limb is spoken to, in
//            three short lines at the planet like a craft's hail (src/feedback.js); its menu offers TAKE THE JOB
//   fetch    the suitcase waits at a working station (the plate and the pointer lead there); the station's menu offers TAKE
//            SUITCASE
//   return   the suitcase is aboard; once the pilot has flown a share of the way back a squad comes after the pilot (not
//            at once, and not when the planet is almost reached); the planet's menu offers DELIVER SUITCASE
//   thanked  the suitcase is the planet's: its thanks stand in its window, whose HAND IN pays (SX, 2026-10-02: a quest is
//            handed in to whoever asked for it, in a window where what they say can be read; NPC_DIALOG_HANDOFF.md)
//
// The suitcase is a light thing carried, not the cargo system's job (the tow, the ledger's active contract, par and pay,
// a stranded cargo on a wreck): that machinery is built for one contract at a time with its own economy and its own save,
// and an errand is a small favour outside it. It hangs at the hull's side, rigid, drawn small, and a wreck loses it (the
// quest turns late). A pilot already towing a cargo may take it too: it is not the cargo.
//
// The planet is big, so its menu and its voice stand at the point of its limb that faces the pilot (one point per
// frame, moving as the pilot moves), not at its middle, where they would be off the screen.
//
//   sideQuest.errand = { planet: { sectorId, label }, station, stage, spoke, travelled, ambushed, ambushAt, length }

const E = () => CONFIG.quests.errand;
export const PLANET_ID = 'planet-ask';
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;

// What a planet says, three short lines at a time: its wording of the errand (src/voices.js), drawn when it first speaks and kept
// for the quest, never the last errand's.
const wording = (e, world) => (e.words ??= planetWords(world));

const errandOf = (world) => (world.sideQuest?.kind === 'planet' ? world.sideQuest.errand : null);
const globalOf = (sectorId, fx, fy) => {
  const s = sectorById(sectorId);
  return { x: s.col * W + fx * W, y: s.row * H + fy * H };
};
const planetDef = (e) => sectorById(e.planet.sectorId)?.planets.find((p) => p.label === e.planet.label) ?? null;

// ---------------------------------------------------------------------------------------------------- the offer

// Every planet in this sector and the ones beside it with a working station (not broken) between `minLeg` and `maxLeg` u
// of it, as errands to offer: the planet, the station the suitcase waits at, the way between. Both in open sectors (the
// frontier, src/frontier.js).
export function errandCandidates(world) {
  const L = world.ledger, C = E(), out = [];
  const stations = reachableStationIds(L).filter((id) => !L.broken.has(id)).map((id) => stationDefById(id));
  for (const sector of questSectors(world.sector, world.ledger)) {
    for (const pl of sector.planets ?? []) {
      if (!pl.label) continue;
      const a = globalOf(sector.id, pl.x, pl.y);
      for (const st of stations) {
        const b = globalOf(st.sectorId, st.x, st.y), length = Math.hypot(a.x - b.x, a.y - b.y);
        if (length < C.minLeg || length > C.maxLeg) continue;
        out.push({ id: `side:planet:${pl.label}:${Math.round(world.time)}`, kind: 'planet',
          errand: { planet: { sectorId: sector.id, label: pl.label }, station: st.id, stage: 'ask', spoke: false, travelled: 0, ambushed: false, length } });
      }
    }
  }
  return out;
}

// Whether the errand can still be done: before the suitcase is taken, its station still works.
export function errandReach(world, s) {
  const e = s.errand;
  if (e.stage === 'return' || e.stage === 'thanked') return true;
  return reachableStationIds(world.ledger).includes(e.station) && !world.ledger.broken.has(e.station);
}

// ---------------------------------------------------------------------------------------------------- the planet

// The planet of the errand, as the world holds it (in its sector), or null elsewhere.
export function planetHere(world, e = errandOf(world)) {
  if (!e || world.sector.id !== e.planet.sectorId) return null;
  return world.planets.find((p) => p.label === e.planet.label) ?? null;
}

// The point of the planet's limb that faces the ship, where its voice and its menu stand.
export function limbPoint(world, planet) {
  const d = world.delta(world.ship.x, world.ship.y, planet.x, planet.y), m = Math.hypot(d.x, d.y) || 1;
  return { x: planet.x + (d.x / m) * planet.rim, y: planet.y + (d.y / m) * planet.rim, gap: m - planet.rim };
}

// The planet's menu while it has something for the pilot: the job, then the delivery. A candidate of World.candidates,
// whose anchor is the limb point (so the menu stands on the screen) and whose reach is `reach` u of that point.
export function planetMenu(world) {
  const e = errandOf(world), planet = e && e.stage !== 'fetch' ? planetHere(world, e) : null;
  if (!planet || !world.ship.alive) return null;
  const at = limbPoint(world, planet), st = stationDefById(e.station);
  const ask = e.stage === 'ask';
  // Thanked: its words in its window and the quest's hand-in (labs/graphics/context.js draws a `talk` so).
  if (e.stage === 'thanked') {
    return { id: PLANET_ID, title: planet.label, talk: { name: planet.label, lines: e.thanks ?? [] },
      x: at.x, y: at.y, interactRadius: E().reach, art: { model: { width: 6, height: 3 }, scale: 1 },
      actions: [{ label: 'HAND IN', run: () => handInSuitcase(world) }] };
  }
  return {
    id: PLANET_ID, title: `${planet.label} / ${ask ? 'REQUEST' : 'DELIVERY'}`,
    subtitle: ask ? `COLLECT SUITCASE / ${st?.label ?? ''}` : 'SUITCASE ABOARD',
    x: at.x, y: at.y, interactRadius: E().reach, art: { model: { width: 6, height: 3 }, scale: 1 },
    actions: [ask ? { label: 'ACCEPT JOB', run: () => takeJob(world) } : { label: 'DELIVER SUITCASE', run: () => deliverSuitcase(world) }],
  };
}

// Where a hail at the planet stands (World.craftAt): the limb point; the craft is an empty row, for the hail's shoulder.
const TALK = { rows: [' '.repeat(8)], scale: 1 };
export function planetCraftAt(world) {
  const planet = planetHere(world);
  if (!planet) return null;
  const at = limbPoint(world, planet);
  return { x: at.x, y: at.y, craft: TALK };
}

function say(world, planet, rows) {
  const at = limbPoint(world, planet);
  world.emit('trafficHail', { craftId: PLANET_ID, label: planet.label, line: rows.join(' '), rows, x: at.x, y: at.y, sectorId: world.sector.id });
}

// ---------------------------------------------------------------------------------------------------- the quest

// The quest's words by its stage (src/quests.js sideQuestWords). `spare` holds the lines of the other stages, so the
// plate keeps its width as it changes its words.
export function errandWords(world, s) {
  const e = s.errand, label = e.planet.label, def = planetDef(e), st = stationDefById(e.station);
  if (!def || !st) return null;
  const pSector = sectorById(e.planet.sectorId)?.label ?? '';
  const toPlanet = { sectorId: e.planet.sectorId, x: def.x, y: def.y, mark: PLANET_ID, reach: def.radius * 1.045 + E().reach };
  const stages = {
    ask: { title: QL.errand.askTitle(label), sub: QL.errand.askSub(pSector), pointer: 'PLANET', target: toPlanet },
    fetch: { title: QL.errand.fetchTitle(st.label), sub: QL.errand.fetchSub(label), pointer: 'SUITCASE',
      target: { sectorId: st.sectorId, x: st.x, y: st.y, stationId: st.id, mark: st.id } },
    return: { title: QL.errand.returnTitle(), sub: QL.errand.returnSub(label), pointer: 'DELIVER', target: toPlanet },
    thanked: { title: QL.errand.thankedTitle(), sub: QL.errand.thankedSub(label), pointer: 'PLANET', target: toPlanet },
  };
  const now = stages[e.stage];
  return {
    id: s.id, kind: 'side', ...now,
    spare: Object.values(stages).flatMap((x) => [x.title, x.sub]),
    done: [QL.errand.done(), QL.errand.paid(formatCR(payFor('planet', world.ledger.restored.size)))],
    late: [QL.errand.late(), QL.errand.lateSub()],
  };
}

function takeJob(world) {
  const e = errandOf(world);
  if (!e || e.stage !== 'ask') return false;
  e.stage = 'fetch';
  world.selectedId = null;
  world.emit('errandTaken', { planet: e.planet.label, station: e.station, sectorId: world.sector.id });
  return true;
}

// The station's row while the suitcase waits there (World.stationActions).
export function pickupAction(world, station) {
  const e = errandOf(world);
  if (!e || e.stage !== 'fetch' || e.station !== station.id) return null;
  return { label: 'COLLECT SUITCASE', run: () => takeSuitcase(world) };
}

function takeSuitcase(world) {
  const e = errandOf(world), A = E().ambush;
  if (!e || e.stage !== 'fetch') return false;
  e.stage = 'return';
  e.travelled = 0;
  e.ambushed = false;
  e.ambushAt = clamp(e.length * A.after, A.min, A.max);
  world.selectedId = null;
  world.emit('suitcaseTaken', { planet: e.planet.label, x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
  return true;
}

// The suitcase given: the planet thanks the pilot in its window (it said so in a hail that faded), and waits for the hand-in.
function deliverSuitcase(world) {
  const e = errandOf(world), planet = planetHere(world, e);
  if (!e || e.stage !== 'return' || !planet) return false;
  e.stage = 'thanked';
  e.thanks = PLANET_THANKS[wording(e, world).thanks];
  return true;
}
// Handing it in: the planet pays and the quest is done.
function handInSuitcase(world) {
  const s = world.sideQuest, e = errandOf(world), planet = planetHere(world, e);
  if (!e || e.stage !== 'thanked' || !planet) return false;
  const L = world.ledger, at = limbPoint(world, planet);
  const pay = payFor('planet', L.restored.size);
  L.credits += pay;
  world.questOutcomes.set(s.id, 'done');
  world.sideQuest = null;
  restSide(world);
  world.selectedId = null;
  world.emit('suitcaseDelivered', { planet: planet.label, pay, credits: L.credits, x: at.x, y: at.y, sectorId: world.sector.id });
  return true;
}

// A wreck with the suitcase aboard loses it, and the quest turns late.
function loseSuitcase(world, s) {
  world.questOutcomes.set(s.id, 'late');
  world.sideQuest = null;
  restSide(world);
  world.emit('suitcaseLost', { planet: s.errand.planet.label, x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
}

// -------------------------------------------------------------------------------------------------------- the step

// Every step: in `ask`, the planet speaks to a pilot who comes within reach of its limb (and again if the pilot has
// gone off and comes back); in `return`, the way is measured and the squad sent once; a wreck loses the suitcase.
export function stepErrand(world, dt) {
  const s = world.sideQuest, e = errandOf(world);
  if (!e) return;
  const ship = world.ship;
  if (e.stage === 'return') {
    if (!ship.alive) { loseSuitcase(world, s); return; }
    if (!world.docked) e.travelled += Math.hypot(ship.vx, ship.vy) * dt;
    if (!e.ambushed && world.autoEncounters && e.travelled >= e.ambushAt && world.time >= (e.tryAt ?? 0)) ambush(world, e);
    return;
  }
  if (e.stage !== 'ask' || !ship.alive) return;
  const planet = planetHere(world, e);
  if (!planet) return;
  const gap = limbPoint(world, planet).gap;
  if (e.spoke && gap > E().reach * 2.5) e.spoke = false;
  if (!e.spoke && gap <= E().reach) {
    e.spoke = true;
    say(world, planet, PLANET_ASKS[wording(e, world).ask](stationDefById(e.station)?.label ?? 'A STATION'));
  }
}

// How far the ship is from the planet, by the grid (so it counts across seams).
function leftToGo(world, e) {
  const me = sectorById(world.sector.id), def = planetDef(e), at = globalOf(e.planet.sectorId, def.x, def.y);
  return Math.hypot(at.x - (me.col * W + world.ship.x), at.y - (me.row * H + world.ship.y));
}

// The squad on the way back: only in open space and with no fight on, and not when the planet is nearly reached.
function ambush(world, e) {
  const A = E().ambush, ship = world.ship, rng = world.rng('pirate');
  if (leftToGo(world, e) < A.minLeft) { e.ambushed = true; return; }
  e.tryAt = world.time + 1;
  if (world.encounter || world.sector.hidden || world.docked || world.inSafeZone(ship.x, ship.y)) return;
  const total = A.squad.reduce((n, [, w]) => n + w, 0);
  let u = rng() * total, count = A.squad[A.squad.length - 1][0];
  for (const [n, w] of A.squad) { u -= w; if (u < 0) { count = n; break; } }
  if (world.spawnPirates(count).length) e.ambushed = true;
}

// ----------------------------------------------------------------------------------------------------- drawing

// The suitcase aboard: two rows of a case with its handle, in the quest's blue, hung at the hull's side and turned with
// the ship; rigid and small (a light thing: nothing here is a tether).
const CASE = { rows: ['┌─┐', '╞═╡'], inks: {}, get ink() { return CONFIG.hud.edge; }, get scale() { return 1.15; } };
export function drawSuitcase(world, r) {
  const e = errandOf(world), ship = world.ship;
  if (!e || e.stage !== 'return' || !ship.alive || world.docked) return;
  const m = ship.metrics || ship.measureDrawing(r.cellW, r.cellH);
  let half = 0;
  for (const c of ship.frameCells) half = Math.max(half, Math.abs(c.x));
  const s = world.project(r, ship.x, ship.y), a = ship.angle;
  const out = (half + 0.5) * m.w + CASE.rows[0].length * r.cellW * CASE.scale * 0.5 + 6;
  drawCraft(r, CASE, s.x - Math.sin(a) * out - Math.cos(a) * 4, s.y + Math.cos(a) * out - Math.sin(a) * 4, a);
}
