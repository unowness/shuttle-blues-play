import { CONFIG } from './config.js';
import { NPC_SHIPS } from './npcShips.js';

// What the friendly ships and the planets say when a quest ends, and what a ship in trouble says when the pilot comes (SX,
// 2026-10-02: «нпс разными фразами должны благодарить и говорить фразочки»; the ship's thanks was one of two lines, the pilot out
// of fuel said nothing once helped). The voice is the hails' own (src/traffic.js: DELIVERY! STAND BACK. / STILL FLYING. STILL
// BROKE.): short, dry, capitals, a hail's two rows of 22 cells at most (src/feedback.js hailRows).
//
// A line is drawn from the quest kind's own pool and the ship's, never the one said last for that pool (`pickLine`: a memory
// of the last line a pool gave, kept on the world, in memory only), so two rescues in a row do not thank alike.
//
//   Pools of a kind (CONFIG.quests.<kind>.help / .thanks, the plea and the thanks any ship of that quest may say):
//     rescue.hail / rescue.thanks      a pilot out of fuel
//     pester.help / pester.thanks      a ship held by pirates
//     wreck.thanks, WRECK_ASKS         a wrecked ship (it asks for money, `{ask}` is its sum)
//   A ship's own (SHIP_VOICES, by its code; written in its record, src/npcShips.js): `thanks` (any quest), `fuel` (out of
//   fuel), `hunted` (pirates on it).

// Each ship's own, in its trade's way: its record's `words` in the one list of ships (src/npcShips.js NPC_SHIPS).
export const SHIP_VOICES = Object.freeze(Object.fromEntries(NPC_SHIPS.filter((s) => s.words).map((s) => [s.code,
  Object.freeze({ name: s.name, thanks: s.words.thanks, fuel: s.words.fuel, hunted: s.words.hunted })])));

// A wrecked ship's plea, with its sum (the first is the one it said before).
export const WRECK_ASKS = Object.freeze([
  "ENGINE'S GONE. NEED {ask} CR.", "TOW BILL'S {ask} CR. CAN YOU HELP?", "REPAIRS: {ask} CR. I'M SHORT.", "HULL'S BREACHED. NEED {ask} CR.",
]);

// A planet's words about its suitcase, three rows at a time (src/errands.js): what it asks (the station's name in it), what it
// says when the case is brought. One wording each is drawn for an errand (`planetWords`) and kept, so a planet does not change
// its tune between two visits of the same quest.
export const PLANET_ASKS = Object.freeze([
  (st) => ['MY SUITCASE IS STILL', `AT ${st}.`, 'WOULD YOU FETCH IT?'],
  (st) => ['LEFT MY SUITCASE', `AT ${st}.`, 'COULD YOU PICK IT UP?'],
  (st) => ['A SUITCASE OF MINE', `SITS AT ${st}.`, 'BRING IT BACK HERE.'],
  (st) => ["MY SUITCASE'S WAITING", `AT ${st}.`, 'PLEASE BRING IT BACK.'],
]);
export const PLANET_THANKS = Object.freeze([
  ["THERE'S MY SUITCASE.", 'THANK YOU, PILOT.', 'YOUR PAY IS READY.'],
  ["YES, THAT'S MINE.", 'GOOD OF YOU TO COME.', 'PAYMENT READY.'],
  ["SEAL'S STILL IN PLACE.", 'MUCH APPRECIATED.', 'YOUR PAY IS READY.'],
  ['ALL IN ONE PIECE.', 'GOOD WORK, PILOT.', 'YOUR PAY IS READY.'],
]);

// A line drawn from `pool` by a [0, 1) stream, never the one `key` gave last. `said` is the memory (a Map, the world's).
export function pickLine(said, key, pool, rng) {
  const last = said.get(key);
  const fresh = pool.length > 1 ? pool.filter((l) => l !== last) : pool;
  const line = fresh[Math.min(fresh.length - 1, Math.floor(rng() * fresh.length))];
  said.set(key, line);
  return line;
}
const memory = (world) => world.said;

// What a quest's ship may say: the kind's lines and the ship's own. `what` is 'help' (a ship held by pirates calling), 'hail' (a
// pilot out of fuel calling) or 'thanks'; `code` its NPC_ART code, or none for the kind's alone.
export function voicePool(kind, what, code = null) {
  const own = SHIP_VOICES[code], pool = [...(CONFIG.quests[kind][what] ?? [])];
  if (own) {
    if (what === 'thanks') pool.push(...own.thanks);
    else if (kind === 'rescue') pool.push(...own.fuel);
    else if (kind === 'pester') pool.push(...own.hunted);
  }
  return pool;
}

// A line from a quest's pool for this world, never the last said from it. `kind` 'rescue' | 'pester' | 'wreck'.
export const sayFor = (world, kind, what, code = null) => pickLine(memory(world), `${kind}:${what}`, voicePool(kind, what, code), world.rng('quest'));

// A wrecked ship's plea for `ask` CR.
export const wreckPlea = (world, ask) => pickLine(memory(world), 'wreck:ask', WRECK_ASKS, world.rng('quest')).replace('{ask}', ask);

// The wording a planet's errand takes: which asking and which thanking (indices), each never the last errand's.
export function planetWords(world) {
  const pick = (key, n) => Number(pickLine(memory(world), key, Array.from({ length: n }, (_, i) => String(i)), world.rng('quest')));
  return { ask: pick('planet:ask', PLANET_ASKS.length), thanks: pick('planet:thanks', PLANET_THANKS.length) };
}
