// Money's ink (SX's pick S4, labs/graphics/sketches/hud-inks.html, 2026-10-04: C2 with the rule «золото — это деньги, и только
// деньги»): every amount of money, the number with its CR, in the coin's rim gold (sprites/credit.json's rim, ROLES.creditsLabel),
// the rest of its line in its own ink. Three keep their own, as before: an amount the wallet cannot cover (a greyed action), money
// the pirates took (the danger red) and the «+1 CR» by a coin picked up (its dark translucent gold, CONFIG.hud.coinLabel).
// Moved here from labs/graphics/rail.js (chat B wrote it for the banners) so the labels in the flight (src/feedback.js) read it too.
import { ROLES, PALETTE } from './roles.js';

export const MONEY_INK = ROLES.creditsLabel;
// The coin's light, the dot in its sign's middle (`drawCoin`): the game's brighter amber (SX on the picks hub, 2026-10-04: «ярче,
// янтарный»), the amount beside it staying in the rim gold, as the coin in space is a light sign in a gold rim.
export const COIN_SIGN_INK = PALETTE.amber;

// The coin's sign where money is shown with it (the wallet's count by the souvenirs, the windows' prices): a small coin drawn as one
// (SX, 2026-10-06: «иконка кредитсов не нравится, просто нарисуй миниатюру монеток сам вертикальный прямоугольник с закругленными углами
// и точкой посередине (цветной) размером не больше чем кнопка обозначающая клавишу действия»): an upright rectangle, its corners
// rounded a pixel, in the rim gold, a 2 px dot of the coin's light in its middle; 8 x 12 px, under a keycap's 15 x 18 and about the
// capitals' height. It was K3 SIGN (a ring and four rays, ¤) until then. Centred on (cx, cy), 1 px lines on the pixel grid.
export const COIN = Object.freeze({ w: 8, h: 12, dot: 2 });
export function drawCoin(ctx, cx, cy, rim = MONEY_INK, light = COIN_SIGN_INK) {
  const L = Math.round(cx - COIN.w / 2), T = Math.round(cy - COIN.h / 2), R = COIN.w - 1, B = COIN.h - 1;
  ctx.save();
  ctx.lineWidth = 1; ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.strokeStyle = rim; ctx.fillStyle = light;
  ctx.beginPath();
  [[1, 0], [R - 1, 0], [R, 1], [R, B - 1], [R - 1, B], [1, B], [0, B - 1], [0, 1]].forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](L + x + 0.5, T + y + 0.5));
  ctx.closePath();
  ctx.stroke();
  ctx.fillRect(L + (COIN.w - COIN.dot) / 2, T + (COIN.h - COIN.dot) / 2, COIN.dot, COIN.dot);
  ctx.restore();
}
const MONEY = /[+-]?\d[\d, ]*\d? CR\b|[+-]?\d CR\b/g;

// `text` cut into [text, ink] runs: each amount of money in MONEY_INK, the rest in `ink`.
export function moneyRuns(text, ink) {
  const s = String(text ?? ''), out = [];
  let at = 0;
  for (const m of s.matchAll(MONEY)) {
    if (m.index > at) out.push([s.slice(at, m.index), ink]);
    out.push([m[0], MONEY_INK]);
    at = m.index + m[0].length;
  }
  if (at < s.length || !out.length) out.push([s.slice(at), ink]);
  return out;
}
export const hasMoney = (text) => moneyRuns(text, null).some(([, ink]) => ink === MONEY_INK);

// Runs written one after another from (x, y), a cell a character (the renderer's HUD text, left aligned from the row's top).
export function drawRuns(r, runs, x, y, alpha = 1) {
  let at = x;
  for (const [s, ink] of runs) {
    r.text(s, at, y, ink, alpha);
    at += Array.from(s).length * r.cellW;
  }
  return at;
}
