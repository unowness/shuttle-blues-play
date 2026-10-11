// The warning before a heavy hit, said by the cockpit (SX's 3B, 2026-10-04; chat F1; what is ahead is src/hitWarning.js): when the
// ship is about to meet something at a speed that will cost a lot of hull, in time to brake. Three ways for SX to compare, the lab's
// `?warn=W1 | W2 | W3 | off`, W1 in the game (labs/graphics/sketches/hit-warning.html shows them side by side):
//   W1 LEVER         over the lever, where the jump's scale stands: IMPACT and the points it would cost (WRECK when it would wreck),
//                    over a line that runs out as the blow comes; the BRAKES lamp under the lever blinks in the caution's ink
//   W2 CONSOLE       no words: the console knocked as by a blow, again every `knock` s while it holds, and the BRAKES lamp blinking
//   W3 LEVER + MARK  W1, and the thing itself ringed by the focus's four corners in the same ink, closing in as the blow comes
// Each says it once by a sound the game has (the hull's two-tone, higher when it would wreck). Presentation only: nothing here is read
// by the world. Reduced motion: no console knock, the lamp lit steady.
import { heavyHitAhead } from '../../src/hitWarning.js';
import { ROLES } from '../../src/roles.js';
import { drawTargetBrackets } from '../../src/interface.js';
import { clamp } from '../../src/util.js';

export const WARN_VARIANTS = Object.freeze({ W1: 'LEVER', W2: 'CONSOLE', W3: 'LEVER + MARK' });
export const WARN_DEFAULT = 'W1';
// How long a warning outlives the last frame that saw the blow (s): no flicker on the edge of the lead; the console's knock again
// every `knock` s (W2); the lamp's blink, three times a second at most.
export const WARN_LOOK = Object.freeze({ hold: 0.25, knock: 0.45, blink: 3, mark: { from: 26, to: 6 } });

// The lab's `?warn=` (the game reads none: the default).
export function readWarnSwitch(params) {
  const asked = (params.get('warn') || '').toUpperCase();
  if (asked === 'OFF') return null;
  return WARN_VARIANTS[asked] ? asked : WARN_DEFAULT;
}

export function createHitWarning(variant = WARN_DEFAULT) {
  return { variant, threat: null, seen: -Infinity, said: null, knockAt: -Infinity };
}

// One frame: what is ahead (the world's clock, so it waits with a pause), said once with its sound, the console knocked (W2, W3 not).
// `braking`: the pilot's brake held. `sound`: the page's (src/audio.js play); `panel`: the console's spring (labs/graphics/stunt-fx.js).
export function stepHitWarning(hw, world, { braking = false, reducedMotion = false, sound = null, panel = null } = {}) {
  if (!hw.variant) return null;
  const now = world.time, seen = heavyHitAhead(world, { braking });
  if (seen) { hw.threat = seen; hw.seen = now; }
  else if (now - hw.seen > WARN_LOOK.hold || !world.ship.alive) hw.threat = null;
  const t = hw.threat;
  if (!t) { hw.said = null; return null; }
  if (hw.said !== t.id) {
    hw.said = t.id;
    sound?.play('hullCritical', { pitch: t.fatal ? 1.26 : 1 });
    hw.knockAt = -Infinity;
  }
  if (hw.variant === 'W2' && panel && !reducedMotion && now - hw.knockAt >= WARN_LOOK.knock) {
    hw.knockAt = now;
    panel.vy -= t.fatal ? 300 : 200;
    panel.shake = Math.max(panel.shake, 0.2);
  }
  return t;
}

// What the scale over the lever shows (W1, W3; labs/graphics/vector-helm.js draws it), or null.
export function warnGauge(hw) {
  const t = hw.threat;
  if (!t || hw.variant === 'W2') return null;
  return { kind: 'warn', damage: Math.round(t.damage), fatal: t.fatal, left: t.t, lead: t.lead };
}

// The BRAKES lamp under the lever (labs/graphics/hud.js drawBrake): 0 dark, 1 heavy, 2 a wreck; and whether its blink is lit.
export function warnLamp(hw, world, { reducedMotion = false } = {}) {
  const t = hw.threat;
  if (!t) return { level: 0, lit: false };
  return { level: t.fatal ? 2 : 1, lit: reducedMotion || Math.floor(world.time * WARN_LOOK.blink * 2) % 2 === 0 };
}

// W3: the thing itself ringed by the focus's corners, closing in as the blow comes. Drawn over the flushed world (glyphs at once).
export function drawWarnMark(r, world, hw) {
  const t = hw.threat;
  if (!t || hw.variant !== 'W3') return;
  const p = world.project(r, t.x, t.y);
  const size = t.kind === 'rock' ? t.id.radius * 2 : t.kind === 'station' ? 120 : 90;
  const at = t.kind === 'rock' ? world.project(r, t.id.x, t.id.y) : p;
  const M = WARN_LOOK.mark, spread = M.to + (M.from - M.to) * clamp(t.t / t.lead, 0, 1);
  drawTargetBrackets(r, { x: at.x - size / 2, y: at.y - size / 2, w: size, h: size }, t.fatal ? ROLES.danger : ROLES.caution, spread);
}
