import { CONFIG } from './config.js';
import { clearSpot } from './spots.js';
import { wreckDebris } from './debris.js';
import { clamp, TAU } from './util.js';
import { factsOfWorld, nextSpecial, specialDue, specialPay } from './pacing.js';
import { SPECIALS, specialById, specialModel, specialSize, drawModel, drawFlown, drawParked, brokenShare } from './specialShips.js';
import { CRAFT_ART } from './trafficArt.js';
import { HANDLERS } from './specialQuests.js';
import { QUEST_LINES as QL } from './questLines.js';
import { radioFitted, openingStage, REST } from './opening.js';
import { CREW, talkOf, meetOf, clipperPose, readLife } from './clipper.js';
import { contentAreas } from './mapContent.js';
import { tr } from './lang.js';

// The reference ships' rare quests (QUESTS_V2_HANDOFF.md, round three; SX, 2026-10-02: «квесты ... какой-то в каком-то из
// секторов мы на это случайно нарываемся, это как случайная редкое событие, один из кораблей отсылок стоит на месте, и у
// него над головой бабл, который говорит, что там с одним из участников корабля что-то случилось ... А ты в это время
// садишься в машинку назад в будущее, и летишь в ней»). This file is the frame; the six quests are in
// src/specialQuests.js, the ships (drawing, chassis, rewards) in src/specialShips.js.
//
//   met      Now and then (CONFIG.quests.special; the pacing is the quest economy's, src/pacing.js specialDue: the first at
//            `first` s once the opening chapter is over, then a rest and a chance a minute, all eight in a game of two hours), the next in their `order` (the
//            gentlest first, each waiting for some stations restored) that has not left its note yet stands still in the
//            sector the pilot flies in, in a clear place out of sight. A pilot who comes within `reach` u is
//            spoken to, its crew's `meet` (src/specialShips.js `words`) over it one line at a time in the hail's way (what
//            happened to one of its people, the quest); its window's TALK says them whole and its `brief`, and offers TAKE
//            CONTROLS. It waits `stay` s and then goes, unmet, and comes again after the rest of the round
//            (src/pacing.js nextSpecial: the next not done comes first, SX's «Следующий по кругу»). A marker on the
//            screen's edge says where. Nothing else new is offered meanwhile (src/quests.js mayOffer).
//   boarded  The pilot flies THAT ship: its drawing as the ship, its chassis (src/chassis.js `special-<id>`), its own hull
//            and a tank that is never the trouble; the pilot's own ship stays where it was, dark and still (drawn parked),
//            with the hull and tank it had, and comes back when the quest ends, however it ends. While it lasts: no docking,
//            no stations' trade, no caches (a station says only what the quest wants of it, and INFO); a pilot saved
//            meanwhile is saved at the parked ship. A wreck of the borrowed ship is the quest lost, never a wreck of the
//            pilot's: no cargo stranded, no coins taken, no wreck on the card. On the way the crew speaks at the quest's
//            moments (its `road`, each once), over the ship flown.
//   led      CLIPPER (src/clipper.js, 2026-10-22) is not boarded but led: LEAD THEM in its window, the pilot in their own ship all the way,
//            the crew following to TERRA; nothing of the pilot's is parked or given back.
//   ended    Won: the ship's rewards, all three (src/pilot.js notes, cockpits, paints): a cockpit scheme in its style, a paint,
//            a note in the garage, and its CR (CONFIG.quests.special.order; SX picked «Вещи и CR»), and the crew's `end` in a window
//            of its own (a call, labs/graphics/talk-beat.js). Lost: nothing is lost but the chance, which comes again after the rest
//            of the round; the notice says its `failed`. Either way the pilot is back in its own ship where the quest ended, the
//            borrowed one flying on and fading.
//
// A ship standing is in the save (src/questSave.js); so is one whose quest is being flown: it comes back standing where it was
// met, the pilot in his own ship parked, to board again. What the quest gives is the pilot's, saved with him.

const S = () => CONFIG.quests.special;
export const SPECIAL_ID = 'special-ship';
// Who speaks over the ship the pilot flies, its crew aboard: a hail's place of its own (never a body: src/sceneSolids.js makes the ship
// standing one, SPECIAL_ID's).
export const SPECIAL_CREW_ID = 'special-crew';

// What each ship asks of a pilot who stops, in the menu's second line.
const ASK = {
  delorean: (p) => `RACE TO ${p.dest.name}`,
  swordfish: (p) => `BOUNTY / ${p.total} OUTLAWS`,
  express: (p) => `${p.cars} CRATES, ${p.stops.length} STOPS`,
  falcon: (p) => `BATTLE: ${p.dest.name}`,
  serenity: (p) => `REACH ${p.dest.name} BEFORE BREAKUP`,
  xwing: (p) => `RUN TO ${p.dest.name}`,
  scooby: (p) => `GRAB ${p.need} OF ${p.total} SNACKS`,
  clipper: () => `${CREW.sx} / ${CREW.pasha}`,
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
  const next = id ? null : nextSpecial(world.pilot.notes, world.pilot.lastSpecial, { restored: factsOfWorld(world).restored, order: world.pilot.specialOrder });
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
  road: (world, i) => road(world, i),
};

// ---- what the crew says ---------------------------------------------------------------------------------------------------

// The crew's lines one at a time over the ship (the one standing, or the one flown: specialCraftAt, specialCrewAt), each once the one before it has stood
// its time and CLIPPER's `gap` more, at CLIPPER's pace (src/clipper.js readLife): `s.say`, [{ who, line }], its strip's words (a line's
// short form where it has one). Never saved: a quest reloaded is met again.
const strip = ([who, line, short]) => ({ who, line: short ?? line });
const whole = ([who, line]) => ({ who, line });
const wordsOf = (s, part) => { const w = specialById(s.id).words?.[part]; return (typeof w === 'function' ? w(s.plan) : w) ?? []; };
function queue(s, lines) { (s.say ??= []).push(...lines.map(strip)); }
function sayNext(world, s, at) {
  const e = s.say?.[0];
  if (!e || !at || world.time < (s.freeAt ?? -Infinity) || !world.ship.alive) return;
  s.say.shift();
  world.emit('trafficHail', { craftId: s.boarded ? SPECIAL_CREW_ID : SPECIAL_ID, label: e.who, line: e.line, life: readLife(e.line), x: at.x, y: at.y, sectorId: world.sector.id });
  s.freeAt = world.time + readLife(e.line) + S().clipper.gap;
}
// The `i`-th exchange of the way, at its moment (src/specialQuests.js calls it): said once a quest, never again.
function road(world, i) {
  const s = world.special, lines = specialById(s?.id)?.words?.road?.[i];
  if (!lines || !s.q || (s.q.roads ??= new Set()).has(i)) return;
  s.q.roads.add(i);
  queue(s, lines);
}
// The crew's last words, won: a window standing by itself (`world.talkCall`), a conversation of its own.
function endCall(world, s, at) {
  const sp = specialById(s.id), lines = wordsOf(s, 'end').map(whole);
  if (!lines.length) return;
  const thread = `${s.questId}:end`;
  world.talkCall = { n: thread, menu: { id: SPECIAL_ID, title: sp.label, subtitle: '', x: at.x, y: at.y, interactRadius: S().reach,
    art: { model: specialSize(s.id), scale: sp.scale, turns: true }, talk: { name: sp.label, place: sp.label, lines, thread }, actions: [] } };
}

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
    // Nor while the opening chapter runs: one thing at a time until its ruin is restored (src/opening.js REST).
    const chapter = openingStage(world);
    const blocked = !world.ship.alive || !!world.docked || !!world.home || !!world.encounter || !!L.raid || !!world.pester || world.sector.hidden
      || !radioFitted(world) || (chapter !== null && chapter !== REST);
    if (specialDue(world.specialClock, factsOfWorld(world), world.pilot.notes, world.rng('quest'), C.checkEvery, blocked, world.pilot.lastSpecial, world.pilot.specialOrder)) offerSpecial(world);
    return;
  }
  // Flown (or, CLIPPER, led: src/clipper.js): the quest's own step. A borrowed ship taken into O-08 is the quest lost; a crew led waits.
  if (s.stage === 'flying') {
    if (s.boarded && world.sector.hidden) return finish(world, 'late', 'LOST');
    const h = HANDLERS[s.id];
    h.step(world, s, dt, END);
    if (world.special === s && h.done?.(world, s)) END.win(world);
    if (world.special === s && s.boarded) sayNext(world, s, world.ship);
    return;
  }
  // Standing, unmet: it speaks to a pilot who comes near, again if the pilot went off and came back, and goes when its time is up.
  if (L.clock >= s.leaveAt) {
    world.special = null;
    endTurn(world, s.id);
    world.emit('specialGone', { id: s.id, sectorId: s.site.sectorId });
    return;
  }
  if (!world.ship.alive || world.sector.id !== s.site.sectorId) { s.spoke = false; s.say = []; return; }
  const d = Math.hypot(s.site.x - world.ship.x, s.site.y - world.ship.y), h = HANDLERS[s.id];
  if (s.spoke && d > C.reach * 2.5) { s.spoke = false; s.say = []; }
  if (!s.spoke && d <= C.reach) {
    s.spoke = true;
    // Its own way of speaking where it has one (CLIPPER's two strips), else its crew's `meet`, a line at a time over it.
    if (h.meet) h.meet(world, s);
    else queue(s, wordsOf(s, 'meet'));
  }
  if (!h.meet) sayNext(world, s, s.site);
  h.standing?.(world, s);
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

// LEAD THEM (CLIPPER, led and never flown: src/clipper.js): the quest begins, the pilot in their own ship.
function lead(world) {
  const s = world.special;
  if (!s || s.stage !== 'seen' || !world.ship.alive) { world.emit('actionRefused', { reason: 'NOT NOW' }); return false; }
  s.stage = 'flying';
  HANDLERS[s.id].start(world, s);
  world.selectedId = null;
  return true;
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
  s.say = [];
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
  if (!s || s.stage !== 'flying') return;
  const ship = world.ship, pk = s.parked, sp = specialById(s.id), C = S();
  const at = { x: ship.x, y: ship.y, angle: ship.angle, vx: ship.vx, vy: ship.vy };
  // (A crew led leaves nothing to give back: the pilot was in their own ship all along.)
  if (s.boarded) {
    world.specialLeaving = { id: s.id, x: at.x, y: at.y, angle: at.angle, sectorId: world.sector.id, t: 0, vx: at.vx, vy: at.vy };
    ship.setChassis(pk.chassis);
    pk.model.scale = pk.model.baseScale ?? pk.model.scale;
    ship.setModel(pk.model);
    world.hull = clamp(pk.hull, 1, world.hullMax);
    world.fuel = clamp(pk.fuel, 0, world.fuelTank);
    Object.assign(ship, { vx: at.vx * 0.3, vy: at.vy * 0.3, angVel: 0, spool: 0, retroSpool: 0, jolt: 0, alive: true, invuln: C.invuln });
    world.hullGrace = 0;
  }
  world.questOutcomes.set(s.questId, outcome);
  // What is flown no more: the tow of crates, the pirates a quest sent (they fly off), the weight.
  for (const p of world.pirates) if (p.tag === 'special') { p.tag = null; if (p.mode !== 'leave') { p.mode = 'leave'; p.leaveTimer = CONFIG.pirates.leave.time; } }
  world.special = null;
  endTurn(world, s.id);
  const base = { id: s.id, label: sp.label, x: at.x, y: at.y, sectorId: world.sector.id };
  if (outcome === 'done') {
    const given = grantRewards(world, sp);
    world.emit('specialDone', { ...base, ...given });
    endCall(world, s, at);
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
  if (s.stage === 'flying') return HANDLERS[s.id].candidates?.(world, s) ?? [];
  if (s.stage !== 'seen' || s.site.sectorId !== world.sector.id || !world.ship.alive) return [];
  const sp = specialById(s.id), bar = boardBar(world);
  // CLIPPER's: its crew's talk as a script, the window's head CLIPPER (labs/graphics/talk-beat.js; SX's D2 SCRIPT: «в шапке ... напиши
  // просто клиппер, то есть название корабля белым»), and LEAD THEM (whatever the ship carries: it is not given up).
  if (sp.escort) {
    return [{
      id: SPECIAL_ID, title: sp.label, subtitle: ASK[s.id](s.plan),
      x: s.site.x, y: s.site.y, interactRadius: S().reach, art: { model: specialSize(s.id), scale: sp.scale, turns: true },
      talk: { name: sp.label, place: sp.label, before: meetOf(), lines: talkOf(), thread: s.questId },
      actions: [{ label: 'LEAD THEM', run: () => lead(world) }],
    }];
  }
  // The others': their crew's talk as a script, what they said coming up whole and the brief, and TAKE CONTROLS.
  return [{
    id: SPECIAL_ID, title: `${sp.label} / NEEDS A PILOT`, subtitle: ASK[s.id](s.plan),
    x: s.site.x, y: s.site.y, interactRadius: S().reach, art: { model: specialSize(s.id), scale: sp.scale, turns: true },
    talk: { name: sp.label, place: sp.label, before: wordsOf(s, 'meet').map(whole), lines: wordsOf(s, 'brief').map(whole), thread: s.questId },
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
// CLIPPER's crew led, wherever it is near (src/clipper.js clipperPose): the pilot finds them again by it when they fall behind.
export function specialDiscovery(world) {
  const s = world.special;
  if (s?.stage === 'flying' && specialById(s.id).escort) {
    const at = clipperPose(world);
    return at && { id: SPECIAL_ID, x: at.x, y: at.y, label: specialById(s.id).label, interactRadius: S().reach, discoverRadius: 3400 };
  }
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
// Where its crew's words stand while the pilot flies it: over the ship flown (World.craftAt, SPECIAL_CREW_ID).
export function specialCrewAt(world) {
  const s = world.special;
  if (!s?.boarded || !world.ship.alive) return null;
  const m = specialModel(s.id);
  return { x: world.ship.x, y: world.ship.y, craft: { rows: Array(m.height).fill(' '.repeat(m.width)), scale: m.scale } };
}

// The ship as a talk's window pictures it (labs/graphics/talk-beat.js): CLIPPER as its crew points it (the page's art), else the ship
// standing, or the one drifting off once its quest is won: its traffic drawing and its heading. Null when there is none.
export function specialPose(world) {
  const s = world.special, g = world.specialLeaving;
  if (s && specialById(s.id).escort) {
    const c = clipperPose(world), craft = c && world.clipperArt?.craft();
    return craft ? { craft, angle: c.angle } : null;
  }
  const at = s?.stage === 'seen' ? { id: s.id, angle: s.site.angle } : g ? { id: g.id, angle: g.angle } : null;
  const sp = at && specialById(at.id), art = sp?.craft && CRAFT_ART[sp.craft];
  return art ? { craft: { rows: art.glyphs, colors: art.colors, palette: art.palette, scale: sp.scale }, angle: at.angle } : null;
}

// A weight the flown ship drags (the train): its share of the top speed (World.step).
export const specialLoadTop = (world) => (world.special?.boarded ? world.special.loadTop ?? 1 : 1);

// The ship standing, the pilot's own parked, a quest's props (the train), and the borrowed ship drifting off.
export function drawSpecial(world, r, t) {
  const s = world.special;
  if (s && s.stage === 'seen' && s.site.sectorId === world.sector.id) {
    const model = specialModel(s.id), p = world.project(r, s.site.x, s.site.y), h = HANDLERS[s.id];
    if (r.onScreen(p.x, p.y, 220)) {
      if (h.drawStanding) h.drawStanding(world, s, r, t, p);
      else drawModel(r, model, p.x, p.y, s.site.angle + Math.sin(t * 0.6) * 0.04);
      if (Math.hypot(s.site.x - world.ship.x, s.site.y - world.ship.y) < 1150) {
        const label = tr(specialById(s.id).label), w = Array.from(label).length * r.cellW * (r.textScale ?? 1);
        r.text(label, p.x - w / 2, p.y + model.height * r.cellH * model.scale * 0.5 + r.cellH, CONFIG.hud.color, 0.9);
      }
    }
  }
  if (s?.boarded && s.parked.sectorId === world.sector.id) {
    const p = world.project(r, s.parked.x, s.parked.y);
    if (r.onScreen(p.x, p.y, 200)) drawParked(r, s.parked, p.x, p.y);
  }
  if (s?.stage === 'flying') HANDLERS[s.id].draw?.(world, s, r, t);
  const g = world.specialLeaving;
  if (g && g.sectorId === world.sector.id) {
    const u = Math.min(1, g.t / 3), run = u * u * 1100;
    const model = specialModel(g.id), p = world.project(r, g.x + Math.cos(g.angle) * run, g.y + Math.sin(g.angle) * run);
    if (r.onScreen(p.x, p.y, 220)) drawModel(r, model, p.x, p.y, g.angle, { alpha: 1 - u });
  }
}

// The ship the pilot flies, in place of Ship.draw while a borrowed one is: the broken drawing for SERENITY's failing hull.
// The MYSTERY MACHINE has no drive's flame: it smokes out of its pipes (src/scoobySnacks.js, drawn with its quest).
export function drawFlownShip(world, r, sx, sy, t) {
  const s = world.special, share = s.id === 'serenity' ? brokenShare(world.hull / world.hullMax) : 0;
  drawFlown(r, world.ship, sx, sy, { share, time: t, flame: s.id !== 'scooby' });
}

// Whether a borrowed ship is flown now, and which: the cockpit takes its colours (the page).
export const flownId = (world) => (world.special?.boarded ? world.special.id : null);
