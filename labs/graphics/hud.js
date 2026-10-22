import { CONFIG } from '../../src/config.js';
import { fitText } from '../../src/interface.js';
import { drawVectorHelm, HELM_FX } from './vector-helm.js';
import { drawFlightGauges } from './instruments.js';
import { ROLES } from '../../src/roles.js';
import { uiMetrics } from '../../src/uiGrid.js';
import { barLook, barStep, drawMeterBar, meterRow } from './meter-bar.js';
import { deckLayout } from './hud-layout.js';
import { drawCockpitFrame } from './cockpit-frame.js';
import { currentScheme, withInks } from './cockpit-scheme.js';
import { shelfLayout, drawWallet } from './souvenir-shelf.js';
import { drawCharm } from './charm.js';
import { shoulderOf, drawTracker } from './tracker.js';
import { backedText, keycap, keycapBox, KEYCAP_PAD } from './ui-parts.js';
import { noteDuring, noteKeycap } from './clicks.js';
import { hoverItem } from '../../src/hover.js';
import { keyName } from '../../src/controls.js';
import { flyingLoaner } from '../../src/loaner.js';
import { drawScootyDeck } from './scooty-deck.js';
import { tr } from '../../src/lang.js';

// The route's header in the middle of the top stood here (drawMission: the cargo and its station, NO ACTIVE ROUTE without one); since
// 2026-10-04 that place is the task slot's (labs/graphics/notices.js, SX's items 5-7, the banners A / Rail): one banner for the
// focused task, ALL CLEAR or WRECKED. `layout.header` still names the place (labs/graphics/hud-layout.js).

// Left screen: hull over fuel, two bars of one kind (SX, 2026-09-30: "Сделай
// Fuel такой же шкалой как и хп и поставь их друг под другом"). Speed lives in
// the well; cargo and route are in the header. The credits came back from the
// souvenir inventory to the FUEL row (SX, 2026-09-30: «количество монет перенеси к горючему и раскрась их в цвета монет»), then to the
// souvenirs, and since 2026-10-08 it stands on the deck's left shoulder over the rail, on the row of the ruins' tracker's button
// (labs/graphics/tracker.js; SX: «а hp и fuel cделай просто подлинее полоски»): the rows run to the screen's right text edge
// (`left.textEnd`), the steps as many as they were, each wider.
// The bars themselves, their steps and inks (SX's pick S4), are labs/graphics/meter-bar.js's, shared with SCOOTY JR.'s deck; the
// names the sketch pages and the checks read here stay here.
export { FUEL_SEGMENTS, HULL_STEP, BAR_EDGE, barStep, barLook } from './meter-bar.js';

function drawFlightScreen(r, screen, world) {
  const cw = r.cellW;
  const x = screen.textX ?? screen.x + screen.pad;
  const [one, two] = screen.rows;
  // Hull first; the step being lost empties partly. Heading and gravity left this screen: the locator shows the nose, the
  // dotted pointer by the ship shows the pull.
  const max = world.hullMax ?? CONFIG.hull.max;
  const hull = Math.max(0, Math.min(max, Math.round(world.hull ?? max)));
  // Fuel (2026-09-29, CONFIG.fuel) in whole units, the step being burnt filling partly, so the bar drains as the engine runs.
  // The value rounds up: the tank is not empty until it is 0 (limping), and a station counts what is missing the same way.
  const tank = world.fuelTank ?? CONFIG.fuel.tank;
  const fuel = Math.max(0, Math.min(tank, world.fuel ?? tank));
  const unit = barStep(max, tank);
  const segments = Math.max(1, Math.round(max / unit)), fuelSegments = Math.max(1, Math.round(tank / unit));
  // Both numbers start in one column and end on the screen's text edge (as many cells as the widest number takes); both bars have the
  // longer one's pitch, so the same points are the same length on each.
  const { barX, valueX, pitch } = meterRow({ x, end: screen.textEnd ?? screen.x + screen.w, cw, count: Math.max(segments, fuelSegments),
    digits: Math.max(String(max).length, String(Math.ceil(tank)).length), capLeft: uiMetrics(r).capLeft });
  r.text(tr('HULL'), x, one, ROLES.textSecondary, 1);
  drawMeterBar(r, barX, one, (hull / max) * segments, segments, barLook(hull / max), pitch);
  r.text(`${hull}`, valueX, one, ROLES.textPrimary, 1);
  r.text(tr('FUEL'), x, two, ROLES.textSecondary, 1);
  drawMeterBar(r, barX, two, (fuel / tank) * fuelSegments, fuelSegments, barLook(fuel / tank, 'fuel'), pitch);
  r.text(`${Math.ceil(fuel)}`, valueX, two, ROLES.textPrimary, 1);
}

// Right screen: the pilot's own menu. Flight keys live behind `?`, not here. Every
// item is a key that does something (an N LOBBY stood here for a lobby that does not exist).
// The words are in the left screen's label ink, as HULL and FUEL are, and the same text size;
// the key in its cap stays bright, as the values do there (SX, 2026-10-01: «надо такого же
// цвета делать, пилот карт, Control, Leave Sign, как и Hull и Fuel»).
const LEAVE_SIGN = 'LEAVE SIGN';
function drawPilotScreen(r, screen, world) {
  const cw = r.cellW;
  const x = screen.textX ?? screen.x + screen.pad;
  // The words end on `textEnd` (hud-layout.js SCREEN_AIR from the canvas's right edge), ink to ink: the second column, LEAVE SIGN's,
  // stands where its words end there, to the nearest cell (a half cell either way); never nearer the first than a keycap and PILOT CARD.
  const end = screen.textEnd ?? screen.x + screen.w - screen.pad, capLeft = uiMetrics(r).capLeft;
  const cells = (end + capLeft - x - KEYCAP_PAD) / cw;
  const second = Math.max(2 + 'PILOT CARD'.length + 1, Math.round(cells - 2 - LEAVE_SIGN.length));
  const [one, two] = screen.rows;
  // Each a button (SX, 2026-10-03: «со всеми элементами интерфейса ... можно взаимодействовать мышкой»): from its cap to the end of
  // its words it answers a click as its key and comes up under the pointer (src/hover.js).
  const item = (key, label, col, y) => {
    const capX = x + col * cw + KEYCAP_PAD, next = capX + Array.from(key).length * cw + cw;
    const width = col === 0 ? Math.floor((x + (second - 1) * cw - next) / cw) : Math.floor((end + capLeft - next) / cw + 0.5);
    const words = width > 0 ? fitText(label, width) : '';
    const cap = keycapBox(r, key, capX, y);
    const box = { ...cap, w: next + Array.from(words).length * cw - cap.x + KEYCAP_PAD };
    noteKeycap(key, box, 0, r);
    hoverItem(r, `deck:${key}`, box, () => {
      keycap(r, key, capX, y, { reach: 0 });
      if (words) r.text(words, next, y, ROLES.textSecondary, 1);
    });
  };
  // ESC PAUSE (P PAUSE until P went to the pilot card, 2026-10-16) in the fourth place since the corner list went (SX, 2026-10-06: «кнопки для мышки убрать»): the mouse alone pauses here.
  noteDuring(r, () => {
    item(keyName('card'), 'PILOT CARD', 0, one);
    item(keyName('sign'), LEAVE_SIGN, second, one);
    item('?', 'CONTROLS', 0, two);
    item(keyName('pause'), 'PAUSE', second, two);
  });
}

// The brake under the helm, on the readout row: BRAKES between two chevrons (SX, 2026-10-01, of the eight on
// labs/graphics/sketches/helm-shading.html: «надпись брейкс мне нравится вариант 5 шеврон с ин давай его возьмем»; it
// was a round lamp, amber when lit, of which: «как-то не в тему этот кружочек и желтый не в тему, там нужно, наверное,
// красный»). Off, the word and the chevrons are gray and the chevrons stand `BRAKE_OPEN` of a cell further out; braking,
// they close on the word in the danger red, the word white.
export const BRAKE_LABEL = 'BRAKES';
export const BRAKE_CHEVRONS = Object.freeze(['▸', '◂']);
export const BRAKE_OPEN = 0.6;

// `lamp` (chat F1, SX's 3B): a heavy hit ahead lights it before the brake is touched ({ level 1 heavy, 2 a wreck, lit: the blink's
// phase}; labs/graphics/hit-warning.js): the chevrons close on the word in the caution's ink (the danger's for a wreck) while lit.
export function drawBrake(r, row, braking, lamp = null) {
  const cw = r.cellW;
  // A chevron, a space, the word, a space, a chevron; all centred.
  const label = tr(BRAKE_LABEL), n = Array.from(label).length, width = (4 + n) * cw;
  const x = Math.round(r.width / 2 - width / 2);
  const warned = !braking && !!lamp?.level && lamp.lit;
  const open = braking || warned ? 0 : BRAKE_OPEN * cw;
  const ink = braking ? ROLES.danger : warned ? (lamp.level > 1 ? ROLES.danger : ROLES.caution) : ROLES.textSecondary;
  const left = Math.round(x - open), right = Math.round(x + (3 + n) * cw + open);
  backedText(r, BRAKE_CHEVRONS[0], left, row.y, ink);
  backedText(r, label, x + 2 * cw, row.y, braking || warned ? ROLES.textPrimary : ROLES.textSecondary);
  backedText(r, BRAKE_CHEVRONS[1], right, row.y, ink);
  return { x: left, y: row.y, w: right + cw - left, h: row.h, chevrons: [left, right] };
}

// Presentation only: state is read from the real world and never changed here.
// `shift`: where the souvenir shelf and the route's header stand off their own places ({ shelf, header }, px): the shelf's by the HUD's
// sides (labs/graphics/hud-sides.js) and by SX's moves under the pause (labs/graphics/hud-place.js), the layout returned with them
// where they are drawn. `steady`: the cockpit's shake taken back off the two ({ x, y }, px), so
// only the lower panel shakes (SX, 2026-10-02: «основную панель нижнюю ... придай ей больше тряски»).
// `part`: 'deck' the lower panel alone, with what stands on its left shoulder over the rail: the wallet at the row's right end and, over
// it, the ruins' tracker with its button at the left (labs/graphics/tracker.js; SX, 2026-10-08); 'shelf' the souvenir shelf, which is the
// charm that hangs from the locator and nothing else now (labs/graphics/charm.js, souvenir-shelf.js); 'header' the wallet alone (the
// deck waits for its beat in the lab's ?focus, and the wallet stands from the first frame: SX, 2026-10-06); 'all' (by default) the deck
// and the shelf; the page draws them as blocks (main.js `group`; their text's shadow src/textShadow.js), the layout returned whole
// every time. `shelf`: whether the opening has given the shelf (src/opening.js interfaceGiven); not given, no charm hangs
// (souvenir-shelf.js shelfLayout). `charm`: the page's state (charm.js createCharm, stepped once a frame by main.js); without one the
// charm hangs still, at rest. `tracker`: the page's state of the ruins' tracker (tracker.js createTracker, stepped once a frame by
// main.js); without one the deck has the wallet and no tracker. The layout says where they stand: `wallet` (the box drawWallet takes)
// and `tracker` (the ink of the row's foot, and of the rows over it while they are drawn: what the windows and the marks keep off).
export function drawLabCockpit(r, world, input, { reducedMotion = false, shift = null, steady = null, part = 'all', shelf = true, charm = null, tracker = null } = {}) {
  if (r.cockpit.h < r.cellH) return null;
  const deck = deckLayout(r), shoulder = shoulderOf(r, deck);
  const layout = { ...deck, ...shelfLayout(r, world, { given: shelf, dx: shift?.shelf?.x ?? 0, dy: shift?.shelf?.y ?? 0 }), wallet: shoulder.wallet, tracker: shoulder.foot };
  const speed = Math.round(Math.hypot(world.ship.vx, world.ship.vy));

  // SCOOTY JR., the opening's loaner, has its own cockpit while it is flown (labs/graphics/scooty-deck.js, SX's P3+): the pilot's
  // comes with the pilot's own shuttle. Its handlebar is all of it since 2026-10-16 (SX: «вообще никакого интерфейса не надо больше»):
  // no wallet, nothing begun to track. (The flight draws it alone, labs/graphics/flight-frame.js; here for the boot's warm-up and the checks.)
  const onDeck = part === 'all' || part === 'deck';
  const loaner = flyingLoaner(world);
  if (onDeck && loaner) drawScootyDeck(r, world, input, { reducedMotion });
  else if (onDeck) {
    // The lower cockpit's lines and the helm in a reference ship's colours, when the pilot wears them or flies its ship
    // (labs/graphics/cockpit-scheme.js); the rest as it is.
    const scheme = currentScheme(world);
    withInks(r.ctx, scheme, () => drawCockpitFrame(r, layout));
    drawFlightScreen(r, layout.left, world);
    drawPilotScreen(r, layout.right, world);

    const state = withInks(r.ctx, scheme, () => drawVectorHelm(r, layout.helm.bounds, world, input, { reducedMotion }));
    drawFlightGauges(r, layout, state, speed, world.ship.params().maxSpeed);
    drawBrake(r, layout.readout, state.braking, HELM_FX.lamp);
    if (tracker) layout.tracker = drawTracker(r, tracker, shoulder) ?? shoulder.foot;
  }
  if ((onDeck || part === 'header') && !loaner) drawWallet(r, layout, world.ledger?.credits ?? 0);

  const o = shift?.header;
  if (o && (o.x || o.y)) layout.header = { ...layout.header, x: layout.header.x + o.x, y: layout.header.y + o.y };
  const still = steady && (steady.x || steady.y) && part !== 'deck';
  if (still) { r.ctx.save(); r.ctx.translate(steady.x, steady.y); }
  // (No charm in the layout before the shelf is given: shelfLayout's gate.)
  if ((part === 'all' || part === 'shelf') && layout.charm) drawCharm(r, layout.charm, charm);
  if (still) r.ctx.restore();
  return layout;
}
