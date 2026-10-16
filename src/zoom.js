// The camera's height over the world (SX, 2026-10-17: «нам надо не уменьшать, не изменять размер мира и элементов. Нам надо просто как бы
// камеру чуть повыше взять, чтобы чуть-чуть побольше в экран помещался»; «чуть повыше, в том смысле, что мы на мир смотрим. Сверху вниз»; «в
// идеале было бы прикольно на плюс-минус дать пользователю выбирать масштаб»). One factor, the screen px a world unit is drawn at
// (CONFIG.camera.zoom: 100, 90 and 83 %, 90 unless the pilot chooses), on the world's layer alone. The world is not made smaller: its units,
// bodies, physics, rules and the save are what they were; the simulation never reads the screen. The camera is higher.
//
// How it is drawn: the world draws through `worldLayer(r)`, a view of the page's renderer (Object.create: its buckets, canvas and font)
// whose measures are the world's units (its width and height, the ship's place, the view and its bands, over the zoom), on the canvas
// scaled by the zoom (`inWorld`). Every painter of the world is as it was: it draws in units and the canvas makes them px, the glyphs
// sharp (they are text). The page's renderer keeps its px, and its `zoom` is the camera's: World.project finds a thing of the world on it
// where the layer drew it, and the interface sizes what hugs a thing by it (an object's window and its corners, the marks on the rim, the
// hints by the ship, the pointer over a ship or a station).
//
// Not scaled: the stars and the dust before them (src/starfield.js, labs/graphics/depth.js), infinitely far and near the eye, drawn on the
// page's renderer before and after the world; the names in the world (a planet's, a sector's, a droid's, a quest's thing's ...), the
// interface's text at its 15 px where its thing is (SX, the same day: «Остаются 15 px»): the layer's `text` writes on the page's px, and
// its `textScale` is how large a px of that is in units, so a name is centred and set off by its true size. A sign is a thing in space
// and its letters go with the world.
//
// The zoom is snapped so that a cell's height is a whole number of device px, which a row of baked shade needs to lie without a seam
// (src/renderer.js glyphRow, the fog and the clouds): at a pixel ratio of 2, 0.9 and 5/6 are 27 and 25 px of 30, exact; at 1, 14 and 13 of 15.
import { CONFIG } from './config.js';
import { readZoom, writeZoom } from './prefs.js';

export const ZOOM_STEPS = CONFIG.camera.zoom.steps;
// The step a value is (a kept one, the lab's ?zoom= in % or as a share), else the start.
export function fitZoom(v) {
  const n = Number(v), z = n > 2 ? n / 100 : n;
  if (!Number.isFinite(z)) return CONFIG.camera.zoom.start;
  let best = CONFIG.camera.zoom.start, gap = 0.02;
  for (const s of ZOOM_STEPS) if (Math.abs(s - z) < gap) { best = s; gap = Math.abs(s - z); }
  return best;
}
// A step's name in the pause's row: the share of the lowest camera's picture a world unit is drawn at.
export const zoomName = (z) => `${Math.round(z * 100)}%`;

// `zoom` as drawn on `r`: a cell's height a whole number of its device px.
export function snapZoom(zoom, r) {
  const px = r.cellH * (r.dpr || 1);
  return zoom === 1 || !(px > 0) ? zoom : Math.max(1, Math.round(zoom * px)) / px;
}

const box = () => ({ x: 0, y: 0, w: 0, h: 0 });
function scaled(to, from, k) {
  to.x = from.x * k; to.y = from.y * k; to.w = from.w * k; to.h = from.h * k;
  return to;
}
// A name in the world on the page's px, at its place on the layer (Renderer.text's own arguments, `x` and `y` in units).
function layerText(str, x, y, color, alpha = 1) {
  const r = this.screen, ctx = this.ctx, z = r.zoom;
  ctx.save();
  ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  try { r.text(str, x * z, y * z, color, alpha); } finally { ctx.restore(); }
}

// The world's view of `r`, made once with every field it owns declared (an adapter keeps one shape): `screen` the page's renderer, its
// measures fitted by fitWorldLayer, and the bucket it last queued into and its count of glyphs its own (begin() empties the shared buckets).
export function worldLayer(r) {
  if (r.worldLayer) return r.worldLayer;
  const v = Object.create(r);
  v.screen = r; v.zoom = 1; v.textScale = 1; v.dpr = r.dpr;
  v.width = r.width; v.height = r.height; v.cx = r.cx; v.cy = r.cy; v.diagonal = r.diagonal;
  v.view = box(); v.worldView = box(); v.strip = box(); v.cockpit = box();
  v.last = null; v.drawn = 0; v.rowCells = 0;
  v.text = layerText;
  r.worldLayer = v;
  return v;
}

// The camera at `zoom` (a step, snapped here) on `r`: its `zoom`, and the layer's measures in units from `r`'s px as they are now (a
// resize changes them; this is cheap and runs every frame). Returns the layer.
export function fitWorldLayer(r, zoom = 1) {
  const z = snapZoom(zoom, r), v = worldLayer(r), k = 1 / z;
  r.zoom = z;
  v.zoom = 1; v.textScale = k; v.dpr = (r.dpr || 1) * z;
  v.width = r.width * k; v.height = r.height * k; v.cx = r.cx * k; v.cy = r.cy * k; v.diagonal = r.diagonal * k;
  scaled(v.view, r.view, k); scaled(v.worldView, r.worldView, k); scaled(v.strip, r.strip, k); scaled(v.cockpit, r.cockpit, k);
  v.last = null;
  return v;
}

// `draw(layer)` on the canvas scaled by the camera's zoom, and the canvas put back to the page's px; the glyphs it queued counted on `r`
// (the lab's H). Returns what `draw` returns.
export function inWorld(r, draw) {
  const v = r.worldLayer ?? fitWorldLayer(r, r.zoom), ctx = r.ctx, z = r.zoom, dpr = r.dpr || 1, before = v.drawn;
  if (z !== 1) ctx.setTransform(dpr * z, 0, 0, dpr * z, 0, 0);
  try { return draw(v); } finally {
    if (z !== 1) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    r.drawn += v.drawn - before;
  }
}

// The page's choice, { value: a step }: this browser's (src/prefs.js `zoom`, never the save), or the lab's `?zoom=` for this load alone
// (`asked`, a step's % or share: 100, 90, 83; not kept), else CONFIG.camera.zoom.start.
export function createZoom(store, asked = null) {
  return { value: asked !== null && asked !== undefined && asked !== '' ? fitZoom(asked) : readZoom(ZOOM_STEPS, store) ?? CONFIG.camera.zoom.start };
}
// The camera at `value` (a step), kept at once. True when it changed.
export function setZoom(zoom, value, store) {
  const next = fitZoom(value);
  if (next === zoom.value) return false;
  zoom.value = next;
  writeZoom(next, store);
  return true;
}
// A step higher (`dir` 1: more of the world) or lower (-1), none past the ends. True when it moved.
export function stepZoom(zoom, dir, store) {
  const i = ZOOM_STEPS.indexOf(zoom.value), j = Math.max(0, Math.min(ZOOM_STEPS.length - 1, (i < 0 ? ZOOM_STEPS.indexOf(CONFIG.camera.zoom.start) : i) + dir));
  return setZoom(zoom, ZOOM_STEPS[j], store);
}
