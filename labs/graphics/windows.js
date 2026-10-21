// The centred windows: the pilot card (C), a station's INFO, the hangar (HANGAR at a garage), the sign composer (L) and the controls list (?), all on
// the organism since SX's sketch W-ORG of 2026-10-16 (labs/graphics/organism.js: the frame, the service `S` off its lines, the content `C` off any line,
// the ladder's sizes, the monochrome inks, the keys' tiers with ESC first at the foot's left, the shares as rows of squares, the focus bar under the
// pointer; before it the Swiss manner of 2026-10-09). Each is the page's spec of it with the game's own data and state: what the keys chose (a
// souvenir, a ship, a word), the last action's message, the name being typed.
// Presentation only, as the panels they replace were (src/pilotPanel.js, src/stationPanel.js, src/hangarPanel.js, src/signPanel.js
// keep their words: what each window holds): what a key or a click does is the screens registry's (labs/graphics/screens.js), which reads the
// boxes each window returns. The flight goes on underneath every one.
import { CONFIG } from '../../src/config.js';
import { ROLES } from '../../src/roles.js';
import { UI } from '../../src/uiGrid.js';
import { COMPACT_NAMES, fitText } from '../../src/interface.js';
import { COLLECTIBLES, WORDS } from '../../src/progression.js';
import { findDef } from '../../src/rewards.js';
import { sectorById, stationDefById } from '../../src/sectors.js';
import { shipById, shipModel } from '../../src/hangar.js';
import { shipLookModel } from '../../src/shipLooks.js';
import { journey, CHARM_NONE } from '../../src/pilot.js';
import { paintById } from '../../src/paint.js';
import { lookById } from '../../src/looks.js';
import { specialById, specialModel } from '../../src/specialShips.js';
import { formatCR, workingKind, rebuiltShare } from '../../src/ruins.js';
import { wrap } from '../../src/pilotPanel.js';
import { shipStats, fleetOf, fleetAction, FLEET, HANGAR_SQUARES } from '../../src/hangarPanel.js';
import { stationStatus, stationOffers } from '../../src/stationPanel.js';
import { stationInfo, stationLoreNow } from '../../src/stationInfo.js';
import { draftCaption, WORDS_PER_ROW } from '../../src/signPanel.js';
import { SIGN_LIMIT, SIGN_TYPES, signTypeLabel, drawSign } from '../../src/signs.js';
import { drawShipIn, sharedScale, modelScale } from '../../src/shipAvatar.js';
import { heightAt, LIFT } from '../../src/trick.js';
import { FLIGHT } from '../../src/flightConfig.js';
import { mulberry32, TAU } from '../../src/util.js';
import { PICTURE } from '../../src/souvenirPictures.js';
import { balancedCells, largestCells, drawSouvenirCentred } from '../../src/souvenirArt.js';
import { keyName, helpColumns, helpIntro, SCHEMES, SCHEME_NAMES, DEFAULT_SCHEME } from '../../src/controls.js';
import { noteKey } from './clicks.js';
import { drawStationTrue, stationShotAt } from './world-art.js';
import { keyTokens } from './swiss.js';
import { Win, ORG, INK, len, money, partLen, selectMark } from './organism.js';

const NAME_COLS = 14;                       // the name field's columns: a name's twelve letters (src/pilot.js) and two

// ================================================================================================================================
// The pilot card (C), on the organism
// ================================================================================================================================

// SX's sketch W-ORG R3 (2026-10-16, labs/graphics/organism.js; before it his V5 ONE PAGE of 2026-10-13): the ladder's L, 960 x 720, two panes.
//   the pilot's (`left` columns): the name with its N RENAME beside it; the ship flown drawn in a square as tall as its four figures beside it
//   (its class and its role went: SX, «я бы удалил ... сделал бы там компактнее»); the four switches (PAINT, COCKPIT, LOOK, CHARM, each VALUE ‹ ›:
//   a click steps one, on its ‹ back, and ← → step the one under the pointer); the collection, each part its name and its count over a row of
//   squares across the column (SX: «на всю ширину», «4/12 без пробелов»); the tallies; the JOURNEY at the foot, the share of it all.
//   the collection's: SOUVENIRS and their count, two shelves of six true squares, the gap between them `S` across and down (SX: «в два раза
//   меньше отступ»), the chosen one a whole white line, the others dashes; each souvenir's ink centred in its square and sized to one visual
//   weight on whole pixels at its art's own cell (src/souvenirArt.js balancedCells), no more than `inner` of the side; under them the chosen
//   one: its name, its lore, where it was found, and its picture large at the right, frameless (SX: «там вообще не должно быть квадратика»);
//   then WORDS and its count, the words as running text, one not found faint stars as long as it.
// Inside a pane a name to its things and a block to the next `C`, the lines of a block a row apart.
export const CARD = Object.freeze({
  size: 'L', left: 24,                          // the ladder's size; the pilot's pane's columns
  across: 6,                                    // souvenirs a shelf: the arrows' ↑ ↓ step this many (labs/graphics/screens.js pilotKeys)
  inner: 0.7,                                   // a souvenir's ink at most this share of its square's side: (1 - inner) / 2 of air to the line
  figures: 4,                                   // the ship's figures, its square as tall as they are
  loreRows: 4,                                  // the chosen souvenir's lore, at most
});

// The words as running text `n` columns a line: each line's words.
function wordLines(words, n) {
  const lines = [[]];
  let at = 0;
  for (const wd of words) {
    const l = len(wd.text);
    if (at && at + 1 + l > n) { lines.push([]); at = 0; }
    lines.at(-1).push(wd); at += (at ? 1 : 0) + l;
  }
  return lines;
}

// A share as its name, its count at the column's right and its row of squares under them. Returns the squares' bottom.
function shareRow(win, p, Y, name, count, share, countInk = INK.label) {
  win.text(name, p.cx, Y, INK.label);
  win.text(count, p.cxr, Y, countInk, { right: true });
  return win.squares(Y + win.cap + ORG.under, share, { x0: p.cx, x1: p.cxr });
}

// `ui`: the screens registry's pilotUI ({ selected, editing, message, lore }). Returns the boxes the registry reads: `nameBox` (where the name
// field stands while the name is typed: on the name), `paintBox`, `cockpitBox`, `lookBox`, `charmBox` (the switches' rows, a click steps
// them, as P, K, L and J do) and `backs` (each one's ‹, a click on it steps back), `tiles` ([{ index, box }], a click chooses), and the window's `box`.
export function drawPilotCard(r, world, ui) {
  const win = new Win(r, { size: CARD.size, panes: [CARD.left, { fill: true }], keyFirst: [true, false], id: 'card' }).place().sheet();
  const { cw, m, cap } = win, P = world.pilot, j = journey(world), dpr = r.dpr || 1, [a, b] = win.panes;
  win.head([['PILOT CARD', INK.text]]);

  // The pilot's pane. The name (an HTML field takes its place while it is typed: its text inside its 1 px border and its pad on the name, room
  // for a name's twelve letters and two), N RENAME at the pane's right.
  const nameY = a.y(0);
  if (!ui.editing) win.text(P.nickname, a.cx, nameY, INK.text);
  const nameBox = { x: a.cx - m.capLeft - 1 - UI.pad, y: Math.round(nameY - m.capTop - (UI.row - r.cellH) / 2), w: NAME_COLS * cw + 2 * (1 + UI.pad), h: UI.row };
  const renameKey = keyName('rename') || 'rename', renameW = win.keyWidth(renameKey, 'RENAME'), renameX = a.cxr - renameW;
  if (!ui.editing) {
    const box = win.rowBox(renameX, a.cxr, nameY);
    noteKey(renameKey, box, r);
    win.item('key:rename', box, (on) => { if (on) win.bar(renameX, a.cxr, nameY); win.key(renameX, nameY, renameKey, { words: 'RENAME', wordsInk: INK.label, plate: on }); });
  }
  // The ship flown, in a square as tall as its figures, frameless; its figures beside it, each its label and its number at the pane's right.
  const def = shipById(world.hangar?.flying) ?? shipById('standard');
  const fig = Object.fromEntries(shipStats(def.id).map((x) => [x.key, x.text]));
  let k = a.next(nameY - win.keyTop + win.keyH);
  const sqTop = Math.round(a.y(k)), side = Math.round(a.yb(k + CARD.figures - 1)) - sqTop;
  drawShipIn(r, world.ship.model, { x: Math.round(a.cx), y: sqTop, w: side, h: side }, { paint: P.paint, largest: 8 });
  const tx = Math.round(a.cx) + side + ORG.C;
  [['SPD', fig.speed], ['TURN', fig.turn], ['HULL', fig.hull], ['TANK', fig.tank]].forEach(([label, v], i) => {
    win.text(label, tx, a.y(k + i), INK.label);
    win.text(String(v), a.cxr, a.y(k + i), INK.text, { right: true });
  });
  // The switches, a row each: the label, VALUE ‹ › flush right. The row is a button: the focus bar under the pointer.
  k = a.next(a.yb(k + CARD.figures - 1));
  const hung = P.charm !== CHARM_NONE && P.charm !== null ? COLLECTIBLES.find((d) => d.id === P.charm) : null;
  const switches = [
    ['paint', 'PAINT', paintById(P.paint)?.label ?? 'STANDARD'],
    ['cockpit', 'COCKPIT', P.cockpit ? specialById(P.cockpit)?.cockpit.label ?? 'STANDARD' : 'STANDARD'],
    ['look', 'LOOK', lookById(P.look)?.name ?? 'NOW'],
    ['charm', 'CHARM', hung ? COMPACT_NAMES[hung.id] ?? hung.label : 'NONE'],
  ];
  const backs = {};
  switches.forEach(([id, label, said], i) => {
    const Y = a.y(k + i), value = fitText(said, a.cols - len(label) - 6), row = win.rowBox(a.cx, a.cxr, Y);
    backs[id] = win.choiceBack(a.cxr, Y);
    win.item(id, row, (on) => {
      if (on) win.bar(a.cx, a.cxr, Y);
      win.text(label, a.cx, Y, INK.label, { plate: on });
      win.choice(a.cxr, Y, value, { plate: on });
    });
  });
  // The collection: each part's name, its count, its squares; the next part a row's step under the squares.
  let y = a.y(a.next(a.yb(k + switches.length - 1)));
  for (const it of j.rows) y = shareRow(win, a, y, it.label, `${it.have}/${it.of}`, it.have / Math.max(1, it.of)) + (UI.row - cap);
  // The tallies, then the journey.
  k = a.next(y - (UI.row - cap));
  const tallies = [['CARGO RECOVERED', j.recovered], ['CARGO RESCUED', j.rescued], ['WRECKS', world.wrecks ?? 0]];
  tallies.forEach(([label, v], i) => { win.text(label, a.cx, a.y(k + i), INK.label); win.text(String(v), a.cxr, a.y(k + i), INK.text, { right: true }); });
  shareRow(win, a, a.y(a.next(a.yb(k + tallies.length - 1))), 'JOURNEY', `${Math.round(j.progress * 100)}%`, j.progress, INK.text);

  // The collection's pane. SOUVENIRS and its count, its two shelves: a found one its art, an empty one the cross; the keys' choice and the
  // pointer's the whole white line, the others the dashes.
  b.label(0, 'SOUVENIRS', `${world.collection.discovered.size}/${COLLECTIBLES.length}`);
  const shelves = Math.ceil(COLLECTIBLES.length / CARD.across);
  const first = b.cells(CARD.across, b.yb(0) + ORG.C), sideT = first[0].w;
  const cells = balancedCells(COLLECTIBLES.map((d) => d.id), Math.floor(sideT * CARD.inner), dpr);
  const selected = Math.max(0, Math.min(COLLECTIBLES.length - 1, ui.selected ?? 0));
  const alphaOf = (id) => (world.collection.copiesOf(id) ? 1 : 0.45) * PICTURE.alpha;
  const tiles = [];
  let shelfBottom = first[0].y;
  for (let s = 0; s < shelves; s++) {
    const row = s ? b.cells(CARD.across, shelfBottom + ORG.S) : first;
    shelfBottom = row[0].y + row[0].h;
    row.forEach((sq, i) => {
      const n = s * CARD.across + i, d = COLLECTIBLES[n];
      if (!d) return;
      tiles.push({ index: n, box: sq });
      win.item(`tile:${d.id}`, sq, (on) => {
        const known = world.collection.discovered.has(d.id);
        win.cell(sq, { chosen: on || n === selected, cross: !known });
        if (known && cells[d.id]) drawSouvenirCentred(r, d.id, sq, cells[d.id].c, alphaOf(d.id));
      });
    });
  }
  // The chosen one: its name, its lore and where it was found at the left, its picture large at the right, as wide as two squares and their gap.
  const sel = COLLECTIBLES[selected], known = world.collection.discovered.has(sel.id);
  const inst = world.collection.instances.find((x) => x.defId === sel.id && x.source), cache = inst && findDef(inst.source, world.ledger);
  const big = Math.round(2 * sideT + ORG.S);
  k = b.next(shelfBottom);
  const picture = { x: Math.round(b.cxr) - big, y: Math.round(b.y(k)), w: big, h: big };
  const textCols = Math.floor((picture.x - ORG.C - b.cx + 2 * m.capLeft) / cw);
  win.text(known ? sel.label : '???', b.cx, b.y(k), INK.text);
  const lore = wrap(known ? ui.lore?.[sel.id]?.lore ?? '' : 'Not found. Search the caches.', textCols, CARD.loreRows);
  lore.forEach((s, i) => win.text(s, b.cx, b.y(k + 1 + i), INK.label));
  if (known && cache) win.text(fitText(`CACHE, ${sectorById(cache.sector)?.label ?? cache.sector}`, textCols), b.cx, b.y(b.next(b.yb(k + lore.length))), INK.text);
  if (known) drawSouvenirCentred(r, sel.id, picture, largestCells(sel.id, picture.w, picture.h, dpr).c, alphaOf(sel.id));
  else win.cell(picture, { line: false, cross: true });
  // WORDS and its count; the words as running text across the pane.
  const kw = b.next(picture.y + picture.h), got = WORDS.filter((x) => world.collection.words.has(x.id)).length;
  b.label(kw, 'WORDS', `${got}/${WORDS.length}`);
  const kt = b.next(b.yb(kw));
  wordLines(WORDS.map((wd) => ({ text: wd.text, got: world.collection.words.has(wd.id) })), b.cols).forEach((line, i) => {
    let x = b.cx;
    for (const wd of line) {
      win.text(wd.got ? wd.text : '*'.repeat(len(wd.text)), x, b.y(kt + i), wd.got ? INK.text : INK.faint);
      x += (len(wd.text) + 1) * cw;
    }
  });

  // The foot: ESC CLOSE first, the arrows' CHOOSE at the right; the last action's words between, white. While the name is typed the foot says
  // the field's keys (they are the field's, not buttons of the card).
  const back = keyName('back') || 'back';
  if (ui.editing) win.foot([{ key: 'ESC', words: 'CANCEL', quiet: true }], [{ key: 'ENTER', words: 'SAVE', quiet: true }]);
  else win.foot([{ key: back, words: 'CLOSE', id: 'key:back' }], [{ key: '← → ↑ ↓', words: 'CHOOSE', id: 'key:choose', quiet: true }],
    { message: ui.message ? { text: ui.message, ink: INK.text } : null });
  return { nameBox, paintBox: win.boxes.get('paint') ?? null, cockpitBox: win.boxes.get('cockpit') ?? null, lookBox: win.boxes.get('look') ?? null,
    charmBox: win.boxes.get('charm') ?? null, backs, tiles, box: win.box, boxes: win.boxes, layout: CARD };
}

// ================================================================================================================================
// A station's INFO
// ================================================================================================================================

// SX's sketch W-ORG R4 (2026-10-16, labs/graphics/organism.js): a dialog, the ladder's S wide (640), as tall as its words. Its head the station's
// name and what it is now, its sector at the right (the head's INFO went: the window says what it is). At the right a shot of the station at
// its own size, never scaled: a fragment of it, a new one each time the window opens, masked by a square with no frame (SX: «брал в реальном
// размере шот ... рандомный фрагмент станции один к одному, но в этом квадрате заключен ... безрамочно»). At the left its words, then GOODS and
// OFFERS, each its name `C` over its things in two columns, a good a filled square, an offer a hollow one.
export const INFO = Object.freeze({
  width: 640,                  // the ladder's S
  shot: 200,                   // the shot's square, px
  loreRows: 6,                 // the words' lines, at most
});

// A station's shot in `box`: its look as the world draws it, the square taken where `at` ({ u, v }, the window's pick) finds it full, a part
// moving in it and away from the last shot of it (labs/graphics/world-art.js stationShotAt), on the page's clock `t`: its parts moving and the
// station floating as outside (world-art.js drawStationTrue).
export function drawStationShot(r, box, st, world, at = null, t = 0) {
  const { dx, dy } = stationShotAt(r, st, Math.min(box.w, box.h), at?.u ?? 0.5, at?.v ?? 0.5);
  const rebuilt = st.kind === 'ruin' ? rebuiltShare(world.ledger, st) : 1;
  const ctx = r.ctx;
  ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  try { drawStationTrue(r, box, st, dx, dy, rebuilt, t); } finally { ctx.restore(); }
}

// `ui`: { stationId, shot ({ u, v }: where the fragment is taken), time (the page's clock, s) }. Returns the window's `box`, its `boxes` and the
// `layout` it was drawn with (its shot's box included).
export function drawStationInfo(r, world, ui) {
  const st = world.stations.find((s) => s.id === ui.stationId) ?? stationDefById(ui.stationId, world.ledger);
  if (!st) return null;
  const win = new Win(r, { size: [INFO.width, null], id: 'station' }), p = win.p, { cw, m } = win;
  // Measured first: the words beside the shot, then GOODS and OFFERS under them.
  const shotAt = (y0) => ({ x: Math.round(p.cxr) - INFO.shot, y: Math.round(y0), w: INFO.shot, h: INFO.shot });
  const cols = Math.floor((p.cxr - INFO.shot - ORG.C - p.cx + 2 * m.capLeft) / cw);
  const info = stationInfo(st.id), lore = wrap(stationLoreNow(st.id, workingKind(world.ledger, st) === 'ruin'), cols, INFO.loreRows);
  const goods = info?.goods ?? [], offers = String(stationOffers(world, st)).split(', ').filter(Boolean), half = Math.floor(cols / 2) + 1;
  const kGoods = p.next(p.yb(lore.length - 1)), kGoodsList = p.next(p.yb(kGoods)), lastGoods = kGoodsList + Math.ceil(goods.length / 2) - 1;
  const kOffers = p.next(p.yb(goods.length ? lastGoods : kGoods)), kOffersList = p.next(p.yb(kOffers)), lastOffers = kOffersList + Math.ceil(offers.length / 2) - 1;
  win.fit(Math.max(shotAt(p.y(0)).y + INFO.shot, p.yb(lastOffers))).place().sheet();
  // The head: the name and what it is now at the left, its sector at the right (the status keeps what the name and the right leave).
  const sector = sectorById(st.sectorId ?? world.sector?.id), name = fitText(st.label, 24), meta = sector?.label ? [[sector.label, INK.label]] : [];
  win.head([[name, INK.text]], { sub: fitText(stationStatus(world, st), Math.floor((win.w - 2 * ORG.S) / cw) - len(name) - win.metaLen(meta) - 2 - ORG.meta), meta });
  const shot = shotAt(p.y(0));
  drawStationShot(r, shot, st, world, ui.shot, ui.time ?? 0);
  lore.forEach((s, i) => win.text(s, p.cx, p.y(i), INK.text));
  // GOODS and OFFERS: a name, then its things two by two, each its square (a good filled, an offer hollow) and its words a cell on.
  const list = (k, name, items, filled) => {
    win.text(name, p.cx, p.y(k), INK.label);
    items.forEach((s, i) => {
      const Y = p.y(p.next(p.yb(k)) + Math.floor(i / 2)), x = p.x((i % 2) * half);
      win.dot(x, Y, filled);
      win.text(fitText(s, half - 2), x + cw, Y, INK.text);
    });
  };
  list(kGoods, 'GOODS', goods, true);
  list(kOffers, 'OFFERS', offers, false);
  win.foot([{ key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back' }]);
  return { box: win.box, boxes: win.boxes, layout: { ...INFO, picture: shot } };
}

// ================================================================================================================================
// The hangar (HANGAR at a garage)
// ================================================================================================================================

// SX's sketch W-ORG R5 (2026-10-16, labs/graphics/organism.js; before it his H1 SHELF of 2026-10-13, labs/graphics/sketches/garage-ships.html): the
// ladder's M, 800 x 600. Every drawing the pilot can fly (src/hangarPanel.js FLEET: «в гараже должен быть выбор спрайтов самолета которые у тебя
// есть»):
//   the chosen ship: its picture in a square as tall as its eight rows of words, frameless, flying there; beside it its name, what it is to the
//   pilot flush right (ACTIVE in the blue, OWNED, its price in gold, NOT MET), its class, and its five figures, each its label, its share of the
//   best of the twelve as a row of squares, its number flush right;
//   SPACESHIPS and how many are had over twelve squares in two rows (src/hangarPanel.js HANGAR_SQUARES; SX, 2026-10-21: the default first,
//   CLIPPER, the reference ships' as they are won, the rest empty; until then SPACESHIPS, the STANDARD's looks, the COURIER and the HAULER, and
//   ALLIES, the crews' six, a shelf each), `S` apart: the chosen one a whole white line, the others dashes (SX: «в ангаре не заполненные не
//   должны быть заключенными в квадраты ... пунктир ... приглушить надо сильно ... такой же пунктир в ангаре сделай»); a ship not had (CLIPPER
//   in the opening) in the label's gray at `notHad` of its light.
// The foot: ESC CLOSE first; what the chosen ship's key does (USE, BUY), then the arrows' SHIP; why it cannot be had, or what the last key said,
// between.
export const HANGAR = Object.freeze({
  size: 'M',
  showRows: 8,                                         // the chosen ship's rows of words, and its picture as tall
  barFrom: 8, barTo: 6,                                // a figure's squares: columns past its label's start, and short of the right axis
  notHad: 0.45,                                        // a ship not had: its drawing's light, in the label's ink
});
// Every ship shown at one scale, its size in the game (SX, 2026-10-14: «классический корабль должен быть меньше, ты видишь он совсем с
// другими не совпадает в масштабах»; each was fitted to its square alone, and CLASSIC, 4 x 3 cells against THUNDER's 7 x 6, came out at twice
// its glyphs): the largest as large as the square's safe zone holds (CARD.inner of its side), the others smaller by as much as they are in the
// game (src/shipAvatar.js sharedScale); a shelf each at its own until the two rows of 2026-10-21. The chosen ship's picture the same in its box.
//
// The chosen ship flies (SX, 2026-10-14: «в верхнее окно крупное добавь анимацию как этот корабль летит, то есть звезды на фоне и он летит и
// подпрыгивает иногда, летит снизу вверх»): nose up, the stars streaming down past it on three layers (the world's star inks, far to near
// the slower), a slow sway across and a breath up and down, and every `jumpEvery` s a jump on the game's own curve and grow (src/trick.js
// heightAt, LIFT: up in `rise`, held `hang`, down in `fall`). Still where motion is reduced: the stars and the ship where they stand at 0.
export const SHOWCASE = Object.freeze({
  stars: 36, seed: 20261014,                           // the picture's stars, the same every time
  speeds: Object.freeze([16, 34, 70]),                 // px/s each layer streams down, far to near
  sway: Object.freeze({ px: 6, period: 6.4 }),         // across and back
  bob: Object.freeze({ px: 2, period: 2.3 }),          // up and down
  jumpEvery: 4.5, hang: 0.4,                           // s between jumps' starts; s held at the top
});
const STAR_INKS = [ROLES.starFar, ROLES.starMid, ROLES.starNear];

// The drawing one of the twelve is drawn in: a look's (src/shipLooks.js), a hull's (src/hangar.js), a crew's (made in code); the ship flown's own
// where the page has not loaded the file (a rig).
function fleetModel(world, e) {
  const model = e.look ? shipLookModel(e.look) : e.crew ? specialModel(e.ship) : shipModel(e.ship);
  return model ?? (e.flying ? world.ship.model : null);
}

// The chosen ship flying in its picture `box` (SHOWCASE) at `time` s: the stars, then the ship at `scale` of its model's own (the squares',
// sharedScale), grown as a jump grows it. `look` its paint, or the ink and light of a ship not had.
function drawFlying(r, box, model, scale, look, time) {
  const { ctx } = r, S = SHOWCASE;
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x + 1, box.y + 1, box.w - 2, box.h - 2); ctx.clip();
  const rng = mulberry32(S.seed);
  for (let i = 0; i < S.stars; i++) {
    const x = rng() * box.w, y0 = rng() * box.h, layer = (rng() * 3) | 0, ch = rng() < 0.85 ? (rng() < 0.6 ? '.' : '·') : '+';
    r.glyphNow(ch, box.x + x, box.y + ((y0 + time * S.speeds[layer]) % box.h), STAR_INKS[layer], 0.9);
  }
  const up = heightAt(time % S.jumpEvery, FLIGHT.trick.motion.rise + S.hang);
  const dx = S.sway.px * Math.sin((TAU * time) / S.sway.period), dy = S.bob.px * Math.sin((TAU * time) / S.bob.period);
  drawShipIn(r, model, { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h }, { ...look, scale: scale * modelScale(model) * (1 + LIFT.grow * up) });
  ctx.restore();
}

// `ui`: the registry's hangarUI ({ selected, message, worn: the look the STANDARD wears, time: the page's clock in s, still: reduced motion }). Returns
// `ships` ([{ index, box }], a click chooses) and the window's `box`.
export function drawHangar(r, world, ui) {
  const win = new Win(r, { size: HANGAR.size, id: 'hangar' }).place().sheet(), p = win.p, { cw } = win;
  const fleet = fleetOf(world, ui.worn), n = fleet.length;
  const selected = Math.max(0, Math.min(n - 1, ui.selected ?? 0)), e = fleet[selected], action = fleetAction(world, e);
  // The figures' bars against the best of every ship the hangar may hold (FLEET), shown or not yet: a bar does not move as one comes.
  const stats = fleet.map((x) => shipStats(x.ship)), all = FLEET.map((x) => shipStats(x.ship)), best = all[0].map((_, k) => Math.max(...all.map((l) => l[k].value)));
  const station = world.stations.find((s) => s.id === world.docked);
  win.head([['HANGAR', INK.text]], { meta: [...(station ? [[station.label, INK.label]] : []), money(`${formatCR(world.ledger.credits)} CR`)] });
  const look = (x) => ({ paint: x.crew ? null : world.pilot.paint, ink: x.owned ? null : INK.label, alpha: x.owned ? 1 : HANGAR.notHad });

  // The chosen ship: its picture in a square as tall as its words, flying there; its words beside it.
  const top = Math.round(p.y(0)), side = Math.round(p.yb(HANGAR.showRows - 1)) - top;
  const pic = { x: Math.round(p.cx), y: top, w: side, h: side };
  const models = fleet.map((x) => fleetModel(world, x));
  const room = { x: pic.x + side * (1 - CARD.inner) / 2, y: pic.y + side * (1 - CARD.inner) / 2, w: side * CARD.inner, h: side * CARD.inner };
  drawFlying(r, pic, fleetModel(world, e), sharedScale(r, models, room), look(e), ui.still ? 0 : ui.time ?? 0);
  const tx = pic.x + side + ORG.C, status = e.flying ? ['ACTIVE', INK.blue] : e.owned ? ['OWNED', INK.label] : e.crew || e.locked ? ["LOCKED", INK.faint] : money(`${formatCR(e.price)} CR`);
  win.text(fitText(e.label, Math.floor((p.cxr - tx) / cw) - partLen(status) - 2), tx, p.y(0), INK.text);
  win.part(status, p.cxr, p.y(0), { right: true });
  win.text(e.note, tx, p.y(1), INK.label);
  const m0 = tx + HANGAR.barFrom * cw, m1 = p.cxr - HANGAR.barTo * cw;
  stats[selected].forEach((s, i) => {
    const Y = p.y(3 + i);
    win.text(s.label, tx, Y, INK.label);
    win.text(s.text, p.cxr, Y, e.owned || !(e.crew || e.locked) ? INK.text : INK.label, { right: true });
    win.squares(Y + win.cap / 2 - ORG.square / 2, Math.min(1, s.value / best[i]), { x0: m0, x1: m1 });
  });

  // The squares (SX, 2026-10-21): SPACESHIPS and how many are had, then two rows of HANGAR_SQUARES.row, `S` apart, the ships shown first and the
  // rest empty: a slot for a ship to come (SX, 2026-10-16: «можешь там просто оставить слот добавим корабль»), and a crew's ship not had yet,
  // which shows nothing (2026-10-21: «не стоит спойлерить корабли в гараже которые не открыты»). Not buttons. Every ship at one scale, its size
  // in the game (src/shipAvatar.js sharedScale), as the chosen one's picture is.
  const ships = [];
  const k = p.next(p.yb(HANGAR.showRows - 1));
  p.label(k, 'SPACESHIPS', `${fleet.filter((x) => x.owned).length}`);
  const row0 = p.cells(HANGAR_SQUARES.row, p.yb(k) + ORG.C);
  const boxes = [...row0, ...p.cells(HANGAR_SQUARES.row, row0[0].y + row0[0].h + ORG.S)];
  const scale = sharedScale(r, models, { w: Math.floor(boxes[0].w * CARD.inner), h: Math.floor(boxes[0].w * CARD.inner) });
  fleet.forEach((x, j) => {
    const sq = boxes[j];
    if (!sq) return;
    ships.push({ index: x.i, box: sq });
    win.item(`ship:${x.key}`, sq, (on) => {
      win.cell(sq, { chosen: on || x.i === selected });
      const model = models[j];
      drawShipIn(r, model, sq, { ...look(x), scale: scale * modelScale(model) });
    });
  });
  for (const sq of boxes.slice(fleet.length)) win.cell(sq);

  // The foot: ESC CLOSE first; the chosen ship's key and the arrows at the right; why it cannot be had (the world's words, the amounts in
  // gold) or what the last key said between. A crew's ship not had has no key: its crew's run first.
  const message = ui.message ? { text: ui.message, ink: INK.text, side: 'left', money: true }
    : action.reason ? { text: action.reason, ink: INK.label, side: 'left', money: true } : null;
  win.foot([{ key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back' }], [
    ...(action.words ? [{ key: keyName('choose') || 'choose', words: action.words, id: 'key:choose', dim: !action.enabled }] : []),
    { key: '← → ↑ ↓', words: 'SHIP', id: 'key:ships' },
  ], { message });
  return { ships, box: win.box, boxes: win.boxes, layout: { ...HANGAR, side } };
}

// ================================================================================================================================
// The sign composer (L)
// ================================================================================================================================

// On the organism (2026-10-16, labs/graphics/organism.js; before it SX's S8): the ladder's S, 640 x 480. The sign as it will stand, the game's own
// drawing, across the pane's top (`boxRows` rows); TYPE and its choice (VALUE ‹ ›, which T steps too) with its place among the types after its
// name; WORDS and how many are found, and the words in `per` columns across the pane: a known word white, a word the sign holds in the blue (what
// is in hand), a word not found faint stars as long as it; the keys' choice the white line round its word. The head: what the pilot has left
// (the signs, the chalk) and the sector at the right; the last key's words stand there in their place.
export const SIGN = Object.freeze({
  size: 'S', boxRows: 6,
  per: WORDS_PER_ROW,          // the words a row (the arrows' ↑ ↓ step this many: labs/graphics/screens.js)
});

// `ui`: the registry's signUI ({ words, selected, type, message }). Returns `wordBoxes` ([{ index, box }], a click adds the word as ENTER does) and the
// window's `box`.
export function drawSignComposer(r, world, ui) {
  const win = new Win(r, { size: SIGN.size, id: 'sign' }).place().sheet(), p = win.p, { cw, m } = win, per = SIGN.per;
  // The head: the title, and at the right the signs left, the chalk and the sector (the last key's words in their place).
  const own = world.signs.placed.length;
  win.head([['LEAVE A SIGN', INK.text]], { meta: ui.message ? [[ui.message, INK.text]] : [
    ...(own >= SIGN_LIMIT ? [['REPLACES OLDEST', INK.label]] : []),
    { runs: [['SIGNS ', INK.label], [`${own}/${SIGN_LIMIT}`, INK.text]] }, { runs: [['CHALK ', INK.label], [String(world.chalk ?? 0), INK.text]] },
    ...(world.sector?.label ? [[world.sector.label, INK.label]] : [])] });
  // The sign as it will stand, of the chosen type, across the pane (STARS scatters its sky wide: kept inside it).
  const picture = { x: Math.round(p.cx), y: Math.round(p.y(0)), w: Math.round(p.cxr - p.cx), h: SIGN.boxRows * UI.row };
  const put = (c, gx, gy, color, a = 1) => { if (gx - cw / 2 >= picture.x && gx + cw / 2 <= picture.x + picture.w && gy >= picture.y && gy <= picture.y + picture.h) r.glyphNow(c, gx, gy, color, a); };
  drawSign(put, r, picture.x + picture.w / 2, picture.y + 3.5 * UI.row, draftCaption(ui.words), world.pilot.nickname, CONFIG.sign, ui.type, world.time ?? 0, { preview: true });
  // TYPE: its name and its place among the types, its choice at the right; the row is a button (a click steps it, as T does).
  const type = Math.max(0, SIGN_TYPES.findIndex((t) => t.id === ui.type)), kType = p.next(picture.y + picture.h), typeY = p.y(kType);
  const typeBox = win.rowBox(p.cx, p.cxr, typeY);
  noteKey(keyName('signType'), typeBox, r);
  win.item('type', typeBox, (on) => {
    if (on) win.bar(p.cx, p.cxr, typeY);
    const end = win.text('TYPE', p.cx, typeY, INK.label, { plate: on });
    win.text(`${type + 1}/${SIGN_TYPES.length}`, end + 2 * cw + 2 * m.capLeft, typeY, INK.faint, { plate: on });
    win.choice(p.cxr, typeY, signTypeLabel(ui.type), { plate: on });
  });
  // WORDS and how many are found, then the words.
  const kWords = p.next(p.yb(kType)), found = WORDS.filter((x) => world.collection.words.has(x.id)).length;
  p.label(kWords, 'WORDS', `${found}/${WORDS.length}`);
  const k0 = p.next(p.yb(kWords)), cell = Math.floor((p.cols + 1) / per);
  const wordBoxes = [];
  WORDS.forEach((wd, i) => {
    const known = world.collection.words.has(wd.id), chosen = ui.words.includes(wd.id), shown = known ? wd.text : '*'.repeat(len(wd.text));
    const wx = p.x((i % per) * cell), Y = p.y(k0 + Math.floor(i / per)), ink = !known ? INK.faint : chosen ? INK.blue : INK.text;
    const box = win.rowBox(wx, wx + (cell - 1) * cw - 2 * m.capLeft, Y);
    const draw = (on) => {
      if (on && known) win.bar(wx, wx + len(shown) * cw - 2 * m.capLeft, Y);
      win.text(shown, wx, Y, ink, { plate: on && known });
      // The keys' choice, in the white line round the word's ink.
      if (i === ui.selected) selectMark({ r, MARK: UI.pad }, { x: wx, y: Math.round(Y), w: len(shown) * cw - 2 * m.capLeft, h: Math.round(win.cap) });
    };
    if (known) { wordBoxes.push({ index: i, box }); win.item(`word:${wd.id}`, box, draw); } else draw(false);
  });
  // The foot: ESC CANCEL first; LEAVE SIGN, what the window is for, then ADD, UNDO and TYPE.
  win.foot([{ key: keyName('back') || 'back', words: 'CANCEL', id: 'key:back' }], [
    { key: keyName('placeSign') || 'placeSign', words: 'LEAVE SIGN', id: 'key:placeSign' },
    { key: keyName('addWord') || 'addWord', words: 'ADD', id: 'key:addWord' },
    { key: keyName('removeWord') || 'removeWord', words: 'UNDO', id: 'key:removeWord' },
    { key: keyName('signType') || 'signType', words: 'TYPE', id: 'key:signType' },
  ]);
  return { wordBoxes, box: win.box, boxes: win.boxes, picture, layout: { ...SIGN, perRow: per } };
}

// ================================================================================================================================
// The controls list (?)
// ================================================================================================================================

// SX's sketch W-ORG R6 (2026-10-16, labs/graphics/organism.js; before it his S4): the ladder's S, 640 x 480. The head: CONTROLS, and at the right
// the mode the list shows, KEYS + CLICKS ‹ › (a click on it, or ← →, pages to the other). The intro in the label's gray, then the groups in two
// columns, each its name `C` over its rows: the keys as the cockpit's caps flush right on one axis (several keys, several caps; a way that is no
// key, the mouse's HOLD L, a click, in white words there), the words of what they do the gutter after them. A group that does not fit its column
// stands under the other one where it fits there. The window is as large for every mode (it pages in place). The foot: ESC CLOSE, ← → SCHEME.
export const CONTROLS = Object.freeze({ size: 'S', half: 40 });
// A row's keys as their caps take it (the caps' letters a cell apart: organism.js keysWidth), or its words where it names no key.
const cellWidth = (win, cell) => { const t = keyTokens(cell); return t ? win.keysWidth(t) : len(String(cell).trim()) * win.cw - 2 * win.m.capLeft; };
// Sentences kept whole on a line where they fit, else words: the intro.
function sentences(text, cols) {
  const out = [];
  for (const s of String(text).match(/[^.!?]+[.!?]*\s*/g) ?? []) {
    const t = s.trim(), last = out.at(-1);
    if (last != null && len(last) + 1 + len(t) <= cols) out[out.length - 1] = `${last} ${t}`;
    else out.push(...wrap(t, cols, 9));
  }
  return out;
}

// `opts`: { page (a mode: K, M), can (what the hull can do, src/chassis.js), steering (src/steering.js) }. Returns the window's `box` and `scheme` ({ box,
// back }: the head's choice and its ‹, which the registry makes a button).
export function drawControlsWindow(r, { page = DEFAULT_SCHEME, can = null, steering = 'tank' } = {}) {
  const win = new Win(r, { size: CONTROLS.size, id: 'controls' }), p = win.p, { cw, m } = win;
  const intro = sentences(helpIntro(page), p.cols), kTop = p.next(p.yb(intro.length - 1));
  // A column's groups: each its name's row, `C`, its rows; `C` between groups. Their height, px from the first name's capitals to the last row's.
  const groupH = (list) => win.cap + ORG.C + (list.length - 1) * UI.row + win.cap;
  const columnH = (groups) => groups.reduce((n, [, list], i) => n + groupH(list) + (i ? ORG.C : 0), 0);
  // The columns of the mode shown: a group that does not fit its column under the other where it fits there.
  const room = win.footRule - ORG.C - p.y(kTop);
  const [c0, c1 = []] = helpColumns(page, can, steering).map((col) => [...col]);
  while (c1.length > 1 && columnH(c1) > room && columnH([...c0, c1.at(-1)]) <= room) c0.push(c1.pop());
  while (c0.length > 1 && columnH(c0) > room && columnH([...c1, c0.at(-1)]) <= room) c1.push(c0.pop());
  win.fit(p.y(kTop) + Math.max(columnH(c0), columnH(c1))).place().sheet();
  const top = p.y(kTop);
  // The head: CONTROLS, and the mode (an arrow at an end of the row is faint: there is no page past it).
  const at0 = SCHEMES.indexOf(page), value = SCHEME_NAMES[page] ?? '', headY = win.head([['CONTROLS', INK.text]]);
  const last = win.panes.at(-1), right = last.sxr, n = Win.choiceLen(value);
  const choice = win.rowBox(right + 2 * m.capLeft - n * cw, right, headY), back = win.choiceBack(right, headY);
  win.item('scheme', choice, (on) => {
    if (on) win.bar(right + 2 * m.capLeft - n * cw, right, headY);
    win.choice(right, headY, value, { ends: [at0 > 0, at0 < SCHEMES.length - 1], plate: on });
  });
  intro.forEach((s, i) => win.text(s, p.cx, p.y(i), INK.label));
  // The groups: each its name and its rows `C` under it, the keys flush right on the column's axis, their words the gutter after it.
  const half = Math.max(CONTROLS.half, Math.ceil((Math.max(0, ...c0.flatMap(([, list]) => list.map(([k]) => cellWidth(win, k)))) + ORG.gutter * cw) / cw)
    + Math.max(0, ...c0.flatMap(([, list]) => list.map(([, d]) => len(d)))) + ORG.gutter);
  const column = (groups, c) => {
    const x = p.x(c), axis = x + Math.max(0, ...groups.flatMap(([, list]) => list.map(([k]) => cellWidth(win, k)))), wordsAt = axis + ORG.gutter * cw;
    let y = top;
    for (const [heading, list] of groups) {
      win.text(heading, x, y, INK.label);
      const k1 = p.next(y + win.cap);
      list.forEach(([cell, words], i) => {
        const Y = p.y(k1 + i), tokens = keyTokens(cell);
        // Caps flush right on the axis, each one a legend, not a button; or the words of a way that is no key.
        if (tokens) win.keysEndingAt(axis, Y, tokens);
        else win.text(String(cell).trim(), axis, Y, INK.text, { right: true });
        win.text(words, wordsAt, Y, INK.text);
      });
      y = p.yb(k1 + list.length - 1) + ORG.C;
    }
  };
  column(c0, 0);
  if (c1.length) column(c1, half);
  win.foot([{ key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back' }], [{ key: '← →', words: 'SCHEME', id: 'key:scheme' }]);
  return { box: win.box, scheme: { box: choice, back } };
}
