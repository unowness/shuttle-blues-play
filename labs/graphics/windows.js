// The centred windows: the pilot card (C), a station's INFO, the hangar (HANGAR at a garage), the sign composer (L) and the controls list (?), all in
// the Swiss manner since SX's picks of 2026-10-09 (labs/graphics/swiss.js: the character grid, hanging heads, the frames' gray, the inverted row under
// the pointer; the card on labs/graphics/sketches/windows-swiss.html, S3, the others on windows-swiss-2.html, S4 and S6-S8: «берем но наши текущие
// контекстные окна не трогаем мы сейчас поп апами занимаемся»; the chrome they share, labs/graphics/swiss-window.js). Each is the page's spec of it with
// the game's own data and state: what the keys chose (a souvenir, a ship, a word), the last action's message, the name being typed.
// Presentation only, as the panels they replace were (src/pilotPanel.js, src/stationPanel.js, src/hangarPanel.js, src/signPanel.js
// keep their words: what each window holds): what a key or a click does is the screens registry's (labs/graphics/screens.js), which reads the
// boxes each window returns. The flight goes on underneath every one.
import { CONFIG } from '../../src/config.js';
import { ROLES } from '../../src/roles.js';
import { UI, centredWindow as centred } from '../../src/uiGrid.js';
import { COMPACT_NAMES, fitText } from '../../src/interface.js';
import { COLLECTIBLES, WORDS } from '../../src/progression.js';
import { findDef } from '../../src/rewards.js';
import { sectorById, stationDefById } from '../../src/sectors.js';
import { SHIPS, shipModel } from '../../src/hangar.js';
import { journey, CHARM_NONE } from '../../src/pilot.js';
import { PAINTS, paintById } from '../../src/paint.js';
import { lookById, ownedLooks } from '../../src/looks.js';
import { SPECIAL_IDS, specialById } from '../../src/specialShips.js';
import { formatCR, workingKind } from '../../src/ruins.js';
import { wrap } from '../../src/pilotPanel.js';
import { shipStats, hangarAction } from '../../src/hangarPanel.js';
import { stationStatus, stationOffers, wrapItems } from '../../src/stationPanel.js';
import { stationInfo, stationLoreNow } from '../../src/stationInfo.js';
import { draftCaption, WORDS_PER_ROW } from '../../src/signPanel.js';
import { SIGN_LIMIT, SIGN_TYPES, signTypeLabel, drawSign } from '../../src/signs.js';
import { drawAvatar } from '../../src/shipAvatar.js';
import { frameInk, onFrame } from '../../src/frames.js';
import { drawSouvenirPicture } from '../../src/souvenirPictures.js';
import { keyName, helpColumns, helpIntro, SCHEMES, SCHEME_NAMES, DEFAULT_SCHEME } from '../../src/controls.js';
import { noteKey, unnoted } from './clicks.js';
import { swiss, SWISS, BLACK, Q, pad2, sectorLine, frameBox, edgeRule, crossBox, bar, onBar, keycapAt, keycapWidth, drawStep } from './swiss.js';
import { placeWindow, sheet, headRow, hangHead, footKeys, putPartEnd, partCols, keyTokens } from './swiss-window.js';
import { W, G, H, ledger, finish, selectMark, len } from './ledger.js';

const NAME_COLS = 14;                       // the name field's columns: a name's twelve letters (src/pilot.js) and two

// ================================================================================================================================
// The pilot card (C), in the Swiss manner
// ================================================================================================================================

// SX's pick of 2026-10-09 (labs/graphics/sketches/windows-swiss.html, S3: «карточку пилота можно расширить ... отдельная колонка, где список
// всех слов ... которые не нашли, они звездочками отмечены просто и серые»; the kit and its rules, labs/graphics/swiss.js): the card wide, four
// columns kept apart by space: 01 SHIP (its drawing in its box, its class, its figures), 02 RECORD (the counts, the
// journey with its bar, and under it the chosen souvenir's number, name and lore), 03 SOUVENIRS (twelve places three across: a found one its art
// and its name, an empty one the layout's crossed box with its number and a dash), 04 WORDS (all thirty numbered in two columns: a found one
// white, one not found gray stars as long as the word). Under them, over a rule, the four switches in one band, each its name and count over
// ‹ VALUE ›, and the foot's keys under another. 1,084 px wide at the game's 9.27 px cell where the other cards were 657: over the HUD's
// columns at 1280 (SX allowed the widening), so it stands in the middle of the screen, not between them (centredWindow `clear: false`).
// The two widths: WIDE as above (a group's step of columns between the four), NARROW where the screen is under it (a line's step between them,
// the columns a little shorter, the places a column apart): 936 px, for a window of 1024, which still draws the whole card.
export const CARD = Object.freeze({
  across: 3,                                       // souvenirs across: the arrows' ↑ ↓ step this many (labs/graphics/screens.js pilotKeys)
  wide: Object.freeze({ cols: Object.freeze({ ship: 17, record: 26, tiles: 34, words: 24 }), gut: UI.group.cols, tileGap: UI.line.cols }),
  narrow: Object.freeze({ cols: Object.freeze({ ship: 15, record: 22, tiles: 32, words: 22 }), gut: UI.line.cols, tileGap: UI.space.cols }),
  tileCols: 10,                                    // a place's box: square, this many columns across; the next a gap off
  avatar: 6,                                       // the ship's box, rows across and down
  lead: 18,                                        // the head's second word, columns in (the name's room: its twelve letters and the field's air)
  // Rows from the head's row (halves allowed): the columns' heads (the body's first, under the head's band: SWISS.headGap), their first row, the
  // band's rule (`air` over its cells, which a focus inverts), its name row, the foot. The head's rule and the foot's are the sheet's own
  // (labs/graphics/swiss.js headRule, footRule).
  rows: Object.freeze({ heads: 1.5, first: 3, bandRule: 26, band: 26.5, foot: 29.5 }),
});

// The card's measures on `r`: the wide ones where the screen holds them (the window's inset from its edges), else the narrow.
export function cardLayout(r) {
  const cw = r.cellW, E = Math.round(UI.air.inset), I = SWISS.air + 1;
  const width = (l) => 2 * I + (l.cols.ship + l.cols.record + l.cols.tiles + l.cols.words + 3 * l.gut) * cw;
  const l = width(CARD.wide) <= r.width - 2 * E ? CARD.wide : CARD.narrow;
  return { ...l, across: CARD.across, perRow: CARD.across, width: Math.round(width(l)) };
}

// `ui`: the screens registry's pilotUI ({ selected, editing, message, lore }). Returns the boxes the registry reads: `nameBox` (where
// the name field stands while the name is typed: the head's first word), `paintBox`, `cockpitBox`, `lookBox`, `charmBox` (the band's cells, a click
// steps them, as P, K, L and J do) and `backs` (each one's ‹, a click on it steps back), `tiles` ([{ index, box }], a click chooses), and the
// window's `box`.
export function drawPilotCard(r, world, ui) {
  const w = ledger(r, { id: 'card' }), sw = swiss(r), { cw, m, I } = sw, P = world.pilot, j = journey(world), CR = CARD.rows, lay = cardLayout(r), C = lay.cols;
  const def = SHIPS.find((s) => s.id === world.hangar?.flying) ?? SHIPS[0];
  const fig = Object.fromEntries(shipStats(def.id).map((x) => [x.key, x.text]));
  const gut = lay.gut * cw, inner = (C.ship + C.record + C.tiles + C.words) * cw + 3 * gut;
  const bw = Math.round(2 * I + inner), bh = sw.heightWithKeys(CR.foot);
  const E = Math.round(UI.air.inset), mid = centred(r, bw, bh, { clear: false });
  const box = { x: Math.max(E, mid.x), y: mid.y, w: bw, h: bh };
  const L = box.x + I, R = box.x + bw - I, rowAt = (k) => sw.rowAt(box.y, k);
  const xs = [L];
  for (const n of [C.ship, C.record, C.tiles]) xs.push(xs.at(-1) + n * cw + gut);       // each column's ink left
  const [xA, xB, xC, xD] = xs.map(Math.round), colRight = (x, n) => x + n * cw;
  const headRule = sw.headRule(box.y), bandRule = Math.round(rowAt(CR.bandRule)), footRule = sw.footRule(box.y, CR.foot);

  // The sheet, its frame, and three rules, each across to the frame's lines (SX, 2026-10-09: «Держись минимализма»): under the head, over the
  // switches' band, over the foot. The columns and the band's cells are kept apart by space.
  r.fill(box.x, box.y, box.w, box.h, ROLES.backing);
  frameBox(sw, box);
  for (const y of [headRule, bandRule, footRule]) edgeRule(sw, box, y);
  const cell = inner / 4, cellX = (i) => L + i * cell, ruleOff = 3 * UI.pad;

  // The head: the name (an HTML field takes its place while it is typed), what this is, and at the right the sector and the journey.
  const headTop = rowAt(0), say = (s, x, top, ink) => sw.text(s, x, top, ink), sayEnd = (s, x, top, ink) => sw.textEnd(s, x, top, ink);
  if (!ui.editing) say(P.nickname, L, headTop, W);
  say('PILOT CARD', L + CARD.lead * cw, headTop, G);
  const pct = `${Math.round(j.progress * 100)}%`;
  sayEnd(pct, R, headTop, W);
  sayEnd('JOURNEY ', R - len(pct) * cw, headTop, G);
  const place = sectorLine(world);
  if (place) sayEnd(place, R - (len(pct) + 8) * cw - gut, headTop, G);
  // The name field's box: its text (inside its 1 px border and its `pad`) on the head's first word, room for a name's twelve letters and two.
  const origin = L - m.capLeft;
  const nameBox = { x: origin - 1 - UI.pad, y: headTop + m.textY - (UI.row - r.cellH) / 2, w: NAME_COLS * cw + 2 * (1 + UI.pad), h: UI.row };

  // The columns' heads: number, name, and at the right a count where there is one.
  const heads = [[xA, C.ship, '01', 'SHIP', null], [xB, C.record, '02', 'RECORD', null],
    [xC, C.tiles, '03', 'SOUVENIRS', `${world.collection.discovered.size} / ${COLLECTIBLES.length}`],
    [xD, C.words, '04', 'WORDS', `${WORDS.filter((x) => world.collection.words.has(x.id)).length} / ${WORDS.length}`]];
  for (const [x, n, num, name, count] of heads) {
    say(num, x, rowAt(CR.heads), H);
    say(name, x + 4 * cw, rowAt(CR.heads), G);
    if (count) sayEnd(count, colRight(x, n), rowAt(CR.heads), W);
  }
  const first = (k) => rowAt(CR.first + k);                        // a column's k-th row, from the first
  const inkTop = Math.round(sw.capTopOf(rowAt(CR.first)));         // a box's top on the first row's capitals
  const pair = (x, n, k, label, value) => { say(label, x, first(k), G); sayEnd(String(value), colRight(x, n), first(k), W); };

  // 01 SHIP: its drawing in its box, its class and note, its figures.
  const side = CARD.avatar * UI.row, avatar = { x: xA, y: inkTop, w: side, h: side };
  drawAvatar(w.r, world.ship.model, avatar.x - cw / 2, avatar.y - UI.row / 2, Math.round(side / cw) + 1, side / UI.row + 1,
    { largest: 2.4, pose: true, fill: 0.62, paint: P.paint, line: ROLES.backing });
  frameBox(sw, avatar);
  const under = CARD.avatar + 1;
  say(def.label, xA, first(under), W);
  say(def.note, xA, first(under + 1), G);
  [['SPEED', fig.speed], ['TURN', fig.turn], ['HULL', fig.hull], ['TANK', fig.tank]].forEach(([label, v], k) => pair(xA, C.ship, under + 3 + k, label, v));

  // 02 RECORD: the counters, the tallies, the journey with its bar.
  let k = 0;
  for (const it of j.rows) pair(xB, C.record, k++, it.label, `${it.have} / ${it.of}`);
  k += 1;
  for (const [label, v] of [['CARGO RECOVERED', j.recovered], ['CARGO RESCUED', j.rescued], ['WRECKS', world.wrecks ?? 0]]) pair(xB, C.record, k++, label, v);
  k += 1;
  pair(xB, C.record, k, 'JOURNEY', pct);
  const barY = Math.round(first(k) + UI.row + UI.pad), barW = Math.round(C.record * cw);
  onFrame(() => r.fill(xB, barY, barW, 3, frameInk('rule')));
  r.fill(xB, barY, Math.round(barW * j.progress), 3, W);
  const detailK = k + 3;

  // 03 SOUVENIRS: twelve places three across. A found one: its art and its name; an empty one: the crossed box, its number, a dash. The keys' choice
  // and a click's in the white square round the place; under the pointer the name is the inverted row.
  const shortName = (d) => (len(d.label) <= CARD.tileCols ? d.label : COMPACT_NAMES[d.id] ?? d.label);
  const tile = Math.floor(CARD.tileCols * cw), pitch = (CARD.tileCols + lay.tileGap) * cw;
  const selected = Math.max(0, Math.min(COLLECTIBLES.length - 1, ui.selected ?? 0));
  const tiles = [];
  COLLECTIBLES.forEach((d, i) => {
    const tx = Math.round(xC + (i % CARD.across) * pitch), ty = inkTop + Math.floor(i / CARD.across) * (tile + UI.row);
    const pic = { x: tx, y: ty, w: tile, h: tile }, strip = { x: tx, y: ty + tile, w: tile, h: UI.row }, hit = { x: tx, y: ty, w: tile, h: tile + UI.row };
    tiles.push({ index: i, box: hit });
    w.item(`tile:${d.id}`, hit, (on) => {
      const known = world.collection.discovered.has(d.id), copies = world.collection.copiesOf(d.id);
      if (known) drawSouvenirPicture(w.r, d.id, tx, ty, tile, copies ? 1 : 0.45, { whole: true });
      else crossBox(sw, pic, pad2(i + 1));
      if (on) bar(sw, strip);
      sw.text(known ? shortName(d) : '—', tx, ty + tile, on ? BLACK : known ? W : H, on);
      if (i === selected) selectMark(w, pic);
    }, 'flat');
  });

  // The chosen souvenir under the journey: its number, its name, its lore, where it was found.
  const sel = COLLECTIBLES[selected], known = world.collection.discovered.has(sel.id);
  const inst = world.collection.instances.find((x) => x.defId === sel.id && x.source), cache = inst && findDef(inst.source, world.ledger);
  const lore = known ? ui.lore?.[sel.id]?.lore ?? '' : 'Not found. Search the caches.';
  say(pad2(selected + 1), xB, first(detailK), H);
  say(known ? sel.label : '???', xB + 4 * cw, first(detailK), W);
  wrap(lore, C.record, 4).forEach((s, n) => say(s, xB, first(detailK + 1 + n), G));
  if (known && cache) {
    say('FOUND', xB, first(detailK + 6), G);
    sayEnd(fitText(`CACHE, ${sectorById(cache.sector)?.label ?? cache.sector}`, C.record - 7), colRight(xB, C.record), first(detailK + 6), W);
  }

  // 04 WORDS: all thirty, numbered, two columns of fifteen; a found one white, the rest gray stars as long as the word.
  const half = Math.ceil(WORDS.length / 2), wordCol = (C.words / 2) * cw;
  WORDS.forEach((wd, i) => {
    const x = Math.round(xD + (i < half ? 0 : wordCol)), top = first(i % half), got = world.collection.words.has(wd.id);
    say(pad2(i + 1), x, top, H);
    say(got ? wd.text : '*'.repeat(len(wd.text)), x + 3 * cw, top, got ? W : H);
  });

  // The switches, one band: each cell its name and count over ‹ VALUE ›; a click on the cell steps it forward, on its ‹ back.
  const count = (list, worn) => (list.length > 1 ? `${Math.max(0, list.indexOf(worn)) + 1} / ${list.length}` : null);
  const paints = PAINTS.filter((p) => p.id === 'standard' || P.paints.has(p.id)).map((p) => p.id);
  const cockpits = [null, ...SPECIAL_IDS.filter((id) => P.cockpits.has(id))];
  const looks = ownedLooks(P.looks).map((l) => l.id);
  const charms = [CHARM_NONE, ...world.collection.kindsFound()];
  const hung = P.charm !== CHARM_NONE && P.charm !== null ? COLLECTIBLES.find((d) => d.id === P.charm) : null;
  const scheme = P.cockpit ? specialById(P.cockpit)?.cockpit.label ?? 'STANDARD' : 'STANDARD';
  const switches = [
    ['paint', 'PAINT', paintById(P.paint)?.label ?? 'STANDARD', count(paints, P.paint)],
    ['cockpit', 'COCKPIT', scheme, count(cockpits, P.cockpit)],
    ['look', 'LOOK', lookById(P.look)?.name ?? 'NOW', count(looks, P.look)],
    ['charm', 'CHARM', hung ? shortName(hung) : 'NONE', count(charms, P.charm ?? CHARM_NONE)],
  ];
  const backs = {};
  switches.forEach(([id, name, value, n], i) => {
    const x = cellX(i), cellBox = { x: Math.round(x - UI.pad), y: Math.round(rowAt(CR.band)), w: Math.round(cell - 4 * UI.pad), h: 2 * UI.row };
    const valueRow = { ...cellBox, y: cellBox.y + UI.row, h: UI.row };
    backs[id] = { x: Math.round(x - m.capLeft - cw / 2), y: valueRow.y, w: 2 * cw, h: UI.row };
    w.item(id, cellBox, (on) => {
      say(name, x, rowAt(CR.band), G);
      if (n) sayEnd(n, x + cell - 2 * ruleOff, rowAt(CR.band), H);
      if (on) bar(sw, valueRow);
      drawStep(sw, { right: x + (len(value) + 4) * cw - 2 * m.capLeft, top: rowAt(CR.band + 1), value, on });
    }, 'flat');
  });
  // The foot: its keys, each a cockpit keycap and its words (a click on N or ESC presses it); the last action's words before the ESC, in the accent.
  // While the name is typed the foot says the field's keys (they are the field's, not buttons of the card).
  const keys = ui.editing
    ? [{ key: 'ENTER', words: 'SAVE', id: 'key:enter', quiet: true }, { key: 'ESC', words: 'CANCEL', id: 'key:esc', quiet: true }]
    : [{ key: keyName('rename') || 'rename', words: 'RENAME', id: 'key:rename' }, { key: '← →', words: 'CHANGE', id: 'key:change', quiet: true },
      { key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back', right: true }];
  footKeys(w, sw, box, keys, { top: rowAt(CR.foot), gap: gut, message: ui.message ? { text: ui.message, ink: CONFIG.hud.accent } : null });
  finish(w);
  return { nameBox, paintBox: w.boxes.get('paint') ?? null, cockpitBox: w.boxes.get('cockpit') ?? null, lookBox: w.boxes.get('look') ?? null,
    charmBox: w.boxes.get('charm') ?? null, backs, tiles, box, boxes: w.boxes, layout: lay };
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

// SX's S7: three ships in three columns of 30 columns, a group's step apart (fewer where the screen is narrower, never under 16: the bars go first, below 22): each its drawing in a
// square box (six rows), under it its number, name and what it is to the pilot (ACTIVE, OWNED, or its price in the coin's gold), its class, and five
// figures on one axis, the words at the left, the numbers flush right and between them a thin bar (a hairline with its share filled in white, the share
// of the best of the three). The chosen ship's name row is the inverted row (and the one under the pointer).
export const HANGAR = Object.freeze({
  colCols: 30, minCols: 16, gap: UI.group.cols,
  box: 6,                              // the drawing's box: rows across and down
  nameRow: 7, noteRow: 8, statsRow: 10, // rows from the body's first
  labelCols: 8, valueCols: 8,          // a figure's bar starts after its label's columns and ends before its number's
});

// `ui`: the registry's hangarUI ({ selected, message }). Returns `ships` ([{ index, box }], a click chooses) and the window's `box`.
export function drawHangar(r, world, ui) {
  const w = ledger(r, { id: 'hangar' }), sw = swiss(r), { cw, I } = sw, E = Math.round(UI.air.inset), n = SHIPS.length;
  const station = world.stations.find((s) => s.id === world.docked);
  const stats = SHIPS.map((d) => shipStats(d.id)), best = stats[0].map((_, k) => Math.max(...stats.map((l) => l[k].value)));
  const avail = Math.floor((r.width - 2 * E - 2 * I) / cw);
  const colCols = Math.max(HANGAR.minCols, Math.min(HANGAR.colCols, Math.floor((avail - (n - 1) * HANGAR.gap) / n))), colW = colCols * cw;
  const footRow = SWISS.headGap + HANGAR.statsRow + stats[0].length + SWISS.footRows;
  const bw = Math.round(2 * I + (n * colCols + (n - 1) * HANGAR.gap) * cw), bh = sw.heightWithKeys(footRow), at = placeWindow(r, bw, bh);
  const box = { x: at.x, y: at.y, w: bw, h: bh }, L = box.x + I, bodyAt = (k) => sw.rowAt(box.y, SWISS.headGap + k);
  const selected = Math.max(0, Math.min(n - 1, ui.selected ?? 0)), def = SHIPS[selected], action = hangarAction(world, def.id);
  sheet(sw, box, footRow);
  headRow(sw, box, [['HANGAR', W]], [...(station ? [[station.label, G]] : []), { money: formatCR(world.ledger.credits) }]);
  const ships = [], side = HANGAR.box * UI.row, inkTop = Math.round(sw.capTopOf(bodyAt(0))), pad = SWISS.barPad;
  SHIPS.forEach((d, i) => {
    const x = Math.round(L + i * (colCols + HANGAR.gap) * cw), flying = world.hangar.flying === d.id, owned = world.hangar.owns(d.id);
    const hit = { x: x - pad, y: bodyAt(0), w: Math.round(colW) + 2 * pad, h: (HANGAR.statsRow + stats[i].length) * UI.row };
    ships.push({ index: i, box: hit });
    w.item(`ship:${d.id}`, hit, (on) => {
      const lit = on || i === selected;
      // Its drawing in its square box, the box a hairline in the frames' gray.
      const model = shipModel(d.id) ?? world.ship.model, avatar = { x, y: inkTop, w: side, h: side };
      drawAvatar(w.r, model, avatar.x - cw / 2, avatar.y - UI.row / 2, Math.round(side / cw) + 1, side / UI.row + 1,
        { largest: 2.6, pose: true, fill: 0.7, paint: world.pilot.paint, line: ROLES.backing });
      frameBox(sw, avatar);
      // Its name row: the number, the name, and at the right what it is to the pilot; the inverted row for the chosen and the pointed at.
      const top = bodyAt(HANGAR.nameRow), status = flying ? ['ACTIVE', W] : owned ? ['OWNED', G] : { money: formatCR(d.price) };
      if (lit) bar(sw, { x: x - pad, y: top, w: Math.round(colW) + 2 * pad, h: UI.row });
      // (A column too narrow for the number as well as the name and the status goes without the number.)
      const numbered = colCols - 4 - partCols(status) - 1 >= len(d.label);
      if (numbered) sw.text(pad2(i + 1), x, top, onBar(lit, Q), lit);
      sw.text(fitText(d.label, colCols - (numbered ? 4 : 0) - partCols(status) - 1), x + (numbered ? 4 * cw : 0), top, onBar(lit, W), lit);
      putPartEnd(sw, status, x + colW, top, lit);
      sw.text(fitText(d.note, colCols), x, bodyAt(HANGAR.noteRow), G);
      // Its figures: the label, the number flush right, the bar between (a hairline, its share of the best filled in white).
      const x0 = Math.round(x + HANGAR.labelCols * cw), len0 = Math.round((colCols - HANGAR.labelCols - HANGAR.valueCols) * cw);
      stats[i].forEach((s, k) => {
        const row = bodyAt(HANGAR.statsRow + k), ly = Math.round(sw.capMid(row));
        sw.text(s.label, x, row, G);
        sw.textEnd(s.text, x + colW, row, W);
        if (len0 < 4 * cw) return;       // a window too narrow for the bars (the numbers and the words stay)
        onFrame(() => w.r.fill(x0, ly, len0, 1, frameInk('frame')));
        w.r.fill(x0, ly - 1, Math.max(1, Math.round(len0 * Math.min(1, s.value / best[k]))), 3, W);
      });
    }, 'flat');
  });
  // The foot: why the chosen ship cannot be had (the world's own words, the amounts in gold) or what the last key said (in the accent), at the left; the
  // keys flush right. The row stands whether or not it has words, so the window keeps its height as the arrows choose.
  const flying = world.hangar.flying === def.id;
  const message = ui.message ? { text: ui.message, ink: CONFIG.hud.accent, side: 'left', money: true }
    : !flying && action.reason ? { text: action.reason, ink: G, side: 'left', money: true } : null;
  footKeys(w, sw, box, [
    { key: keyName('choose') || 'choose', words: world.hangar.owns(def.id) ? `USE ${def.label}` : `BUY ${def.label}`, id: 'key:choose', dim: !action.enabled, right: true },
    { key: '← →', words: 'SHIP', id: 'key:ships', right: true },
    { key: keyName('back') || 'back', words: 'CLOSE', id: 'key:back', right: true },
  ], { top: sw.rowAt(box.y, footRow), message });
  finish(w);
  return { ships, box, boxes: w.boxes, layout: { ...HANGAR, colCols } };
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
