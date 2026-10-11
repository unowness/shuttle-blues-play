import { CONFIG } from './config.js';
import { formatCR } from './ruins.js';
import { fitText } from './interface.js';
import { UI, uiPanel, centredWindow, windowRoom, frameInk } from './uiGrid.js';
import { resolveChassis } from './chassis.js';
import { clockText } from './contracts.js';
import { SHIPS, shipLimits, shipModel } from './hangar.js';
import { drawAvatar } from './shipAvatar.js';
import { hoverItem } from './hover.js';

// The hangar screen (E4): the pilot's ships and the ones for sale, side by side,
// each with its drawing, what it is, what it can do and what it costs. Opened
// with HANGAR at a garage; the flight goes on underneath it (controls let go, the world not
// paused) like under the pilot card, whose frame, type and marks it shares. Presentation only: buying and changing
// ships go through World.buyShip and World.flyShip.

const ink = () => CONFIG.hud.hot;
const muted = () => CONFIG.hud.color;
const accent = () => CONFIG.hud.accent;
const frame = () => CONFIG.hud.frame;

// What a ship can do, as the rows show it, from its chassis and its limits: the
// top speed, how quickly it turns, hull points, tank, and how long the tank
// lasts at full thrust (its range).
export function shipStats(id) {
  const def = SHIPS.find((s) => s.id === id);
  const chassis = resolveChassis(def?.chassis);
  const limits = shipLimits(id);
  const range = limits.tank / (CONFIG.fuel.burn * (chassis.burn ?? 1));
  return [
    { key: 'speed', label: 'SPEED', value: chassis.maxSpeed, text: String(chassis.maxSpeed) },
    { key: 'turn', label: 'TURN', value: chassis.turnRate, text: chassis.turnRate.toFixed(1) },
    { key: 'hull', label: 'HULL', value: limits.hull, text: String(limits.hull) },
    { key: 'tank', label: 'TANK', value: limits.tank, text: String(limits.tank) },
    { key: 'range', label: 'RANGE', value: range, text: clockText(range) },
  ];
}

// Every measurement the screen uses, from the canvas size alone, so a check can
// verify the layout without drawing it. On the interface's grid (src/uiGrid.js,
// 2026-09-30; the map is reports/2026-09-30-spacing-system.md section 5): three
// ship columns of 24 columns, `group` apart, `line` in from the frame, and the
// rows below, each a row of UI.row. A window too narrow for 84 columns narrows
// the columns (the bars go first).
const STATS = 5;                                     // rows of figures
const BOX = { cols: 16, rows: 6 };                   // the ship's drawing box
export function hangarLayout(r) {
  const cw = r.cellW, row = UI.row;
  const n = SHIPS.length;
  const avail = Math.floor(windowRoom(r, frameInk(r)) / cw);      // (the centred windows' room: src/uiGrid.js centredWindow)
  const colW = Math.max(16, Math.min(24, Math.floor((avail - 2 * UI.line.cols - (n - 1) * UI.group.cols) / n)));   // columns a ship's column spans
  const cols = 2 * UI.line.cols + n * colW + (n - 1) * UI.group.cols;
  const bars = colW >= 23;                           // room for a bar beside each value
  // Rows under the frame's top: the drawing, the name, the note, a blank, the
  // stats, a blank, the message, the keys, the frame.
  const at = { box: 1 };
  at.name = at.box + BOX.rows;
  at.note = at.name + 1;
  at.stats = at.note + 1 + UI.line.rows;
  at.message = at.stats + STATS + UI.line.rows;
  at.keys = at.message + 1;
  const rows = at.keys + 2;
  const { x, y } = centredWindow(r, cols * cw, rows * row, { ink: frameInk(r) });
  return { cols, rows, x, y, colW, boxCols: BOX.cols, boxRows: BOX.rows, bars, at, cw, row };
}

// What the key does for the selected ship, and whether it can; when it cannot
// for want of credits, `reason` says so in the world's own words (World.buyShip).
export function hangarAction(world, id) {
  const def = SHIPS.find((s) => s.id === id);
  if (!def) return { label: '', enabled: false };
  if (world.hangar.flying === id) return { label: 'ACTIVE', enabled: false };
  if (world.hangar.owns(id)) return { label: `USE ${def.label}`, enabled: true };
  const enabled = world.ledger.credits >= def.price;
  return { label: `BUY ${def.label} ${formatCR(def.price)} CR`, enabled, reason: enabled ? null : `NEED ${formatCR(def.price)} CR, HAVE ${formatCR(world.ledger.credits)}` };
}

// Draws the screen. `ui` holds the selected ship and a short message from the
// last action.
// The look before SX's V2 (2026-10-05): the game draws this window in the menus' look now (labs/graphics/windows.js drawHangar); this
// painter stays only for the sketch pages that show the old look beside the new (labs/graphics/sketches/popups-v2.html, and
// menus-ledger.html's V0). BACKLOG: remove it with them.
export function drawHangarPanel(r, world, ui) {
  const L = hangarLayout(r);
  const { cw, x, y, at } = L;
  const station = world.stations.find((s) => s.id === world.docked);
  const g = uiPanel(r, x, y, L.cols, L.rows, station ? `HANGAR / ${station.label}` : 'HANGAR');
  const last = L.cols - 1 - UI.line.cols;             // the last text column

  // Each row's bars are measured against the best of the three, so a full bar
  // is the best there is and the rest read against it.
  const stats = SHIPS.map((def) => shipStats(def.id));
  const best = stats[0].map((_, k) => Math.max(...stats.map((list) => list[k].value)));
  const barCells = 8;
  const labelCols = Math.max(...stats[0].map((stat) => stat.label.length));

  // Each ship's column is a button (a click chooses it, as the arrows do; labs/graphics/main.js) and comes up under the pointer
  // (src/hover.js, SX 2026-10-03).
  const ships = [];
  SHIPS.forEach((def, i) => {
    const col = UI.line.cols + i * (L.colW + UI.group.cols);
    const end = col + L.colW - 1;
    const box = { x: g.X(col), y: g.Y(at.box), w: L.colW * cw, h: g.Y(at.stats + stats[i].length) - g.Y(at.box) };
    ships.push({ index: i, box });
    hoverItem(r, `hangar:${def.id}`, box, () => drawShip(def, i, col, end));
  });
  function drawShip(def, i, col, end) {
    const flying = world.hangar.flying === def.id;
    const owned = world.hangar.owns(def.id);
    const boxCols = Math.min(L.colW, L.boxCols);
    const model = shipModel(def.id) || (flying ? world.ship.model : null);
    if (model) drawAvatar(r, model, g.X(col), g.Y(at.box), boxCols, L.boxRows, { largest: 2.6, pose: true, paint: world.pilot?.paint });
    else g.box(col, at.box, col + boxCols - 1, at.box + L.boxRows - 1, frame());

    // The name, and at the column's right what the ship is to the pilot.
    const status = flying ? 'ACTIVE' : owned ? 'OWNED' : `${formatCR(def.price)} CR`;
    const statusInk = flying ? accent() : owned || world.ledger.credits >= def.price ? ink() : muted();
    g.text(fitText(def.label, L.colW - status.length - UI.space.cols), col, at.name, ink());
    g.textEnd(status, end, at.name, statusInk);
    g.text(fitText(def.note, L.colW), col, at.note, muted());

    stats[i].forEach((stat, k) => {
      const row = at.stats + k;
      g.text(stat.label, col, row, muted());
      g.textEnd(stat.text, end, row, ink());
      if (L.bars) {
        const filled = Math.max(1, Math.round((stat.value / best[k]) * barCells));
        g.text('▰'.repeat(filled) + '▱'.repeat(barCells - filled), col + labelCols + UI.line.cols, row, accent());
      }
    });

    // The chosen ship is marked on its own drawing's frame, as a tile is on the pilot card.
    if (i === ui.selected) g.corners(col, at.box, col + boxCols - 1, at.box + L.boxRows - 1, ink());
  }

  // The key for the chosen ship, unless it is the one flown: nothing to do there.
  const action = hangarAction(world, SHIPS[ui.selected]?.id);
  const credits = `CR ${world.ledger.credits}`;
  const flying = world.hangar.flying === SHIPS[ui.selected]?.id;
  // The message of the last key; with none, an offer the pilot cannot afford says why,
  // as an object's menu does under an action it cannot run (gray, with the reason).
  if (ui.message) g.text(fitText(ui.message, last - UI.line.cols + 1), UI.line.cols, at.message, accent());
  else if (!flying && action.reason) g.text(fitText(action.reason, last - UI.line.cols + 1), UI.line.cols, at.message, muted());
  // The keys, each in its own ink: the offer is gray when it cannot be taken, the
  // others are what they always are.
  const keys = [['[← →] SELECT', ink()], ...(flying ? [] : [[`[1] ${action.label}`, action.enabled ? ink() : muted()]]), ['[0] CLOSE', ink()]];
  let col = UI.line.cols;
  const room = last - UI.line.cols + 1 - credits.length - UI.line.cols;   // columns the keys may take, as they always had
  for (const [key, keyInk] of keys) {
    const used = col - UI.line.cols;
    if (used >= room) break;
    const shown = fitText(key, room - used);
    g.text(shown, col, at.keys, keyInk);
    col += Array.from(shown).length + UI.line.cols;
  }
  g.textEnd(credits, last, at.keys, ink());
  return { layout: L, ships };
}
