import { CONFIG } from './config.js';
import { clamp, lerp } from './util.js';

// Pirates' characters (SX, 2026-10-02, PIRATE_PERSONAS_HANDOFF.md): four traits, each its own scale of 0-10. A pirate
// rolls a main trait high, one secondary in the middle and the other two low; a squad has no more than two with the
// same main. The numbers of CONFIG.pirates.personas turn the points into the pilot's brain, gun and craft (applied once,
// where the Pirate is made, src/pirates.js); the behaviours that are new (hiding behind a rock, running away) and the
// shouts live in src/pirates.js and read the points through the helpers here.
//
//   GREED       quickest to the loose coins, and careless while it grabs
//   DARING      keeps its range, circles and weaves, dodges, hides behind rocks between shots
//   AGGRESSION  comes in close and fires more often
//   COWARDICE   runs when its hull is low or its squad is losing

export const TRAITS = Object.freeze(['greed', 'daring', 'aggression', 'cowardice']);
export const TRAIT_LABELS = Object.freeze({ greed: 'GREED', daring: 'DARING', aggression: 'AGGRESSION', cowardice: 'COWARDICE' });

const P = () => CONFIG.pirates.personas;
const whole = (rng, [lo, hi]) => lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));

// One pirate's points with `main` as its main trait (or one drawn).
export function rollPersona(rng, main = null) {
  const C = P();
  const top = main ?? TRAITS[Math.min(TRAITS.length - 1, Math.floor(rng() * TRAITS.length))];
  const others = TRAITS.filter((t) => t !== top);
  const second = others[Math.min(others.length - 1, Math.floor(rng() * others.length))];
  const traits = {};
  for (const t of TRAITS) traits[t] = t === top ? whole(rng, C.main) : t === second ? whole(rng, C.second) : whole(rng, C.rest);
  return traits;
}

// A squad's characters: the mains drawn at random, but none for a third time.
export function rollSquad(count, rng) {
  const C = P(), used = {}, out = [];
  for (let i = 0; i < count; i++) {
    const free = TRAITS.filter((t) => (used[t] ?? 0) < C.sameMain);
    const main = (free.length ? free : TRAITS)[Math.min((free.length || TRAITS.length) - 1, Math.floor(rng() * (free.length || TRAITS.length)))];
    used[main] = (used[main] ?? 0) + 1;
    out.push(rollPersona(rng, main));
  }
  return out;
}

// The trait with the most points.
export function mainTrait(traits) {
  return traits ? TRAITS.reduce((best, t) => (traits[t] > traits[best] ? t : best), TRAITS[0]) : null;
}

// Points over the reference (negative under it), 0 without a character.
const over = (traits, t) => (traits ? (traits[t] ?? P().ref) - P().ref : 0);
const points = (traits, t) => (traits ? traits[t] ?? 0 : P().ref);

// The pilot's numbers with the character laid over them. `keepGreed` leaves `greed` as it is (a change of role keeps
// the grab rule it was made with, and what a check set on it).
export function personaBrain(B, traits, { keepGreed = false } = {}) {
  if (!traits) return B;
  const C = P(), g = over(traits, 'greed'), d = over(traits, 'daring'), a = over(traits, 'aggression');
  const out = { ...B };
  if (!keepGreed && B.greed) {
    const G = C.greed, gv = points(traits, 'greed');
    out.greed = {
      ...B.greed,
      rate: Math.max(0, G.rate * gv),
      radius: Math.max(200, B.greed.radius + G.radius * g),
      speed: B.greed.speed + G.speed * g,
      time: Math.max(1, B.greed.time + G.time * g),
      cooldown: Math.max(G.minCooldown, B.greed.cooldown + G.cooldown * g),
      max: gv >= G.reckless ? Infinity : B.greed.max,
      reckless: gv >= G.reckless,
    };
  }
  const D = C.daring, A = C.aggression;
  const range = Math.max(0.4, (1 + D.standoff * d) * (1 + A.standoff * a));
  out.standoff = [B.standoff[0] * range, B.standoff[1] * range];
  out.strafeSpeed = Math.max(0, B.strafeSpeed * (1 + D.strafe * d));
  out.weaveAccel = Math.max(0, B.weaveAccel * (1 + D.weave * d));
  out.dodgeSkill = clamp(B.dodgeSkill + D.dodge * d, 0, 0.95);
  out.breakRange = B.breakRange > 0 ? Math.max(60, B.breakRange + A.breakRange * a) : B.breakRange;
  if (B.lapse) out.lapse = { ...B.lapse, rate: Math.max(0, B.lapse.rate * (1 + A.lapse * a)) };
  if (B.ramSpeed > 0) out.ramSpeed = B.ramSpeed * (1 + A.ram * a);
  return out;
}

// The gun: a quicker one, with a wider cone, for an aggressive pirate.
export function personaWeapon(W, traits) {
  if (!traits) return W;
  const A = P().aggression, a = over(traits, 'aggression');
  return { ...W, interval: W.interval * Math.max(0.5, 1 + A.interval * a), cone: Math.max(0.04, W.cone + A.cone * a) };
}

// The craft: a little faster and quicker on the turn for a daring one.
export function personaCraft(K, traits) {
  if (!traits) return K;
  const D = P().daring, d = over(traits, 'daring');
  return { ...K, maxSpeed: K.maxSpeed * (1 + D.speed * d), turnRate: K.turnRate * (1 + D.turn * d) };
}

// The chance, after a shot, that a daring pirate slips behind cover (0 under `hide.from` points).
export function hideChance(traits) {
  const H = P().daring.hide, v = points(traits, 'daring');
  return traits && v >= H.from ? clamp(H.chance * (v - H.from + 1), 0, 0.9) : 0;
}
export const hideTime = (rng) => lerp(P().daring.hide.time[0], P().daring.hide.time[1], rng());

// Whether a coward runs now: its own hull at `hull` per point over `from` of what it had or less, or its squad losing
// (one or more of `size` down, and a share of at least 1 - `squad` per point over `from`). Never without a character.
export function wantsToRun(traits, hp, maxHp, lost, size) {
  if (!traits) return false;
  const C = P().cowardice, c = points(traits, 'cowardice') - C.from;
  if (c <= 0) return false;
  if (hp / Math.max(1, maxHp) <= C.hull * c) return 'hull';
  if (lost >= 1 && size > 0 && lost / size >= 1 - C.squad * c) return 'squad';
  return false;
}

// A shout for acting on `trait`, or null when the pirate has too few of its points to say it.
export function shoutFor(traits, trait, rng) {
  if (!traits || points(traits, trait) < P().voice) return null;
  const lines = P().shouts[trait];
  return lines?.length ? lines[Math.min(lines.length - 1, Math.floor(rng() * lines.length))] : null;
}
