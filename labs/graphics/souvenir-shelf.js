import { PALETTE } from '../../src/roles.js';
import { mixHex } from '../../src/util.js';
import { uiMetrics } from '../../src/uiGrid.js';
import { MONEY_INK, COIN, drawCoin } from '../../src/money.js';
import { haloText } from './ui-parts.js';
import { EDGE, TOP } from './hud-layout.js';
import { charmPlace, hungCharm } from './charm.js';

// The souvenirs' place under the locator: the charm that hangs from it (labs/graphics/charm.js), and since the evening of 2026-10-08
// nothing else: the wallet left it for the deck's left shoulder (SX, on a screenshot with a box on the row over the rail: «бро вот сделай
// так»; labs/graphics/tracker.js says where, `drawWallet` below still draws it). Until 2026-10-08 the place was an inventory of
// corner-marked tiles, three by three (SX, 2026-09-30: "сделай ее похожей на инвентарь из 9 клеток и подписи сколько монеток и
// сколько коллектаблс собрано"; the tiles, the pictures' air, the empty slots' dots and the rows that came as the shelf filled are in git
// before 2026-10-08). SX, 2026-10-08, on the eight widgets' W6 CHARMS: «нравится charms, но я бы вешал 1 и не делал широкую палку как его
// держатель куда то пристроить бы аккуратнее», and of the four places, C2 ROW: «берем RoW но шнурок в 1.5 раз длинее»: one souvenir
// hangs on a cord from the scope's ring into the legend's row. The pilot card chooses which (src/pilot.js).
//
// The group keeps its name, `shelf`: the layout editor's offsets (labs/graphics/hud-place.js), the boxes the labels keep off and the
// opening's stage `shelf` (src/opening.js, the pilot's FIT THE SHELF at B) all call it that.

// An empty place's ink: a third of the way from the depth ink to the structure blue (SX, 2026-10-01: «Сетка сувениров, которая не
// активна, ее слишком плохо видно. Надо ее ярче сделать, при этом темнее, чем та, где уже лежат сувениры»). The grid of tiles is gone;
// the sketch pages that show a place waiting to be filled read it from here.
export const EMPTY_TILE_INK = mixHex(PALETTE.depth, PALETTE.blue, 0.3);

// The shelf's boxes for `world` on `r`'s screen, from its own place (the top right, where the group was before it went under the locator;
// `dx`, `dy` whole px move it from there: where the HUD's sides put it, labs/graphics/hud-sides.js, and where LAYOUT moved it).
//   shelf   the box the labels and windows keep off: the charm's zone, from the shelf's top to a container's inset under the tallest
//           picture at rest; `h` 0 with nothing hung (the box is still at the group's own place: hud-sides.js reads its left and width);
//   tiles   the same zone, as it was called when the shelf held tiles; null before the shelf is given;
//   charm   { id, x, y }: what hangs (null: nothing) and its eyelet's centre; null where no charm may hang (below).
// The wallet is not here: it stands on the deck's left shoulder (labs/graphics/tracker.js shoulderOf), `layout.wallet` of drawLabCockpit.
// The shelf is as wide as the column's ink (the scope's ring), so under the locator, moved whole, its edge is the column's. `given` false:
// the opening has not fitted the shelf (src/opening.js interfaceGiven).
//
// THE GATE: the charm hangs once the shelf is given, the first souvenir the pilot's by then (the opening's FIT THE SHELF at B). One
// condition, `charmOpen` below; with `given &&` taken out of it the first find hangs at once, before B (SX has not been asked which).
// Every other reader follows this layout (the page steps the charm's state by `layout.charm.id`, labs/graphics/main.js).
export function shelfLayout(r, world, { given = true, dx = 0, dy = 0 } = {}) {
  const place = charmPlace(r), width = place.width;
  const x = r.width - EDGE - width + dx, top = TOP + dy;
  const charmOpen = given && place.laid;
  const hung = charmOpen ? hungCharm(world) : null;
  const zone = { x, y: top, w: width, h: hung ? place.drop : 0 };
  return {
    shelf: zone,
    tiles: given ? { ...zone } : null,
    charm: charmOpen ? { id: hung, x: x + place.ex, y: top + place.ey } : null,
  };
}

// The wallet's row (`layout.wallet`, tracker.js shoulderOf): the count in the rim gold, its last cell on the box's right edge (its ink a
// pixel in), the coin's sign in the cell before the one before it (a free cell between: a sign and what it says, UI.space), on a halo as
// the column's words are. `alone`: it reads from the box's left edge, the coin's left line on it, the count a cell and a half past the
// coin's middle (the sketch pages draw it so). Returns its box.
export function drawWallet(r, layout, credits) {
  const box = layout.wallet;
  if (!box) return null;
  const m = uiMetrics(r), text = String(credits), cw = r.cellW, y = box.y + m.textY, coinY = y + (m.capTop + m.capBottom) / 2;
  if (box.alone) {
    const coin = box.x + COIN.w / 2, x = Math.round(coin + 1.5 * cw);
    haloText(r, text, x, y, MONEY_INK);
    drawCoin(r.ctx, coin, coinY);
    return { x: box.x, y: box.y, w: x + Array.from(text).length * cw - box.x, h: box.h };
  }
  const x = Math.floor(box.x + box.w - Array.from(text).length * cw);
  haloText(r, text, x, y, MONEY_INK);
  drawCoin(r.ctx, x - 1.5 * cw, coinY);
  return { x: x - 2 * cw, y: box.y, w: box.x + box.w - (x - 2 * cw), h: box.h };
}
