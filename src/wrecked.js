import { CONFIG } from './config.js';
import { sectorById } from './sectors.js';
import { SIGNALS, WORDS } from './progression.js';
import { findsFor, findDef, isAvailable, findTitle, placedFind } from './rewards.js';
import { NPC_ART, QUEST_SHIPS } from './npcShips.js';
import { paintedCraft as craftOf } from './npcPaint.js';
import { drawCraft, craftReach, HAIL_REACH } from './traffic.js';
import { clearSpot, questSectors, pickOf } from './spots.js';
import { lerp, TAU, hashId } from './util.js';
import { pickShip, newRecent } from './pacing.js';
import { restSide } from './sideSlot.js';
import { sayFor, wreckPlea } from './voices.js';
import { sectorOpen } from './frontier.js';
import { QUEST_LINES as QL } from './questLines.js';
import { contentAreas } from './mapContent.js';

// A wrecked ship asking for money: the yellow quest of QUESTS_V2_HANDOFF.md (SX, 2026-10-02: «Желтые это помочь кораблю,
// который разбился, дать ему денег»). One of the NPC ships SX picked (src/npcShips.js) lies dead in the open, a share of
// its cells gone, sparking where it is broken, turning slowly (the pilot out of fuel of src/quests.js is its model: a
// side quest with a place in this sector or one beside it, a hail on approach, a menu with one action). Its menu offers
// GIVE N CR. The giving costs, and is not paid back in money: the reward is a tip, which the plate says before it is
// earned (SX: «the quest's done line says what»), one of three:
//
//   cache    a cache the pilot has not opened is marked (the bearing and its pointer go to it, as a restored station's do)
//   signal   a signal not yet tuned in is marked: it is offered as the next quest, with its pointer
//   word     a word for signs the pilot did not know
//
// Given, the ship lights up in its own colours and flies off, as the pilot out of fuel does.
//
//   sideQuest.wreck = { sectorId, x, y (fractions), angle, code, paint, ask, hint: { kind, findId | signalId | wordId } }

const Wk = () => CONFIG.quests.wreck;
export const WRECK_ID = 'wreck';

const WRECK_CODES = QUEST_SHIPS;

// ---------------------------------------------------------------------------------------------------- the tip

// What can be given as a tip now: caches not opened (nor already marked), signals not tuned in, words not known; never
// in the hidden sector, which nothing outside points into, nor past a closed border (the frontier, src/frontier.js; a
// cache's is in isAvailable).
export function hintOptions(world) {
  const L = world.ledger, out = [];
  const caches = findsFor(L).filter((f) => isAvailable(f, L) && L.marked !== f.id).map((f) => placedFind(f, L)).filter((f) => !sectorById(f.sector)?.hidden);
  if (caches.length) out.push({ kind: 'cache', list: caches });
  const signals = SIGNALS.filter((g) => !L.heard.has(g.id) && !sectorById(g.sector)?.hidden && sectorOpen(L, g.sector));
  if (signals.length) out.push({ kind: 'signal', list: signals });
  const words = WORDS.filter((w) => !world.collection.words.has(w.id));
  if (words.length) out.push({ kind: 'word', list: words });
  return out;
}

// A tip drawn evenly among its kinds, then one of that kind; null when there is nothing left to tell.
function rollHint(world, rng) {
  const opts = hintOptions(world);
  if (!opts.length) return null;
  const o = pickOf(opts, rng), item = pickOf(o.list, rng);
  return o.kind === 'cache' ? { kind: 'cache', findId: item.id } : o.kind === 'signal' ? { kind: 'signal', signalId: item.id } : { kind: 'word', wordId: item.id };
}

// Whether a tip still says something true: its cache not opened, its signal not heard, its word not known.
function hintValid(world, hint) {
  const L = world.ledger;
  if (!hint) return false;
  if (hint.kind === 'cache') { const f = findDef(hint.findId, L); return !!f && isAvailable(f, L); }
  if (hint.kind === 'signal') return !L.heard.has(hint.signalId);
  return !world.collection.words.has(hint.wordId);
}

// The tip in the plate's words: what the pilot is told it will get.
function hintLine(hint, ledger) {
  if (!hint) return QL.wreck.tipNone();
  if (hint.kind === 'cache') {
    const f = placedFind(findDef(hint.findId, ledger), ledger);
    return QL.wreck.tipCache(sectorById(f?.sector)?.label ?? '');
  }
  if (hint.kind === 'signal') return QL.wreck.tipSignal(sectorById(SIGNALS.find((g) => g.id === hint.signalId)?.sector)?.label ?? '');
  return QL.wreck.tipWord(WORDS.find((w) => w.id === hint.wordId)?.text ?? '');
}

// The tip given, in the world: a cache marked (the ledger's `marked`, saved), a signal offered as the next side quest, a
// word added. The events are the ones these already have, so the notices, labels and sounds are theirs.
function giveHint(world, hint, at) {
  const L = world.ledger;
  if (hint.kind === 'cache') {
    const f = findDef(hint.findId, L);
    L.marked = f.id;
    world.emit('findMarked', { findId: f.id, label: findTitle(f), kind: f.kind, sectorId: world.sector.id });   // its kind, not what it holds (SX, 2026-10-09)
  } else if (hint.kind === 'signal') {
    world.sideQuest = { id: `side:${hint.signalId}`, kind: 'signal', signalId: hint.signalId, since: world.time };
    world.emit('questOffered', { questId: world.sideQuest.id, kind: 'signal' });
  } else {
    const w = WORDS.find((x) => x.id === hint.wordId);
    world.collection.words.add(w.id);
    world.emit('signalHeard', { signalId: null, kind: 'word', wordId: w.id, text: w.text, amount: 0, credits: L.credits,
      x: at.x, y: at.y, sectorId: world.sector.id, tip: true });
  }
}

// ----------------------------------------------------------------------------------------------------- the quest

// The wreck of an offered quest: where (this sector or one beside it, a clear place), which ship, what it asks (one of
// the asks the wallet covers) and what it will tell. `here` keeps it to the pilot's own sector (the lab). Null when there
// is no place, no ask the wallet covers, or nothing to tell.
export function placeWreck(world, rng, { here = false } = {}) {
  const C = Wk(), credits = world.ledger.credits;
  const asks = C.asks.filter((a) => a <= credits);
  const hint = rollHint(world, rng);
  if (!asks.length || !hint) return null;
  const sector = pickOf(here ? [world.sector] : questSectors(world.sector, world.ledger), rng);
  const areas = here ? [] : contentAreas('wreck-help', world.ledger, { sectorId: sector.id });
  const spot = clearSpot(sector.id, rng, { clear: C.clear, avoid: world.questPlaces(), areas });
  if (!spot) return null;
  const code = pickShip(WRECK_CODES, rng, (world.recent ??= newRecent()), world.ledger.clock);
  // In a paint drawn by the counterweights, as the fleet's ships are (src/npcFleet.js questPaint): what it lights up in when it is
  // helped (wrecked, it is the dead grey of wreckCraft).
  return { sectorId: sector.id, ...spot, angle: rng() * TAU, code, ask: pickOf(asks, rng), hint, paint: world.fleet?.questPaint(world, code) ?? null };
}

// The wreck in this sector, or null.
export function wreckHere(world) {
  const s = world.sideQuest, w = s?.wreck;
  if (!w || s.helped || w.sectorId !== world.sector.id) return null;
  return { id: WRECK_ID, x: w.x * world.width, y: w.y * world.height, angle: w.angle, code: w.code, paint: w.paint ?? null, name: NPC_ART[w.code].name, ask: w.ask };
}

// The quest's words (src/quests.js sideQuestWords).
export function wreckWords(world, s) {
  const w = s.wreck, name = NPC_ART[w.code].name, sector = sectorById(w.sectorId)?.label ?? '';
  return {
    id: s.id, kind: 'side', pointer: 'WRECK', title: QL.wreck.title(name), sub: w.given ? QL.wreck.handIn(sector) : QL.wreck.give(sector, w.ask),
    target: { sectorId: w.sectorId, x: w.x, y: w.y, mark: WRECK_ID, reach: CONFIG.stranded.interactRadius, lift: 110 },
    done: [QL.wreck.done(name), hintLine(w.hint, world.ledger)],
  };
}

// Giving: refused when the wallet falls short; else the wallet pays, and the ship's thanks wait beside it in its window until
// the quest is handed in (`handInWreck`, as a pilot's out of fuel do, src/quests.js helpDrifter).
export function giveToWreck(world) {
  const s = world.sideQuest, here = wreckHere(world);
  if (!here || s.wreck.given) return false;
  const ask = s.wreck.ask;
  if (world.ledger.credits < ask) { world.emit('actionRefused', { reason: `NEED ${ask} CR` }); return false; }
  world.ledger.credits -= ask;
  s.wreck.given = true;
  s.wreck.thanks = sayFor(world, 'wreck', 'thanks', here.code);
  return true;
}
// Handing it in (its window's HAND IN): the tip is given, the quest is done and the ship goes.
export function handInWreck(world) {
  const s = world.sideQuest, here = wreckHere(world);
  if (!here || !s.wreck.given) return false;
  const ask = s.wreck.ask;
  // The tip as it was promised, or, if that has been found meanwhile, another.
  const hint = hintValid(world, s.wreck.hint) ? s.wreck.hint : rollHint(world, world.rng('quest'));
  s.helped = true;
  world.questOutcomes.set(s.id, 'done');
  world.sideQuest = null;
  restSide(world);
  world.selectedId = null;
  world.wreckLeaving = { x: here.x, y: here.y, angle: here.angle, code: here.code, paint: here.paint, name: here.name, sectorId: world.sector.id, t: 0 };
  world.emit('wreckHelped', { ask, hint: hint?.kind ?? null, credits: world.ledger.credits, name: here.name, x: here.x, y: here.y, sectorId: world.sector.id });
  if (hint) giveHint(world, hint, here);
  return true;
}

// The quest's tip is re-drawn when what it promised is gone (found meanwhile); withdrawn when there is nothing to tell.
// Called on the quest's look (every `checkEvery` s).
export function refreshWreck(world, s) {
  if (hintValid(world, s.wreck.hint)) return true;
  const hint = rollHint(world, world.rng('quest'));
  if (!hint) return false;
  s.wreck.hint = hint;
  return true;
}

// ---------------------------------------------------------------------------------------------------- the step

// Every step: the ship goes (after it was helped), calls to a pilot who comes near (once), and sparks where it is broken.
export function stepWreck(world, dt) {
  const C = Wk(), l = world.wreckLeaving;
  if (l && (l.t += dt) >= C.leave) world.wreckLeaving = null;
  const here = wreckHere(world);
  if (!here || !world.ship.alive) return;
  const s = world.sideQuest;
  const d = Math.hypot(here.x - world.ship.x, here.y - world.ship.y);
  if (!s.wreck.hailed && d < C.hailReach) {
    s.wreck.hailed = true;
    world.emit('trafficHail', { craftId: WRECK_ID, label: here.name, line: wreckPlea(world, here.ask), x: here.x, y: here.y, sectorId: world.sector.id });
  }
  // Sparks only where they can be seen: within a screen and a half.
  if (d > 1400) return;
  s.wreck.sparkIn = (s.wreck.sparkIn ?? 0) - dt;
  if (s.wreck.sparkIn > 0) return;
  s.wreck.sparkIn = lerp(C.spark[0], C.spark[1], world.rng('drop')());
  const cells = brokenCells(here.code);
  if (!cells.length) return;
  const c = pickOf(cells, world.rng('drop')), cr = craftOf(here.code);
  // A nominal cell, as a pirate's debris is placed (src/pirates.js pirateGlyphs): the drawing is not measured here.
  const a = here.angle + world.time * 0.05 + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
  const lx = (c.i - (cr.rows[0].length - 1) / 2) * 9 * cr.scale, ly = (c.j - (cr.rows.length - 1) / 2) * 15 * cr.scale;
  const B = CONFIG.asteroid.bump;
  const bits = Array.from({ length: 3 }, (_, k) => ({ ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length] }));
  world.particles.burst(here.x + lx * ca - ly * sa, here.y + lx * sa + ly * ca, bits, { speed: [30, 110], life: [0.15, 0.45] });
}

// ------------------------------------------------------------------------------------------------------ drawing

// The cells of a ship that are gone: a fixed share of them by a hash of the ship and the place, so a wreck is the same
// wreck every time and every frame, and never the whole ship (at least two gone, at least a third left).
const brokenCache = new Map();
export function brokenCells(code) {
  if (brokenCache.has(code)) return brokenCache.get(code);
  const rows = NPC_ART[code].glyphs, all = [];
  rows.forEach((row, j) => Array.from(row).forEach((ch, i) => { if (ch !== ' ') all.push({ i, j }); }));
  const seed = hashId(code);
  const noise = (c) => (Math.imul((c.i + 1) * 73856093 ^ (c.j + 1) * 19349663 ^ seed, 2654435761) >>> 0) / 4294967296;
  const ranked = all.map((c) => ({ ...c, n: noise(c) })).sort((a, b) => a.n - b.n);
  const count = Math.max(2, Math.min(Math.floor(all.length * (2 / 3)), Math.round(all.length * Wk().broken)));
  const out = ranked.slice(0, count).map(({ i, j }) => ({ i, j }));
  brokenCache.set(code, out);
  return out;
}

// The craft a wrecked ship is drawn as: its drawing without the broken cells, all in the quiet grey of dead metal; made once a ship.
const crafts = new Map();
function wreckCraft(code) {
  const key = `dead:${code}`;
  if (!crafts.has(key)) {
    const base = craftOf(code), gone = new Set(brokenCells(code).map((c) => `${c.i},${c.j}`));
    const rows = base.rows.map((row, j) => Array.from(row).map((ch, i) => (gone.has(`${i},${j}`) ? ' ' : ch)).join(''));
    crafts.set(key, { rows, ink: CONFIG.hud.hint, inks: {}, name: base.name, get scale() { return base.scale; } });
  }
  return crafts.get(key);
}

// Where the ship going away is (it flies off along its nose, easing out), and its fade.
function goingPose(l) {
  const u = Math.min(1, l.t / Wk().leave);
  return { x: l.x + Math.cos(l.angle) * u * u * 900, y: l.y + Math.sin(l.angle) * u * u * 900, u };
}
function wreckGoing(world) {
  const l = world.wreckLeaving;
  if (!l || l.sectorId !== world.sector.id) return null;
  const at = goingPose(l);
  return { x: at.x, y: at.y, angle: l.angle, craft: craftOf(l.code, l.paint), alpha: 1 - at.u };
}

// Where a hail at the wreck stands (World.craftAt).
export function wreckCraftAt(world) {
  const here = wreckHere(world);
  if (here) return { x: here.x, y: here.y, craft: wreckCraft(here.code) };
  const going = wreckGoing(world);
  return going ? { x: going.x, y: going.y, craft: going.craft } : null;
}

// The footprint of its menu (World.candidates): the drawing's cells, turning.
export function wreckArt(code) {
  const c = craftOf(code);
  return { model: { width: c.rows[0].length, height: c.rows.length }, scale: c.scale, turns: true };
}

export function drawWreck(world, r, t) {
  const here = wreckHere(world), going = wreckGoing(world);
  if (!here && !going) return;
  if (here) {
    const craft = wreckCraft(here.code), s = world.project(r, here.x, here.y);
    if (!r.onScreen(s.x, s.y, craftReach(r, craft))) return;
    drawCraft(r, craft, s.x, s.y, here.angle + t * 0.05);
    if (Math.hypot(here.x - world.ship.x, here.y - world.ship.y) < HAIL_REACH * 2.5) {
      // Under the square its menu's marks stand round (it turns, so the marks hold its whole reach), not under the drawing.
      const label = `${here.name} / WRECK`, w = label.length * r.cellW * (r.textScale ?? 1);
      const reach = Math.hypot(craft.rows[0].length * r.cellW, craft.rows.length * r.cellH) * craft.scale / 2;
      r.text(label, s.x - w / 2, s.y + reach + r.cellH * 1.5, CONFIG.hud.color, 0.9);
    }
    return;
  }
  const s = world.project(r, going.x, going.y);
  if (r.onScreen(s.x, s.y, craftReach(r, going.craft))) drawCraft(r, going.craft, s.x, s.y, going.angle, going.alpha);
}
