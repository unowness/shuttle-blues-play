import { CONFIG } from './config.js';
import { clearSpot } from './spots.js';
import { wreckDebris } from './debris.js';
import { clamp, TAU } from './util.js';
import { factsOfWorld, nextSpecial, specialDue, specialPay } from './pacing.js';
import { SPECIALS, specialById, specialModel, specialSize, drawModel, drawFlown, drawParked, brokenShare } from './specialShips.js';
import { HANDLERS } from './specialQuests.js';
import { QUEST_LINES as QL } from './questLines.js';
import { radioFitted } from './opening.js';
import { contentAreas } from './mapContent.js';

// The reference ships' rare quests (QUESTS_V2_HANDOFF.md, round three; SX, 2026-10-02: «квесты ... какой-то в каком-то из
// секторов мы на это случайно нарываемся, это как случайная редкое событие, один из кораблей отсылок стоит на месте, и у
// него над головой бабл, который говорит, что там с одним из участников корабля что-то случилось ... А ты в это время
// садишься в машинку назад в будущее, и летишь в ней»). This file is the frame; the six quests are in
// src/specialQuests.js, the ships (drawing, chassis, rewards) in src/specialShips.js.
//
//   met      Now and then (CONFIG.quests.special; the pacing is the quest economy's, src/pacing.js specialDue: the first at
//            `first` s, then a rest and a chance a minute, about every half hour), the next of the six in their `order` (the
//            gentlest first, each waiting for some stations restored) that has not left its note yet stands still in the
//            sector the pilot flies in, in a clear place out of sight. A pilot who comes within `reach` u is
//            spoken to, three lines over its head in the hail's way (what happened to one of its people, the quest);
//            its menu offers BOARD. It waits `stay` s and then goes, unmet, and comes again after the rest of the round
//            (src/pacing.js nextSpecial: the next not done comes first, SX's «Следующий по кругу»). A marker on the
//            screen's edge says where. Nothing else new is offered meanwhile (src/quests.js mayOffer).
//   boarded  The pilot flies THAT ship: its drawing as the ship, its chassis (src/chassis.js `special-<id>`), its own hull
//            and a tank that is never the trouble; the pilot's own ship stays where it was, dark and still (drawn parked),
//            with the hull and tank it had, and comes back when the quest ends, however it ends. While it lasts: no docking,
//            no stations' trade, no caches (a station says only what the quest wants of it, and INFO); a pilot saved
//            meanwhile is saved at the parked ship. A wreck of the borrowed ship is the quest lost, never a wreck of the
//            pilot's: no cargo stranded, no coins taken, no wreck on the card.
//   ended    Won: the ship's rewards, all three (src/pilot.js notes, cockpits, paints): a cockpit scheme in its style, a paint,
//            a note in the garage, and its CR (CONFIG.quests.special.order; SX picked «Вещи и CR»). Lost: nothing is lost but the chance, which comes again after the rest of the round. Either way the pilot is back
//            in its own ship where the quest ended, the borrowed one flying on and fading.
//
// A ship standing is in the save (src/questSave.js); so is one whose quest is being flown: it comes back standing where it was
// met, the pilot in his own ship parked, to board again. What the quest gives is the pilot's, saved with him.

const S = () => CONFIG.quests.special;
export const SPECIAL_ID = 'special-ship';

// What each ship asks of a pilot who stops, in the menu's second line.
const ASK = {
  delorean: (p) => `RACE TO ${p.dest.name}`,
  swordfish: (p) => `BOUNTY / ${p.total} OUTLAWS`,
  express: (p) => `${p.cars} CRATES, ${p.stops.length} STOPS`,
  falcon: (p) => `BATTLE AT ${p.dest.name}`,
  serenity: (p) => `REACH ${p.dest.name} BEFORE BREAKUP`,
  xwing: (p) => `RUN TO ${p.dest.name}`,
};

// ---- who is met, where, when ----------------------------------------------------------------------------------------------

// A place for the ship to stand in the pilot's sector: clear of everything, in the middle, out of sight. `near` (the lab's
// `?special=`) puts it in view of the ship instead.
function findSite(world, near, { areas = [], fallback = true } = {}) {
  const rng = world.rng('quest'), ship = world.ship;
  if (near) {
    // In view, clear of every body (a station's menu would be nearer than the ship's): the first bearing round that has room.
    const first = rng() * TAU;
    for (let i = 0; i < 24; i++) {
      const a = first + (i / 24) * TAU, x = ship.x + Math.cos(a) * 560, y = ship.y + Math.sin(a) * 380;
      if (world.clearance(x, y, 900) && x > 300 && y > 300 && x < world.width - 300 && y < world.height - 300) return { sectorId: world.sector.id, x, y, angle: rng() * TAU, near: true };
    }
    return { sectorId: world.sector.id, x: ship.x + 560, y: ship.y + 380, angle: rng() * TAU, near: true };
  }
  const C = S();
  // Out of sight of the pilot (`apart` u), and if the sector has no such place, a little nearer; apart from the open quests (src/spots.js).
  const avoid = world.questPlaces();
  for (const k of [1, 0.75, 0.55]) {
    const spot = clearSpot(world.sector.id, rng, { clear: C.clear, edge: C.edge, away: { x: ship.x, y: ship.y, by: C.apart * k }, avoid, areas, fallback });
    if (spot) return { sectorId: world.sector.id, x: spot.x * world.width, y: spot.y * world.height, angle: rng() * TAU };
  }
  return null;
}

// A ship comes to stand, if one fits: `id` names it (the lab), else the next of the round (src/pacing.js nextSpecial: after
// the one whose turn ended last, the first whose note the pilot does not hold). It needs a place and a quest from here (its plan); with none, it is tried again
// at the next look, from wherever the pilot is then. Returns the special, or null.
export function offerSpecial(world, { id = null, near = false } = {}) {
  if (world.special || world.sector.hidden) return null;
  const rng = world.rng('quest'), C = S();
  const next = id ? null : nextSpecial(world.pilot.notes, world.pilot.lastSpecial);
  const pool = SPECIALS.filter((sp) => (id ? sp.id === id && !world.pilot.notes.has(sp.id) : sp.id === next?.id));
  for (const sp of pool) {
    let site = null, plan = null;
    const areas = near ? [] : contentAreas('reference-ship', world.ledger, { sectorId: world.sector.id, variant: sp.id });
    if (areas.length) {
      site = findSite(world, false, { areas, fallback: false });
      if (site) plan = HANDLERS[sp.id].plan(world, site);
    }
    // A clear position is not enough: the complete mission must fit its normal destination/length/stop rules.
    // If the authored area cannot provide that mission, try the original current-sector placement.
    if (!plan) {
      site = findSite(world, near);
      if (!site) return null;
      plan = HANDLERS[sp.id].plan(world, site);
    }
    if (!plan) continue;
    world.specialSerial = (world.specialSerial ?? 0) + 1;
    const L = world.ledger;
    world.special = { id: sp.id, n: world.specialSerial, questId: `special:${world.specialSerial}`, stage: 'seen', site, plan, q: null, loadTop: 1,
      leaveAt: L.clock + C.stay, spoke: false, parked: null, boarded: false };
    world.emit('specialSeen', { id: sp.id, label: sp.label, sectorId: site.sectorId });
    return world.special;
  }
  return null;
}

// ---- the step ---------------------------------------------------------------------------------------------------------------

const END = {
  win: (world) => finish(world, 'done'),
  lose: (world, why) => finish(world, 'late', why),
};

// Every step: the ship that has gone drifting off; a ship to meet now and then; the one stood, waiting (it speaks, it
// goes); the quest, once boarded.
export function stepSpecial(world, dt) {
  const C = S(), L = world.ledger;
  const gone = world.specialLeaving;
  if (gone && (gone.t += dt) >= 3) world.specialLeaving = null;
  const s = world.special;
  if (!s) {
    if (!world.autoSpecials) return;
    world.specialLook = (world.specialLook ?? C.checkEvery) - dt;
    if (world.specialLook > 0) return;
    world.specialLook = C.checkEvery;
    // (A reference ship is one of the side activities the radio opens: SX, 2026-10-06, «радио открывает квесты нпс и прочие
    // дополнительные активности».)
    const blocked = !world.ship.alive || !!world.docked || !!world.home || !!world.encounter || !!L.raid || !!world.pester || world.sector.hidden
      || !radioFitted(world);
    if (specialDue(world.specialClock, factsOfWorld(world), world.pilot.notes, world.rng('quest'), C.checkEvery, blocked, world.pilot.lastSpecial)) offerSpecial(world);
    return;
  }
  if (s.boarded) {
    if (world.sector.hidden) return finish(world, 'late', 'LOST');
    const h = HANDLERS[s.id];
    h.step(world, s, dt, END);
    if (world.special === s && h.done?.(world, s)) END.win(world);
    return;
  }
  // Standing, unmet: it speaks to a pilot who comes near, again if the pilot went off and came back, and goes when its time is up.
  if (L.clock >= s.leaveAt) {
    world.special = null;
    endTurn(world, s.id);
    world.emit('specialGone', { id: s.id, sectorId: s.site.sectorId });
    return;
  }
  if (!world.ship.alive || world.sector.id !== s.site.sectorId) { s.spoke = false; return; }
  const d = Math.hypot(s.site.x - world.ship.x, s.site.y - world.ship.y);
  if (s.spoke && d > C.reach * 2.5) s.spoke = false;
  if (!s.spoke && d <= C.reach) {
    s.spoke = true;
    const sp = specialById(s.id), rows = HANDLERS[s.id].rows(s.plan);
    world.emit('trafficHail', { craftId: SPECIAL_ID, label: sp.label, line: rows.join(' '), rows, x: s.site.x, y: s.site.y, sectorId: s.site.sectorId });
  }
}

// A ship's turn is over, met or not, done or not: the rest before the next one begins, and the round goes on from the ship after
// it (src/pacing.js nextSpecial), kept in the pilot's save so a reload does not start the round again.
function endTurn(world, id) {
  world.specialClock.endedAt = world.ledger.clock;
  world.pilot.lastSpecial = id;
}

// ---- boarding and coming back -------------------------------------------------------------------------------------------

// Why the pilot cannot board now, or null: a cargo on the ship, or anything that has the ship in hand.
function boardBar(world) {
  if (world.ledger.active || world.cargo) return 'DELIVER YOUR CARGO FIRST';
  if (world.docked || world.home) return 'UNDOCK FIRST';
  if (!world.ship.alive) return 'NOT NOW';
  return null;
}

function board(world) {
  const s = world.special, ship = world.ship, C = S();
  const bar = boardBar(world);
  if (!s || s.stage !== 'seen' || bar) { world.emit('actionRefused', { reason: bar ?? 'NOT NOW' }); return false; }
  // The pilot's own ship stays as it is: where, which way, its hull and tank, its drawing and its chassis.
  s.parked = { x: ship.x, y: ship.y, angle: ship.angle, hull: world.hull, fuel: world.fuel, model: ship.model, chassis: ship.chassis.id, sectorId: world.sector.id };
  ship.setChassis(`special-${s.id}`);
  const model = specialModel(s.id);
  model.scale = model.baseScale;
  ship.setModel(model);
  Object.assign(ship, { x: s.site.x, y: s.site.y, angle: s.site.angle, vx: 0, vy: 0, angVel: 0, spool: 0, retroSpool: 0, jolt: 0, alive: true, invuln: C.invuln });
  world.hull = world.hullMax;
  world.fuel = world.fuelTank;
  world.hullGrace = 0;
  s.boarded = true;
  s.stage = 'flying';
  HANDLERS[s.id].start(world, s);
  world.selectedId = null;
  const sp = specialById(s.id);
  world.emit('specialBoarded', { id: s.id, label: sp.label, x: s.site.x, y: s.site.y, sectorId: world.sector.id });
  return true;
}

// The quest is over. Won or lost, the pilot is in its own ship again where the borrowed one is; the borrowed ship flies on
// and fades. Won, the rewards are given.
function finish(world, outcome, why = null) {
  const s = world.special;
  if (!s || !s.boarded) return;
  const ship = world.ship, pk = s.parked, sp = specialById(s.id), C = S();
  const at = { x: ship.x, y: ship.y, angle: ship.angle, vx: ship.vx, vy: ship.vy };
  world.specialLeaving = { id: s.id, x: at.x, y: at.y, angle: at.angle, sectorId: world.sector.id, t: 0, vx: at.vx, vy: at.vy };
  ship.setChassis(pk.chassis);
  pk.model.scale = pk.model.baseScale ?? pk.model.scale;
  ship.setModel(pk.model);
  world.hull = clamp(pk.hull, 1, world.hullMax);
  world.fuel = clamp(pk.fuel, 0, world.fuelTank);
  Object.assign(ship, { vx: at.vx * 0.3, vy: at.vy * 0.3, angVel: 0, spool: 0, retroSpool: 0, jolt: 0, alive: true, invuln: C.invuln });
  world.hullGrace = 0;
  world.questOutcomes.set(s.questId, outcome);
  // What is flown no more: the tow of crates, the pirates a quest sent (they fly off), the weight.
  for (const p of world.pirates) if (p.tag === 'special') { p.tag = null; if (p.mode !== 'leave') { p.mode = 'leave'; p.leaveTimer = CONFIG.pirates.leave.time; } }
  world.special = null;
  endTurn(world, s.id);
  const base = { id: s.id, label: sp.label, x: at.x, y: at.y, sectorId: world.sector.id };
  if (outcome === 'done') {
    const given = grantRewards(world, sp);
    world.emit('specialDone', { ...base, ...given });
  } else world.emit('specialFailed', { ...base, why });
}

// The three rewards (SX: a cockpit scheme in the ship's style, a paint in its style, a note to read in the garage): owned for
// good and put on at once, the pilot card's lines change them after.
function grantRewards(world, sp) {
  const p = world.pilot;
  p.notes.add(sp.id);
  p.cockpits.add(sp.id);
  p.paints.add(sp.paint);
  p.wearPaint(sp.paint);
  p.wearCockpit(sp.id);
  const pay = specialPay(sp.id);
  world.ledger.credits += pay;
  return { paint: sp.paint, cockpit: sp.id, note: sp.id, pay, credits: world.ledger.credits };
}

// A wreck while boarded is the quest lost: the borrowed ship comes apart where it is, and the pilot is in its own ship, not
// wrecked (World.wreckShip asks first). Returns whether it was one.
export function failSpecial(world, cause) {
  const s = world.special;
  if (!s?.boarded || !world.ship.alive) return false;
  const ship = world.ship;
  wreckDebris(world, ship.x, ship.y, ship.debris(), ship.vx, ship.vy);      // its pieces hang, as every wreck's (src/debris.js)
  // It is gone, not drifting off: it was the debris.
  finish(world, 'late', cause);
  world.specialLeaving = null;
  return true;
}

// A pirate of a quest has gone down or run (World.killPirate, World.pirateGone): the wave's tally.
export function noteSpecialPirate(world, p) {
  if (p.tag !== 'special' || !world.special?.q) return;
  world.special.q.down = (world.special.q.down ?? 0) + 1;
}

// What a saved game holds while the pilot is in a borrowed ship: its own, parked (World.snapshot).
export const specialParked = (world) => (world.special?.boarded ? world.special.parked : null);
export const boarded = (world) => !!world.special?.boarded;

// ---- what the world shows -------------------------------------------------------------------------------------------------

// The quest as the list shows it, once boarded; the standing ship has no plate (it is met, not offered).
export function specialQuest(world) {
  const s = world.special;
  if (!s || s.stage !== 'flying') return null;
  const w = HANDLERS[s.id].words(world, s);
  return { id: s.questId, kind: 'special', tone: 'special', title: w.title, sub: w.sub, pointer: w.pointer,
    ends: w.ends, time: w.time, left: w.ends != null ? w.ends - world.ledger.clock : undefined, target: w.target,
    done: [w.win, QL.special.paid(specialPay(s.id))], late: w.lose, spare: w.spare };
}

// The menus: the ship standing (BOARD), and a quest's own while it is flown.
export function specialCandidates(world) {
  const s = world.special;
  if (!s) return [];
  if (s.boarded) return HANDLERS[s.id].candidates?.(world, s) ?? [];
  if (s.stage !== 'seen' || s.site.sectorId !== world.sector.id || !world.ship.alive) return [];
  const sp = specialById(s.id), bar = boardBar(world);
  return [{
    id: SPECIAL_ID, title: `${sp.label} / NEEDS A PILOT`, subtitle: ASK[s.id](s.plan),
    x: s.site.x, y: s.site.y, interactRadius: S().reach, art: { model: specialSize(s.id), scale: sp.scale, turns: true },
    actions: [{ label: 'TAKE CONTROLS', disabled: !!bar, reason: bar, note: bar, run: () => board(world) }],
  }];
}

// A station's rows while a borrowed ship is flown: the quest's (a crate unloaded), nothing else but INFO (World.stationActions).
export function specialStationActions(world, station) {
  const s = world.special;
  if (!s?.boarded) return null;
  return HANDLERS[s.id].stationActions?.(world, s, station) ?? [];
}

// The marker on the screen's edge for the ship standing (World.discoveries).
export function specialDiscovery(world) {
  const s = world.special;
  if (!s || s.stage !== 'seen' || s.site.sectorId !== world.sector.id) return null;
  return { id: SPECIAL_ID, x: s.site.x, y: s.site.y, label: specialById(s.id).label, interactRadius: S().reach, discoverRadius: 3400 };
}

// Where a hail at the ship stands (World.craftAt), and its drawing's size for the shoulder.
export function specialCraftAt(world) {
  const s = world.special;
  if (s && s.stage === 'seen' && s.site.sectorId === world.sector.id) {
    const m = specialModel(s.id);
    return { x: s.site.x, y: s.site.y, craft: { rows: Array(m.height).fill(' '.repeat(m.width)), scale: m.scale } };
  }
  return null;
}

// A weight the flown ship drags (the train): its share of the top speed (World.step).
export const specialLoadTop = (world) => (world.special?.boarded ? world.special.loadTop ?? 1 : 1);

// The ship standing, the pilot's own parked, a quest's props (the train), and the borrowed ship drifting off.
export function drawSpecial(world, r, t) {
  const s = world.special;
  if (s && s.stage === 'seen' && s.site.sectorId === world.sector.id) {
    const model = specialModel(s.id), p = world.project(r, s.site.x, s.site.y);
    if (r.onScreen(p.x, p.y, 220)) {
      drawModel(r, model, p.x, p.y, s.site.angle + Math.sin(t * 0.6) * 0.04);
      if (Math.hypot(s.site.x - world.ship.x, s.site.y - world.ship.y) < 1150) {
        const label = specialById(s.id).label, w = label.length * r.cellW * (r.textScale ?? 1);
        r.text(label, p.x - w / 2, p.y + model.height * r.cellH * model.scale * 0.5 + r.cellH, CONFIG.hud.color, 0.9);
      }
    }
  }
  if (s?.boarded) {
    if (s.parked.sectorId === world.sector.id) {
      const p = world.project(r, s.parked.x, s.parked.y);
      if (r.onScreen(p.x, p.y, 200)) drawParked(r, s.parked, p.x, p.y);
    }
    HANDLERS[s.id].draw?.(world, s, r, t);
  }
  const g = world.specialLeaving;
  if (g && g.sectorId === world.sector.id) {
    const u = Math.min(1, g.t / 3), run = u * u * 1100;
    const model = specialModel(g.id), p = world.project(r, g.x + Math.cos(g.angle) * run, g.y + Math.sin(g.angle) * run);
    if (r.onScreen(p.x, p.y, 220)) drawModel(r, model, p.x, p.y, g.angle, { alpha: 1 - u });
  }
}

// The ship the pilot flies, in place of Ship.draw while a borrowed one is: the broken drawing for SERENITY's failing hull.
export function drawFlownShip(world, r, sx, sy, t) {
  const s = world.special, share = s.id === 'serenity' ? brokenShare(world.hull / world.hullMax) : 0;
  drawFlown(r, world.ship, sx, sy, { share, time: t });
}

// Whether a borrowed ship is flown now, and which: the cockpit takes its colours (the page).
export const flownId = (world) => (world.special?.boarded ? world.special.id : null);
