// The centred windows: the pilot card (C), a station's INFO, the hangar (HANGAR at a garage), the sign composer (L) and the controls list (?), all in
// the Swiss manner since SX's picks of 2026-10-09 (labs/graphics/swiss.js: the character grid, hanging heads, the frames' gray, the inverted row under
// the pointer; the card since 2026-10-13 on labs/graphics/sketches/pilot-card.html, V5, the others on windows-swiss-2.html, S4 and S6-S8: «берем но наши текущие
// контекстные окна не трогаем мы сейчас поп апами занимаемся»; the chrome they share, labs/graphics/swiss-window.js). Each is the page's spec of it with
// the game's own data and state: what the keys chose (a souvenir, a ship, a word), the last action's message, the name being typed.
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
import { formatCR, workingKind } from '../../src/ruins.js';
import { wrap } from '../../src/pilotPanel.js';
import { shipStats, fleetOf, fleetAction } from '../../src/hangarPanel.js';
import { stationStatus, stationOffers, wrapItems } from '../../src/stationPanel.js';
import { stationInfo, stationLoreNow } from '../../src/stationInfo.js';
import { draftCaption, WORDS_PER_ROW } from '../../src/signPanel.js';
import { SIGN_LIMIT, SIGN_TYPES, signTypeLabel, drawSign } from '../../src/signs.js';
import { drawAvatar, drawShipIn, sharedScale, modelScale } from '../../src/shipAvatar.js';
import { heightAt, LIFT } from '../../src/trick.js';
import { FLIGHT } from '../../src/flightConfig.js';
import { mulberry32, TAU } from '../../src/util.js';
import { frameInk, onFrame } from '../../src/frames.js';
import { PICTURE } from '../../src/souvenirPictures.js';
import { balancedCells, largestCells, drawSouvenirCentred } from '../../src/souvenirArt.js';
import { keyName, helpColumns, helpIntro, SCHEMES, SCHEME_NAMES, DEFAULT_SCHEME } from '../../src/controls.js';
import { noteKey, unnoted } from './clicks.js';
import { swiss, SWISS, BLACK, Q, pad2, frameBox, edgeRule, ruleH, ruleV, crossBox, bar, onBar, keycapAt, keycapWidth, drawStep } from './swiss.js';
import { placeWindow, sheet, headRow, hangHead, footKeys, putPartEnd, partCols, keyTokens } from './swiss-window.js';
import { W, G, H, ledger, finish, selectMark, hairline, len } from './ledger.js';

const NAME_COLS = 14;                       // the name field's columns: a name's twelve letters (src/pilot.js) and two

// ================================================================================================================================
// The pilot card (C), in the Swiss manner
// ================================================================================================================================

// SX's V5 ONE PAGE of 2026-10-13 (labs/graphics/sketches/pilot-card.html; «мы должны все на 1 странице показывать ... самый первый вариант
// который у нас был еще давно был неплох»: B, the card of 2026-10-01, docs/plans/refs/2026-10-01-pilot-card-b.png; «вот это норм»), on the kit of
// labs/graphics/swiss.js. Two columns on one grid of rows:
//   the pilot's, read down: 01 SHIP in four rows (its drawing at the left; its name, its note and its figures two by two beside it, the second
//   pair's figures on the column's right edge), the four switches (PAINT, COCKPIT, LOOK, CHARM, each ‹ VALUE › by leaders: a click steps one, on
//   its ‹ back, and ← → step the one under the pointer), 02 JOURNEY (its share on its head with the bar under it, its seven parts, the tallies);
//   the collection's: 03 SOUVENIRS, two shelves of six true squares, the gap between them the same across and down (no names under them: «подпись
//   в миниатюрах можешь убрать, миниатюры должны быть вписаны в равносторонние квадраты с достаточной save зоной»), each souvenir's ink centred in
//   its square and sized to one visual weight on whole pixels at its art's own cell (src/souvenirArt.js balancedCells), no more than `inner` of
//   the side; the chosen one (its number and name, its lore, where it was found, its picture large at the right); 04 WORDS as running text, a
//   word not found gray stars as long as it.
// The air from the inside out: no empty row inside a list, one under a head and between a list's parts, two before a group's head; every figure
// once, a label tied to its figure by leaders in the frames' gray. The lines where SX drew them: one down between the columns from the head's
// rule to the foot's, one across the collection's column between each two of its groups, each to the nearest line it meets. The head: the name.
export const CARD = Object.freeze({
  cols: 106, left: 30, gut: 6,                  // the window's columns inside its inset, the pilot's column's, the gutter (the line down its middle)
  across: 6,                                    // souvenirs a shelf: the arrows' ↑ ↓ step this many (labs/graphics/screens.js pilotKeys)
  tileCols: 10,                                 // a square's side, in the columns' px (92 at the game's font)
  inner: 0.7,                                   // a souvenir's ink at most this share of its square's side: (1 - inner) / 2 of air to the line
  pic: 22,                                      // the chosen one's picture, columns at the column's right
  ship: Object.freeze({ cols: 8, figure: 9, step: 11 }),   // the ship's drawing; a figure's label and value; the second pair's step
  // Rows: the columns' heads and the body's first from the head's (SWISS.headGap is the head's band), and the foot's air: the words' last line
  // to the foot's rule as much as each line across the collection's column has over and under it (SX: «отступ под словами не в сетке»).
  rows: Object.freeze({ heads: 1.5, first: 3.5, footAir: 1.5 }),
  // Each group's rows from the body's first, the same for every pilot: the pilot's column, then the collection's.
  at: Object.freeze({ ship: 0, wear: 5, journey: 11, parts: 13, tallies: 21, chosen: 12, lore: 14, found: 19, words: 22, wordsText: 24, end: 26 }),
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

// `ui`: the screens registry's pilotUI ({ selected, editing, message, lore }). Returns the boxes the registry reads: `nameBox` (where the name
// field stands while the name is typed: the head's word), `paintBox`, `cockpitBox`, `lookBox`, `charmBox` (the switches' rows, a click steps
// them, as P, K, L and J do) and `backs` (each one's ‹, a click on it steps back), `tiles` ([{ index, box }], a click chooses), and the window's `box`.
export function drawPilotCard(r, world, ui) {
  const w = ledger(r, { id: 'card' }), sw = swiss(r), { cw, m, I } = sw, P = world.pilot, j = journey(world), CR = CARD.rows, A = CARD.at;
  const footRow = CR.first + A.end + SWISS.footRows + CR.footAir;
  const bw = Math.round(2 * I + CARD.cols * cw), bh = sw.heightWithKeys(footRow), E = Math.round(UI.air.inset), at = placeWindow(r, bw, bh);
  const box = { x: Math.max(E, at.x), y: at.y, w: bw, h: bh }, L = box.x + I, dpr = r.dpr || 1;
  const rowAt = (k) => sw.rowAt(box.y, k), first = (k) => rowAt(CR.first + k), capTop = (top) => Math.round(sw.capTopOf(top)), capH = m.capBottom - m.capTop;
  const xL = Math.round(L), nL = CARD.left, xR = Math.round(L + (CARD.left + CARD.gut) * cw), nR = CARD.cols - CARD.left - CARD.gut;
  sheet(sw, box, footRow);

  // The head: the name (an HTML field takes its place while it is typed). The field's box: its text (inside its 1 px border and its `pad`) on the
  // name, room for a name's twelve letters and two.
  const headTop = rowAt(0);
  if (!ui.editing) sw.text(P.nickname, L, headTop, W);
  const nameBox = { x: L - m.capLeft - 1 - UI.pad, y: headTop + m.textY - (UI.row - r.cellH) / 2, w: NAME_COLS * cw + 2 * (1 + UI.pad), h: UI.row };
  // The line down between the columns, in the gutter's middle, from the head's rule to the foot's.
  const xDiv = Math.round(xL + (nL + CARD.gut / 2) * cw - cw / 2), yHead = sw.headRule(box.y), yFoot = sw.footRule(box.y, footRow);
  ruleV(sw, xDiv, yHead + 1, yFoot - yHead - 1);

  // A group's head with its count at the column's right; a label and its figure; the same tied by leaders (the frames' gray, quieter than words).
  const head = (x, n, top, num, name, count = null) => { hangHead(sw, x, top, num, name); if (count) sw.textEnd(count, x + n * cw, top, W); };
  const pair = (x, n, top, label, value) => { sw.text(label, x, top, G); sw.textEnd(String(value), x + n * cw, top, W); };
  const dots = (x, from, to, top, on = false) => {
    if (to <= from) return;
    const s = '.'.repeat(to - from);
    if (on) sw.text(s, x + from * cw, top, BLACK, true); else onFrame(() => sw.text(s, x + from * cw, top, frameInk('frame')));
  };
  const lead = (x, n, top, label, value) => { pair(x, n, top, label, value); dots(x, len(label) + 1, n - len(String(value)) - 1, top); };

  // 01 SHIP: four rows. Its drawing at the left; beside it its name and note, then its figures two by two.
  const def = shipById(world.hangar?.flying) ?? shipById('standard');
  const fig = Object.fromEntries(shipStats(def.id).map((x) => [x.key, x.text]));
  head(xL, nL, rowAt(CR.heads), 1, 'SHIP');
  const shipTop = capTop(first(A.ship)), shipH = capTop(first(A.ship + 3)) + capH - shipTop;
  drawAvatar(w.r, world.ship.model, xL - cw / 2, shipTop - UI.row / 2, CARD.ship.cols + 1, shipH / UI.row + 1,
    { largest: 8, pose: true, fill: 1, paint: P.paint, line: BLACK });
  const xT = xL + (CARD.ship.cols + UI.line.cols) * cw;
  sw.text(def.label, xT, first(A.ship), W);
  sw.text(def.note, xT, first(A.ship + 1), G);
  [['SPEED', fig.speed], ['TURN', fig.turn], ['HULL', fig.hull], ['TANK', fig.tank]]
    .forEach(([label, v], i) => pair(xT + (i % 2) * CARD.ship.step * cw, CARD.ship.figure, first(A.ship + 2 + Math.floor(i / 2)), label, v));

  // The switches, a row each: the label, its leaders, ‹ VALUE › flush right. The row is a button: the inverted row under the pointer.
  const hung = P.charm !== CHARM_NONE && P.charm !== null ? COLLECTIBLES.find((d) => d.id === P.charm) : null;
  const switches = [
    ['paint', 'PAINT', paintById(P.paint)?.label ?? 'STANDARD'],
    ['cockpit', 'COCKPIT', P.cockpit ? specialById(P.cockpit)?.cockpit.label ?? 'STANDARD' : 'STANDARD'],
    ['look', 'LOOK', lookById(P.look)?.name ?? 'NOW'],
    ['charm', 'CHARM', hung ? COMPACT_NAMES[hung.id] ?? hung.label : 'NONE'],
  ];
  const backs = {}, right = xL + nL * cw;
  switches.forEach(([id, label, said], k) => {
    const top = first(A.wear + k), value = fitText(said, nL - len(label) - 6), n = len(value) + 4;
    const row = { x: xL - SWISS.barPad, y: top, w: Math.round(nL * cw + 2 * SWISS.barPad), h: UI.row };
    backs[id] = { x: Math.round(right + m.capLeft - n * cw - cw / 2), y: top, w: 2 * cw, h: UI.row };
    w.item(id, row, (on) => {
      if (on) bar(sw, row);
      sw.text(label, xL, top, onBar(on, G), on);
      dots(xL, len(label) + 1, nL - n - 1, top, on);
      drawStep(sw, { right, top, value, on });
    }, 'flat');
  });

  // 02 JOURNEY: its share on its head and the bar under it (the rules' gray, the share white); the seven parts; the tallies.
  const pct = `${Math.round(j.progress * 100)}%`;
  head(xL, nL, first(A.journey), 2, 'JOURNEY', pct);
  const barY = Math.round(first(A.journey) + UI.row + UI.pad), barW = Math.round(nL * cw);
  onFrame(() => r.fill(xL, barY, barW, 3, frameInk('rule')));
  r.fill(xL, barY, Math.round(barW * j.progress), 3, W);
  j.rows.forEach((it, k) => lead(xL, nL, first(A.parts + k), it.label, `${it.have} / ${it.of}`));
  [['CARGO RECOVERED', j.recovered], ['CARGO RESCUED', j.rescued], ['WRECKS', world.wrecks ?? 0]].forEach(([label, v], k) => lead(xL, nL, first(A.tallies + k), label, v));

  // 03 SOUVENIRS: the squares half a row over a list's first row (SX: «Квадраты выше»: the head to the squares the squares' own gap). A found one:
  // its art, the square's line in the rules' gray; an empty one: the crossed box with its number. The keys' choice and the pointer's: the white line.
  head(xR, nR, rowAt(CR.heads), 3, 'SOUVENIRS', `${world.collection.discovered.size} / ${COLLECTIBLES.length}`);
  const side = Math.floor(CARD.tileCols * cw), gap = (nR * cw - CARD.across * side) / (CARD.across - 1), shelfTop = capTop(first(-0.5));
  const cells = balancedCells(COLLECTIBLES.map((d) => d.id), Math.floor(side * CARD.inner), dpr);
  const selected = Math.max(0, Math.min(COLLECTIBLES.length - 1, ui.selected ?? 0));
  const alphaOf = (id) => (world.collection.copiesOf(id) ? 1 : 0.45) * PICTURE.alpha;
  const tiles = [];
  COLLECTIBLES.forEach((d, i) => {
    const sq = { x: Math.round(xR + (i % CARD.across) * (side + gap)), y: Math.round(shelfTop + Math.floor(i / CARD.across) * (side + gap)), w: side, h: side };
    tiles.push({ index: i, box: sq });
    w.item(`tile:${d.id}`, sq, (on) => {
      const known = world.collection.discovered.has(d.id);
      if (!known) crossBox(sw, sq, pad2(i + 1));
      if (on || i === selected) hairline(w, sq, W); else if (known) frameBox(sw, sq, 'rule');
      if (known && cells[d.id]) drawSouvenirCentred(w.r, d.id, sq, cells[d.id].c, alphaOf(d.id));
    }, 'flat');
  });
  const shelves = Math.ceil(COLLECTIBLES.length / CARD.across), shelfBottom = Math.round(shelfTop + shelves * side + (shelves - 1) * gap);

  // The chosen one: its number and name, its lore and where it was found at the left, its picture large at the right.
  const sel = COLLECTIBLES[selected], known = world.collection.discovered.has(sel.id), textCols = nR - CARD.pic - UI.group.cols;
  const inst = world.collection.instances.find((x) => x.defId === sel.id && x.source), cache = inst && findDef(inst.source, world.ledger);
  sw.text(pad2(selected + 1), xR, first(A.chosen), Q);
  sw.text(known ? sel.label : '???', xR + 4 * cw, first(A.chosen), W);
  const lore = wrap(known ? ui.lore?.[sel.id]?.lore ?? '' : 'Not found. Search the caches.', textCols, 4);
  lore.forEach((s, k) => sw.text(s, xR, first(A.lore + k), G));
  const foundTop = first(A.lore + lore.length + 1);
  if (known && cache) sw.text(fitText(`CACHE, ${sectorById(cache.sector)?.label ?? cache.sector}`, textCols), xR, foundTop, W);
  const picture = { x: Math.round(xR + (nR - CARD.pic) * cw), y: capTop(first(A.chosen)), w: Math.round(CARD.pic * cw) };
  picture.h = capTop(first(A.found)) + UI.row - SWISS.air - picture.y;
  if (known) drawSouvenirCentred(w.r, sel.id, picture, largestCells(sel.id, picture.w, picture.h, dpr).c, alphaOf(sel.id));
  else crossBox(sw, picture, pad2(selected + 1));
  // The lines across the collection's column, from the line down to the frame's: each halfway between a group's last ink and the next head's capitals.
  const chosenBottom = Math.max(picture.y + picture.h, capTop(foundTop) + capH);
  const across = (above, k) => Math.round((above + capTop(first(k))) / 2), ruleW = box.x + box.w - 1 - (xDiv + 1);
  ruleH(sw, xDiv + 1, across(shelfBottom, A.chosen), ruleW);
  ruleH(sw, xDiv + 1, across(chosenBottom, A.words), ruleW);

  // 04 WORDS: running text across the column; a found one white, one not found gray stars as long as the word.
  const got = WORDS.filter((x) => world.collection.words.has(x.id)).length;
  head(xR, nR, first(A.words), 4, 'WORDS', `${got} / ${WORDS.length}`);
  wordLines(WORDS.map((wd) => ({ text: wd.text, got: world.collection.words.has(wd.id) })), nR).forEach((line, k) => {
    let x = xR;
    for (const wd of line) {
      sw.text(wd.got ? wd.text : '*'.repeat(len(wd.text)), x, first(A.wordsText + k), wd.got ? W : Q);
      x += (len(wd.text) + 1) * cw;
    }
  });

  // The foot: its keys, each a cockpit keycap and its words (a click on N or ESC presses it); the last action's words before the ESC, in the accent.
  // While the name is typed the foot says the field's keys (they are the field's, not buttons of the card).
  const keys = ui.editing
    ? [{ key: 'ENTER', words: 'SAVE', id: 'key:enter', quiet: true }, { key: 'ESC', words: 'CANCEL', id: 'key:esc', quiet: true }]
    : [{ key: keyName('rename') || 'rename', words: 'RENAME', id: 'key:rename' }, { key: '← → ↑ ↓', words: 'CHOOSE', id: 'key:choose', quiet: true },
      { key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back', right: true }];
  footKeys(w, sw, box, keys, { top: rowAt(footRow), gap: UI.group.cols * cw, message: ui.message ? { text: ui.message, ink: CONFIG.hud.accent } : null });
  finish(w);
  return { nameBox, paintBox: w.boxes.get('paint') ?? null, cockpitBox: w.boxes.get('cockpit') ?? null, lookBox: w.boxes.get('look') ?? null,
    charmBox: w.boxes.get('charm') ?? null, backs, tiles, box, boxes: w.boxes, layout: CARD };
}

// ================================================================================================================================
// A station's INFO
// ================================================================================================================================

// SX's S6: 84 columns. The lore at the left, four lines of 44 in white (the measure the stations' words are held to, src/stationInfo.js); under it GOODS
// and OFFERS as hanging heads (`01 GOODS`, the values hung to the right of them, 36 columns: the goods of every station in two lines); the station's picture,
// alive, in its box at the right, 32 columns and fifteen rows, on the first row's capitals, its foot `air` over the foot's rule: the window is as tall as
// its picture, not its text (SX, 2026-10-09: «Желтые прямоугольник станции. Можно крупнее ... не обязательно по тексту ровняй размер поп-апа, а можешь
// равнять по картинке станции ... чтобы была сейф-зона большая для станций»; the box is the place another picture takes later: «мы в целом там потом
// другие иллюстрации поместим»). The head: the station's name and what it is now, and at the right its sector and INFO. The picture is the page's
// (`ui.drawLook`), drawn centred in its box.
export const INFO = Object.freeze({
  cols: 84,                    // the window's columns inside its inset
  textCols: 48,                // the text's: the values' column and their 36, a group's step (4) before the picture's 32
  loreCols: 44,                // the lore's measure
  picCols: 32, picRows: 15,    // the picture's box: about square (297 x 298 px at the game's font)
  loreRows: 4,                 // the lore's lines
  goodsRow: 5, offersRow: 8,   // rows from the body's first: GOODS' two lines, OFFERS
  valueCol: 12, valueCols: 36, // the values' column: a number, a step, the longest name (OFFERS) and a line's step; and their measure
});

// `ui`: { stationId, drawLook(r, cx, cy, w, h, station) } (the station's picture, alive, drawn on the window's renderer). Returns the window's `box`, its
// `boxes` and the `layout` it was drawn with (its picture's box included).
export function drawStationInfo(r, world, ui) {
  const st = world.stations.find((s) => s.id === ui.stationId) ?? stationDefById(ui.stationId, world.ledger);
  if (!st) return null;
  const w = ledger(r, { id: 'station' }), sw = swiss(r), { cw, I } = sw;
  const footRow = SWISS.headGap + Math.max(INFO.picRows, INFO.offersRow + 1 + SWISS.footRows) + 1;
  const bw = Math.round(2 * I + INFO.cols * cw), bh = sw.heightWithKeys(footRow), at = placeWindow(r, bw, bh);
  const box = { x: at.x, y: at.y, w: bw, h: bh }, L = box.x + I, R = box.x + bw - I, bodyAt = (k) => sw.rowAt(box.y, SWISS.headGap + k);
  sheet(sw, box, footRow);
  // The head: the name and what it is now at the left, the sector and INFO at the right (the status keeps what the name and the right leave).
  const sector = sectorById(st.sectorId ?? world.sector?.id), name = fitText(st.label, 24);
  const right = [...(sector?.label ? [[sector.label, G]] : []), ['INFO', Q]];
  const rightCols = right.reduce((n, p) => n + len(p[0]), 0) + SWISS.gap * (right.length - 1);
  headRow(sw, box, [[name, W], [fitText(stationStatus(world, st), INFO.cols - len(name) - rightCols - 2 * SWISS.gap), G]], right);
  // The lore (a rebuilt ruin's is the rebuilt station's; the start's three by what each is for this pilot, src/stationInfo.js), GOODS and OFFERS.
  const info = stationInfo(st.id), valueCols = INFO.valueCols, valueAt = L + INFO.valueCol * cw;
  wrap(stationLoreNow(st.id, workingKind(world.ledger, st) === 'ruin'), INFO.loreCols, INFO.loreRows).forEach((s, k) => sw.text(s, L, bodyAt(k), W));
  hangHead(sw, L, bodyAt(INFO.goodsRow), 1, 'GOODS');
  wrapItems(info?.goods ?? [], valueCols, 2).forEach((s, k) => sw.text(s, valueAt, bodyAt(INFO.goodsRow + k), W));
  hangHead(sw, L, bodyAt(INFO.offersRow), 2, 'OFFERS');
  sw.text(fitText(stationOffers(world, st), valueCols), valueAt, bodyAt(INFO.offersRow), W);
  // The picture, in its box from the first row's capitals to `air` over the foot's rule, its right side `air` in from the frame's.
  const picTop = Math.round(sw.capTopOf(bodyAt(0))), picX = Math.round(R - INFO.picCols * cw);
  const picture = { x: picX, y: picTop, w: Math.round(R) - picX, h: sw.footRule(box.y, footRow) - SWISS.air - picTop };
  ui.drawLook?.(w.r, picture.x + picture.w / 2, picture.y + picture.h / 2, picture.w, picture.h, st);
  frameBox(sw, picture);
  footKeys(w, sw, box, [{ key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back', right: true }], { top: sw.rowAt(box.y, footRow) });
  finish(w);
  return { box, boxes: w.boxes, layout: { ...INFO, picture } };
}

// ================================================================================================================================
// The hangar (HANGAR at a garage)
// ================================================================================================================================

// SX's H1 SHELF (2026-10-13, labs/graphics/sketches/garage-ships.html, H1B: «Берем Shelf ... shelf сверстай аккуратнее»): every drawing the pilot can
// fly (src/hangarPanel.js FLEET: «в гараже должен быть выбор спрайтов самолета которые у тебя есть»), on the pilot card's grid: its collection
// column's width, six columns of true squares, the card's side and gap, the sixth ending on the window's inset (the souvenirs' shelves). On them:
//   the chosen ship: its picture over the first two columns, as tall as its eight rows of words (the name's capitals to RANGE's foot); from the
//   third column's edge its number and name, what it is to the pilot flush right (ACTIVE, OWNED, its price in the coin's gold, NOT MET), its class,
//   and its five figures, each its label in the third column, its bar across the fourth and the fifth (a hairline, its share of the best of the
//   twelve filled white), its number flush right in the sixth;
//   01 HANGAR: the STANDARD in its four looks, the COURIER, the HAULER; 02 CREWS: the six crews' ships. A square each, the gap under its head's
//   capitals (the card's «Квадраты выше»); a ship had in its colours, one not had in the hint's ink at `notHad` of its light; the chosen square's
//   line white (the card's), the ship flown underlined a pad under its square.
// The air from the inside out: no empty row inside the words; between groups one air (a group's last row to the next head's, `airRows`, less the
// capitals) with a rule across its middle, frame to frame; half of it from the last squares to the foot's rule (the card's foot air).
export const HANGAR = Object.freeze({
  cols: CARD.cols - CARD.left - CARD.gut,              // the card's collection column: six of its squares and their gaps
  showRows: 8,                                         // the chosen ship's rows of words, and its picture as tall
  airRows: 3,                                          // a group's last row to the next group's head
  notHad: 0.45,                                        // a ship not had: its drawing's light, in the hint's ink
});
// Every ship of a shelf at one scale, its size in the game (SX, 2026-10-14: «классический корабль должен быть меньше, ты видишь он совсем с
// другими не совпадает в масштабах»; each was fitted to its square alone, and CLASSIC, 4 x 3 cells against THUNDER's 7 x 6, came out at twice
// its glyphs): the largest of the shelf as large as the square's safe zone holds (CARD.inner of its side), the others smaller by as much as
// they are in the game (src/shipAvatar.js sharedScale). The chosen ship's picture the same, at its shelf's scale in the picture's box.
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

// The chosen ship flying in its picture `box` (SHOWCASE) at `time` s: the stars, then the ship at `scale` of its model's own (its shelf's,
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
  const w = ledger(r, { id: 'hangar' }), sw = swiss(r), { cw, m } = sw, capH = m.capBottom - m.capTop, cols = HANGAR.cols;
  const fleet = fleetOf(world, ui.worn), n = fleet.length;
  const selected = Math.max(0, Math.min(n - 1, ui.selected ?? 0)), e = fleet[selected], action = fleetAction(world, e);
  const stats = fleet.map((x) => shipStats(x.ship)), best = stats[0].map((_, k) => Math.max(...stats.map((l) => l[k].value)));
  const side = Math.floor(CARD.tileCols * cw), gap = (cols * cw - CARD.across * side) / (CARD.across - 1);
  // Px under the body's first capitals: the chosen ship's rows, the air, the first shelf's head, its squares, the air, the second's.
  const capAt = (k) => k * UI.row, showBottom = capAt(HANGAR.showRows - 1) + capH;
  const head1 = HANGAR.showRows - 1 + HANGAR.airRows, air = capAt(head1) - showBottom;
  const sq1 = capAt(head1 + 1.5), head2 = head1 + 1.5 + Math.round(((side + air) / UI.row) * 2) / 2;
  const sq2 = capAt(head2 + 1.5), last = sq2 + side;
  // The foot on the half row whose rule stands nearest half the air under the last squares.
  const footRuleAt = (fr) => sw.footRule(0, fr) - sw.capTopOf(sw.rowAt(0, SWISS.headGap));
  let footRow = SWISS.headGap, nearest = Infinity;
  for (let fr = SWISS.headGap; fr < SWISS.headGap + 60; fr += 0.5) {
    const off = Math.abs(footRuleAt(fr) - (last + air / 2));
    if (off < nearest) { nearest = off; footRow = fr; }
  }
  const bw = Math.round(2 * sw.I + cols * cw), bh = sw.heightWithKeys(footRow), at = placeWindow(r, bw, bh);
  const box = { x: at.x, y: at.y, w: bw, h: bh }, L = box.x + sw.I, R = L + cols * cw;
  const row = (k) => sw.rowAt(box.y, SWISS.headGap + k), top0 = Math.round(sw.capTopOf(row(0))), y = (px) => Math.round(top0 + px);
  const colX = (j) => Math.round(L + j * (side + gap));
  const station = world.stations.find((s) => s.id === world.docked);
  sheet(sw, box, footRow);
  headRow(sw, box, [['HANGAR', W]], [...(station ? [[station.label, G]] : []), { money: formatCR(world.ledger.credits) }]);
  const inset = (b, by) => ({ x: b.x + by, y: b.y + by, w: b.w - 2 * by, h: b.h - 2 * by });
  const look = (x) => ({ paint: x.crew ? null : world.pilot.paint, ink: x.owned ? null : Q, alpha: x.owned ? 1 : HANGAR.notHad });
  // Each shelf's one scale (sharedScale): in a square's safe zone, and in the chosen ship's picture.
  const shelfModels = (n) => fleet.filter((x) => x.shelf === n).map((x) => fleetModel(world, x));
  const safe = Math.floor(side * CARD.inner), tileScale = [0, 1].map((n) => sharedScale(w.r, shelfModels(n), { w: safe, h: safe }));

  // The chosen ship: its picture over the first two columns, flying there; its words from the third.
  const pic = { x: colX(0), y: y(0), w: Math.round(colX(1) + side - colX(0)), h: Math.round(showBottom) };
  frameBox(sw, pic, 'rule');
  const room = inset(pic, (Math.min(pic.w, pic.h) * (1 - CARD.inner)) / 2);
  drawFlying(w.r, pic, fleetModel(world, e), sharedScale(w.r, shelfModels(e.shelf), room), look(e), ui.still ? 0 : ui.time ?? 0);
  const xT = colX(2), status = e.flying ? ['ACTIVE', W] : e.owned ? ['OWNED', G] : e.crew ? ['NOT MET', Q] : { money: formatCR(e.price) };
  sw.text(pad2(selected + 1), xT, row(0), Q);
  sw.text(fitText(e.label, Math.floor((R - xT) / cw) - 4 - partCols(status) - 1), xT + 4 * cw, row(0), W);
  putPartEnd(sw, status, R, row(0));
  sw.text(e.note, xT, row(1), G);
  const barX = colX(3), barW = colX(4) + side - colX(3);
  stats[selected].forEach((s, k) => {
    const top = row(3 + k), ly = Math.round(sw.capMid(top));
    sw.text(s.label, xT, top, G);
    sw.textEnd(s.text, R, top, e.owned || !e.crew ? W : G);
    onFrame(() => w.r.fill(barX, ly, barW, 1, frameInk('frame')));
    w.r.fill(barX, ly - 1, Math.max(1, Math.round(barW * Math.min(1, s.value / best[k]))), 3, W);
  });

  // The rules across, frame to frame, each in the middle of the air between two groups.
  edgeRule(sw, box, Math.round(y(showBottom + air / 2)));
  edgeRule(sw, box, Math.round(y(sq1 + side + air / 2)));

  // The shelves: each a head, its count of the ships had, its squares.
  const ships = [];
  const shelf = (k, sqTop, num, name, list) => {
    hangHead(sw, L, row(k), num, name);
    sw.textEnd(`${list.filter((x) => x.owned).length} / ${list.length}`, R, row(k), W);
    list.forEach((x, j) => {
      const sq = { x: colX(j), y: y(sqTop), w: side, h: side };
      ships.push({ index: x.i, box: sq });
      w.item(`ship:${x.key}`, sq, (on) => {
        if (on || x.i === selected) hairline(w, sq, W); else frameBox(sw, sq, 'rule');
        const model = fleetModel(world, x);
        drawShipIn(w.r, model, sq, { ...look(x), scale: tileScale[x.shelf] * modelScale(model) });
        if (x.flying) w.r.fill(sq.x, sq.y + sq.h + UI.pad, sq.w, 3, W);
      }, 'flat');
    });
  };
  shelf(head1, sq1, 1, 'HANGAR', fleet.filter((x) => x.shelf === 0));
  shelf(head2, sq2, 2, 'CREWS', fleet.filter((x) => x.shelf === 1));

  // The foot: why the chosen ship cannot be had (the world's words, the amounts in gold) or what the last key said (in the accent), at the left;
  // the keys flush right. A crew's ship not had has no key: its crew's run first.
  const message = ui.message ? { text: ui.message, ink: CONFIG.hud.accent, side: 'left', money: true }
    : action.reason ? { text: action.reason, ink: G, side: 'left', money: true } : null;
  footKeys(w, sw, box, [
    ...(action.words ? [{ key: keyName('choose') || 'choose', words: action.words, id: 'key:choose', dim: !action.enabled, right: true }] : []),
    { key: '← → ↑ ↓', words: 'SHIP', id: 'key:ships', right: true },
    { key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back', right: true },
  ], { top: sw.rowAt(box.y, footRow), message });
  finish(w);
  return { ships, box, boxes: w.boxes, layout: { ...HANGAR, side, gap } };
}

// ================================================================================================================================
// The sign composer (L)
// ================================================================================================================================

// SX's S8: 78 columns. The sign as it will stand, the game's own drawing, in its box (six rows); under it `01 TYPE` and its choice (‹ STARS ›, which T
// steps too) with its place among the types at the right; `02 WORDS` and, under it, how many are found, and the words in four columns: a known word
// white, a word the sign holds the inverted row (as the one under the pointer), a word not found gray stars as long as the word (as the card's WORDS).
// The keys' choice is the white square round its word, as the card's souvenir. The head: the signs the pilot has left and the chalk; the last key's words
// stand there in the accent in their place.
export const SIGN = Object.freeze({
  cols: 78, boxRows: 6,
  typeRow: 7, wordsRow: 9,    // rows from the body's first
  wordsAt: 20, cell: 14, per: WORDS_PER_ROW,   // the words' columns: from here, a cell wide, this many a row (the arrows' ↑ ↓ step this many: labs/graphics/screens.js)
});

// `ui`: the registry's signUI ({ words, selected, type, message }). Returns `wordBoxes` ([{ index, box }], a click adds the word as ENTER does) and the
// window's `box`.
export function drawSignComposer(r, world, ui) {
  const w = ledger(r, { id: 'sign' }), sw = swiss(r), { cw, m, I } = sw, per = SIGN.per, pad = SWISS.barPad;
  const rows = Math.ceil(WORDS.length / per), footRow = SWISS.headGap + SIGN.wordsRow + rows + SWISS.footRows;
  const bw = Math.round(2 * I + SIGN.cols * cw), bh = sw.heightWithKeys(footRow), at = placeWindow(r, bw, bh);
  const box = { x: at.x, y: at.y, w: bw, h: bh }, L = box.x + I, R = box.x + bw - I, bodyAt = (k) => sw.rowAt(box.y, SWISS.headGap + k);
  sheet(sw, box, footRow);
  // The head: the title, and at the right the signs left and the chalk (the last key's words in the accent in their place).
  const own = world.signs.placed.length;
  headRow(sw, box, [['LEAVE A SIGN', W]], ui.message ? [[ui.message, CONFIG.hud.accent]] : [
    ...(own >= SIGN_LIMIT ? [['REPLACES OLDEST', G]] : []),
    { runs: [['YOUR SIGNS ', G], [`${own} / ${SIGN_LIMIT}`, W]] }, { runs: [['CHALK ', G], [String(world.chalk ?? 0), W]] },
    ...(world.sector?.label ? [[world.sector.label, Q]] : [])]);
  // The sign as it will stand, of the chosen type, in its box (STARS scatters its sky wide: kept inside it).
  const picture = { x: Math.round(L), y: Math.round(sw.capTopOf(bodyAt(0))), w: Math.round(R - L), h: SIGN.boxRows * UI.row };
  const put = (c, gx, gy, color, a = 1) => { if (gx - cw / 2 >= picture.x + 1 && gx + cw / 2 <= picture.x + picture.w - 1) w.r.glyphNow(c, gx, gy, color, a); };
  drawSign(put, w.r, picture.x + picture.w / 2, picture.y + 3.5 * UI.row, draftCaption(ui.words), world.pilot.nickname, CONFIG.sign, ui.type, world.time ?? 0, { preview: true });
  frameBox(sw, picture);
  // 01 TYPE: its choice at the words' column, its place among the types at the right; the row is a button (a click steps it, as T does).
  const type = Math.max(0, SIGN_TYPES.findIndex((t) => t.id === ui.type)), typeTop = bodyAt(SIGN.typeRow), value = signTypeLabel(ui.type);
  const wordsX = L + SIGN.wordsAt * cw, typeBox = { x: L - pad, y: typeTop, w: R - L + 2 * pad, h: UI.row };
  w.item('type', typeBox, (on) => {
    if (on) bar(sw, typeBox);
    hangHead(sw, L, typeTop, 1, 'TYPE', { on });
    drawStep(sw, { right: wordsX + (len(value) + 4) * cw - 2 * m.capLeft, top: typeTop, value, on });
    sw.textEnd(`${type + 1} / ${SIGN_TYPES.length}`, R, typeTop, onBar(on, Q), on);
  }, 'flat');
  // 02 WORDS: how many are found under its name, and the words.
  const wordsTop = bodyAt(SIGN.wordsRow), found = WORDS.filter((x) => world.collection.words.has(x.id)).length;
  hangHead(sw, L, wordsTop, 2, 'WORDS');
  sw.text(`${found} / ${WORDS.length}`, L + 4 * cw, bodyAt(SIGN.wordsRow + 1), W);
  const wordBoxes = [];
  WORDS.forEach((wd, i) => {
    const known = world.collection.words.has(wd.id), chosen = ui.words.includes(wd.id), shown = known ? wd.text : '*'.repeat(len(wd.text));
    const wx = Math.round(wordsX + (i % per) * SIGN.cell * cw), top = bodyAt(SIGN.wordsRow + Math.floor(i / per));
    const cell = { x: wx - pad, y: top, w: Math.round((SIGN.cell - 1) * cw), h: UI.row };
    const draw = (on) => {
      const lit = known && (on || chosen);
      if (lit) bar(sw, cell);
      sw.text(shown, wx, top, lit ? BLACK : known ? W : H, lit);
      // The keys' choice, in the white square round the word's ink.
      if (i === ui.selected) selectMark(w, { x: wx, y: Math.round(sw.capTopOf(top)), w: len(shown) * cw, h: sw.CAP });
    };
    if (known) { wordBoxes.push({ index: i, box: cell }); w.item(`word:${wd.id}`, cell, draw, 'flat'); } else draw(false);
  });
  footKeys(w, sw, box, [
    { key: keyName('addWord') || 'addWord', words: 'ADD', id: 'key:addWord' },
    { key: keyName('removeWord') || 'removeWord', words: 'UNDO', id: 'key:removeWord' },
    { key: keyName('signType') || 'signType', words: 'TYPE', id: 'key:signType' },
    { key: keyName('placeSign') || 'placeSign', words: 'LEAVE SIGN', id: 'key:placeSign' },
    { key: keyName('back') || 'back', words: 'CANCEL', id: 'key:back', right: true },
  ], { top: sw.rowAt(box.y, footRow) });
  // The TYPE row steps the type as its key does.
  const typed = w.boxes.get('type');
  if (typed) noteKey(keyName('signType'), typed, r);
  finish(w);
  return { wordBoxes, box, boxes: w.boxes, layout: { ...SIGN, perRow: per } };
}

// ================================================================================================================================
// The controls list (?)
// ================================================================================================================================

// SX's S4: 90 columns (more where a page's keys take more). The head: CONTROLS, and at the right the mode the list shows, ‹ KEYS + CLICKS ›, with its
// place among the modes (a click on it, or ← →, pages to the other); under the rule the intro in gray; then the groups in two columns, each a hanging
// head (`01 FLY`) and under it, half a row on, its rows: the keys as the cockpit's caps flush right on one axis (several keys, several caps; a way that is
// no key, the mouse's HOLD L, a click, in white words there), the words of what they do a line's step after them. The foot: ← → SCHEME and ESC CLOSE.
// The window is as tall and as wide for every mode as the tallest and widest page makes it, so paging does not move it.
export const CONTROLS = Object.freeze({ cols: 90, half: 47, head: 1.5 });
const capsWidth = (sw, tokens) => tokens.reduce((n, t) => n + keycapWidth(sw, t), 0) + (tokens.length - 1) * SWISS.keyGap * sw.cw;
const cellWidth = (sw, cell) => { const t = keyTokens(cell); return t ? capsWidth(sw, t) : len(String(cell).trim()) * sw.cw; };
const groupRows = (list) => CONTROLS.head + list.length;
const columnRows = (groups) => groups.reduce((n, [, list]) => n + groupRows(list), 0) + Math.max(0, groups.length - 1);
// A column's measures: the keys' axis (px: the widest cell) and the columns it takes (the axis, a line's step, the longest words or head).
function columnOf(sw, groups) {
  const rows = groups.flatMap(([, list]) => list), key = Math.max(0, ...rows.map(([k]) => cellWidth(sw, k)));
  const words = Math.max(0, ...rows.map(([, d]) => len(d)), ...groups.map(([h]) => 4 + len(h)));
  return { key, cols: Math.ceil((key + UI.line.cols * sw.cw) / sw.cw) + words };
}

// `opts`: { page (a mode: K, M), can (what the hull can do, src/chassis.js), steering (src/steering.js) }. Returns the window's `box` and `scheme` ({ box,
// back }: the head's choice and its ‹, which the registry makes a button).
export function drawControlsWindow(r, { page = DEFAULT_SCHEME, can = null, steering = 'tank' } = {}) {
  const w = ledger(r, { id: 'controls' }), sw = swiss(r), { cw, m, I } = sw, pad = SWISS.barPad;
  const pages = SCHEMES.map((p) => helpColumns(p, can, steering).map((groups) => ({ groups, ...columnOf(sw, groups) })));
  // The second column starts where the longest first one leaves it room, on every page alike; the window holds the widest page's.
  const half = Math.max(CONTROLS.half, ...pages.map(([a]) => a.cols + UI.group.cols));
  const cols = Math.max(CONTROLS.cols, ...pages.map(([, b]) => half + (b?.cols ?? 0)));
  const intro = wrap(helpIntro(page), cols, 3), tallest = Math.max(...pages.map((p) => Math.max(...p.map((c) => columnRows(c.groups)))));
  const introRows = Math.max(...SCHEMES.map((p) => wrap(helpIntro(p), cols, 3).length));
  const bodyRows = introRows + 1 + tallest, footRow = SWISS.headGap + bodyRows + SWISS.footRows;
  const bw = Math.round(2 * I + cols * cw), bh = sw.heightWithKeys(footRow), at = placeWindow(r, bw, bh);
  const box = { x: at.x, y: at.y, w: bw, h: bh }, L = box.x + I, R = box.x + bw - I, bodyAt = (k) => sw.rowAt(box.y, SWISS.headGap + k);
  sheet(sw, box, footRow);
  // The head: CONTROLS, and the mode with its place among the modes (an arrow at an end of the row is quiet: there is no page past it).
  const headTop = sw.rowAt(box.y, 0), at0 = SCHEMES.indexOf(page), value = SCHEME_NAMES[page] ?? '', count = `${at0 + 1} / ${SCHEMES.length}`;
  const n = len(value) + 4, right = R - (len(count) + SWISS.gap) * cw, origin = right + m.capLeft - n * cw;
  const choice = { x: origin - pad, y: headTop, w: n * cw + 2 * pad, h: UI.row }, back = { x: origin - cw / 2, y: headTop, w: 2 * cw, h: UI.row };
  headRow(sw, box, [['CONTROLS', W]]);
  w.item('scheme', choice, (on) => {
    if (on) bar(sw, choice);
    drawStep(sw, { right, top: headTop, value, on, ends: [at0 > 0, at0 < SCHEMES.length - 1] });
  }, 'flat');
  sw.textEnd(count, R, headTop, Q);
  intro.forEach((s, k) => sw.text(s, L, bodyAt(k), G));
  // The groups: numbered across the columns, each a head and its rows half a row under it, a blank row between groups.
  let number = 0;
  pages[SCHEMES.indexOf(page)]?.forEach((column, c) => {
    const x = L + (c ? half : 0) * cw, axis = x + column.key, wordsAt = axis + UI.line.cols * cw;
    let k = introRows + 1;
    column.groups.forEach(([heading, list]) => {
      hangHead(sw, x, bodyAt(k), ++number, heading);
      list.forEach(([cell, words], i) => {
        const top = bodyAt(k + CONTROLS.head + i), tokens = keyTokens(cell);
        if (tokens) {
          // Caps flush right on the axis; each one a legend, not a button.
          let at1 = axis - capsWidth(sw, tokens);
          unnoted(() => { for (const t of tokens) { const cap = keycapAt(sw, t, at1, top); at1 = cap.x + cap.w + SWISS.keyGap * cw; } });
        } else sw.textEnd(String(cell).trim(), axis, top, W);
        sw.text(words, wordsAt, top, W);
      });
      k += groupRows(list) + 1;
    });
  });
  footKeys(w, sw, box, [
    { key: '← →', words: 'SCHEME', id: 'key:scheme' },
    { key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back', right: true },
  ], { top: sw.rowAt(box.y, footRow) });
  finish(w);
  return { box, scheme: { box: choice, back } };
}
