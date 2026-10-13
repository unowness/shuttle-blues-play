// The craft that keep a path of their own, as bodies of the one plane (src/groundPlane.js): O-08's authored traffic (src/traffic.js),
// a visitor on its way through, and a quest's ship (the drifter, the wreck, the pestered ship, a reference ship's site). Each is fixed
// there: it stands where its path or its story puts it and shoves loose things aside, and nothing moves it, so nothing of it is
// written back and nothing new is saved.
//
// Until 2026-10-13 (Codex's weekend round) these steered round obstacles and were pushed off their paths, the push written into a
// quest's own saved record; the steering took ships into planets and off their schedules by kilometres (SX: «Переписать дёшево»).
import { CONFIG } from './config.js';
import { trafficIn, craftPose, visitorPose } from './traffic.js';

// A craft's envelope (u), from its drawing's rows, worked out once a craft.
const radii = new WeakMap();
export function craftRadius(craft) {
  let r = radii.get(craft);
  if (r === undefined) {
    const R = CONFIG.render, S = CONFIG.traffic.npcSolid;
    let cols = 0;
    for (const row of craft.rows) cols = Math.max(cols, row.length);
    r = Math.hypot(cols * R.fontSize * S.cellEm, craft.rows.length * R.fontSize * R.lineRatio) * craft.scale * S.fill / 2;
    radii.set(craft, r);
  }
  return r;
}

// Each World's bodies, made once and moved each step.
const states = new WeakMap();
const ACTORS = ['drifter', 'wreck', 'pester-ship', 'special-ship'];

function body(map, key) {
  let b = map.get(key);
  if (!b) map.set(key, b = { x: 0, y: 0, vx: 0, vy: 0, radius: 0 });
  return b;
}

export function sceneBodies(world, dt, out) {
  let s = states.get(world);
  if (!s) states.set(world, s = { bodies: new Map(), last: new Map() });
  const t = world.time, sample = Math.max(dt, CONFIG.sim.step);
  if (world.sector.hidden) {
    for (const craft of trafficIn('sector-hidden')) {
      const p = craftPose(craft, t, world.width, world.height), q = craftPose(craft, t - sample, world.width, world.height);
      const b = body(s.bodies, craft);
      b.x = p.x; b.y = p.y; b.vx = (p.x - q.x) / sample; b.vy = (p.y - q.y) / sample; b.radius = craftRadius(craft);
      out.push(b);
    }
  }
  const v = world.visitor;
  if (v && v.sectorId === world.sector.id) {
    const p = visitorPose(v), b = body(s.bodies, 'visitor');
    b.vx = (p.x - b.x) / sample; b.vy = (p.y - b.y) / sample;
    if (s.last.get('visitor') !== v) { b.vx = 0; b.vy = 0; s.last.set('visitor', v); }
    b.x = p.x; b.y = p.y; b.radius = craftRadius(v.craft);
    out.push(b);
  }
  for (const id of ACTORS) {
    const pose = world.craftAt(id);
    if (!pose?.craft) continue;
    const b = body(s.bodies, id);
    b.vx = 0; b.vy = 0; b.x = pose.x; b.y = pose.y; b.radius = craftRadius(pose.craft);
    out.push(b);
  }
  return out;
}
