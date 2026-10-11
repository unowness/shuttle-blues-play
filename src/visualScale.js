// The ship's visual scale follows the speed TREND (SX, 2026-09-23).
//
// Since SX, 2026-10-05 («пусть он становится слегка меньше при тормозе, и темнее»): smaller while it slows (1.5 -> 1.4, the numbers
// in FLIGHT.ship.visualScale), and a little less opaque with it (brakeShade below). The history of the numbers below is the rule's.
//
// 1.60 by default. While the ship slows, the scale eases toward 1.80 (SX,
// 2026-09-30: it was 2.00); while it speeds up, back toward 1.60; in steady
// flight it holds wherever it is. The trend is the low-passed change in speed,
// with a deadband so that drag alone never reads as braking. Holding the brake
// always counts as slowing, so it also works at low speed, where the dampers
// stay inside the deadband. A wreck resets it, so every life starts at the
// default size.
//
// Presentation only. It multiplies the model's own base scale, and nothing
// that decides play reads it: collider, muzzle and flight come from the
// chassis, which checks/flight-regression.mjs holds independent of scale.

export function createScaleState() {
  return { factor: 1, target: 1, lastSpeed: 0, trend: 0 };
}

// Advances the state by `dt` seconds and returns the multiplier to apply to
// the model's base scale. `held`: the speed is not the pilot's to read (a jump's:
// its top's lift and the lift taken back after the contact, src/trick.js
// jumpSpeedHeld), so the trend reads none of it and none is left over to read
// after; the size eases on toward where it was going. A landing is not a brake
// (labs/graphics/sketches/trick-readable.html measured the hull swelling 1.13
// after every landing under the 1.8 brake; under 1.4 it shrank and darkened).
export function stepScale(state, speed, dt, cfg, alive = true, braking = false, held = false) {
  if (!alive) {
    state.factor = 1; state.target = 1; state.trend = 0;
  } else if (dt > 0) {
    if (held) state.trend = 0;
    else {
      const raw = (speed - state.lastSpeed) / dt;
      state.trend += (raw - state.trend) * (1 - Math.exp(-dt / cfg.smoothing));
      if (braking || state.trend < -cfg.deadband) state.target = cfg.slow / cfg.cruise;
      else if (state.trend > cfg.deadband) state.target = 1;
    }
    state.factor += (state.target - state.factor) * (1 - Math.exp(-dt * cfg.rate));
  }
  state.lastSpeed = speed;
  return state.factor;
}

// The ship flown takes its drawing: at the boot, and when the hangar changes ships (labs/graphics/main.js applyModel). The base scale is what
// the drawing was authored at, noted once. `model.scale` is the braking-breathing scale (up to 1.125x on top of it) and the models are
// shared singletons, so reading it again on every swap grew the ship by 12.5 % each time (standard 1.6, 1.8, 2.02 ...): a model seen before goes
// back to its base. The state starts over (`state`, the page's one, is kept as an object); `ship` measures its drawing in `r`'s cells.
export function takeModel(model, state, ship, r) {
  if (model.baseScale === undefined) model.baseScale = model.scale;
  else model.scale = model.baseScale;
  Object.assign(state, createScaleState());
  ship.setModel(model);
  ship.measureDrawing(r.cellW, r.cellH);
}

// The hull's opacity at a scale `factor` (stepScale's): 1 at the cruise scale, 1 - `fade` at the slow one, eased with the scale between,
// so it darkens and comes back exactly as the hull shrinks and grows again (SX, 2026-10-05). Presentation only, as the scale is.
export function brakeShade(factor, cfg) {
  const span = 1 - cfg.slow / cfg.cruise, fade = cfg.fade;
  if (!(fade > 0) || !(span > 0)) return 1;
  return 1 - fade * Math.min(1, Math.max(0, (1 - factor) / span));
}
