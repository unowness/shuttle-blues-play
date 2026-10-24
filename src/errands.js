import { CONFIG } from './config.js';
import { sectorById, stationDefById, SECTOR_SIZE, planetKey } from './sectors.js';
import { reachableStationIds, formatCR } from './ruins.js';
import { questSectors } from './spots.js';
import { ROLES } from './roles.js';
import { PALETTE } from './palette.js';
import { clamp } from './util.js';
import { payFor } from './pacing.js';
import { restSide } from './sideSlot.js';
import { planetWords, PLANET_ASKS, PLANET_THANKS, PLANET_PAID } from './voices.js';
import { QUEST_LINES as QL } from './questLines.js';
import { contentLinks } from './mapContent.js';

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
// and an errand is a small favour outside it. It hangs on a short rope behind the hull, drawn only (no body, nothing reads where
// it is), and a wreck loses it (the quest turns late). A pilot already towing a cargo may take it too: it is not the cargo.
//
// The planet is big, so its menu and its voice stand at the point of its limb that faces the pilot (one point per
// frame, moving as the pilot moves), not at its middle, where they would be off the screen.
//
//   sideQuest.errand = { planet: { sectorId, label }, station, stage, spoke, travelled, ambushed, ambushAt, length }
//   (the planet's `label` there is its key, src/sectors.js planetKey: its address, never shown; `nameOf` is what is shown)

const E = () => CONFIG.quests.errand;
// What the notch says of the errand as it goes (the text pass of 2026-10-24; labs/graphics/notices.js): the case taken, the squad come on
// the way back (the case is to be brought, not the squad beaten), the case lost.
export const SUITCASE = Object.freeze({
  taken: "SUITCASE COLLECTED. DESTINATION: THE CONTACT'S PLANET.",
  ambush: 'DELIVER THE SUITCASE TO THE PLANET.',
  lost: 'THE SUITCASE WAS LOST IN THE WRECK. DELIVERY INCOMPLETE.',
});
export const PLANET_ID = 'planet-ask';
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;

// What a planet says: its wording of the errand (src/voices.js), its hail's short form and the rest in its window, drawn when it first speaks and kept
// for the quest, never the last errand's.
const wording = (e, world) => (e.words ??= planetWords(world));

const errandOf = (world) => (world.sideQuest?.kind === 'planet' ? world.sideQuest.errand : null);
const globalOf = (sectorId, fx, fy) => {
  const s = sectorById(sectorId);
  return { x: s.col * W + fx * W, y: s.row * H + fy * H };
};
const planetDef = (e) => sectorById(e.planet.sectorId)?.planets.find((p) => planetKey(p) === e.planet.label) ?? null;
const nameOf = (e) => planetDef(e)?.label ?? e.planet.label;

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
        out.push({ id: `side:planet:${planetKey(pl)}:${Math.round(world.time)}`, kind: 'planet',
          errand: { planet: { sectorId: sector.id, label: planetKey(pl) }, station: st.id, stage: 'ask', spoke: false, travelled: 0, ambushed: false, length } });
      }
    }
  }
  return out;
}

// The map's connections are preferences among already legal offers. Called after the side slot has also removed
// candidates near another quest; an unavailable planned station or blocked planet leaves the ordinary pool intact.
export function preferErrandCandidates(world, candidates) {
  const links = contentLinks('planet-errand', world.ledger);
  const preferred = candidates.filter((c) => links.some((link) =>
    link.anchor?.kind === 'planet' && link.anchor.sectorId === c.errand.planet.sectorId &&
    link.anchor.label === c.errand.planet.label && link.targetId === c.errand.station));
  return preferred.length ? preferred : candidates;
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
  return world.planets.find((p) => planetKey(p) === e.planet.label) ?? null;
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
  // One conversation from the ask to the thanks (labs/graphics/talk-beat.js, the game's dialogs as a script; SX, 2026-10-22): its ask is its
  // window's words while it asks, and said before whatever it says later, so a pilot who comes back with the suitcase finds it there.
  const [whole, , rest] = PLANET_ASKS[wording(e, world).ask](st?.label ?? 'A STATION'), asked = [whole, rest], thread = world.sideQuest.id;
  // Thanked: its words in its window and the quest's hand-in (labs/graphics/context.js draws a `talk` so).
  if (e.stage === 'thanked') {
    return { id: PLANET_ID, title: planet.label, talk: { name: planet.label, lines: e.thanks ?? [], before: asked, thread },
      x: at.x, y: at.y, interactRadius: E().reach, art: { model: { width: 6, height: 3 }, scale: 1 },
      actions: [{ label: 'HAND IN', run: () => handInSuitcase(world) }] };
  }
  return {
    id: PLANET_ID, title: `${planet.label} / ${ask ? 'REQUEST' : 'DELIVERY'}`,
    subtitle: ask ? `COLLECT SUITCASE / ${st?.label ?? ''}` : 'SUITCASE ABOARD',
    x: at.x, y: at.y, interactRadius: E().reach, art: { model: { width: 6, height: 3 }, scale: 1 },
    talk: ask ? { name: planet.label, lines: asked, thread } : { name: planet.label, lines: [], before: asked, thread },
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

function say(world, planet, line) {
  const at = limbPoint(world, planet);
  world.emit('trafficHail', { craftId: PLANET_ID, label: planet.label, line, x: at.x, y: at.y, sectorId: world.sector.id });
}

// ---------------------------------------------------------------------------------------------------- the quest

// The quest's words by its stage (src/quests.js sideQuestWords). `spare` holds the lines of the other stages, so the
// plate keeps its width as it changes its words.
export function errandWords(world, s) {
  const e = s.errand, label = nameOf(e), def = planetDef(e), st = stationDefById(e.station);
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
  world.emit('errandTaken', { planet: nameOf(e), station: e.station, sectorId: world.sector.id });
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
  world.emit('suitcaseTaken', { planet: nameOf(e), x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
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
  // Paid: its last word in its window, the conversation going on (a call, labs/graphics/talk-beat.js).
  world.talkCall = { n: `${s.id}:paid`, menu: { id: PLANET_ID, title: planet.label, subtitle: '', x: at.x, y: at.y, interactRadius: E().reach,
    art: { model: { width: 6, height: 3 }, scale: 1 }, talk: { name: planet.label, lines: [PLANET_PAID], thread: s.id }, actions: [] } };
  world.emit('suitcaseDelivered', { planet: planet.label, pay, credits: L.credits, x: at.x, y: at.y, sectorId: world.sector.id });
  return true;
}

// A wreck with the suitcase aboard loses it, and the quest turns late.
function loseSuitcase(world, s) {
  world.questOutcomes.set(s.id, 'late');
  world.sideQuest = null;
  restSide(world);
  world.emit('suitcaseLost', { planet: nameOf(s.errand), x: world.ship.x, y: world.ship.y, sectorId: world.sector.id });
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
    // (Its hail the ask's short form; its window says it whole, planetMenu.)
    say(world, planet, PLANET_ASKS[wording(e, world).ask](stationDefById(e.station)?.label ?? 'A STATION')[1]);
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
  if (world.spawnPirates(count).length) { e.ambushed = true; world.emit('suitcaseAmbush', { planet: nameOf(e), sectorId: world.sector.id }); }
}

// ----------------------------------------------------------------------------------------------------- drawing

// The suitcase aboard (SX's L4C on labs/graphics/sketches/quest-objects.html, 2026-10-15; until then two rows, `┌─┐ ╞═╡`, «напоминает
// табуретку»): a cabin trolley standing up («багаж должен быть вертикальным, как вертикальный самолетный чемодан»), the errand's blue,
// its handle's grip and its wheels the world's gray, its button white; clamped to the hull's left side by a short bar, its handle toward
// the ship, standing out from it as the ship flies and turns (SX, 2026-10-17: «сбоку пристегивался к кораблю и сбоку торчал ... Отличить
// его от обычного груза»; on a short rope behind the hull until then, as a cargo is), and now and then a bit of what is packed comes out
// of it, turns away from the ship and fades (CONFIG.quests.errand.suitcase). Drawn only: the bits are the page's, kept apart from the world's state and drawn from its clock by a
// hash, so the same frames draw the same bits.
const CASE_ROWS = [' ╭─╮ ', '╭┴─┴╮', '│   │', '│ ● │', '╰───╯', '•   •'];
const WHEEL_LIFT = 0.5;   // the wheels' row drawn half a cell up, against the case's foot
// The case's cells read once, each with its place in cells from the case's middle and its ink's role (the handle's grip, the button, a
// wheel, or the case's edge): a frame walks them and makes nothing.
const CASE_CELLS = CASE_ROWS.flatMap((row, j) => Array.from(row).flatMap((ch, i) => (ch === ' ' ? [] : [{
  ch, x: i - (row.length - 1) / 2, y: j - (ch === '•' ? WHEEL_LIFT : 0) - (CASE_ROWS.length - 1) / 2,
  ink: ch === '●' ? 'button' : ch === '•' || j === 0 ? 'gray' : 'edge',
}])));
const caseInk = (role) => (role === 'button' ? PALETTE.white : role === 'gray' ? ROLES.material : CONFIG.hud.edge);
const CLAMP_GLYPH = '═';
const BIT_GLYPHS = ['▪', '•', '∙', '◦', '≈', '·'];   // glyphs the boot already warms (labs/graphics/warmup.js)
const BIT_INK_COUNT = 5;
const bitInk = (k) => (k < 2 ? PALETTE.white : k === 2 ? ROLES.material : k === 3 ? CONFIG.hud.edge : PALETTE.amber);
const hash = (n, k) => { const v = Math.sin(n * 91.7 + k * 47.3) * 43758.5453; return v - Math.floor(v); };
const spills = new WeakMap();   // world -> { next, n, last, bits }
export function drawSuitcase(world, r) {
  const e = errandOf(world), ship = world.ship;
  if (!e || e.stage !== 'return' || !ship.alive || world.docked) return;
  const C = E().suitcase, a = ship.angle;
  // `out` the way from the hull's left side outward (the nose's left, y down), `ra` from the case back toward the hull.
  const out = a - Math.PI / 2, ra = out + Math.PI;
  const s = world.project(r, ship.x, ship.y), side = ship.drawnSide();
  const fx = s.x + Math.cos(out) * side, fy = s.y + Math.sin(out) * side;
  const half = (CASE_ROWS.length / 2) * r.cellH * C.scale, cx = fx + Math.cos(out) * (C.clamp + half), cy = fy + Math.sin(out) * (C.clamp + half);
  // The clamp: a bar between the hull and the handle, in the world's gray.
  const tx = cx + Math.cos(ra) * half, ty = cy + Math.sin(ra) * half;
  r.glyphRot(CLAMP_GLYPH, (fx + tx) / 2, (fy + ty) / 2, out, ROLES.material, 1, C.scale);
  // The case, its handle toward the ship.
  const turn = ra + Math.PI / 2, co = Math.cos(turn), si = Math.sin(turn), w = r.cellW * C.scale, h = r.cellH * C.scale;
  for (const c of CASE_CELLS) {
    const lx = c.x * w, ly = c.y * h;
    r.glyphRot(c.ch, cx + lx * co - ly * si, cy + lx * si + ly * co, turn, caseInk(c.ink), 1, C.scale);
  }
  drawSpill(world, r, C.spill, ship.x + (cx - s.x), ship.y + (cy - s.y), ra, turn, h);
}
// The bits: one comes out at the case's lower half now and then, flies off away from the ship easing to a stop, turning, and fades.
function drawSpill(world, r, S, wx, wy, ra, turn, h) {
  const t = world.time;
  let st = spills.get(world);
  if (!st || t < st.last || t - st.last > 2) { st = { next: t + S.every, n: st?.n ?? 0, last: t, bits: [] }; spills.set(world, st); }
  st.last = t;
  while (t >= st.next) {
    const n = ++st.n;
    if (hash(n, 7) > S.skip) {
      const lx = (hash(n, 3) - 0.5) * 3 * r.cellW * (h / r.cellH), ly = (0.2 + hash(n, 4) * 0.3) * CASE_ROWS.length * h;
      st.bits.push({ n, born: st.next, x: wx + lx * Math.cos(turn) - ly * Math.sin(turn), y: wy + lx * Math.sin(turn) + ly * Math.cos(turn),
        dir: ra + Math.PI + (hash(n, 5) - 0.5) * S.spread, speed: S.speed[0] + hash(n, 6) * (S.speed[1] - S.speed[0]),
        life: S.life[0] + hash(n, 2) * (S.life[1] - S.life[0]) });
    }
    st.next += S.every + hash(n, 1) * S.jitter;
  }
  // The bits gone are dropped in place (a frame makes no new list).
  let kept = 0;
  for (const b of st.bits) if (t - b.born < b.life) st.bits[kept++] = b;
  st.bits.length = kept;
  for (const b of st.bits) {
    const age = t - b.born, u = age / b.life, dist = (b.speed * b.life * (1 - (1 - u) * (1 - u))) / 2;
    const p = world.project(r, b.x + Math.cos(b.dir) * dist, b.y + Math.sin(b.dir) * dist);
    r.glyphRot(BIT_GLYPHS[Math.floor(hash(b.n, 8) * BIT_GLYPHS.length)], p.x, p.y, age * (hash(b.n, 9) - 0.5) * 2 * S.spin,
      bitInk(Math.floor(hash(b.n, 10) * BIT_INK_COUNT)), u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4, S.size);
  }
}
