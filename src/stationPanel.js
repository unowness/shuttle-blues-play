import { CONFIG } from './config.js';
import { fitText } from './interface.js';
import { UI, uiPanel, uiMetrics, uiAir, centredWindow, frameInk } from './uiGrid.js';
import { sectorById, stationDefById } from './sectors.js';
import { stationInfo, stationLoreNow } from './stationInfo.js';
import { workingKind, invested, formatCR } from './ruins.js';
import { offersAt } from './contracts.js';
import { wrap } from './pilotPanel.js';

// A station's info (SX, 2026-09-30: «напиши для каждой станции info с лорам в их
// тематике, каждая станция дает тематические заказы»): INFO in a station's menu
// opens it. Its name and sector, what it is now, its lore, the goods its runs
// carry and what it offers, and its drawing, alive, at the right. The flight goes on underneath
// it, as under the hangar: the ship's controls let go, the world not paused. Presentation only.

const ink = () => CONFIG.hud.hot;
const muted = () => CONFIG.hud.color;
const hint = () => CONFIG.hud.hint;
const frame = () => CONFIG.hud.hint;              // the card's gray lines (the pilot card, 2026-09-30)

// Columns: the frame, `line`, the text (TEXT_COLS), `group`, the picture
// (PICTURE_COLS), `line`, the frame. Rows: the text block's lines keep the row's
// pitch; the block stands `inset` from the frame at the top and the bottom.
const TEXT_COLS = 44;                              // the lore's measure: four lines of about 44
const PICTURE_COLS = 28;
const LORE_LINES = 4, GOODS_LINES = 2;
// The block, row by row: title, status, blank, lore x4, blank, GOODS x2, OFFERS, blank, keys.
const AT = { title: 0, status: 1, lore: 3 };
AT.goods = AT.lore + LORE_LINES + 1;
AT.offers = AT.goods + GOODS_LINES;
AT.keys = AT.offers + 2;

export function stationPanelLayout(r) {
  const cw = r.cellW, ROW = UI.row, m = uiMetrics(r);
  const cols = UI.line.cols + TEXT_COLS + UI.group.cols + PICTURE_COLS + UI.line.cols;
  // By ink, in the pop-ups' air (src/uiGrid.js uiAir, the pilot card's): the title's capitals `inset` under the frame's line, the
  // keys' `inset` over the bottom one.
  const { CAP, frameTop, afterLine, lineAfter } = uiAir(r);
  const titleCap = afterLine(frameTop);
  const keysCap = titleCap + AT.keys * ROW;
  const frameBottom = lineAfter(keysCap + CAP);
  const height = frameBottom + ROW / 2;
  const { x, y } = centredWindow(r, cols * cw, height, { ink: frameInk(r) });
  const textCol = UI.line.cols, pictureCol = textCol + TEXT_COLS + UI.group.cols;
  // The picture's room: across its columns, down from the title's capitals to the last fact's.
  const picture = {
    x: x + pictureCol * cw + m.textX, w: PICTURE_COLS * cw - 2 * m.textX,
    y: y + titleCap, h: AT.offers * ROW + CAP,
  };
  return { cols, rows: height / ROW, height, x, y, cw, row: ROW, textCol, pictureCol, titleCap, keysCap, frameBottom, picture, at: AT };
}

// A list wrapped between its items, never inside one (SIGNAL LAMPS stays on one
// line), a comma after each but the last, at most `lines` lines (the last cut with
// an ellipsis).
export function wrapItems(items, cols, lines) {
  const out = [''];
  items.forEach((item, i) => {
    const token = i < items.length - 1 ? `${item},` : item;
    const line = out[out.length - 1];
    if (line && Array.from(line).length + 1 + Array.from(token).length > cols) out.push(token);
    else out[out.length - 1] = line ? `${line} ${token}` : token;
  });
  if (out.length > lines) { out.length = lines; out[lines - 1] = fitText(`${out[lines - 1]} …`, cols); }
  return out.map((line) => fitText(line, cols));
}

// What the station is now, in words: a freight hub, a garage, a ruin and its price, or one a wreck or a raid broke and its bill
// (src/stationService.js breakStation; Codex's text pass UI-03, SX 2026-10-07: it said FREIGHT HUB while its services were shut).
export function stationStatus(world, station) {
  const kind = workingKind(world.ledger, station);
  if (kind === 'ruin') {
    const put = invested(world.ledger, station.id);
    return put > 0 ? `RUIN / FUNDED ${formatCR(put)} OF ${formatCR(station.cost)} CR` : `RUIN / RESTORE FOR ${formatCR(station.cost)} CR`;
  }
  const bill = world.ledger.broken?.get(station.id);
  if (bill) return `DAMAGED / REPAIR FOR ${formatCR(bill)} CR`;
  if (kind === 'home') return 'YOUR GARAGE';
  const what = kind === 'garage' ? 'GARAGE' : 'FREIGHT HUB';
  const status = station.kind === 'ruin' ? `RESTORED / ${what}` : what;
  // A station worn by hard blows (src/stationService.js wearStation) says how much of its hull is gone; it breaks at a fifth.
  const worn = world.ledger.wear?.get(station.id);
  return worn ? `${status} / ${Math.round(100 * worn)}% WORN` : status;
}

// What it offers a pilot who docks: what the station's menu holds now, in the menu's
// order. Runs while it has one to give, fuel and coffee at every working station, repairs
// and the hangar at a garage, the hull's patch at a freight hub (src/stationService.js patchAction; UI-05). A ruin offers
// nothing until it is rebuilt, a broken station nothing until repaired (UI-03). A list with
// commas, like GOODS beside it, and docking itself left out: it is how any of these is
// reached, and the line has 36 columns.
export function stationOffers(world, station) {
  const kind = workingKind(world.ledger, station);
  if (kind === 'ruin') return 'RESTORE TO OPEN';
  if (world.ledger.broken?.has(station.id)) return 'REPAIR TO REOPEN';
  if (kind === 'home') return 'FUEL, REPAIRS';
  const garage = kind === 'garage';
  return [
    offersAt(station.id, world.ledger).length > 0 && 'JOBS',
    'FUEL',
    garage ? 'REPAIRS' : 'HULL PATCH',
    'COFFEE',
    garage && 'HANGAR',
  ].filter(Boolean).join(', ');
}

// Draws the panel for `ui.stationId`. `ui.drawLook(r, cx, cy, w, h)`, when there
// is one, draws the station's look centred in that room (the lab's art).
// The look before SX's V2 (2026-10-05): the game draws this window in the menus' look now (labs/graphics/windows.js drawStationInfo); this
// painter stays only for the sketch pages that show the old look beside the new (labs/graphics/sketches/popups-v2.html, and
// menus-ledger.html's V0). BACKLOG: remove it with them.
export function drawStationPanel(r, world, ui) {
  const station = world.stations.find((s) => s.id === ui.stationId) ?? stationDefById(ui.stationId, world.ledger);
  if (!station) return null;
  const L = stationPanelLayout(r);
  const g = uiPanel(r, L.x, L.y, L.cols, L.rows, '', frame());
  const at = (row) => g.capRow(L.y + L.titleCap) + row;
  const info = stationInfo(station.id);
  const textEnd = L.textCol + TEXT_COLS - 1;

  const sector = sectorById(station.sectorId ?? world.sector?.id);
  g.text(fitText(station.label, TEXT_COLS - 6), L.textCol, at(AT.title), ink());
  g.textEnd(sector ? sector.label : '', textEnd, at(AT.title), muted());
  g.text(fitText(stationStatus(world, station), TEXT_COLS), L.textCol, at(AT.status), muted());

  // A rebuilt ruin's lore is the rebuilt station's, not what rebuilding would do; the start's three by what each is for this
  // pilot (src/stationInfo.js stationLoreNow).
  const lore = stationLoreNow(station.id, workingKind(world.ledger, station) === 'ruin');
  wrap(lore, TEXT_COLS, LORE_LINES).forEach((line, k) => g.text(line, L.textCol, at(AT.lore + k), muted()));

  // The facts: a label column, then the values, `line` apart. GOODS, not SENDS: a
  // ruin deals in them too, once rebuilt, and the status line says which it is.
  const labels = ['GOODS', 'OFFERS'];
  const valueCol = L.textCol + Math.max(...labels.map((s) => s.length)) + UI.line.cols;
  const valueCols = textEnd - valueCol + 1;
  g.text(labels[0], L.textCol, at(AT.goods), muted());
  wrapItems(info?.goods ?? [], valueCols, GOODS_LINES).forEach((line, k) => g.text(line, valueCol, at(AT.goods + k), ink()));
  g.text(labels[1], L.textCol, at(AT.offers), muted());
  g.text(fitText(stationOffers(world, station), valueCols), valueCol, at(AT.offers), ink());

  g.text('[0] CLOSE', L.textCol, at(AT.keys), hint());

  const p = L.picture;
  if (ui.drawLook) ui.drawLook(r, p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, station);
  return { layout: L, picture: p };
}
