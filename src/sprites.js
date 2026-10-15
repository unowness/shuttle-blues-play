import { normalizeModel } from './asciiModel.js';

// World-object artwork.
//
// Files retain the Blockmode schema; the current art includes direct JSON
// edits documented in sprites/README.md. They go through the same normalizer
// as ships, and the runtime never rewrites the source artwork.
//
// The files carry no `scale`. Blockmode does not write one, and how large a
// pickup looks is a readability decision that belongs to the game, so each
// consumer passes its own.

const SOURCES = {
  credit: 'sprites/credit.json',
  'cache-sealed': 'sprites/cache-sealed.json',
  'cargo-container': 'sprites/cargo-container.json',
  'fuel-canister': 'sprites/fuel-canister.json',
};

const registry = new Map();

// Loads every sprite, and reports failures instead of throwing them: a missing
// file costs its artwork, never the game. Callers keep a fallback drawing.
export async function loadSprites(fetchImpl = globalThis.fetch) {
  const failed = [];
  await Promise.all(Object.entries(SOURCES).map(async ([id, url]) => {
    try {
      const res = await fetchImpl(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      registry.set(id, normalizeModel(await res.json(), id));
    } catch (err) {
      failed.push(`${id}: ${err.message}`);
    }
  }));
  return failed;
}

// For headless checks and tools that already hold the JSON.
export function registerSprite(id, data) {
  registry.set(id, normalizeModel(data, id));
}

export function sprite(id) {
  return registry.get(id) || null;
}

// An object loops every pose, in file order, at the file's rate. That is a
// different rule from a ship, whose idle pose holds until a direction key is
// pressed: an object has no pilot, so there is nothing for it to wait for.
export function objectFrame(model, time) {
  const n = model.frames ? model.frames.length : 0;
  if (n <= 1) return model.frames ? model.frames[0] : model.cells;
  // A clock a hair below zero (a first animation frame stamped before the
  // page's own start time) must still land on a real frame, not frames[-1].
  return model.frames[((Math.floor(time * model.fps) % n) + n) % n];
}

// Draws a sprite centred on its idle-pose pivot. `angle` turns the drawing and
// its glyphs together, the same rule a hull follows.
// `inks`, a Map from an ink of the file to the one drawn in its place (the cargo's body in its destination's hue), or null.
export function drawSprite(r, model, time, sx, sy, { scale = 1, angle = 0, alpha = 1, inks = null } = {}) {
  const cells = objectFrame(model, time);
  const w = r.cellW * scale;
  const h = r.cellH * scale;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (const c of cells) {
    const lx = c.x * w, ly = c.y * h;
    r.glyphRot(c.ch, sx + lx * ca - ly * sa, sy + lx * sa + ly * ca, angle, inks?.get(c.color) ?? c.color, alpha, scale);
  }
}

// Half the drawn extent along the drawing's own vertical axis, in pixels. Used
// to hang a tether off the end of a sprite rather than off its centre.
export function halfHeight(r, model, scale = 1) {
  let lo = Infinity, hi = -Infinity;
  for (const c of objectFrame(model, 0)) {
    if (c.y < lo) lo = c.y;
    if (c.y > hi) hi = c.y;
  }
  return lo === Infinity ? 0 : ((hi - lo + 1) * r.cellH * scale) / 2;
}
