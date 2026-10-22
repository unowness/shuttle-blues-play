import { CONFIG } from './config.js';
import { drawLocalLabel, drawTargetBrackets, overlaps } from './interface.js';
import { formatCR } from './ruins.js';
import { moneyRuns, hasMoney, drawRuns } from './money.js';
import { UI, uiMetrics } from './uiGrid.js';
import { ROLES } from './roles.js';
import { tr } from './lang.js';

// What is said when a pirate goes down and when a fight ends (World.killPirate,
// World.endEncounter). A fight that ends in a wreck says nothing here: the wreck
// speaks for itself.
// What the clock did to a delivery's pay (CONFIG.delivery), after the amount.
const DELIVERY_TIMING = {
  fast: (t) => ` / FAST +${Math.round(t.change * 100)}%`,
  onTime: () => ' / ON TIME',
  late: (t) => ` / LATE ${Math.round(t.change * 100)}%`,
};
export const deliveryTiming = (timing) => DELIVERY_TIMING[timing?.status]?.(timing) || '';

const PIRATE_DOWN = {
  shot: '', friendly: ' / FRIENDLY FIRE', rock: ' / ROCK', planet: ' / PLANET',
  hole: ' / BLACK HOLE', ram: ' / RAMMED', cargo: ' / CARGO', collision: ' / COLLISION',
};
// What hit the hull, before the points it cost; a rock says nothing (it is the usual).
const HIT_BY = { cargo: 'CARGO HIT / ', planet: 'PLANET / ', droid: 'DROID / ', station: 'STATION / ', npc: 'SHIP / ' };
const ENCOUNTER_ENDED = {
  hole: 'ESCAPED / BLACK HOLE', docked: 'ESCAPED / DOCKED', station: 'PIRATES WITHDREW / STATION',
  lost: 'PIRATES LOST YOU', cleared: 'ALL PIRATES DOWN', routed: 'PIRATES RETREATED',
};

// A label with an amount of money in it: as a plain label is (src/interface.js drawLocalLabel, a cell of air at either side, one
// row), its money in the coin's rim gold.
const MONEY_LABEL = Object.freeze({
  size: (r, label) => ({ w: (label.length + 2) * r.cellW, h: UI.row }),
  draw: (r, label, x, y, ink) => { drawRuns(r, moneyRuns(label, ink), x + r.cellW, y + uiMetrics(r).textY); },
});

// The ink of a label by what happened (design review, 2026-09-30: every label was
// the gains' green, a loss or a hit among them). A gain keeps the active green, a
// hit or a loss by an enemy and an empty tank are in danger, a lesser loss and a
// warning in caution, and news that is neither a gain nor a loss in the primary text.
const TONE = {
  shipDamaged: 'danger', creditsSeized: 'danger', fuelEmpty: 'danger',
  coinsSpilled: 'caution', fuelLow: 'caution', piratesEngaged: 'caution',
  contractAccepted: 'news', docked: 'news', signPlaced: 'news', signRemoved: 'news', flagRemoved: 'news', chalkBought: 'news', tankFull: 'news',
  refueled: 'news', hullRepaired: 'news', droidServed: 'news', shipBought: 'news', shipChanged: 'news', findMarked: 'news', stationInvested: 'news',
  pirateDown: 'news', npcDown: 'danger', encounterEnded: 'news', trafficHail: 'news', pirateShout: 'caution', drifterHelped: 'gain',
  pickupClaimed: 'coin', fuelClaimed: 'fuel', suitcaseTaken: 'news', suitcaseLost: 'danger',
};
export function labelInk(type) {
  const hud = CONFIG.hud;
  switch (TONE[type]) {
    case 'danger': return hud.danger ?? hud.hot;
    case 'caution': return hud.caution ?? hud.hot;
    case 'news': return hud.hot;
    case 'coin': return hud.coinLabel ?? hud.accent;
    case 'fuel': return hud.fuelLabel ?? hud.accent;
    default: return hud.accent;
  }
}

// Fuel taken from a canister: whole units as they are, a part of one to a tenth.
const fuelAmount = (units) => (Number.isInteger(units) ? String(units) : units.toFixed(1));

// Signals, caches, paints, pirates and restorations are said by the page's notices under the navigation
// (labs/graphics/notice.js) since 2026-10-01; a label at the thing would repeat them (SX: «ты не убрал
// повторные нотификации старые»). Coins, fuel and the rest keep their labels.
// Transient presentation consumes committed world events. It never grants
// rewards, runs actions, writes saves or advances simulation time.
// The labels that say a quest ended (what a rescued ship, a freed one, a wreck helped, a suitcase delivered, a raid won or a radio
// step paid) stand longer than the rest (SX, 2026-10-02: «в конце квестов нужно чуть помедленнее говорить о том что он
// выполнен»; they stood 1.8 s, as a coin's label does).
export const QUEST_END_LABELS = new Set(['drifterHelped', 'pesterFreed', 'guidePaid', 'raidWon', 'wreckHelped', 'suitcaseDelivered']);
export const QUEST_END_LIFE = 3.2;

export class Feedback {
  constructor() {
    this.items = [];
    // COMMONS's collage (src/chorus.js chorusLine): the pieces said over the station, newest last (drawChorus).
    this.chorus = [];
    this.reducedMotion = false;
    // How a friendly ship's words and the pilot's greeting are drawn (`greet` on the hail: labs/graphics/greeting.js, GAMEPLAY's
    // GREETING), the page's: (r, world, item) -> the box it took, or null. Without it they are drawn as every hail is (drawHail).
    this.drawGreet = null;
  }

  handle(event, world) {
    if (event.type === 'sectorEntered' || event.type === 'shipWrecked') {
      this.items.length = 0;
      if (event.type === 'sectorEntered') this.chorus.length = 0;
      return false;
    }
    // A piece of COMMONS's collage: it rises over the station with the ones before it (SX's V1 HAIL).
    if (event.type === 'chorusLine') {
      this.chorus.push({ stationId: event.stationId, sectorId: event.sectorId, who: event.who, at: event.at, line: event.line,
        own: !!event.own, faint: !!(event.hole || event.noise), age: 0, life: CONFIG.quests.chorus.line.life });
      if (this.chorus.length > CONFIG.quests.chorus.line.shown * 2) this.chorus.shift();
      return false;
    }
    if (event.alreadySettled) return false;
    const station = world.stations.find(s => s.id === event.stationId);
    const origin = station || world.ship;
    let label;
    switch (event.type) {
      // Taking, recovering and delivering cargo are said by the cargo plates under the navigation (labs/graphics/main.js,
      // SX, 2026-10-01); here only the container's marks light up a moment (cargoAcknowledged), without a label.
      case 'contractAccepted': case 'cargoRecovered':
        this.items.push({ type: event.type, label: null, sectorId: event.sectorId || world.sector.id,
          x: event.x ?? origin.x, y: event.y ?? origin.y, age: 0, life: 0.6 });
        if (this.items.length > 4) this.items.shift();
        return false;
      case 'coinsSpilled': label = `-${event.amount} CR`; break;
      case 'signPlaced': label = Number.isInteger(event.chalk) ? `SIGN LEFT / CHALK ${event.chalk}` : 'SIGN LEFT'; break;
      case 'chalkBought': label = `CHALK +${event.pieces} / -${event.cost} CR`; break;
      case 'signRemoved': label = 'SIGN REMOVED'; break;
      case 'flagRemoved': label = `${event.colour} FLAG REMOVED`; break;
      case 'pickupClaimed': label = `+${event.reward} CR`; break;
      // A Scooby snack (src/specialQuests.js scooby): the count is the plate's, here the one taken.
      case 'snackTaken': label = '+1'; break;
      case 'fuelClaimed': label = `+${fuelAmount(event.gained ?? event.units)} FUEL`; break;
      case 'partClaimed': label = `+${event.gained} HULL`; break;
      case 'tankFull': label = 'TANK FULL'; break;
      // Another pilot's cargo (src/strangers.js) ends with their thanks, said at the station; the pay is the plate's.
      case 'delivered':
        if (!event.thanks) return false;
        label = event.thanks; break;
      case 'docked': label = 'DOCKED'; break;
      // A pirate's hit is seen, not read: sparks and a piece of the hull flying off (src/debris.js chipHull), the HULL gauge
      // going down (SX, 2026-10-01: «Пират, хит и минус 10. Не надо делать этого. Просто покажи искры ... деталь
      // цвета нашего корабля отлетает»).
      case 'shipDamaged':
        if (event.cause === 'pirate') return false;
        label = `${HIT_BY[event.cause] || ''}-${event.amount} HULL`; break;
      case 'pirateDown':
        label = `${CONFIG.pirates.types[event.kind]?.label || 'PIRATE'} DOWN${PIRATE_DOWN[event.cause] || ''}`;
        break;
      // A friendly ship run into hard enough to break (src/npcFleet.js Fleet.hurt).
      case 'npcDown': label = `${event.label || 'SHIP'} DESTROYED`; break;
      case 'creditsSeized': label = `PIRATES TOOK ${event.amount} CR`; break;
      case 'refueled': label = event.cost > 0 ? `REFUELED / -${event.cost} CR` : 'REFUELED / FREE'; break;
      case 'fuelLow': label = 'FUEL LOW'; break;
      case 'fuelEmpty': label = 'FUEL EMPTY / LOW THRUST'; break;
      case 'encounterEnded':
        if (!ENCOUNTER_ENDED[event.cause]) return false;
        label = ENCOUNTER_ENDED[event.cause];
        break;
      // The home garage mends the hull for nothing (src/home.js).
      case 'hullRepaired': label = event.cost > 0 ? `HULL REPAIRED / -${event.cost} CR` : 'HULL REPAIRED / FREE'; break;
      // A droid's service (src/droids.js), said at the droid.
      case 'droidServed': label = `${event.kind === 'fuel' ? `+${event.units} FUEL` : `+${event.units} HULL`} / -${event.cost} CR`; break;
      case 'shipBought': label = `${event.label} BOUGHT / -${formatCR(event.price)} CR`; break;
      case 'shipChanged': label = `SHIP SELECTED / ${event.label}`; break;
      // A ruin restored in one payment (src/ruins.js), and a find marked (src/rewards.js).
      // A part put into a ruin, and how far along it is; its restoration is a notice (labs/graphics/main.js).
      // (The support's building is not the wallet's: +n CR built into it, src/starterSupport.js.)
      case 'stationInvested': label = event.by === 'support' ? `+${formatCR(event.amount)} CR FUNDED / ${Math.floor(event.share * 100)}%`
        : `-${formatCR(event.amount)} CR / FUNDED ${Math.floor(event.share * 100)}%`; break;
      case 'findMarked': label = `MARKED / ${event.label}`; break;
      // A hail is said by the craft itself (drawHail): its line up a slash from it, `life` s (its own where it says: CLIPPER's crew's, read by
      // their length, src/clipper.js readLife); a friendly ship's and the pilot's greeting (`greet`)
      // in GAMEPLAY's GREETING style (this.drawGreet). Its rows broken once here; `rows` (a planet's three lines, src/errands.js) are
      // said as they stand, not broken to fit. `box` the place it took, kept (labs/graphics/greeting.js).
      // (Its words in the pilot's language, src/lang.js tr, before its rows are broken.)
      case 'trafficHail': {
        const line = tr(event.line);
        const item = { type: event.type, label: `${event.label}: ${line}`, sectorId: event.sectorId || world.sector.id,
          x: event.x ?? origin.x, y: event.y ?? origin.y, age: 0, life: event.life ?? HAIL.life, box: null,
          hail: { craftId: event.craftId, name: tr(event.label), line, rows: event.rows?.map(tr) ?? hailRows(line), greet: !!event.greet, to: event.to ?? null, angry: !!event.angry } };
        this.items = this.items.filter((it) => !(it.hail && it.hail.craftId === event.craftId));
        this.items.push(item);
        if (this.items.length > 4) this.items.shift();
        return true;
      }
      // A pirate's shout (src/pirates.js pirateShout, SX 2026-10-02: «выкрики короткие») stands with it as a hail does,
      // shorter, in the caution ink a pirate's guns are.
      case 'pirateShout': {
        const line = tr(event.line);
        const item = { type: event.type, label: line, sectorId: event.sectorId || world.sector.id,
          x: event.x ?? origin.x, y: event.y ?? origin.y, age: 0, life: CONFIG.pirates.personas.life,
          hail: { craftId: event.pirateId, name: null, line } };
        this.items = this.items.filter((it) => !(it.hail && it.hail.craftId === event.pirateId));
        this.items.push(item);
        if (this.items.length > 4) this.items.shift();
        return true;
      }
      // A pilot out of fuel helped (src/quests.js): what it cost the tank and paid, at the craft.
      // Its plea is answered: it is no longer said.
      case 'drifterHelped':
        this.items = this.items.filter((it) => !(it.hail && it.hail.craftId === 'drifter'));
        label = `-${event.fuel} FUEL / +${event.pay} CR`; break;
      // The second round of quests (QUESTS_V2_HANDOFF.md): what a rescue paid, what was given to a wreck, a suitcase taken,
      // delivered or lost, said at the thing. A ship freed is thanked by its hail; the plate says the rest.
      case 'pesterFreed': label = `+${formatCR(event.pay)} CR`; break;
      // The radio's thanks for a step done, and a raid won's pay (the quest economy), said where the pilot or the station is.
      case 'guidePaid': label = `+${formatCR(event.pay)} CR / RADIO`; break;
      case 'raidWon': label = `+${formatCR(event.pay)} CR`; break;
      case 'wreckHelped': label = `-${formatCR(event.ask)} CR`; break;
      case 'suitcaseTaken': label = 'SUITCASE ABOARD'; break;
      case 'suitcaseDelivered': label = `+${formatCR(event.pay)} CR`; break;
      case 'suitcaseLost': label = 'SUITCASE LOST'; break;
      // COMMONS's chain (src/chorus.js): a recorder taken, at it; a voice played back, what it paid, at the station.
      case 'chorusTaken': label = 'RECORDER ABOARD'; break;
      case 'chorusVoiceBack': label = `+${formatCR(event.pay)} CR`; break;
      // A ship boarded has said its three lines (src/specials.js): they go.
      case 'specialBoarded':
        this.items = this.items.filter((it) => !(it.hail && it.hail.craftId === 'special-ship'));
        return false;
      case 'outatime': label = 'OUTATIME'; break;
      default: return false;
    }
    const item = { type: event.type, label, sectorId: event.sectorId || world.sector.id,
      x: event.x ?? origin.x, y: event.y ?? origin.y, age: 0, life: QUEST_END_LABELS.has(event.type) ? QUEST_END_LIFE : 1.8 };
    this.items.push(item);
    if (this.items.length > 4) this.items.shift();
    return true;
  }

  step(dt) {
    for (const item of this.items) item.age += Math.max(0, dt);
    this.items = this.items.filter(item => item.age < item.life);
    for (const piece of this.chorus) piece.age += Math.max(0, dt);
    if (this.chorus.length && this.chorus[0].age >= this.chorus[0].life) this.chorus = this.chorus.filter((p) => p.age < p.life);
  }

  get cargoAcknowledged() {
    return this.items.some(item =>
      (item.type === 'contractAccepted' || item.type === 'cargoRecovered') && item.age < 0.6);
  }

  draw(r, world, avoid = []) {
    const occupied = [...avoid];
    // Newest outcomes have first choice of label placement.
    for (const item of [...this.items].reverse()) {
      if (item.sectorId !== world.sector.id) continue;
      if (!item.label) continue;
      if (item.hail) {
        const box = item.hail.greet && this.drawGreet ? this.drawGreet(r, world, item, occupied) : drawHail(r, world, item, occupied);
        if (box) occupied.push(box);
        continue;
      }
      const anchor = item.type === 'contractAccepted' ? world.cargo || world.ship : item;
      const p = world.project(r, anchor.x, anchor.y);
      if (p.x < r.view.x || p.x > r.view.x + r.view.w || p.y < r.view.y || p.y > r.view.y + r.view.h) continue;
      const t = Math.min(1, item.age / 0.45);
      const objectBox = { x: p.x - 36, y: p.y - 36, w: 72, h: 72 };
      // A coin picked up shows no burst: its six marks were the gains' green round it, the green SX had taken off the coins' labels
      // (2026-10-02: «надписи от них не должны быть зеленые»; 2026-10-06: «при сборе монеток снова показываются зеленые тексты»). Its
      // dim gold «+1 CR» stays. A Scooby snack is taken as a coin is: its «+1» alone (its crunch is its crumbs, src/scoobySnacks.js).
      if (!this.reducedMotion && t < 1 && item.type !== 'pickupClaimed' && item.type !== 'snackTaken') {
        if (item.type === 'fuelClaimed' || item.type === 'partClaimed') {
          const radius = 9 + 26 * (1 - t) ** 2;
          for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            const x = p.x + Math.cos(angle) * radius, y = p.y + Math.sin(angle) * radius;
            const foot = { x: x - r.cellW / 2, y: y - r.cellH / 2, w: r.cellW, h: r.cellH };
            if (foot.x >= r.view.x && foot.y >= r.view.y
              && foot.x + foot.w <= r.view.x + r.view.w
              && foot.y + foot.h <= r.view.y + r.view.h
              && !occupied.some(b => overlaps(foot, b))) {
              r.glyphNow(i % 2 ? '·' : '+', x, y, CONFIG.hud.accent);
            }
          }
        } else {
          drawTargetBrackets(r, objectBox, CONFIG.hud.hot, 14 * (1 - t) ** 2, occupied);
        }
      }
      // An amount of money in the coin's rim gold (S4, src/money.js) where the label is a gain or news; a warning or a loss keeps its
      // ink whole (PIRATES TOOK, coins spilled), and so does the coin's own «+1 CR».
      const tone = TONE[item.type] ?? 'gain';
      const gold = (tone === 'gain' || tone === 'news') && hasMoney(item.label);
      const box = drawLocalLabel(r, item.label, p, [...occupied, objectBox], labelInk(item.type), 50, gold ? MONEY_LABEL : null);
      if (box) occupied.push(box);
    }
    // (Not while COMMONS's window writes them as a script: `quietChorus`, the page's, labs/graphics/talk-beat.js.)
    const chorus = this.quietChorus ? null : drawChorus(r, world, this.chorus);
    if (chorus) occupied.push(chorus);
    return occupied;
  }
}

// COMMONS's collage over the station (src/chorus.js; SX's V1 HAIL on labs/graphics/sketches/commons-voice.html, 2026-10-15: «hail над
// станцией»): from the ring's upper shoulder a slash rises as a hail's does, and on it stand the newest `shown` pieces, the newest at the
// slash and the older above it, fading; each a recording's tag (who) over its line in capitals, a missing recording and the
// static faint, and the AI's own words lowercase in the station's hue with no tag. Mirrored to the left where the right leaves the view.
function drawChorus(r, world, pieces) {
  if (!pieces.length) return null;
  const station = world.stations.find((s) => s.id === pieces.at(-1).stationId);
  if (!station || pieces.at(-1).sectorId !== world.sector.id) return null;
  const shown = pieces.filter((p) => p.age < p.life).slice(-CONFIG.quests.chorus.line.shown);
  if (!shown.length) return null;
  const p = world.project(r, station.x, station.y), v = r.view, row = r.cellH, pad = HAIL.pad;
  // (The station as the camera draws it: its zoom, src/zoom.js.)
  const z = r.zoom ?? 1, f = station.footprint;
  const halfW = (f ? (f.model.width * r.cellW * f.scale) / 2 : 120) * z, halfH = (f ? (f.model.height * r.cellH * f.scale) / 2 : 80) * z;
  // Each piece: its tag (none for the AI's own words, the static or a gap) over its line in capitals (the AI's own lowercase).
  const blocks = shown.map((piece) => {
    const text = piece.own || piece.faint ? [piece.line] : hailRows(piece.line.toUpperCase());
    // (The resident's short name alone, no recording's time: SX's V2, 2026-10-22, src/chorus.js.)
    const tag = piece.own || piece.faint ? null : piece.who;
    return { piece, tag, text, h: (text.length + (tag ? 1 : 0)) * row };
  });
  const width = Math.max(...blocks.flatMap((b) => [...b.text, b.tag ?? ''].map((t) => t.length))) * r.cellW;
  const height = blocks.reduce((h, b) => h + b.h, 0) + (blocks.length - 1) * row * 0.8;
  const rise = HAIL.rise * row * 1.5, run = rise / 2;
  const dir = p.x + halfW * 0.45 + run + pad + width > v.x + v.w ? -1 : 1;
  const sx = p.x + dir * halfW * 0.45, sy = p.y - halfH * 0.45, ex = sx + dir * run, ey = sy - rise;
  // Where the stack would leave the view (the ring near its edge, or off it), it is kept inside, at the edge toward the ring, with no slash.
  let tx = dir > 0 ? ex + pad : ex - pad - width, bottom = ey;
  const x0 = v.x + pad, x1 = v.x + v.w - pad - width, y0 = v.y + pad + height, y1 = v.y + v.h - pad;
  const kept = Math.min(Math.max(tx, x0), Math.max(x0, x1)), held = Math.min(Math.max(bottom, y0), Math.max(y0, y1));
  const moved = Math.abs(kept - tx) > 0.5 || Math.abs(held - bottom) > 0.5;
  tx = kept; bottom = held;
  const newest = shown.at(-1);
  if (!moved) {
    const ctx = r.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, newest.age / HAIL.fade);
    ctx.strokeStyle = CONFIG.hud.color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5); ctx.lineTo(Math.round(ex) + 0.5, Math.round(ey) + 0.5); ctx.stroke();
    ctx.restore();
  }
  let y = bottom;
  for (let k = blocks.length - 1; k >= 0; k--) {
    const { piece, tag, text } = blocks[k], older = blocks.length - 1 - k;
    const a = Math.max(0, Math.min(1, piece.age / HAIL.fade, (piece.life - piece.age) / HAIL.fade)) * (1 - older * 0.3);
    y -= text.length * row;
    const ink = piece.own ? CONFIG.quests.chorus.art.own : piece.faint ? ROLES.textHint : ROLES.textPrimary;
    if (a > 0) text.forEach((t, j) => r.text(t, tx, y + j * row, ink, a));
    if (tag) { y -= row; if (a > 0) r.text(tag, tx, y, ROLES.textSecondary, a); }
    y -= row * 0.8;
  }
  const top = bottom - height;
  return { x: tx - pad, y: top - pad, w: width + 2 * pad, h: height + 2 * pad };
}

// A craft's hail (SX, 2026-10-01: «как говорят при встрече ... делал слэш снизу и надпись какую-то сверху с небольшим
// затемнением ... можно в две строки фразу, но когда фраза вылетает, она как слишком далеко сразу от корабля
// отлетает»). It was a label placed wherever it fitted, often far from the craft. Now it stays with the craft as it
// flies: from the craft's shoulder a slash rises `rise` rows at the interface's 2:1 slant, and on it stands the line,
// in one row or two of at most `wrap` cells, on its text's shadow (src/textShadow.js; it stood over a black at 0.62 until
// 2026-10-02, then on the shadow of every shape until 2026-10-06). The craft's name is not repeated: the world writes it under the craft while the pilot is near. It lasts
// `life` s and fades in and out over `fade` s. Up and to the right first; up and to the left where that would leave the view or cover the
// interface, a planet or a station (hailBodies); never under the craft (drawHail).
export const HAIL = Object.freeze({ life: 4.5, rise: 1.6, wrap: 22, fade: 0.35, pad: 4 });

// The line in one row, or in two where it is longer than `wrap` cells: broken between words, as evenly as it goes,
// and after a full stop or a comma where one is near the middle ("STILL FLYING. / STILL BROKE.").
export function hailRows(line, wrap = HAIL.wrap) {
  const text = String(line);
  if (text.length <= wrap) return [text];
  let best = null;
  for (let i = text.indexOf(' '); i > 0; i = text.indexOf(' ', i + 1)) {
    const a = text.slice(0, i), b = text.slice(i + 1);
    const score = Math.max(a.length, b.length) - (/[.,!?]$/.test(a) ? 4 : 0);
    if (!best || score < best.score) best = { score, rows: [a, b] };
  }
  return best ? best.rows : [text];
}

// What a hail stands clear of besides the interface (SX, 2026-10-21: «нам бы сделать так чтобы тексты на станции и планеты не налезались»):
// every planet on the screen, its disc to its rim (src/bodies.js Planet.rim; a circle, since its square would keep the words off the
// sky at its corners) and its name where it stands now (World.planetLabelAt), and every station, the box its drawing takes (`footprint`, as
// its menu stands clear of it) and its external dock's module at rest (`footprint.dock`); a neighbouring sector's too, as drawn beyond
// the seam (World.drawNeighbour). On `r`'s px, as the camera draws them (src/zoom.js). Filled into the module's scratch shapes (a disc
// { cx, cy, rad }, a box { x, y, w, h }); returns how many there are.
const BODIES = [];
const LAYER = { cellW: 0, cellH: 0, textScale: 1 };       // the world's layer's measures, for World.planetLabelAt
function shapeAt(n) { return BODIES[n] ?? (BODIES[n] = { cx: 0, cy: 0, rad: 0, x: 0, y: 0, w: 0, h: 0 }); }
function putDisc(n, cx, cy, rad) { const s = shapeAt(n); s.cx = cx; s.cy = cy; s.rad = rad; s.w = 0; return n + 1; }
function putBox(n, x, y, w, h) { const s = shapeAt(n); s.rad = 0; s.x = x; s.y = y; s.w = w; s.h = h; return n + 1; }
function onView(v, x, y, reach) { return x + reach >= v.x && x - reach <= v.x + v.w && y + reach >= v.y && y - reach <= v.y + v.h; }
function bodiesOf(r, world, planets, stations, ox, oy, n) {
  const v = r.view, z = r.zoom ?? 1;
  LAYER.cellW = r.cellW; LAYER.cellH = r.cellH; LAYER.textScale = 1 / z;
  for (const p of planets) {
    const s = world.projectBody(r, p.x + ox, p.y + oy), rad = p.rim * z;
    if (!onView(v, s.x, s.y, rad + (p.label?.length ?? 0) * r.cellW + 3 * r.cellH)) continue;
    n = putDisc(n, s.x, s.y, rad);
    // Its name, drawn on the world's layer in its units (World.drawPlanetLabel): the place there, on the page's px.
    if (p.label) { const at = world.planetLabelAt(LAYER, p, { x: s.x / z, y: s.y / z }); n = putBox(n, at.x * z, at.y * z, p.label.length * r.cellW, r.cellH); }
  }
  for (const st of stations) {
    const art = st.footprint ?? { model: st.model, scale: st.model.scale }, cw = r.cellW * art.scale * z, ch = r.cellH * art.scale * z;
    const cx = world.projectX(r, st.x + ox) + (art.dx ?? 0) * r.cellW * z, cy = world.projectY(r, st.y + oy) + (art.dy ?? 0) * r.cellH * z;
    // Turned in the float (src/float.js): the box round the turned one.
    const c = Math.abs(Math.cos(st.angle || 0)), sn = Math.abs(Math.sin(st.angle || 0));
    const w0 = art.model.width * cw, h0 = art.model.height * ch, w = w0 * c + h0 * sn, h = w0 * sn + h0 * c;
    if (!onView(v, cx, cy, Math.max(w, h))) continue;
    n = putBox(n, cx - w / 2, cy - h / 2, w, h);
    const d = art.dock;
    if (d) n = putBox(n, cx + d.x * r.cellW * z, cy + d.y * r.cellH * z, d.w * r.cellW * z, d.h * r.cellH * z);
  }
  return n;
}
export function hailBodies(r, world) {
  let n = bodiesOf(r, world, world.planets ?? [], world.stations ?? [], 0, 0, 0);
  for (const nb of world.neighbours ?? []) {
    const b = world.sectorBodies(nb.sector);
    n = bodiesOf(r, world, b.planets, b.stations, nb.ox, nb.oy, n);
  }
  return n;
}
// Whether `box` comes within `gap` px of shape `s` (a disc by its nearest point to the box, a box as `overlaps` has it).
function meets(box, s, gap = 6) {
  if (!s.rad) return overlaps(box, s, gap);
  const dx = Math.max(box.x - s.cx, 0, s.cx - box.x - box.w), dy = Math.max(box.y - s.cy, 0, s.cy - box.y - box.h);
  return dx * dx + dy * dy < (s.rad + gap) ** 2;
}
// The shapes `hailBodies` filled, as a list (for a check, and for a sketch that wants to draw them).
export const hailShapes = (r, world) => BODIES.slice(0, hailBodies(r, world)).map((s) => (s.rad ? { cx: s.cx, cy: s.cy, rad: s.rad } : { x: s.x, y: s.y, w: s.w, h: s.h }));

// `name` over the words (the hail's own unless given; null for none) in `nameInk`: a friendly ship's words and the pilot's greeting are drawn
// here too (labs/graphics/greeting.js drawGreetAnswer).
export function drawHail(r, world, item, occupied = [], name = item.hail.name ?? null, nameInk = ROLES.textSecondary) {
  const at = world.craftAt?.(item.hail.craftId);
  if (at) { item.x = at.x; item.y = at.y; }
  const p = world.project(r, item.x, item.y);
  const v = r.view, row = r.cellH;
  // How far the craft's drawing reaches from its middle: the shoulder the slash starts from.
  const craft = at?.craft;
  const half = (craft ? Math.max(craft.rows[0].length * r.cellW, craft.rows.length * row) * craft.scale / 2 : 40) * (r.zoom ?? 1);     // (as drawn: src/zoom.js)
  const alpha = Math.max(0, Math.min(1, item.age / HAIL.fade, (item.life - item.age) / HAIL.fade));
  if (alpha <= 0) return null;
  // Its name a row over its words, in the quiet ink (SX, 2026-10-16: «имя там приглушенная фразочка белая»); the world writes none under it.
  const rows = item.hail.rows ?? hailRows(item.hail.line), head = name ? 1 : 0;
  const width = Math.max(name ? name.length : 0, ...rows.map((t) => t.length)) * r.cellW, height = (rows.length + head) * row;
  const shoulder = half * 0.55, rise = HAIL.rise * row * 1.5, run = rise / 2;
  const bodies = hailBodies(r, world);
  const place = (dir, up) => {
    const sx = p.x + dir * shoulder, sy = p.y - up * shoulder;
    const ex = sx + dir * run, ey = sy - up * rise;
    const tx = dir > 0 ? ex + HAIL.pad : ex - HAIL.pad - width, ty = up > 0 ? ey - height : ey + HAIL.pad;
    const box = { x: tx - HAIL.pad, y: ty - HAIL.pad, w: width + 2 * HAIL.pad, h: height + 2 * HAIL.pad };
    const across = box.x >= v.x && box.x + box.w <= v.x + v.w;
    const inside = across && box.y >= v.y && box.y + box.h <= v.y + v.h;
    let clear = true;
    for (let k = 0; k < bodies && clear; k++) clear = !meets(box, BODIES[k]);
    return { dir, sx, sy, ex, ey, tx, ty, box, across, ok: inside && !occupied.some((o) => overlaps(box, o)), clear };
  };
  // Always over the craft (SX, 2026-10-22: «баблы, появляются то снизу корабля, то сверху ... тяжело текст прочитать, потому что он мигает на
  // экране ... чтобы игрок, пользователь был готов всегда тексты читать сверху, а не снизу»; the two lower corners were tried too until then):
  // up and to the right or up and to the left, the first off the interface and off the planets and stations, else off the interface alone,
  // else the first whose box keeps inside the view across; and once a line has taken a side it keeps it (`item.side`) while it stays off the
  // interface, or while the other side is no better, so it does not jump from frame to frame as bodies pass. Near the view's top it is held
  // inside it, over the craft as far as it goes.
  const sides = item.side ? [item.side, -item.side] : [1, -1], tries = sides.map((d) => place(d, 1));
  const kept = item.side && (tries[0].ok || (!tries[1].ok && tries[0].across)) ? tries[0] : null;
  const at0 = kept ?? tries.find((t) => t.ok && t.clear) ?? tries.find((t) => t.ok) ?? tries.find((t) => t.across) ?? tries[0];
  item.side = at0.dir;
  const down = Math.max(0, v.y - at0.box.y);
  const { sx, sy, ex, tx } = at0, ey = Math.min(at0.ey + down, sy), ty = at0.ty + down, box = { ...at0.box, y: at0.box.y + down };
  if (box.x + box.w < v.x || box.x > v.x + v.w || box.y + box.h < v.y || box.y > v.y + v.h) return null;
  // No darkened box since 2026-10-02: the line stands on its text's shadow (src/textShadow.js, the labels' group; SX: «на тексте ...
  // в тех местах, где не надо прям заливку делать»). `box` is still the place it takes.
  const ctx = r.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = CONFIG.hud.color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(Math.round(sx) + .5, Math.round(sy) + .5); ctx.lineTo(Math.round(ex) + .5, Math.round(ey) + .5); ctx.stroke();
  ctx.restore();
  if (name) r.text(name, tx, ty, nameInk, alpha);
  rows.forEach((t, k) => r.text(t, tx, ty + (k + head) * row, labelInk(item.type), alpha));
  return box;
}
