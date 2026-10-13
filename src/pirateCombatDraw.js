import { PIRATE_CUES as C } from './pirateCombatTheme.js';
import { PIRATE_ROLES } from './pirateRolesConfig.js';
import { roleSystemFor } from './pirateRoles.js';

const rests = new Set(['recover', 'reset', 'reload', 'regroup', 'withdraw', 'gun-reset']);
const LOOSE = new Set(['available', 'carried']);
// A count's caption made once a number, not a new string a frame.
const captions = new Map();
const counted = (word, n) => { const key = word + n; let text = captions.get(key); if (!text) captions.set(key, text = `${word} ${n}`); return text; };
function ring(r, x, y, radius, ink, progress = 1) {
  for (let i = 0; i < C.ringSteps; i++) {
    const a = i / C.ringSteps * Math.PI * 2;
    r.glyph('·', x + Math.cos(a) * radius, y + Math.sin(a) * radius, ink,
      i / C.ringSteps <= progress ? C.cueAlpha : C.ringAlpha);
  }
}
function dotted(r, a, b, ink) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  for (let at = C.lineStep; at < length; at += C.lineStep) r.glyph('·', a.x + dx * at / length, a.y + dy * at / length, ink, C.cueAlpha);
}
function caption(r, text, x, y, ink) { r.text(text, x - text.length * r.cellW / 2, y, ink, C.cueAlpha); }

// No ring round a pirate (SX, 2026-10-13: «Убираем это кольцо вообще», asked how long the warning ring before an attack should
// last): the attack is read from the ship itself, its turn and its shots. A resting one keeps its dot, a repair its line.
export function drawPirateCues(world, r, p, at) {
  if (p.mode !== 'hunt' || !p.attack || !r.onScreen(at.x, at.y, p.radius)) return;
  const a = p.attack;
  if (rests.has(a.phase)) r.glyph('·', at.x, at.y - p.radius - C.ringGap, C.recovery);
  if (a.phase === 'pulse') {
    const patient = world.pirates.find((q) => q.id === a.patientId);
    if (patient) dotted(r, at, world.project(r, patient.x, patient.y), C.repair);
  }
  const sys = roleSystemFor(world, p);
  if (p.type === 'tender') caption(r, counted('REPAIR', sys?.supplyRemaining ?? 0), at.x, at.y + p.radius + C.labelGap, C.repair);
  if (p.type === 'weaver') caption(r, counted('MINES', sys?.mineRemaining ?? 0), at.x, at.y + p.radius + C.labelGap, C.warning);
}

export function drawPirateFields(world, r) {
  for (const sys of world.pirateRoleSystems?.values() ?? []) {
    for (const m of sys.mines) {
      const at = world.project(r, m.x, m.y);
      if (!r.onScreen(at.x, at.y, PIRATE_ROLES.mine.trigger)) continue;
      const ink = m.armed ? C.commit : C.warning;
      ring(r, at.x, at.y, PIRATE_ROLES.mine.trigger + world.ship.radius, ink,
        Math.min(1, m.age / PIRATE_ROLES.mine.arm));
      r.glyph(m.armed ? '✳' : '+', at.x, at.y, ink, 1, C.mineScale);
    }
    const c = sys.capsule;
    if (!c || !LOOSE.has(c.state)) continue;
    const at = world.project(r, c.x, c.y);
    if (r.onScreen(at.x, at.y, C.labelGap)) {
      r.glyph('◇', at.x, at.y, C.warning, 1, C.capsuleScale);
      caption(r, c.state === 'carried' ? 'INTERCEPT' : 'RECOVER', at.x, at.y + C.labelGap, C.warning);
    }
    if (c.state === 'carried') {
      const exit = world.project(r, c.exit.x, c.exit.y);
      if (r.onScreen(exit.x, exit.y, C.labelGap)) {
        r.glyph('×', exit.x, exit.y, C.commit);
        caption(r, 'ESCAPE', exit.x, exit.y + C.labelGap, C.commit);
      }
    }
  }
}
