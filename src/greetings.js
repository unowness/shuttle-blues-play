// Greeting an NPC ship (SX, 2026-10-03: «Пролетает NPC. Я могу на него заховериться мышкой ... Я могу по нему кликнуть. И мой
// корабль его поприветствует. А он ответит. Очень коротко и сухо ... Пусть несколько типа будет»): a click on a friendly craft
// (labs/graphics/world-pointer.js) has the pilot's ship say one of PILOT_HELLOS over itself and, `GREET.reply` s later, the craft
// one of CRAFT_REPLIES over it, each in GAMEPLAY's GREETING style (`greet` on the event: labs/graphics/greeting.js), never the line said last. The same craft is not greeted
// again within `GREET.again` s. The words are product copy: Codex may change them in place (AGENTS.md).
import { isEnraged } from './traffic.js';

export const GREET = Object.freeze({ reply: 0.8, again: 6 });
export const PILOT_HAIL_ID = 'pilot';
export const PILOT_HELLOS = Object.freeze(['HELLO.', 'HI THERE.', 'GOOD FLYING.', 'HEY.', 'SAFE ROUTES.', 'MORNING.']);
export const CRAFT_REPLIES = Object.freeze(['YEAH.', 'HI.', 'MM.', 'SURE.', 'LIKEWISE.', 'BUSY.', 'NOTED.']);
// A friendly ship rammed swears at the pilot's ship (SX, 2026-10-08: «когда врезаешься в NPC, он выдавал какую-нибудь фразу, ругался на
// наш корабль, например»), in the answers' own voice, short and dry: src/npcRage.js. A craft with a `curses` list of its own (its record
// in src/npcShips.js) says those. Then, when a ship is enraged (src/npcFleet.js): what it says as it turns on the pilot, at a ram, and
// as it calms. Each pool never gives the line it gave last. These words are the agent's, not SX's picks: product copy for him to change.
export const NPC_CURSES = Object.freeze(['WATCH IT.', 'HEY!', 'LEARN TO FLY.', 'NICE FLYING.', "THAT'S MY HULL.", 'LOOK WHERE YOU FLY.',
  'SPACE IS BIG. USE IT.', 'OH, COME ON.', 'SERIOUSLY?', 'EYES FRONT, PILOT.']);
export const RAGE_LINES = Object.freeze({
  turn: Object.freeze(['THAT DOES IT.', 'YOU ASKED FOR IT.', "GET BACK HERE.", 'MY TURN.', 'HOLD STILL.']),
  ram: Object.freeze(['TAKE THAT.', 'FEEL THAT?', 'ONE MORE.', 'GOT YOU.', 'HOW ABOUT THAT?']),
  calm: Object.freeze(['FINE. GO.', 'FORGET IT.', "WE'RE EVEN.", "WE'RE DONE HERE.", 'NOT WORTH IT.']),
});
// The act's word on its offer, by GAMEPLAY's GREETING (labs/graphics/greeting.js; SX, 2026-10-07: «берем g2 wave и нотч»): WAVE beside
// the ship, or SAY HI after its name. HAIL is gone («мне не нравится название действия Hail»).
export const GREET_WORDS = Object.freeze({ wave: 'WAVE', notch: 'SAY HI' });

// One of `lines`, not `last` again.
export function pickGreeting(lines, last, rng) {
  const pool = lines.length > 1 ? lines.filter((l) => l !== last) : lines;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

// The pilot greets a friendly craft: its own line over its ship at once, the craft's dry answer a moment on (World.greetings, said in
// World.step); not the same craft again so soon. A craft with answers of its own (its record's `replies`) gives one of those.
// Returns whether it was greeted.
export function greetCraft(world, craftId) {
  const ship = world.ship, at = world.craftAt(craftId);
  if (!ship.alive || world.docked || !at || (at.craft && isEnraged(at.craft))) return false;   // an enraged ship is not greeted
  if (world.time - (world.greeted.get(craftId) ?? -Infinity) < GREET.again) return false;
  world.greeted.set(craftId, world.time);
  const rng = world.rng('quest');
  world.lastHello = pickGreeting(PILOT_HELLOS, world.lastHello, rng);
  world.lastReply = pickGreeting(at.craft?.replies ?? CRAFT_REPLIES, world.lastReply, rng);
  // `to`: the craft greeted, so the pilot's words stand on its side (labs/graphics/greeting.js).
  world.emit('trafficHail', { craftId: PILOT_HAIL_ID, label: 'YOU', line: world.lastHello, x: ship.x, y: ship.y, sectorId: world.sector.id, greet: true, to: craftId });
  world.greetings.push({ at: world.time + GREET.reply, craftId, label: at.craft?.label ?? '', line: world.lastReply });
  return true;
}
