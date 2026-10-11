// Souvenir pictures: since 2026-10-01 each souvenir is drawn from its art (src/souvenirArt.js, the picked set SX
// accepted: «Все прям можно принимать»), at PICTURE.size CSS px in its tile, a little clear (`alpha`; SX: «добавь
// сувенирам небольшую прозрачность, типо 90-95%»), so it sits in its tile instead of on it. A souvenir without art
// keeps its block icon (src/souvenirIcons.js). The dithered photographs of 2026-09-30 are gone with their loader; a
// check may still put a stand-in picture in place (registerSouvenirPicture) where there is no page to draw art on.

import { drawSouvenirArt } from './souvenirArt.js';

export const PICTURE = Object.freeze({ size: 56, dots: 28, alpha: 0.92 });

const pictures = new Map();   // id -> a stand-in image a check put in place (anything drawImage takes)

// For checks and tools: a picture put in place without loading one.
export function registerSouvenirPicture(id, image) {
  if (image) pictures.set(id, image); else pictures.delete(id);
}

export function souvenirPicture(id) {
  return pictures.get(id) || null;
}

// How big a picture is drawn in a square of `size` CSS px at `dpr`: every dot
// the same whole number of device pixels, as many as the square allows (2 at
// 1x, 3 at 1.5x, 4 at 2x, all 56 px). At 1.25x and 1.75x that is a little
// smaller (45 and 48 px) rather than dots of two widths (QA, 2026-09-30).
export function pictureSize(size = PICTURE.size, dpr = 1) {
  const per = Math.max(1, Math.floor((size / PICTURE.dots) * dpr + 1e-9));
  return (PICTURE.dots * per) / dpr;
}

// Draws the picture of `id` centred in the square with its top left at (x, y),
// `size` CSS px across (pictureSize), at `alpha` of its own (PICTURE.alpha);
// false if there is no picture to draw.
//
// The souvenir's art first (src/souvenirArt.js); a stand-in picture where a check put one.
// `whole`: the art's cells on whole device pixels (src/souvenirArt.js wholeCells; the charm's).
export function drawSouvenirPicture(r, id, x, y, size = PICTURE.size, alpha = 1, { whole = false } = {}) {
  if (drawSouvenirArt(r, id, x, y, size, alpha * PICTURE.alpha, undefined, whole)) return true;
  const image = pictures.get(id);
  if (!image || !r.ctx.drawImage) return false;
  const dpr = r.dpr || 1;
  const snap = (v) => Math.round(v * dpr) / dpr;
  const drawn = pictureSize(size, dpr), inset = (size - drawn) / 2;
  const { ctx } = r;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha * PICTURE.alpha;
  ctx.drawImage(image, snap(x + inset), snap(y + inset), drawn, drawn);
  ctx.restore();
  return true;
}
