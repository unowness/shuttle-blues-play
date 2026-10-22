import { CONFIG } from './config.js';
import { sectorById } from './sectors.js';
import { NPC_ART } from './npcShips.js';
import { paintedCraft as craftOf } from './npcPaint.js';
import { drawCraft, craftReach, HAIL_REACH } from './traffic.js';
import { spawnPost } from './raids.js';
import { clearSpot, questSectors, pickOf } from './spots.js';
import { formatCR } from './ruins.js';
import { TAU } from './util.js';
import { pesterOpen, pesterGap, payFor, pickShip, newRecent, noteRecent } from './pacing.js';
import { sayFor } from './voices.js';
import { QUEST_LINES as QL } from './questLines.js';
import { radioFitted } from './opening.js';
import { pickTypes, pickPaint } from './pirates.js';
import { replaceRoster } from './pirateRoster.js';
import { PIRATE_ROLES } from './pirateRolesConfig.js';
import { recoverPesterCapsule, cleanupPesterCombat } from './pirateCombat.js';
import { contentAreas } from './mapContent.js';
import { tr } from './lang.js';

// Pirates pestering a small ship: the red quest of QUESTS_V2_HANDOFF.md (SX, 2026-10-02: «Красные это рейды или спасти
// кораблик от набега пиратов. То есть рейды, там большое количество пиратов, мелкие набеги. Там 2-3 пирата просто
// пристают к маленькому кораблю»). A small friendly ship (one of the NPC ships SX picked, src/npcShips.js) is held
// still in the open, 2-3 pirates circling it and firing at it (they are a squad at a post, src/raids.js, with
// characters as every squad has). The pilot has a clock to drive them off, by shooting them or by frightening the cowards
// among them; then the ship waits for the pilot, its thanks in its window, and the window's HAND IN pays and lets it fly on
// (SX, 2026-10-02: «чтобы завершить надо вернуться к нпс и поговорить»; NPC_DIALOG_HANDOFF.md). Late, it limps away, hurt
// and unpaid.
//
// The ship is its own body, made here and drawn here: the route NPC of the same drawing (NPCS in src/traffic.js) goes on
// flying its lane as before, clock-driven and untouched, and this one sits in a clear place from the catalogue. It is a
// red quest on its own slot (`world.pester`), called on its own clock as a raid is (CONFIG.quests.pester): a call for
// help does not wait behind a green quest. Open at a save, it is in the save (src/questSave.js), its squad made again.
//
//   world.pester = { id, code, paint, name, sectorId, x, y, angle, size, down, ends, hailed, plea, hits, cleared, thanks }   (x, y in world units)
//   world.pesterLeaving = { x, y, angle, code, paint, name, sectorId, t, limp }                       a ship going away
//   world.pesterNext    the pilot's clock when the next call may come
//   pester.mix / piratePaint keep the remaining allocation; combat keeps finite supplies and an optional NPC capsule.
//   A JACKAL rescue uses the same quest/reward: drive the squad off, recover that capsule, return to this ship.
//
// When it may come is the quest economy's (src/pacing.js): not before `first` s of the pilot's clock and a first pirate fight
// won (Pilot.fought), then `gap` s (by stations restored) from one's end; never while a raid or a reference ship is on,
// nor a new side offer while it is. Its pay grows with the stations restored.

const P = () => CONFIG.quests.pester;
export const PESTER_ID = 'pester-ship';


function pickSquad(rng) {
  const table = P().squad, total = table.reduce((s, [, w]) => s + w, 0);
  let u = rng() * total;
  for (const [n, w] of table) { u -= w; if (u < 0) return n; }
  return table[table.length - 1][0];
}

// ----------------------------------------------------------------------------------------------------- the call

// A call for help begins, if one can: not while another is on or the pilot is lost in O-08 (nothing there to fly to).
// `here` keeps it to the pilot's own sector (the lab's `?quest=pester`). Returns it, or null.
export function startPester(world, { here = false } = {}) {
  const L = world.ledger, C = P(), rng = world.rng('quest');
  if (world.pester || world.sector.hidden) return null;
  const sector = pickOf(here ? [world.sector] : questSectors(world.sector, world.ledger), rng);
  const away = sector.id === world.sector.id ? { x: world.ship.x, y: world.ship.y, by: C.apart } : null;
  const areas = here ? [] : contentAreas('pirate-rescue', L, { sectorId: sector.id });
  const spot = clearSpot(sector.id, rng, { clear: C.clear, edge: C.edge, away, avoid: world.questPlaces(), areas });
  if (!spot) return null;
  // Which of the small ships leans away from the ones the pilot met or was asked about lately (src/pacing.js).
  const recent = (world.recent ??= newRecent()), code = world.fleet?.questShip?.(world, rng, C.ships) ?? pickShip(C.ships, rng, recent, L.clock);
  noteRecent(recent, 'ship', code, L.clock, CONFIG.quests.mix.asked);
  world.pesterSerial += 1;
  world.pester = {
    id: `pester:${world.pesterSerial}`, code, name: NPC_ART[code].name, sectorId: sector.id,
    x: spot.x * world.width, y: spot.y * world.height, angle: rng() * TAU,
    size: pickSquad(rng), down: 0, ends: L.clock + C.time, hailed: false, hits: [],
  };
  // In a paint drawn by the counterweights, as the fleet's ships are (src/npcFleet.js questPaint).
  world.pester.paint = world.fleet?.questPaint(world, code) ?? null;
  // Allocate this existing rescue once. Later hulls replace its slots, never add a second squad or reward.
  const p = world.pester, pirateRng = world.rng('pirate');
  p.mix = pickTypes(p.size, pirateRng);
  p.piratePaint = pickPaint(pirateRng);
  p.combat = { mineRemaining: PIRATE_ROLES.mine.encounterBudget, supplyRemaining: PIRATE_ROLES.tender.supply };
  const replacement = replaceRoster(p.mix, { restored: L.restored.size, context: 'recovery', rng: pirateRng });
  if (replacement.includes('jackal')) {
    const J = PIRATE_ROLES.jackal;
    const capsule = { id: `${p.id}:capsule`, owner: 'npc',
      x: p.x + Math.cos(p.angle) * J.capsuleOffset, y: p.y + Math.sin(p.angle) * J.capsuleOffset,
      state: 'available', carrierId: null, claimId: null, loadedAt: null, drops: 0 };
    const departure = clearSpot(p.sectorId, pirateRng, { clear: C.clear, edge: C.edge,
      away: { x: capsule.x, y: capsule.y, by: J.departureDistance }, avoid: world.questPlaces() });
    // If there is no clear departure point with interception room, keep the original DART rescue.
    if (departure) {
      capsule.exit = { x: departure.x * world.width, y: departure.y * world.height };
      p.mix = replacement;
      p.combat.capsule = capsule;
    }
  }
  world.emit('pesterStarted', { questId: world.pester.id, name: world.pester.name, sectorId: sector.id, size: world.pester.size });
  return world.pester;
}

// The pester quest as the list shows it, or null: red, with a clock, leading to the ship.
export function pesterQuest(world) {
  const p = world.pester;
  if (!p) return null;
  const C = P(), sector = sectorById(p.sectorId);
  const capsule = p.combat?.capsule;
  const outstanding = capsule && capsule.state !== 'recovered';
  // Driven off, the clock is done with: the ship waits for its thanks to be heard.
  const clock = p.cleared ? {} : { ends: p.ends, time: C.time, left: p.ends - world.ledger.clock };
  return {
    id: p.id, kind: 'pester', tone: 'red', pointer: 'HELP',
    title: QL.pester.title(p.name), sub: p.cleared ? QL.pester.handIn(sector?.label ?? '') :
      outstanding ? QL.pester.recover() : QL.pester.sub(),
    ...clock,
    target: outstanding ? { sectorId: p.sectorId, x: capsule.x / world.width, y: capsule.y / world.height,
      mark: capsule.id, reach: PIRATE_ROLES.jackal.recoverReach, lift: 110 } :
      { sectorId: p.sectorId, x: p.x / world.width, y: p.y / world.height, mark: PESTER_ID, reach: C.ring + 400, lift: 110 },
    done: [QL.pester.done(p.name), QL.pester.paid(formatCR(payFor('pester', world.ledger.restored.size)))],
    late: [QL.pester.late(), QL.pester.lateSub(p.name)],
  };
}

// ---------------------------------------------------------------------------------------------------- the step

// Every step: the call itself (its clock, its squad, its hail, its ending), and a ship going away.
export function stepPester(world, dt) {
  const L = world.ledger, C = P(), p = world.pester, l = world.pesterLeaving;
  if (l) {
    l.t += dt;
    if (l.limp && world.sector.id === l.sectorId) smoulder(world, l, dt);
    if (l.t >= (l.limp ? C.limp : C.leave)) world.pesterLeaving = null;
  }
  if (!p) {
    // A call is made now and then, on the pilot's clock, while pirates are on (checks and the lab's scenes switch them off).
    if (!world.autoEncounters || !pesterOpen({ clock: L.clock, fought: world.pilot?.fought })) return;
    world.pesterNext ??= L.clock;
    if (L.clock < world.pesterNext) return;
    world.pesterNext = L.clock + 30;                      // not now: look again in half a minute
    // A ship's call for help is heard on the radio (SX, 2026-10-06: «радио открывает квесты нпс»): none without it.
    if (L.raid || world.encounter || world.docked || !world.ship.alive || world.special || !radioFitted(world)) return;
    startPester(world);
    return;
  }

  // The squad's strokes arriving: sparks on the hull (src/raids.js harass).
  for (let i = p.hits.length - 1; i >= 0; i--) {
    const h = p.hits[i];
    if (world.time < h.at) continue;
    p.hits.splice(i, 1);
    if (world.sector.id === p.sectorId) sparks(world, h);
  }
  // Recovery remains possible after the last pirate dies or the page is reloaded.
  recoverPesterCapsule(world);
  if (['escaped', 'cancelled'].includes(p.combat?.capsule?.state)) return lose(world, p);
  if (p.cleared && rescueComplete(p)) return;
  p.cleared = false;
  if (L.clock >= p.ends) return lose(world, p);
  // Driven off: it waits, its thanks for its window (World.candidates offers HAND IN at it).
  if (rescueComplete(p)) { p.cleared = true; p.thanks = sayFor(world, 'pester', 'thanks', p.code); return; }

  if (!world.ship.alive || world.sector.id !== p.sectorId) return;
  // It calls to a pilot who comes near, once.
  if (!p.hailed && Math.hypot(p.x - world.ship.x, p.y - world.ship.y) < C.hailReach) {
    p.hailed = true;
    // Its call for help, kept: its thanks' window says it first (src/menus.js pesteredMenu).
    p.plea = sayFor(world, 'pester', 'help', p.code);
    world.emit('trafficHail', { craftId: PESTER_ID, label: p.name, line: p.plea, x: p.x, y: p.y, sectorId: p.sectorId });
  }
  // The squad: made when the pilot is in the sector and it has none, as many as are still to beat.
  if (world.autoEncounters && !world.pirates.some((q) => q.post?.stationId === p.id)) {
    const left = p.size - p.down;
    if (left <= 0) return;
    // Rocks in the ring would put a pirate down for nothing (a crash counts as beaten): they are cleared from it, unseen,
    // for the ring is made while the pilot is still `apart` u off or across a seam.
    const keep = C.ring + 220;
    world.asteroids = world.asteroids.filter((a) => Math.hypot(a.x - p.x, a.y - p.y) > keep + a.radius * 1.3);
    spawnPost(world, p, 'pester', left, { radius: C.ring, wake: C.wake, label: `A ${p.name}`,
      record: p, types: p.mix, paint: p.piratePaint });
  }
}

function sparks(world, h) {
  const B = CONFIG.asteroid.bump;
  const bits = Array.from({ length: 4 }, (_, k) => ({ ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length] }));
  world.particles.burst(h.x, h.y, bits, { aim: h.aim, speed: [60, 190], life: [0.15, 0.4] });
}

// A ship limping off drops a spark or two now and then.
function smoulder(world, l, dt) {
  l.spark = (l.spark ?? 0) - dt;
  if (l.spark > 0) return;
  l.spark = 0.18;
  const at = goingPose(l);
  sparks(world, { x: at.x, y: at.y, aim: l.angle + Math.PI });
}

// Handed in (its window's HAND IN, in its sector): paid, the ship goes on its way, the next call is a while off.
export function handInPester(world) {
  const p = world.pester;
  if (!p?.cleared || !rescueComplete(p) || p.sectorId !== world.sector.id) return false;
  free(world, p);
  world.selectedId = null;
  return true;
}
const rescueComplete = (p) => p.down >= p.size && (!p.combat?.capsule || p.combat.capsule.state === 'recovered');
function free(world, p) {
  const L = world.ledger, C = P();
  cleanupPesterCombat(world, p, 'cleared');
  const pay = payFor('pester', L.restored.size);
  L.credits += pay;
  world.questOutcomes.set(p.id, 'done');
  world.pesterLeaving = { x: p.x, y: p.y, angle: p.angle, code: p.code, paint: p.paint, name: p.name, sectorId: p.sectorId, t: 0, limp: false };
  world.pester = null;
  world.pesterNext = L.clock + pesterGap(L.restored.size, world.rng('quest'));
  world.emit('pesterFreed', { questId: p.id, name: p.name, pay, credits: L.credits, x: p.x, y: p.y, sectorId: p.sectorId });
  world.fleet?.helped?.(p.code);        // it remembers, and owes the pilot a favor (src/npcTalk.js)
}

// Late: the ship is lost, and limps away (nothing worse is said: no wreck, no payment either way); the squad round it
// flies off with what it came for, as a raid's does.
function lose(world, p) {
  const L = world.ledger;
  world.questOutcomes.set(p.id, 'late');
  cleanupPesterCombat(world, p, 'cancelled');
  world.pesterLeaving = { x: p.x, y: p.y, angle: p.angle, code: p.code, paint: p.paint, name: p.name, sectorId: p.sectorId, t: 0, limp: true };
  world.pester = null;
  world.pesterNext = L.clock + pesterGap(L.restored.size, world.rng('quest'));
  world.emit('pesterLost', { questId: p.id, name: p.name, x: p.x, y: p.y, sectorId: p.sectorId });
}

// --------------------------------------------------------------------------------------------- where it is, drawn

// The held ship in this sector, or null: still, but it jinks a little (a ship pressed from every side).
export function pesterHere(world) {
  const p = world.pester;
  if (!p || p.sectorId !== world.sector.id) return null;
  return { id: PESTER_ID, x: p.x, y: p.y, angle: p.angle + Math.sin(world.time * 0.7) * 0.12, craft: craftOf(p.code, p.paint), name: p.name };
}

// Where a ship going away is now, along its nose: quick when it was freed, slow and fading when it was too late.
function goingPose(l) {
  const C = P(), u = Math.min(1, l.t / (l.limp ? C.limp : C.leave));
  const run = l.limp ? u * 260 : u * u * 900;
  return { x: l.x + Math.cos(l.angle) * run, y: l.y + Math.sin(l.angle) * run, u };
}
export function pesterGoing(world) {
  const l = world.pesterLeaving;
  if (!l || l.sectorId !== world.sector.id) return null;
  const at = goingPose(l);
  return { id: PESTER_ID, x: at.x, y: at.y, angle: l.angle, craft: craftOf(l.code, l.paint), name: l.name, alpha: l.limp ? 0.7 * (1 - at.u) : 1 - at.u, limp: l.limp };
}

// Where a hail at it stands (World.craftAt), and the craft, for its shoulder.
export function pesterCraftAt(world) {
  const b = pesterHere(world) ?? pesterGoing(world);
  return b ? { x: b.x, y: b.y, craft: b.craft } : null;
}

// The ship, in the world's own drawing of the NPC ships, its name under it while the pilot is near.
export function drawPestered(world, r) {
  const here = pesterHere(world), b = here ?? pesterGoing(world);
  if (!b) return;
  const s = world.project(r, b.x, b.y);
  if (!r.onScreen(s.x, s.y, craftReach(r, b.craft))) return;
  drawCraft(r, b.craft, s.x, s.y, b.angle, here ? 1 : b.alpha);
  if (here && Math.hypot(b.x - world.ship.x, b.y - world.ship.y) < HAIL_REACH * 2.5) {
    const name = tr(b.name), w = Array.from(name).length * r.cellW * (r.textScale ?? 1);
    r.text(name, s.x - w / 2, s.y + b.craft.rows.length * r.cellH * b.craft.scale * 0.5 + r.cellH, CONFIG.hud.color, 0.9);
  }
}
