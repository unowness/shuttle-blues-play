import { ROLES, PALETTE } from '../../src/roles.js';
import { GRIP_INK, STEM_INK } from './vector-helm.js';
import { specialById } from '../../src/specialShips.js';
import { flownId } from '../../src/specials.js';
import { mixHex } from '../../src/util.js';
import { keepBegin, keepEnd } from '../../src/grade.js';

// The cockpit's colour schemes (SX, 2026-10-02: «они должны цветовую схему давать, как бы в стиле их корабля для штурвала,
// нижней части»; and of SERENITY, «ты можешь покрасить панель в этот момент в цвет просто раскраски корабля»). A reference
// ship's quest leaves the pilot a scheme in its style (src/specialShips.js: three inks, `line`, `accent`, `grip`; the pilot
// card's COCKPIT line puts it on), and while its ship is flown the cockpit wears it. It recolours the lower cockpit's lines
// and the helm only: the bars of the frame and the helm's base, socket and stem in `line`, the console's grey parts
// (the helm's top, its collar and ridges) in `accent`, the stick's grip in `grip`; the instruments, the screens, the
// text and everything outside the cockpit keep the interface's own colours.
//
// It is done at the canvas: for the length of the two painters (the frame and the helm, labs/graphics/hud.js) the
// context's fill and stroke colours are looked up in a map of the interface's inks, each to its scheme's, and put back
// after. The painters themselves are as they were.
//
// With a look worn (src/looks.js, INTERFACE_LOOKS_HANDOFF.md) the scheme's inks are art, like the pilot's ship: they take the
// kept layer's treatment (today's grade under the look's ART share), never the interface palette; what the scheme does not
// recolour follows the look.

// The interface's inks the two painters use, to the scheme's inks. Lower case, as a colour is looked up.
export function schemeMap(id) {
  const sp = specialById(id);
  if (!sp) return null;
  const { line, accent, grip } = sp.cockpit;
  const lc = (c) => c.toLowerCase();
  const map = new Map();
  map.set(lc(ROLES.structure), line);
  map.set(lc(ROLES.textSecondary), accent);
  map.set(lc(STEM_INK.rest), line);
  map.set(lc(STEM_INK.forward), mixHex(line, '#000000', 0.25));
  map.set(lc(STEM_INK.back), mixHex(line, PALETTE.white, 0.4));
  map.set(lc(GRIP_INK.rest), mixHex(grip, '#000000', 0.1));
  map.set(lc(GRIP_INK.forward), mixHex(grip, '#000000', 0.22));
  map.set(lc(GRIP_INK.back), mixHex(grip, '#FFFFFF', 0.35));
  return map;
}

const cache = new Map();
// The scheme the cockpit wears now: the borrowed ship's while one is flown, else the pilot's own choice (the card's
// COCKPIT line), else none.
export function cockpitSchemeId(world) {
  return flownId(world) ?? world.pilot?.cockpit ?? null;
}
export function currentScheme(world) {
  const id = cockpitSchemeId(world);
  if (!id) return null;
  if (!cache.has(id)) cache.set(id, schemeMap(id));
  return cache.get(id);
}

// Runs `fn` with the context's fill and stroke colours looked up in `map` as they are set, and puts them back. A context
// of the canvas (its colours behind accessors, the page's grade among them) and a plain recording one both work.
export function withInks(ctx, map, fn) {
  if (!map || !map.size) return fn();
  const saved = [];
  for (const key of ['strokeStyle', 'fillStyle']) {
    const own = Object.getOwnPropertyDescriptor(ctx, key);
    let base = own;
    if (!base) { let o = Object.getPrototypeOf(ctx); while (o && !(base = Object.getOwnPropertyDescriptor(o, key))) o = Object.getPrototypeOf(o); }
    let value = base && 'value' in base ? base.value : undefined;       // a plain property keeps its colour here meanwhile
    saved.push({ key, own, read: () => (base?.get ? base.get.call(ctx) : value) });
    Object.defineProperty(ctx, key, {
      configurable: true, enumerable: true,
      get() { return base?.get ? base.get.call(this) : value; },
      set(v) {
        const mapped = typeof v === 'string' ? map.get(v.toLowerCase()) : undefined;
        const next = mapped ?? v;
        // A scheme's ink is a ship's livery, art like a paint: a worn look (src/looks.js) only filters it, as it does the
        // pilot's ship (src/grade.js, the kept layer), and never repaints it. The cockpit's other inks follow the look.
        if (mapped && base?.set) { const was = keepBegin(); try { base.set.call(this, next); } finally { keepEnd(was); } }
        else if (base?.set) base.set.call(this, next); else value = next;
      },
    });
  }
  try { return fn(); } finally {
    for (const { key, own, read } of saved) {
      const last = read();
      if (!own) delete ctx[key];
      else if ('value' in own) Object.defineProperty(ctx, key, { ...own, value: last });
      else Object.defineProperty(ctx, key, own);
    }
  }
}
