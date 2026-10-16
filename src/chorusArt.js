// The recorder buoy of COMMONS's chain (src/chorus.js), as SX picked it on labs/graphics/sketches/quest-objects.html (2026-10-15, C2: «Вот
// этот только глазок другой нарисуй и не надо еще овал мелкий сбоку», «убери белу полоску блика ... сделай приятнее цвет ... в тему самой
// станции», «с2»): a tall rounded panel, a glass eye in its upper half whose pupil looks about while it listens and comes to the middle,
// wider, to speak, and under it the voice's window where the talk stands as bars. Its case is a line of the box glyphs' own weight (a
// tenth of the glyph's size), drawn on the canvas, since a box glyph's corner is never rounder than a quarter cell; what moves in it
// stays glyphs. Its inks are COMMONS's own tones (CONFIG.quests.chorus.art), its pupil white as the ring's lamps. Drawn only: nothing
// reads where it is drawn.
//
//   drawRecorderLying   where it lies, in its sector, turning a little (drawn with the quests' ships, under the hull)
//   drawRecorderAboard  aboard, on a short rope behind the hull as the planet's suitcase hangs (src/errands.js), on the other side of
//                       the hull's rear when the suitcase or a cargo is there too (drawn with the hull)
import { CONFIG } from './config.js';
import { ROLES } from './roles.js';
import { PALETTE } from './palette.js';
import { buoyHere, recorderAboard } from './chorus.js';

const A = () => CONFIG.quests.chorus.art;
const LINE = 0.105;   // the box glyphs' stroke, a share of the glyph's size (measured on the sheet)
const BAR = 1.34;     // the `│` glyph stands 1.34 rows tall: a bar `max` rows tall is drawn at max / BAR
const TAU = Math.PI * 2;
const HALF = 2.45;    // the case's half height, in rows of its own scale: where the rope takes it
const ROPE_MARKS = [1 / 3, 2 / 3];
// The voice: it plays a while and rests; its syllables; how loud it is.
const talking = (t) => (t % 6) < 3;
const lampOn = (t) => Math.sin(t * 9) > 0.2 && (t % 2.4) < 1.6;
const loudness = (t) => (talking(t) ? (lampOn(t) ? 1 : 0.35) * (0.55 + 0.45 * Math.abs(Math.sin(t * 7))) : 0);

// A rounded box as arcs and lines (the stand-ins of the checks know these, and so does every browser).
function rounded(c, x, y, w, h, rr) {
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y); c.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  c.lineTo(x + w, y + h - rr); c.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  c.lineTo(x + rr, y + h); c.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  c.lineTo(x, y + rr); c.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
}
function circle(c, x, y, rr) { c.moveTo(x + rr, y); c.arc(x, y, rr, 0, TAU); }

// The recorder at (x, y) on the screen, turned by `turn`, its rows `scale` of the world's cell, at the world's time `t`.
export function paintRecorder(r, x, y, turn, scale, t, alpha = 1) {
  const I = A(), v = r.cellH * scale, co = Math.cos(turn), si = Math.sin(turn), ctx = r.ctx;
  const g = (ch, lx, ly, ink, a = 1, size = 1) => r.glyphRot(ch, x + (lx * co - ly * si) * v, y + (lx * si + ly * co) * v, turn, ink, a * alpha, scale * size);
  const line = (build, ink) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y); ctx.rotate(turn); ctx.scale(v, v);
    ctx.beginPath(); build(ctx);
    ctx.lineWidth = (LINE * r.fontSize * scale) / v; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  };
  line((c) => rounded(c, -1.4, -HALF, 2.8, 2 * HALF, 1.0), I.body);
  line((c) => rounded(c, -1.0, 0, 2.0, 2.0, 0.5), I.inner);
  // The eye: its rim and inner ring, the pupil.
  const ey = -1.2, loud = loudness(t), speaking = talking(t);
  line((c) => circle(c, 0, ey, 0.85), I.body);
  line((c) => circle(c, 0, ey, 0.62), I.inner);
  const dx = speaking ? 0 : 0.2 * Math.sin(t * 0.9), dy = speaking ? 0 : 0.14 * Math.sin(t * 1.4 + 1);
  g('●', dx, ey + dy, PALETTE.white, speaking ? 1 : 0.7, 0.5 + 0.6 * loud);
  // The voice's window: seven bars as loud as the voice, quiet dots while it rests.
  for (let i = 0; i < 7; i++) {
    const bx = -0.72 + (1.44 * i) / 6;
    if (!speaking) { g('·', bx, 1.0, ROLES.textHint); continue; }
    const l = (0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + t * 7)) * Math.abs(Math.sin(t * 2.3 + i * 0.5))) * (lampOn(t) ? 1 : 0.45);
    g('│', bx, 1.0, I.body, 1, Math.max(0.2, l * 1.7) / BAR);
  }
}

export function drawRecorderLying(world, r, t) {
  // Where it lies: turning a little, rising and falling; its name under it when the pilot is near.
  const b = buoyHere(world);
  if (b) {
    const s = world.project(r, b.x, b.y), sc = A().lying, reach = HALF * r.cellH * sc;
    if (r.onScreen(s.x, s.y, reach * 2)) {
      paintRecorder(r, s.x, s.y + Math.sin(t * 0.8) * 3, 0.12 * Math.sin(t * 0.35), sc, t);
      if (Math.hypot(b.x - world.ship.x, b.y - world.ship.y) < CONFIG.quests.chorus.reach * 2.5) {
        const label = 'RECORDER', w = label.length * r.cellW * (r.textScale ?? 1);
        r.text(label, s.x - w / 2, s.y + reach + r.cellH, CONFIG.hud.color, 0.9);
      }
    }
  }
}
export function drawRecorderAboard(world, r, t) {
  if (!recorderAboard(world) || world.docked) return;
  // Aboard: on the suitcase's short rope behind the hull, swinging as it does, its top toward the ship.
  const S = CONFIG.quests.errand.suitcase, ship = world.ship, a = ship.angle, sc = A().carried;
  const crowded = !!world.cargo || (world.sideQuest?.kind === 'planet' && world.sideQuest.errand?.stage === 'return');
  const ra = a + S.swing[0] * Math.sin(t * S.swing[1] + 1.3) + S.swing[2] * Math.sin(t * S.swing[3] + 0.4) - (crowded ? S.side : 0);
  const p = world.project(r, ship.x, ship.y), rear = ship.drawnRear();
  const fx = p.x - Math.cos(a) * rear, fy = p.y - Math.sin(a) * rear;
  const half = HALF * r.cellH * sc, cx = fx - Math.cos(ra) * (S.rope + half), cy = fy - Math.sin(ra) * (S.rope + half);
  const tx = cx + Math.cos(ra) * half, ty = cy + Math.sin(ra) * half;
  for (const k of ROPE_MARKS) r.glyphRot(CONFIG.cargo.tetherGlyph, tx + (fx - tx) * k, ty + (fy - ty) * k, 0, CONFIG.cargo.color, 1, 1.4);
  paintRecorder(r, cx, cy, ra + Math.PI / 2, sc, t);
}
