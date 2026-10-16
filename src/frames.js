import { gradeHex, oklch, fromLch, gradeEpoch, lookWorn, wornInk, finalDraw } from './grade.js';
import { PALETTE } from './palette.js';
import { readFrames, writeFrames } from './prefs.js';

// The frames and rules of the windows in the Swiss manner (SX, 2026-10-09, on labs/graphics/sketches/windows-swiss.html: «делаем вот
// это, но стиль рамки ... лучше увести в серый, типа в темно-серый или наоборот в средне-серый ... может слегка тонированный в цвет
// интерфейса. Мы же поддерживаем четыре разных цвета интерфейса ... я бы хотел, чтобы в оригинале они были серые. А там можно было бы
// включить и тонированные, пока в графические настройки сохраняю»; and «надо следить чтобы сетка и рамка не перебивали контент своим
// контрастом»). The pause and the pilot card wear them; the other windows keep the white frame until they are laid out the same way.
//
// Two inks, both quieter than any text (the secondary text is 7:1 on black, the white 14:1):
//   frame  a window's frame, a picture's box, a keycap's line, a slider's hairline      #585C62, about 2.9:1
//   rule   the rules between groups and the layout's crossed box for a place waiting     #2E3135, about 1.5:1
// They are the sketch's own, put through the game's base grade (src/grade.js gradeHex) as every ink is, and never through the worn look:
// drawn in the final layer (src/grade.js finalDraw, `onFrame`), so a look does not turn them (it did: TYRELL took the frame down
// to 1.9:1 and to a red brown).
//
// The pause's GRAPHICS > FRAMES: GRAY, the default, is those two; TINTED takes the worn look's own colour for the interface (what the
// look makes of the cockpit's structure ink, src/roles.js: PALETTE.blue, the colour the interface's lines are drawn in) and lays a
// FRAME_TINT share of its chroma over the same gray at its own lightness, so the frame is as quiet in every look and only its hue
// follows. Nothing here is per look: a look added tomorrow tints by what it does to PALETTE.blue. ORIGINAL wears no look, so there is
// nothing to follow and TINTED stays the gray. A browser's choice, never the save (src/prefs.js `frames`).
export const FRAME_STYLES = Object.freeze(['gray', 'tinted']);
export const FRAME_STYLE_NAMES = Object.freeze({ gray: 'GRAY', tinted: 'TINTED' });
export const DEFAULT_FRAME_STYLE = 'gray';
// Two more since the organism (SX, 2026-10-16, labs/graphics/organism.js): `hollow`, an empty square's line, and `dash`, the dashes round an empty
// place of a collection («пунктир можно оставить, но его тогда приглушить надо сильно»), both between the rule's gray and the frame's.
export const FRAME_GRAYS = Object.freeze({ frame: '#585C62', rule: '#2E3135', hollow: '#404348', dash: '#323438' });
export const FRAME_TINT = 0.4;

// The page's: { style }, read once at the start (this browser's own, GRAY unless TINTED is kept), changed by the pause's row.
export const frames = { style: DEFAULT_FRAME_STYLE };
export const fitFrameStyle = (v) => (FRAME_STYLES.includes(v) ? v : DEFAULT_FRAME_STYLE);
export function loadFrames(store) {
  frames.style = readFrames(FRAME_STYLES, store);
  return frames;
}
// The switch: kept at once. True when the style changed.
export function setFrames(style, store) {
  const next = fitFrameStyle(style);
  if (next === frames.style) return false;
  frames.style = next;
  writeFrames(next, store);
  return true;
}

// A frame ink as it is to be seen now (a final hex, for `onFrame`): `name` 'frame' or 'rule'. Kept per look worn (the grade's epoch).
const kept = new Map();
export function frameInk(name, style = frames.style) {
  const key = `${gradeEpoch()}|${style}|${name}`;
  let ink = kept.get(key);
  if (ink) return ink;
  const written = FRAME_GRAYS[name];
  ink = gradeHex(written);
  if (style === 'tinted' && lookWorn()) {
    const [, chroma, hue] = oklch(wornInk(PALETTE.blue));
    const [light] = oklch(ink);
    if (hue !== null) ink = fromLch(light, chroma * FRAME_TINT, hue);
  }
  if (kept.size > 64) kept.clear();
  kept.set(key, ink);
  return ink;
}

// `draw()` with every ink in it final, as frameInk gives it (the canvas takes it as it is): `onFrame(() => r.fill(x, y, w, 1, frameInk('rule')))`.
export const onFrame = finalDraw;
