import { CONFIG } from './config.js';
import { lineArt, fitText, COMPACT_SOUVENIR_ART, COMPACT_NAMES } from './interface.js';
import { UI, uiPanel, uiAir, centredWindow, windowRoom, frameInk } from './uiGrid.js';
import { COLLECTIBLES } from './progression.js';
import { findDef } from './rewards.js';
import { sectorById } from './sectors.js';
import { shipById } from './hangar.js';
import { shipStats } from './hangarPanel.js';
import { journey } from './pilot.js';
import { paintById } from './paint.js';
import { lookById } from './looks.js';
import { specialById } from './specialShips.js';
import { SOUVENIR_ICONS, iconCellFitting, iconSize, drawBlockIcon } from './souvenirIcons.js';
import { PICTURE, drawSouvenirPicture, pictureSize } from './souvenirPictures.js';
import { hoverItem } from './hover.js';
import { drawAvatar } from './shipAvatar.js';

// The pilot screen: the pilot's own card on the left, the collection on the
// right. Opened with C; the flight goes on underneath it, the ship's controls let go (labs/graphics/main.js
// anyScreen, IDLE_CONTROLS: a pop-up does not pause, SX, 2026-10-02). Presentation only:
// placing a souvenir and renaming go through Collection and Pilot.

const ink = () => CONFIG.hud.hot;
const muted = () => CONFIG.hud.color;
const accent = () => CONFIG.hud.accent;
const hint = () => CONFIG.hud.hint;               // the keys, quieter than `muted`
// The card's lines and its leader dots are the keys' gray (SX, 2026-09-30: «рамку нарисуй
// такого же цвета как инструкцию по управлению, точки соединяющие статистику тоже»).
const frame = hint;
// Its outer frame is the interface's blue (SX, 2026-10-01), and so are the joints on it; over the garage's room the card
// has none (SX, 2026-10-02, of the card on the room: «у нее не должно быть контура синего, только черная заливка с
// отступом», then of the card in open space: «у карточки в открытом космосе пропал контур»): `ui.bare`, the card's black
// alone, its outer row and column the air, the dividers stopping short of it.
const edge = () => CONFIG.hud.edge;

// The card is laid out on the interface's grid (src/uiGrid.js): whole rows of
// UI.row and whole columns, nothing between (SX, 2026-09-30: «Все вот эти
// отступы ... должны быть в системе»; the map is reports/2026-09-30-spacing-system.md
// section 2). Columns: 0 the frame, 2-29 the card's text, 31 the divider, 33 to
// cols-3 the collection's text, cols-1 the frame. Rows: the frame is row 0 and
// the last row; the card's and the collection's own rows are below.
const CARD_TEXT = UI.line.cols;                    // the card's first text column: the frame, then `line`
const CARD_TEXT_COLS = 28;                         // its width
const CARD_END = CARD_TEXT + CARD_TEXT_COLS - 1;   // its last text column, 29
const DIVIDER = CARD_END + 1 + UI.space.cols;      // a blank column, then the divider: 31
const LIST_TEXT = DIVIDER + UI.line.cols;          // the divider owns its column, one blank each side: 33
// The ship's box, at the card's first text column: square, line to line (11
// columns, 102 px; SX, 2026-09-30: «аватарку сделай квадратной а корабль в ней
// сделай поменьше, чтобы там воздух был»), the ship in the middle `AVATAR_FILL` of
// it.
const AVATAR = { cols: 12 };
const AVATAR_FILL = 0.62;
// A tile: 11 columns wide (its lines 10 columns apart), 12 columns to the next one.
// Its height is its air: top line, picture, name, bottom line the same air apart,
// and that air is the air at the picture's sides (SX, 2026-09-30, the teal marks:
// «все что по цветам одинаковые ... должны быть одинаковые»). The count is gone
// (the detail has OWNED).
const TILE = { cols: 11, pitchCols: 12, perRowMax: 6 };
const PCT_COLS = 4;                                // '100%'
// The chosen souvenir's block (SX's marks of 2026-10-02): the text this many columns narrower than beside the old
// picture, the picture with at least this many insets of air round it.
const DETAIL = Object.freeze({ narrow: 4, air: 1.25 });
// The ship's figures under the avatar, in a box of their own (SX: «инфу по кораблю
// поместил наверх», «как-то надо инфу о корабле от статистики отделить»): its name
// with the note at the right, five figures, the paint.
// since the reference ships (src/specials.js) the cockpit scheme worn stands under the paint, and the figures are four (the range
// went: it is the tank over the burn, and the hangar still says it): the box is seven rows still, the card as tall as it was.
// Since the interface's looks (src/looks.js) the look worn stands under the cockpit scheme, and SPEED and TURN share a row (they
// are the ship's handling; nothing is lost, the hangar has each on its own row): the box is seven rows still, and the card
// as tall as it was (a row more would not fit a 860 px window, where the card has 6 px to spare).
const SHIP_LINES = 7;
// Seven counters (STORIES, the reference ships' notes, joined the six) and three tallies (THANKS went: it was one for every
// CARGO RESCUED, the same number twice): the card is as tall as it was.
const STAT_LINES = 7, TALLY_LINES = 3;

// The card's vertical flow, in px from its top edge, placed by ink (UI.air): every
// container's edge (the frame, the avatar's box, the ship's box, a tile, the
// divider) stands `inset` of air from what it holds and from the next container;
// a rule stands `rule` of air from the text over and under it; text inside a
// block keeps the row's pitch. The same numbers draw the card and let a check
// measure it. `ship` and `detail` say which parts there is room for.
function flow(r, { ship, detail, gridRows }) {
  const cw = r.cellW, ROW = UI.row;
  // The pop-ups' air (src/uiGrid.js uiAir): this card's own, written down for all of them.
  const { T, RA, LH, CAP, frameTop, afterLine, lineAfter, lines } = uiAir(r);
  const card = {};
  card.avatarTop = afterLine(frameTop) + LH;
  card.avatarSide = (AVATAR.cols - 1) * cw;
  card.avatarBottom = card.avatarTop + card.avatarSide;
  card.nameCap = afterLine(card.avatarTop);
  let y = card.avatarBottom;
  if (ship) {
    card.shipTop = lineAfter(y + LH);
    card.shipCap = afterLine(card.shipTop);
    card.shipBottom = lineAfter(lines(card.shipCap, SHIP_LINES));
    y = card.shipBottom;
  }
  card.statsCap = afterLine(y);
  card.rule1 = lines(card.statsCap, STAT_LINES) + RA + LH;
  card.tallyCap = card.rule1 + LH + RA;
  card.rule2 = lines(card.tallyCap, TALLY_LINES) + RA + LH;
  card.journeyCap = card.rule2 + LH + RA;
  const cardEnd = lineAfter(card.journeyCap + CAP);                // where the frame's bottom line would stand

  // No heading: the tiles `inset` under the frame, level with the avatar (SX, 2026-09-30,
  // striking COLLECTION 4 OF 12 FOUND · 9 OWNED: «статистику над сувенирами убери»; the
  // card's SOUVENIRS line has the count).
  const list = {};
  list.tileTop = card.avatarTop;
  const sideAir = ((TILE.cols - 1) * cw - 2 * LH - PICTURE.size) / 2;
  list.tileAir = sideAir;
  list.tileHeight = 2 * LH + 3 * sideAir + PICTURE.size + CAP;     // line middle to line middle
  list.tileGap = (TILE.pitchCols - TILE.cols + 1) * cw;            // line to line between rows, as across (2 columns)
  list.tilesBottom = list.tileTop + gridRows * list.tileHeight + (gridRows - 1) * list.tileGap;
  let listEnd;
  if (detail) {
    list.divider = lineAfter(list.tilesBottom + LH);
    list.detailTop = afterLine(list.divider);
    // The keys stand on the card's last text line; the detail ends `inset` over them.
    list.detailBottom = card.journeyCap - T;
    listEnd = cardEnd;
  } else {
    // No detail: the keys a blank row under the tiles.
    list.keysCap = afterLine(list.tilesBottom) + ROW;
    listEnd = lineAfter(list.keysCap + CAP);
  }
  const frameBottom = Math.max(cardEnd, listEnd);
  // The keys: level with JOURNEY, on the card's last line, when both columns are full.
  list.keysCap = detail ? card.journeyCap : list.keysCap;
  return { card, list, frameTop, frameBottom, height: frameBottom + ROW / 2 };
}

// Every measurement the screen uses, from the canvas size alone, so a check can
// verify the layout without drawing it. Redrawn 2026-09-30 from SX's sketch
// («Попробуй переверстать карточку пилота в таком стиле», «Это приблизительный
// скетч»), with only what the game knows (SX: «Только реальные данные»), as a
// panel over the flight («Панель поверх полёта»), sized for a window the size
// of the screen (SX: «фулскрин окно целевой размер»). Columns are the grid's
// (0 the frame, 2-29 the card's text, 31 the divider, 33 on the collection's);
// heights come from `flow`. A smaller window keeps it whole but plainer: no
// ship box and no detail, one row of tiles and pages when two do not fit.
export function pilotLayout(r) {
  const cw = r.cellW, row = UI.row;
  const view = r.view || { x: 0, y: 0, w: r.width, h: r.height };
  // As many tiles to a row as the width holds (six is the most: twelve kinds, two rows).
  const avail = Math.floor(windowRoom(r, frameInk(r)) / cw);      // (the centred windows' room: src/uiGrid.js centredWindow)
  const perRow = Math.max(1, Math.min(TILE.perRowMax, Math.floor((avail - LIST_TEXT - TILE.cols - UI.line.cols) / TILE.pitchCols) + 1));
  const cols = LIST_TEXT + (perRow - 1) * TILE.pitchCols + TILE.cols + UI.line.cols;
  // The fullest card that fits the flight area's height (SX, 2026-09-30: «низ можно подтянуть»).
  const options = [{ ship: true, detail: true, gridRows: 2 }, { ship: false, detail: false, gridRows: 2 }, { ship: false, detail: false, gridRows: 1 }];
  let chosen = options[options.length - 1], f = flow(r, chosen);
  for (const o of options) { const t = flow(r, o); if (t.height <= view.h) { chosen = o; f = t; break; } }
  const rows = f.height / row;
  const { x, y } = centredWindow(r, cols * cw, f.height, { ink: frameInk(r) });
  const perPage = perRow * chosen.gridRows;
  const pages = Math.ceil(COLLECTIBLES.length / perPage);
  return {
    cols, rows, x, y, cw, row, height: f.height, flow: f,
    cardCols: DIVIDER, dividerCol: DIVIDER, listX: x + DIVIDER * cw, listCols: cols - DIVIDER,
    listText: LIST_TEXT, textCols: cols - 2 - LIST_TEXT,     // the collection's text columns, first and count
    perRow, pitchX: TILE.pitchCols, gridRows: chosen.gridRows, perPage, pages, detail: chosen.detail, ship: chosen.ship,
    divider: chosen.detail ? f.list.divider / row - 0.5 : null,   // the detail's rule, as a (fractional) row
  };
}

// Words wrapped to `cols` cells, at most `lines` lines (the last cut with an ellipsis).
export function wrap(text, cols, lines) {
  const out = [''];
  for (const word of String(text).split(/\s+/)) {
    const line = out[out.length - 1];
    if (line && Array.from(line).length + 1 + Array.from(word).length > cols) out.push(word);
    else out[out.length - 1] = line ? `${line} ${word}` : word;
  }
  if (out.length > lines) { out.length = lines; out[lines - 1] = fitText(`${out[lines - 1]} …`, cols); }
  return out.map((line) => fitText(line, cols));
}

// The key that puts on the next paint owned, shown in the PAINT line (not in the foot).
export const PAINT_KEY = 'C';
// The key that puts on the next cockpit scheme owned (SX, 2026-10-02: the ships' rare quests leave a scheme in their style, «chosen
// afterwards like the paint is»), shown in the COCKPIT line under PAINT once the pilot owns one.
export const COCKPIT_KEY = 'K';
// The key that puts on the next look owned (src/looks.js, SX 2026-10-02: «В карточку пилота добавь переключение стилей»),
// shown in the LOOK line under COCKPIT. The pilot owns two from the start (NOW, ORIGINAL), so it always has a key.
export const LOOK_KEY = 'L';
// The key that hangs the next souvenir from the locator as a charm (labs/graphics/charm.js; SX, 2026-10-08): none, then each kind found in
// the order found. Its line, CHARM, stands under the souvenirs' tiles in the card (labs/graphics/windows.js); the old painter below has none.
export const CHARM_KEY = 'J';

// The key line and the message at its end, in `room` columns: the words
// shorten before the message is cut. No placing keys since 2026-10-01: the cockpit's
// shelf fills itself with every kind found (labs/graphics/souvenir-shelf.js).
function footLine(message, room) {
  const gap = ' '.repeat(UI.line.cols);
  const options = [
    ['[← → ↑ ↓] SELECT', '[0] CLOSE'],
    ['[←→] SELECT', '[0] CLOSE'],
  ].map((items) => items.join(gap));
  const length = (s) => Array.from(s).length;
  const need = message ? length(message) + UI.line.cols : 0;
  const line = options.find((option) => length(option) + need <= room) ?? options[options.length - 1];
  const left = room - length(line) - UI.line.cols;
  return { keys: fitText(line, room), message: left > 0 ? fitText(message, left) : '' };
}

// Draws the screen. `ui` holds the selected collection index, whether the name
// is being edited, a short message from the last action, and (the game's) each
// souvenir's lore by id. Returns the boxes main.js needs: where the name field
// is, for the text input, and the PAINT line, which a click repaints.
// The look before SX's V2 (2026-10-05): the game draws this window in the menus' look now (labs/graphics/windows.js drawPilotCard); this
// painter stays only for the sketch pages that show the old look beside the new (labs/graphics/sketches/popups-v2.html, and
// menus-ledger.html's V0). BACKLOG: remove it with them.
export function drawPilotPanel(r, world, ui) {
  const L = pilotLayout(r);
  const { cw, row: ROW, x, y } = L;
  const { card: C, list: S } = L.flow;
  // No title: the name heads the card (SX struck PILOT out, 2026-09-30).
  const g = uiPanel(r, x, y, L.cols, L.rows, '', ui.bare ? null : edge());
  const m = g.metrics;
  const last = L.cols - 1 - UI.line.cols;             // the last text column of the collection
  const at = (px) => g.capRow(y + px);                // the text row whose capitals start `px` down the card
  const lineAt = (px) => g.lineRow(y + px);           // the line row whose middle is `px` down the card

  // ------------------------------------------------------------- the card
  // The avatar: a square box, the ship in its middle.
  const avatarRows = C.avatarSide / ROW + 1;
  const avatarY = y + C.avatarTop - ROW / 2;
  drawAvatar(r, world.ship.model, g.X(CARD_TEXT), avatarY, AVATAR.cols, avatarRows, { largest: 2.4, pose: true, fill: AVATAR_FILL, paint: world.pilot.paint, line: frame() });

  const nameCol = CARD_TEXT + AVATAR.cols - 1 + UI.line.cols;    // two columns after the avatar's line
  const nameCols = CARD_END - nameCol + 1;
  // The name `inset` under the avatar's top line, as its ship is; RENAME under it.
  const nameRow = at(C.nameCap);
  // Where the DOM field stands: its text (the border and `pad` in) lands on the canvas name.
  // A column short of the card's end, so its focus ring keeps clear of the divider; a name is 12 letters at most.
  const nameBox = { x: g.X(nameCol) + m.textX - 1 - UI.pad, y: g.Y(nameRow) + m.textY - (ROW - r.cellH) / 2, w: (nameCols - 1) * cw + 2 * (1 + UI.pad), h: ROW };
  if (!ui.editing) g.text(fitText(world.pilot.nickname, nameCols), nameCol, nameRow, ink());
  g.text(ui.editing ? 'ENTER  SAVE' : '[N] RENAME', nameCol, nameRow + 1, muted());
  if (ui.editing) g.text('ESC    CANCEL', nameCol, nameRow + 2, muted());

  // The ship flown, in its own box under its portrait: its name with its note at
  // the right, its figures, and the paint worn (src/paint.js). Once there is another
  // paint, the key that changes it stands in the paint's own line (SX, 2026-09-30:
  // «сделай просто в строке где цвет описан, кнопочку например p»), and the line
  // answers a click.
  let paintBox = null, cockpitBox = null, lookBox = null;
  if (L.ship) {
    const id = world.hangar?.flying ?? 'standard';
    const def = shipById(id) ?? shipById('standard');
    g.box(CARD_TEXT, lineAt(C.shipTop), CARD_END, lineAt(C.shipBottom), frame());
    const inner = CARD_TEXT + UI.line.cols, innerEnd = CARD_END - UI.line.cols;
    let row = at(C.shipCap);
    g.text(def.label, inner, row, ink());
    g.textEnd(fitText(def.note ?? '', innerEnd - inner + 1 - Array.from(def.label).length - UI.line.cols), innerEnd, row, muted());
    row += 1;
    // Three rows of figures: the handling together, then the hull and the tank.
    const figure = Object.fromEntries(shipStats(def.id).map((x) => [x.key, x.text]));
    for (const [label, value] of [['SPEED / TURN', `${figure.speed} / ${figure.turn}`], ['HULL', figure.hull], ['TANK', figure.tank]]) {
      g.leader(label, value, inner, innerEnd, row++, ink(), muted(), frame());
    }
    const paint = paintById(world.pilot.paint) ?? paintById('standard');
    // A line with a key is a button (a click does what its key does) and comes up under the pointer (src/hover.js).
    const line = (id, box, draw) => hoverItem(r, `card:${id}`, box, draw);
    if (world.pilot.paints.size) {
      const key = `[${PAINT_KEY}]`, keyCols = Array.from(key).length;
      paintBox = { x: g.X(inner), y: g.Y(row), w: (innerEnd - inner + 1) * cw, h: ROW };
      line('paint', paintBox, () => {
        g.leader('PAINT', paint.label, inner, innerEnd - keyCols - UI.space.cols, row, ink(), muted(), frame());
        g.textEnd(key, innerEnd, row, hint());
      });
    } else g.leader('PAINT', paint.label, inner, innerEnd, row, ink(), muted(), frame());
    // The cockpit's colours (src/specials.js): the interface's own, or a reference ship's scheme; its key once there is one.
    row += 1;
    const scheme = world.pilot.cockpit ? specialById(world.pilot.cockpit)?.cockpit.label ?? 'STANDARD' : 'STANDARD';
    if (world.pilot.cockpits.size) {
      const key = `[${COCKPIT_KEY}]`, keyCols = Array.from(key).length;
      cockpitBox = { x: g.X(inner), y: g.Y(row), w: (innerEnd - inner + 1) * cw, h: ROW };
      line('cockpit', cockpitBox, () => {
        g.leader('COCKPIT', scheme, inner, innerEnd - keyCols - UI.space.cols, row, ink(), muted(), frame());
        g.textEnd(key, innerEnd, row, hint());
      });
    } else g.leader('COCKPIT', scheme, inner, innerEnd, row, ink(), muted(), frame());
    // The look worn (src/looks.js): its name, its key, and the row answers a click as PAINT's does.
    row += 1;
    {
      const key = `[${LOOK_KEY}]`, keyCols = Array.from(key).length;
      lookBox = { x: g.X(inner), y: g.Y(row), w: (innerEnd - inner + 1) * cw, h: ROW };
      line('look', lookBox, () => {
        g.leader('LOOK', lookById(world.pilot.look)?.name ?? 'NOW', inner, innerEnd - keyCols - UI.space.cols, row, ink(), muted(), frame());
        g.textEnd(key, innerEnd, row, hint());
      });
    }
  }

  const j = journey(world);
  let row = at(C.statsCap);
  for (const item of j.rows) {
    g.leader(item.label, `${item.have} / ${item.of}`, CARD_TEXT, CARD_END, row++, item.have >= item.of ? accent() : ink(), muted(), frame());
  }
  g.rule(CARD_TEXT, CARD_END, lineAt(C.rule1), frame());
  row = at(C.tallyCap);
  for (const [label, value] of [['CARGO RECOVERED', j.recovered], ['CARGO RESCUED', j.rescued], ['WRECKS', world.wrecks]]) {
    g.leader(label, value, CARD_TEXT, CARD_END, row++, ink(), muted(), frame());
  }
  g.rule(CARD_TEXT, CARD_END, lineAt(C.rule2), frame());
  const journeyRow = at(C.journeyCap);
  const pct = `${Math.round(j.progress * 100)}%`;
  const barCol = CARD_TEXT + 'JOURNEY'.length + UI.line.cols;
  const barCols = CARD_END - PCT_COLS - UI.line.cols - barCol + 1;
  const filled = Math.round(j.progress * barCols);
  g.text('JOURNEY', CARD_TEXT, journeyRow, muted());
  g.text('▰'.repeat(filled) + '▱'.repeat(barCols - filled), barCol, journeyRow, accent());
  g.textEnd(pct, CARD_END, journeyRow, ink());

  // The divider between card and collection, joined to the outer frame (or, bare, a row short of the card's edge).
  const bottomRow = L.rows - 1;
  if (!ui.bare) g.glyph('┬', DIVIDER, 0, edge());
  g.vline(DIVIDER, 1, bottomRow - 1, frame());
  if (!ui.bare) g.glyph('┴', DIVIDER, bottomRow, edge());

  // ------------------------------------------------------- the collection
  // No heading (SX, 2026-09-30: «статистику над сувенирами убери»); the page, when
  // a small window has pages, is at the end of the keys' line.
  const page = Math.min(L.pages - 1, Math.floor(Math.max(0, ui.selected) / L.perPage));

  const capH = m.capBottom - m.capTop;
  // Each tile a button (a click chooses it, as the arrows do; labs/graphics/main.js), coming up under the pointer
  // (src/hover.js, SX 2026-10-03: «наведение на интерфейсные кнопки, сувениры ... должны увеличиваться при ховере»).
  const tiles = [];
  COLLECTIBLES.forEach((def, i) => {
    const k = i - page * L.perPage;
    if (k < 0 || k >= L.perPage) return;
    const col = LIST_TEXT + (k % L.perRow) * TILE.pitchCols;
    const top = S.tileTop + Math.floor(k / L.perRow) * (S.tileHeight + S.tileGap);
    const box = { x: g.X(col), y: Math.round(y + top), w: TILE.cols * cw, h: S.tileHeight };
    tiles.push({ index: i, box });
    hoverItem(r, `card:tile:${def.id}`, box, () => drawTile(def, i, col, top));
  });
  function drawTile(def, i, col, top) {
    const topRow = lineAt(top), lastRow = lineAt(top + S.tileHeight);
    const known = world.collection.discovered.has(def.id);
    const copies = world.collection.copiesOf(def.id);
    g.dashed(col, topRow, col + TILE.cols - 1, lastRow, frame());
    const w = TILE.cols * cw;
    // Top line, photograph, name, bottom line, `tileAir` apart, the air at the
    // picture's sides. A kind no longer owned dimmer; its block icon or drawing
    // when the picture did not load.
    const pictureX = g.X(col) + (w - PICTURE.size) / 2, pictureY = Math.round(y + top + m.lineHalf + S.tileAir);
    const nameCap = pictureY + PICTURE.size + S.tileAir;
    if (known) {
      const drawn = drawSouvenirPicture(r, def.id, pictureX, pictureY, PICTURE.size, copies ? 1 : 0.45);
      const icon = !drawn && SOUVENIR_ICONS[def.id];
      if (icon) {
        const cell = iconCellFitting(7 * cw, PICTURE.size, r.dpr || 1), size = iconSize(cell);
        drawBlockIcon(r, icon, g.X(col) + (w - size.w) / 2, pictureY, cell, copies ? accent() : muted());
      } else if (!drawn && COMPACT_SOUVENIR_ART[def.id]) lineArt(r, COMPACT_SOUVENIR_ART[def.id], g.X(col) + UI.line.cols * cw, pictureY, copies ? accent() : muted());
      const label = Array.from(def.label).length <= TILE.cols - 2 ? def.label : COMPACT_NAMES[def.id] || def.label;
      const name = fitText(label, TILE.cols - 2);
      r.text(name, g.X(col) + (TILE.cols - Array.from(name).length) * cw / 2, Math.round(nameCap - m.capTop), copies ? ink() : muted(), 1);
    } else {
      // Not found yet: its place and a question in its middle, so the size of the set is known but not its contents.
      const middle = y + top + S.tileHeight / 2;
      r.text('?', g.X(col) + (TILE.cols - 1) * cw / 2, Math.round(middle - capH / 2 - m.capTop), hint(), 1);
    }
    if (i === ui.selected) g.corners(col, topRow, col + TILE.cols - 1, lastRow, ink());
  }

  // ------------------------------------------------ the chosen souvenir
  // SX, 2026-09-30: the text on the left, the picture on the right, «Картинку надо увеличить», «перенеси у сувениров
  // статистику вниз». Then SX's marks of 2026-10-02 («вот я тебе нарисовал как должны отступы расставлены быть где блок
  // под текст и как выровнен в свободном пространстве предмет»): the text is one block (the teal box) with the same air
  // at each of its three seams (the yellow squares), `inset` ink to ink: from the divider to the title, from the title
  // to the lore, and from the facts to the keys at the foot; the picture (the red circle) smaller, in the middle of the
  // free room beside the block, from the divider down to the card's edge and from the block to the card's side, with
  // `DETAIL.air` insets round it at least (it was twice the inset; SX asked for less, and a larger picture).
  if (L.detail) {
    g.hline(DIVIDER, L.cols - 2, lineAt(S.divider), frame(), '├', '─');
    if (!ui.bare) g.glyph('┤', L.cols - 1, lineAt(S.divider), edge());   // its joint with the outer frame
    const def = COLLECTIBLES[Math.max(0, Math.min(COLLECTIBLES.length - 1, ui.selected))];
    const known = world.collection.discovered.has(def.id);
    const copies = world.collection.copiesOf(def.id);
    const { T } = uiAir(r);
    // The text block's width: where it stood beside the larger picture, its last column a `group` clear of it, and then
    // `DETAIL.narrow` columns narrower, for a larger picture (SX, the same night: «картинки ... все-таки чуть побольше
    // надо делать можешь чуть подужать текст ... поля чуть поменьше»).
    const room = S.detailBottom - S.detailTop;
    const wide = pictureSize(PICTURE.dots * Math.max(2, Math.min(8, Math.floor(room / PICTURE.dots))), r.dpr || 1);
    const textEnd = Math.floor((g.X(last + 1) - m.textX - wide - g.X(0)) / cw) - UI.group.cols - DETAIL.narrow;
    const textCols = textEnd - LIST_TEXT + 1;
    // The free room: from the block's edge to where the card's frame stood, from the divider to the card's foot.
    const freeX0 = g.X(textEnd + 1) + UI.group.cols * cw / 2, freeX1 = g.X(L.cols - 1) + cw / 2;
    const freeY0 = y + S.divider, freeY1 = y + L.flow.frameBottom;
    const fit = Math.min(freeX1 - freeX0, freeY1 - freeY0) - 2 * DETAIL.air * T;
    const big = pictureSize(PICTURE.dots * Math.max(2, Math.min(8, Math.floor(fit / PICTURE.dots))), r.dpr || 1);
    const pictureX = Math.round((freeX0 + freeX1 - big) / 2), pictureY = Math.round((freeY0 + freeY1 - big) / 2);
    if (known) drawSouvenirPicture(r, def.id, pictureX, pictureY, big, copies ? 1 : 0.45);
    else {
      const c0 = Math.round((pictureX - g.X(0)) / cw), c1 = Math.round((pictureX + big - g.X(0)) / cw) - 1;
      g.dashed(c0, lineAt(pictureY - y), c1, lineAt(pictureY - y + big), frame());
    }
    // The block: the title `inset` under the divider's ink, the lore `inset` under the title's capitals.
    const titleRow = at(S.detailTop);
    g.text(known ? def.label : '???', LIST_TEXT, titleRow, known ? ink() : muted());
    const lore = known ? ui.lore?.[def.id]?.lore : 'Not found. Search the caches.';
    // The blurbs (labs/graphics/souvenir-lore.js, 2026-09-30) run to four lines.
    const loreRow = at(S.detailTop + capH + T);
    const loreLines = lore ? wrap(lore, textCols, 4) : [];
    loreLines.forEach((line, k) => g.text(line, LIST_TEXT, loreRow + k, muted()));
    if (known) {
      // Where the first copy still held came from: a cache, and its sector. No IN COCKPIT since
      // 2026-10-01: every kind found stands on the cockpit's shelf.
      const firstCopy = world.collection.instances.find((inst) => inst.defId === def.id && inst.source);
      const cache = firstCopy && findDef(firstCopy.source, world.ledger);
      // No OWNED since 2026-10-01 (SX: «в новой экономике вот эта надпись не нужна»): a cache holds one known item,
      // so there are no copies to count.
      const facts = [];
      if (cache) facts.push(['FOUND', `CACHE, ${sectorById(cache.sector)?.label ?? cache.sector}`]);
      const valueCol = LIST_TEXT + Math.max(...facts.map(([label]) => label.length)) + UI.line.cols;
      // At the foot of the block: the last fact's capitals end `inset` over the keys' capitals.
      const factsRow = at(S.keysCap - T - capH) - (facts.length - 1);
      facts.forEach(([label, value], k) => {
        g.text(label, LIST_TEXT, factsRow + k, muted());
        g.text(fitText(value, textEnd - valueCol + 1), valueCol, factsRow + k, ink());
      });
    }
  }

  // ------------------------------------------------------------- the foot
  // The keys on the card's last line, level with JOURNEY; the last action's word
  // (or the page) at the end of the same line.
  const paging = L.pages > 1 ? `PAGE ${page + 1}/${L.pages}` : '';
  const foot = footLine(ui.message || paging, last - LIST_TEXT + 1);
  const keysRow = at(S.keysCap);
  g.text(foot.keys, LIST_TEXT, keysRow, hint());
  if (foot.message) g.textEnd(foot.message, last, keysRow, ui.message ? accent() : hint());
  return { nameBox, paintBox, cockpitBox, lookBox, tiles, layout: L };
}
