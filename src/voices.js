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
//     wreck.thanks, WRECK_OFFERS       a wrecked ship (it offers its tip for money, `{ask}` is its sum)
//   A ship's own (SHIP_VOICES, by its code; written in its record, src/npcShips.js): `thanks` (any quest), `fuel` (out of
//   fuel), `hunted` (pirates on it).

// Each ship's own, in its trade's way: its record's `words` in the one list of ships (src/npcShips.js NPC_SHIPS); its calls whole here, their
// short forms in SHORTS.
const whole = (list) => (list ?? []).map((l) => (Array.isArray(l) ? l[0] : l));
export const SHIP_VOICES = Object.freeze(Object.fromEntries(NPC_SHIPS.filter((s) => s.words).map((s) => [s.code,
  Object.freeze({ name: s.name, thanks: s.words.thanks, fuel: whole(s.words.fuel), hunted: whole(s.words.hunted) })])));

// The words of the side quests (the text pass SX approved on 2026-10-24, codex/text-review/2026-10-24), beside the pools of CONFIG.quests:
// what a pilot out of fuel says once given it (RESCUE_GIVEN), and what a ship the pirates held says as it goes on (PESTER: driven off,
// with a capsule of its own out there, and late, its hail's short form, and the notch's word on it); a wrecked ship's offer by the tip it holds, and what it says as it hands the tip over.
export const RESCUE_GIVEN = "GOT IT. I'LL SEND THE MONEY NOW.";
export const PESTER = Object.freeze({
  clear: "THEY'VE BACKED OFF. COME OVER. I OWE YOU FOR THAT.",
  capsuleCall: Object.freeze(["MY CAPSULE'S STILL OUT THERE! I'VE MARKED IT. PLEASE GET IT TOO.", "MY CAPSULE'S AT THE MARKER. GET IT TOO!"]),
  capsuleClear: "YOU GOT THE CAPSULE BACK! COME OVER AND I'LL PAY YOU.",
  capsuleWait: Object.freeze(["JUST THE CAPSULE NOW. IT'S STILL OUT THERE, BY THE MARKER.", "CAPSULE'S STILL OUTSIDE, BY THE MARKER."]),
  lost: "CAN'T STAY. I'M PULLING OUT!",
  lostNote: 'RESCUE INCOMPLETE. THE SHIP LEAVES THE ATTACK SITE.',
});
// A wrecked ship's offer, by the kind of tip it holds: [whole, short] (`{ask}` its sum), and what it adds in its window.
export const WRECK_OFFERS = Object.freeze({
  cache: Object.freeze(['WANT SOME CACHE COORDINATES? YOURS FOR {ask} CR.', 'CACHE COORDINATES. {ask} CR. INTERESTED?']),
  signal: Object.freeze(["I KNOW WHERE TO PICK UP A TRANSMISSION. I'LL SHOW YOU FOR {ask} CR.", 'SIGNAL LOCATION. {ask} CR. INTERESTED?']),
  word: Object.freeze(["COLLECTING WORDS FOR SIGNS? I'VE GOT ONE FOR {ask} CR.", 'A WORD FOR SIGNS. {ask} CR.']),
});
export const WRECK_NEED = "THAT'S ALL I NEED TO COVER THE REPAIRS.";
// What it says handing the tip over (src/wrecked.js handInWreck), by the tip it gives in the end: `sector` where it is, `word` the word.
export const WRECK_TIPS = Object.freeze({
  cache: (sector) => [`HERE YOU GO. SECTOR ${sector}. SENT YOU THE MARKER. I HAVEN'T TOUCHED THE CACHE.`, 'GOOD LUCK OUT THERE.'],
  signal: (sector) => [`PICKED UP A TRANSMISSION IN ${sector}. SENT YOU A MARKER; TRY THERE. NEVER DID WORK OUT WHO IT WAS.`, "MAYBE YOU'LL HAVE MORE LUCK WITH IT."],
  word: (word) => [`NEW WORD FOR SIGNS: ${word}.`, 'SENT. NOW I CAN GET THIS SHIP SORTED.'],
  none: () => ["CHECKED THE LEAD. IT'S NO USE ANYMORE, AND I HAVEN'T GOT ANOTHER. SORRY. I'VE LET YOU DOWN."],
  // (The tip promised gone, another in its place: said first.)
  replaced: "THAT LEAD'S NO GOOD ANYMORE. I'VE GOT ANOTHER. SENDING IT NOW.",
});

// A planet's words about its suitcase (src/errands.js): what it asks (the station's name in it: its hail's short form, then the rest in its
// window), what it says when the case is brought, and once it has paid. One wording: the case holds the contact's instruments.
export const PLANET_ASKS = Object.freeze([
  (st) => [`MY INSTRUMENT CASE IS STILL AT STATION ${st}. CAN'T MEASURE A THING OUT HERE WITHOUT IT.`, `MY INSTRUMENT CASE IS AT ${st}.`,
    "COULD YOU PICK IT UP ON YOUR WAY? I'LL PAY FOR THE DELIVERY."],
]);
export const PLANET_THANKS = Object.freeze([
  Object.freeze(['GOOD. I CAN GET ON WITH THIS.', "I'LL SEND THE DELIVERY FEE NOW."]),
]);
export const PLANET_PAID = "THAT'S PAID. THANK YOU.";

// The short forms of the calls (a hail's: src/feedback.js hailRows), by the whole: the ships' own and the quests'.
export const SHORTS = new Map([
  ...NPC_SHIPS.flatMap((s) => [...(s.words?.fuel ?? []), ...(s.words?.hunted ?? [])]).filter(Array.isArray),
  ...(CONFIG.quests.rescue.short ?? []), ...(CONFIG.quests.pester.short ?? []), PESTER.capsuleCall, PESTER.capsuleWait,
].map(([w, sh]) => [w, sh]));
export const shortOf = (line) => SHORTS.get(line) ?? line;

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

// A wrecked ship's offer for `ask` CR, by the tip it holds: [whole, short].
export const wreckOffer = (kind, ask) => (WRECK_OFFERS[kind] ?? WRECK_OFFERS.cache).map((l) => l.replace('{ask}', ask));

// The wording a planet's errand takes: which asking and which thanking (indices), each never the last errand's.
export function planetWords(world) {
  const pick = (key, n) => Number(pickLine(memory(world), key, Array.from({ length: n }, (_, i) => String(i)), world.rng('quest')));
  return { ask: pick('planet:ask', PLANET_ASKS.length), thanks: pick('planet:thanks', PLANET_THANKS.length) };
}
