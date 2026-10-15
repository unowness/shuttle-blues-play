// The pilot's ship docking and leaving a station, drawn (SX, 2026-10-15: «наш корабль уходит вниз в глубину, а потом всплывает в доке»;
// «чуть чуть можно анимацию более хлесткую когда вниз уходит»; then, the code effect of the sketch gone: «Нужна анимация, короче, как на
// респауне. Ныряет внутрь, выплывает снизу»). The world plays the docking (src/docking.js: dive, under, rise, by CONFIG.station.docking)
// and says where it is (dockLook); this says how the ship looks at that moment:
//   the dive: a small hop up (`hop` of the dive, its size `hopGrow` more and `hopLift` px up), then down and away at a rising pace,
//   shrinking to the respawn's `small` and sinking `sink` of the respawn's `from` px, going dark from `fadeFrom` of the dive on;
//   the rise: the respawn's own (reboot.js REBOOT.rise, as respawn-fx.js draws it: up from `from` px under its place, out of nothing over `fade` s, from
//   `small` of its size, a spring let go, past its place by a little and back).
import { REBOOT } from './reboot.js';

export const DOCK_FX = Object.freeze({ hop: 0.16, hopGrow: 0.06, hopLift: 4, sink: 0.6, fadeFrom: 0.35 });
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => { const c = clamp01(u); return c * c * (3 - 2 * c); };

// The rise `e` s after it began: { grow, alpha, dy } (dy px below its place).
export function riseLook(e) {
  const R = REBOOT.rise;
  if (e <= 0) return { grow: R.small, alpha: 0, dy: R.from };
  const z = R.zeta, root = Math.sqrt(1 - z * z), wd = Math.PI / R.peak, w = wd / root;
  const s = 1 - Math.exp(-z * w * e) * (Math.cos(wd * e) + (z / root) * Math.sin(wd * e));
  const f = Math.min(1, e / R.fade);
  return { grow: R.small + (1 - R.small) * Math.min(1, s), alpha: f * f * (3 - 2 * f), dy: R.from * (1 - s) };
}
// The dive `u` of its way through (0..1): { grow, alpha, dy }.
export function diveLook(u) {
  const R = REBOOT.rise, F = DOCK_FX, c = clamp01(u);
  if (c < F.hop) { const k = Math.sin(Math.PI * c / F.hop); return { grow: 1 + F.hopGrow * k, alpha: 1, dy: -F.hopLift * k }; }
  const d = (c - F.hop) / (1 - F.hop);
  return { grow: 1 - (1 - R.small) * d * d, alpha: 1 - ease((c - F.fadeFrom) / (1 - F.fadeFrom)), dy: R.from * F.sink * d * d };
}
// How the ship is drawn for the world's dockLook (src/docking.js), or null when it is drawn as itself: `hidden` while it is under the
// station. With reduced motion it only fades out and in, in its place.
export function shipDockLook(look, { reducedMotion = false } = {}) {
  if (!look) return null;
  if (look.phase === 'under') return { hidden: true };
  const f = look.phase === 'dive' ? diveLook(look.u) : riseLook(look.e);
  return reducedMotion ? { grow: 1, alpha: f.alpha, dy: 0 } : f;
}
