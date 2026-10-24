// Friendly NPC ships in the grid's sectors (SX, 2026-10-02: «нарисуй мне сначала выбор из 36 разных корабликов, чтобы я
// выбрал какие мы поместим в игру как добрые npc корабли»; his picks, from labs/graphics/sketches/npc-ships.html: «N01
// scheme 485, N06 scheme 172, N11 scheme 403, N12 scheme 689, N15 scheme 745, N16 scheme 652, N19 scheme 62, N21, N23,
// N27 scheme 837, N28 scheme 797, N32 scheme 652, N34 scheme 285»); and from the second sheet, labs/graphics/sketches/npc-ships-2.html
// (SX, 2026-10-06: «нарисуй 7 новых еще», «то есть 10, чтобы выбрать»; then «NPC NEW: N37, N38, N40, N41, N42, N43, N44, N46»).
//
// NPC_SHIPS is the one list of them: a ship is one record, and everything that knows the fleet reads it (the drawings and
// paints here and in src/npcPaint.js, where each begins and its pace in src/npcFleet.js, its words in src/voices.js, the
// quests' choice of a ship in src/quests.js, src/wrecked.js and src/pester.js, the checks). Adding a ship is adding a record.
//
//   code, name   its sheet's code and the name under it in flight
//   scheme       the number its paint was rolled with on the sheet (SCHEME 0 is the ship's drawn paint)
//   glyphs       its rows of glyphs; `colors` beside them, one role key a cell (h hull, t trim, g glass, e engine, l light)
//   palette      the ink of each role: the scheme's
//   route        where it begins: a lane between two places or a circle round one (`resolveRoute` below)
//   speed        its pace, u/s, everywhere it goes, by what the ship is (SX, 2026-10-06: «назначь им разные скорости исходя из
//                характера», «всем»): the note above each route says why; `uneven` (LEARNER) swings it (src/npcFleet.js Walker)
//   words        what it says in a quest (src/voices.js): `thanks` (any), `fuel` (out of fuel), `hunted` (pirates on it)
//   job          the word it gives itself when the pilot first meets it (src/npcTalk.js; N4 TALK, 2026-10-19: the agent's words, from the
//                note over its route, product copy SX or Codex may change)
//   favor        what it does for a pilot who helped it, at their next meeting (src/npcTalk.js; N6 QUESTS): 'fuel' or 'hull' it gives,
//                'cache' or 'signal' it marks, 'word' it teaches for signs
//
// The drawings and their paints are copied from the sheet (the game never imports from sketches): each ship's rows of
// glyphs, its rows of role keys and the palette its scheme rolled there (schemeFor with the rule the sheet derives from the
// pilot's ship in STANDARD: two or three inks, plainer, under the ship's brightest; checks/npc-traffic.mjs holds the copy to
// those limits). This palette is the ship's own scheme (OWN): in the game each ship wears one of the pilot's paints, tamed by
// the same rule, or this one (src/npcPaint.js, src/npcFleet.js; SX, 2026-10-02: «По системе весов перекрашивай корабли нпс в
// разные цвета»).
//
// They go about their business over the whole grid (src/npcFleet.js), each from the place its route names. A route names its
// places, a station by its id or a planet by its name, not numbers, so the route follows when the map's layout changes
// (labs/map-editor/); it is worked out once, from the catalogue, into the fractions src/traffic.js craftPose reads. A lane
// stops `clear` u short of a station's middle, outside its menu; a circle round a station is `radius` u, round a planet that
// much above its orbit's cushion. After SX's map layout of 2026-10-02 moved the stations, holes and planets, the routes that no
// longer cleared them were re-anchored (N01, N11, N15, N16, N21, N28, N32); the ships are as picked. SX moved
// no route himself. SX, 2026-10-10: cruising paces raised by 60%, keeping each craft's character.
// The turtle and houseboat stay slowest (88, 96 u/s), the taxi and newsreel quickest (320, 336).

import { CONFIG } from './config.js';
import { SECTORS, SECTOR_SIZE, stationDefById, planetKey } from './sectors.js';
import { QUIET_SHIP } from './eggs.js';

// Each ship's words (the text pass SX approved on 2026-10-24, codex/text-review/2026-10-24): `replies` its answer to the pilot's greeting
// when nothing else is to be said (src/npcTalk.js replyFor); `words` its call out of fuel and under fire, each [whole, short] (the short
// form in its hail, the whole in its window: src/voices.js), and its two thanks, either one after any help (fuel, cover, money for repairs).
export const NPC_SHIPS = Object.freeze([
  {
    code: 'N01', name: 'LATCH', scheme: 485,
    glyphs: [
      "   .-.   ",
      "  ( o )  ",
      " [=]|[=] ",
      " [=]|[=] ",
      " [=]|[=] ",
      " [=]|[=] ",
      "  /___\\  ",
      "   \" \"   ",
    ],
    colors: [
      "   hhh   ",
      "  h g h  ",
      " ttthttt ",
      " ttthttt ",
      " ttthttt ",
      " ttthttt ",
      "  hhhhh  ",
      "   e e   ",
    ],
    palette: { h: '#777E86', t: '#B1A99D', g: '#89D0E3', e: '#777E86', l: '#777E86' },
    // A hauler out of a freight station, slow. It left RELAY 12 for HALCYON before; HOME and the hole now lie on that line, so it
    // hauls north up the sector's middle instead, to a free end. Its pace: four rows of containers, the heaviest hauler.
    route: { sector: 'sector-j05', path: { kind: 'lane', from: 'station-relay-j05', to: [0.58, 0.28], phase: 0.2 } }, speed: 128, job: 'HAULER', favor: 'fuel',
    replies: ["GIVE MY BOW SOME ROOM. I CAN'T STOP QUICKLY WITH THIS LOAD."],
    words: {
      thanks: ['MUCH OBLIGED. THAT HELPED.', 'THANKS. I WAS WELL AND TRULY STUCK.'],
      fuel: [['BURNED THROUGH ALL MY FUEL HAULING THIS LOT. CAN YOU SPARE A LITTLE?', 'BURNED THROUGH MY FUEL. SPARE A LITTLE?']],
      hunted: [['PIRATES ON MY TAIL. TOO HEAVY TO OUTRUN THEM. COVER ME.', 'PIRATES ON MY TAIL. TOO HEAVY TO RUN.']] },
  },
  {
    code: 'N06', name: 'BOKS', scheme: 172,
    glyphs: [
      "  ___  ",
      " /o o\\ ",
      "|[___]|",
      "|[___]|",
      " \\___/ ",
      "  \" \"  ",
    ],
    colors: [
      "  hhh  ",
      " hg gh ",
      "httttth",
      "httttth",
      " hhhhh ",
      "  e e  ",
    ],
    palette: { h: '#AFADB6', t: '#8E87A8', g: '#CBBA98', e: '#AFADB6', l: '#AFADB6' },
    // A hauler out of a freight station, slow. Its pace: a small box hauler, lighter than LATCH.
    route: { sector: 'sector-k04', path: { kind: 'lane', from: 'station-depot-k04', to: [0.5, 0.66], phase: 0.6 } }, speed: 144, job: 'HAULER', favor: 'hull',
    replies: ['HI! AM I BLOCKING YOU?'],
    words: {
      thanks: ['THANKS! ONE LESS THING TO SORT OUT.', "THANKS. I WASN'T SURE WHO ELSE TO CALL."],
      fuel: [["THAT'S ME STUCK. PARCELS ABOARD, NO FUEL LEFT. GOT ANY TO SPARE?", 'STRANDED WITH PARCELS. GOT FUEL?']],
      hunted: [["PIRATES AFTER ME! THEY WON'T LEAVE ME ALONE. HELP!", 'PIRATES ON MY TAIL. COVER ME!']] },
  },
  {
    code: 'N11', name: 'SIFT', scheme: 403,
    glyphs: [
      "\\_________/",
      " \\ . . . / ",
      "  \\_____/  ",
      "   |[o]|   ",
      "   '---'   ",
      "    \" \"    ",
    ],
    colors: [
      "hhhhhhhhhhh",
      " h t t t h ",
      "  hhhhhhh  ",
      "   htgth   ",
      "   hhhhh   ",
      "    e e    ",
    ],
    palette: { h: '#8F9AAC', t: '#C3B9AE', g: '#D3C6AB', e: '#C3B9AE', l: '#8F9AAC' },
    // A workboat: the sweeper across K-04's open south. Its pace: a sweeper, at a sweeping pace.
    route: { sector: 'sector-k04', path: { kind: 'lane', from: [0.46, 0.86], to: [0.84, 0.86], phase: 0.1 } }, speed: 120, job: 'SWEEPER', favor: 'cache',
    replies: ["DON'T WAIT FOR ME. I'LL BE BUSY HERE FOR A WHILE."],
    words: {
      thanks: ['THANKS. HAD ENOUGH ON MY HANDS ALREADY.', 'APPRECIATE THE HELP.'],
      fuel: [['WORKED THE TANK DRY. GOT A LITTLE FUEL TO SPARE?', 'WORKED THE TANK DRY. GOT SPARE FUEL?']],
      hunted: [["I'M TAKING FIRE. I CAN'T HOLD THEM OFF ON MY OWN.", 'TAKING FIRE. NEED HELP.']] },
  },
  {
    code: 'N12', name: 'WICK', scheme: 689,
    glyphs: [
      "·  .-.  ·",
      "  /[o]\\  ",
      " | (·) | ",
      " |     | ",
      "·'-----'·",
      "   \" \"   ",
    ],
    colors: [
      "l  hhh  l",
      "  htgth  ",
      " h tlt h ",
      " h     h ",
      "lhhhhhhhl",
      "   e e   ",
    ],
    palette: { h: '#A8B5BA', t: '#71939F', g: '#71939F', e: '#A8B5BA', l: '#C3C0DD' },
    // A workboat: the buoy tender out in J-04's middle, past the buoy by DRY DOCK. Its pace: a light tender from buoy to buoy.
    route: { sector: 'sector-j04', path: { kind: 'lane', from: [0.44, 0.52], to: [0.56, 0.58], phase: 0.4 } }, speed: 176, job: 'BUOY TENDER', favor: 'signal',
    replies: ['OH, HELLO. HARDLY HEARD ANYTHING BUT BUOYS TODAY.'],
    words: {
      thanks: ['THANKS FOR ANSWERING. I WAS GETTING WORRIED.', "THANKS. GLAD YOU DIDN'T JUST FLY PAST."],
      fuel: [["I'M STUCK WITH AN EMPTY TANK. GOT ANY FUEL TO SPARE?", 'EMPTY TANK. GOT ANY FUEL TO SPARE?']],
      hunted: [["PIRATES ARE FIRING ON ME! I'M ON MY OWN OUT HERE. HELP!", 'PIRATES! BUOY TENDER NEEDS COVER.']] },
  },
  {
    code: 'N15', name: 'TAXI', scheme: 745,
    glyphs: [
      "  .---.  ",
      " / o o \\ ",
      "|  [=]  |",
      "|·:·:·:·|",
      " \\_____/ ",
      "  \"   \"  ",
    ],
    colors: [
      "  hhhhh  ",
      " h g g h ",
      "h  tlt  h",
      "httttttth",
      " hhhhhhh ",
      "  e   e  ",
    ],
    palette: { h: '#85ACC9', t: '#757E84', g: '#757E84', e: '#757E84', l: '#85ACC9' },
    // A courier: a taxi out of DRY DOCK into the open. Its pace: a fare aboard and the meter running.
    route: { sector: 'sector-j04', path: { kind: 'lane', from: 'station-drydock-j04', to: [0.62, 0.48], phase: 0.7 } }, speed: 320, job: 'TAXI', favor: 'word',
    replies: ["A BIT OF ROOM, PLEASE. I'VE GOT A PASSENGER."],
    words: {
      thanks: ['THANKS. MY PASSENGER WAS GETTING NERVOUS.', "OH, THANKS. THAT'S QUITE ENOUGH FOR ONE DAY."],
      fuel: [["COULD USE A HAND. OUT OF FUEL, AND MY PASSENGER'S STILL WAITING.", 'OUT OF FUEL. COULD USE A HAND.']],
      hunted: [["PIRATES! I'VE GOT A PASSENGER. HELP ME GET THEM OFF OUR TAIL!", 'PIRATES! PASSENGER ABOARD.']] },
  },
  {
    code: 'N16', name: 'HOPPER', scheme: 652,
    glyphs: [
      "o.   .o",
      "  \\_/  ",
      "  (o)  ",
      "  / \\  ",
      "o'   'o",
    ],
    colors: [
      "et   te",
      "  hhh  ",
      "  hgh  ",
      "  h h  ",
      "et   te",
    ],
    palette: { h: '#608FAA', t: '#A2ADB5', g: '#BAB3D3', e: '#A2ADB5', l: '#608FAA' },
    // A courier: it hops from YARD 3 out into the open (YARD 3 stood 1,300 u from its sector's top on SX's map of 2026-10-02, too close
    // for an orbit; Map X, 2026-10-10, moved it to 2,376 u and the lane was kept).
    // Its pace: a hop between stops, quick off the mark.
    route: { sector: 'sector-k05', path: { kind: 'lane', from: 'station-yard-k05', to: [0.46, 0.64], phase: 1.3 } }, speed: 272, job: 'COURIER', favor: 'fuel',
    replies: ['HEY! HAVE A GOOD RUN!'],
    words: {
      thanks: ['THANKS! JUST IN TIME.', 'THANKS FOR THAT. HOPE YOUR RUN GOES BETTER!'],
      fuel: [["DIDN'T MAKE THE NEXT STOP. GOT ANY FUEL TO SPARE?", 'OUT OF FUEL BEFORE THE NEXT STOP. HELP?']],
      hunted: [["HELP! I'M TAKING FIRE. THIS HULL WON'T HOLD OUT LONG!", 'COURIER UNDER FIRE. NEED HELP.']] },
  },
  {
    code: 'N19', name: 'LINER', scheme: 62,
    glyphs: [
      "   .^.   ",
      "  /[o]\\  ",
      " |o   o| ",
      " |o ═ o| ",
      " |o ═ o| ",
      " |o ═ o| ",
      " |o   o| ",
      "  \\___/  ",
      "   \"\"\"   ",
    ],
    colors: [
      "   hhh   ",
      "  htgth  ",
      " hg   gh ",
      " hg t gh ",
      " hg t gh ",
      " hg t gh ",
      " hg   gh ",
      "  hhhhh  ",
      "   eee   ",
    ],
    palette: { h: '#7E7B77', t: '#B2A0B1', g: '#B2A0B1', e: '#7E7B77', l: '#7E7B77' },
    // A liner on a long way: down J-06 past PARQUET. Its pace: a liner keeping its timetable.
    route: { sector: 'sector-j06', path: { kind: 'lane', from: 'station-commons-j06', to: [0.42, 0.86], phase: 0.5 } }, speed: 208, job: 'LINER', favor: 'signal',
    replies: ['GOOD DAY, SHUTTLE. HAVE A SAFE FLIGHT.'],
    words: {
      thanks: ['THANK YOU ON BEHALF OF OUR CREW AND PASSENGERS.', "THANK YOU, PILOT. WE'RE IN YOUR DEBT."],
      fuel: [['PASSENGER LINER REQUESTING REFUELLING ASSISTANCE.', 'LINER OUT OF FUEL. NEED REFUELLING.']],
      hunted: [['LINER BRIDGE CALLING ALL NEARBY SHIPS. WE ARE UNDER FIRE AND REQUIRE ASSISTANCE.', 'MAYDAY. PASSENGER LINER UNDER FIRE.']] },
  },
  {
    code: 'N21', name: 'HALO', scheme: 0,
    glyphs: [
      "   .-+-.   ",
      "  /  |  \\  ",
      " (---o---) ",
      "  \\  |  /  ",
      "   '-+-'   ",
      "     |     ",
      "    [=]    ",
      "    \" \"    ",
    ],
    colors: [
      "   hhthh   ",
      "  h  t  h  ",
      " htttgttth ",
      "  h  t  h  ",
      "   hhthh   ",
      "     t     ",
      "    ttt    ",
      "    e e    ",
    ],
    palette: { h: '#6D9BA7', t: '#BCB6AF', g: '#D2C2A4', e: '#BCB6AF' },
    // A liner leaving APIARY along the northern cross-connection, above ISOBAR and the central hole.
    // Its pace: a habitat ring on its crossing, big and steady.
    route: { sector: 'sector-k06', path: { kind: 'lane', from: 'station-apiary-k06', to: [0.72, 0.18], phase: 0.3 } }, speed: 160, job: 'HABITAT', favor: 'hull',
    replies: ['GOOD DAY. GOOD TO SEE YOU.'],
    words: {
      thanks: ['THANK YOU FROM ALL OF US.', "YOU'VE BEEN A REAL HELP. THANK YOU."],
      fuel: [["COULD YOU SPARE SOME FUEL? WE'RE A HABITAT SHIP WITH EMPTY TANKS.", 'HALO OUT OF FUEL. FAMILIES ABOARD.']],
      hunted: [["WE'RE UNDER ATTACK! THIS IS A HABITAT SHIP. PLEASE GIVE US COVER.", 'PIRATES ATTACKING A HABITAT SHIP.']] },
  },
  {
    code: 'N23', name: 'DOZER', scheme: 0,
    glyphs: [
      "  /^\\  ",
      " |[o]| ",
      " (o|o) ",
      " (o|o) ",
      " (o|o) ",
      " |___| ",
      "  \" \"  ",
    ],
    colors: [
      "  hhh  ",
      " htgth ",
      " tthtt ",
      " tthtt ",
      " tthtt ",
      " hhhhh ",
      "  e e  ",
    ],
    palette: { h: '#A4A8AD', t: '#928DAF', g: '#928DAF', e: '#A4A8AD' },
    // A liner on a long way, along the top of J-05. Its pace: the night service, sleepers aboard: smooth, never hurried.
    route: { sector: 'sector-j05', path: { kind: 'lane', from: [0.3, 0.13], to: [0.8, 0.16], phase: 0.85 } }, speed: 152, job: 'NIGHT LINER', favor: 'word',
    replies: ["GOOD EVENING. THE WHOLE CABIN'S ASLEEP ALREADY."],
    words: {
      thanks: ["THANKS. IT'S BEEN QUITE A NIGHT.", 'THANKS FOR HELPING. HOPE YOU HAVE A QUIET SHIFT.'],
      fuel: [["NIGHT SERVICE HERE. WE'VE RUN OUT OF FUEL. CAN YOU SPARE A LITTLE?", 'NIGHT RUN. NEED FUEL.']],
      hunted: [["THEY'RE FIRING ON THE LINER! PASSENGERS ABOARD. HELP US!", 'NIGHT LINER UNDER FIRE! COVER US.']] },
  },
  {
    code: 'N27', name: 'HELION', scheme: 837,
    glyphs: [
      "      ^      ",
      "┌───┐/ \\┌───┐",
      "│╱╱╱├│o│┤╱╱╱│",
      "└───┘\\_/└───┘",
      "      \"      ",
    ],
    colors: [
      "      h      ",
      "ttttth httttt",
      "tgggthghtgggt",
      "ttttthhhttttt",
      "      e      ",
    ],
    palette: { h: '#9191B1', t: '#C2C2C9', g: '#C2C2C9', e: '#C2C2C9', l: '#9191B1' },
    // Science round a planet, high over its cushion. Its pace: a survey lab under wide panels, taking readings.
    route: { sector: 'sector-j06', path: { kind: 'orbit', at: 'planet:FATHOM', radius: 320, phase: 0.4, dir: 1 } }, speed: 144, job: 'SURVEY LAB', favor: 'cache',
    replies: ["SO THAT'S WHOSE SIGNAL I'VE BEEN RECORDING. HELLO."],
    words: {
      thanks: ["THANKS. I'D BETTER CALL THE BASE. THEY'RE PROBABLY WONDERING WHERE I AM.", "THANK YOU. I'M GLAD YOU WERE NEARBY."],
      fuel: [['GOT CAUGHT UP IN THE READINGS AND MISSED MY FUEL STOP. DO YOU HAVE ANY TO SPARE?', 'MISSED MY FUEL STOP. GOT ANY TO SPARE?']],
      hunted: [["THE LAB'S UNDER FIRE! I'VE STOPPED THE SURVEY. WE NEED COVER.", 'LAB UNDER FIRE! NEED COVER.']] },
  },
  {
    code: 'N28', name: 'GERTY', scheme: 797,
    glyphs: [
      "(·)   (·)",
      " \\     / ",
      "  \\.-./  ",
      "  ( o )  ",
      "  |___|  ",
      "   \" \"   ",
    ],
    colors: [
      "tlt   tlt",
      " t     t ",
      "  thhht  ",
      "  h g h  ",
      "  hhhhh  ",
      "   e e   ",
    ],
    palette: { h: '#C0BDC9', t: '#968BAF', g: '#C6C5A6', e: '#C0BDC9', l: '#C6C5A6' },
    // Science round a planet, high over its cushion: TORTUGA, 200 u over it (it was 300; DAMASK stood 1,440 u from the west edge on
    // SX's map of 2026-10-02, too close for an orbit, and Map X, 2026-10-10, kept the orbit where it was). Its pace: a survey robot, brisk between samples.
    route: { sector: 'sector-k05', path: { kind: 'orbit', at: 'planet:TORTUGA', radius: 200, phase: 2.2, dir: -1 } }, speed: 176, job: 'SURVEYOR', favor: 'signal',
    replies: ['SHUTTLE DETECTED. GREETINGS.'],
    words: {
      thanks: ['ASSISTANCE RECEIVED. THANK YOU.', 'THANK YOU FOR YOUR ASSISTANCE.'],
      fuel: [['FUEL DEPLETED. REQUESTING REFUELLING.', 'FUEL DEPLETED. REFUELLING REQUIRED.']],
      hunted: [['GERTY UNDER FIRE. COVER REQUIRED.', 'GERTY UNDER FIRE. COVER REQUIRED.']] },
  },
  {
    code: 'N32', name: 'GLASS', scheme: 652,
    glyphs: [
      "   .-.   ",
      "  /Y.Y\\  ",
      " (.Y.Y.) ",
      " (Y.Y.Y) ",
      "  \\___/  ",
      "   [o]   ",
      "   \" \"   ",
    ],
    colors: [
      "   hhh   ",
      "  hthth  ",
      " hhththh ",
      " hththth ",
      "  hhhhh  ",
      "   hgh   ",
      "   e e   ",
    ],
    palette: { h: '#7DAEBA', t: '#868D8E', g: '#868D8E', e: '#868D8E', l: '#7DAEBA' },
    // An odd one, slow: the greenhouse round CAIRN, 200 u over the cushion (it was 340; ISOBAR stood in the sector's corner on SX's
    // map of 2026-10-02, and Map X, 2026-10-10, kept the orbit round CAIRN). Its pace: a greenhouse: seedlings do not like a jolt.
    route: { sector: 'sector-k06', path: { kind: 'orbit', at: 'planet:CAIRN', radius: 200, phase: 3.1, dir: 1 } }, speed: 104, job: 'GREENHOUSE', favor: 'fuel',
    replies: ["HI. IT'S STILL DAYTIME IN HERE. THAT'S WHY THE LIGHTS ARE ON."],
    words: {
      thanks: ['THANK YOU.', 'PHEW. THANKS FOR HELPING.'],
      fuel: [["ANY FUEL TO SPARE? THE LIGHTS ARE WORKING, BUT I CAN'T GO ANYWHERE.", 'LIGHTS HAVE POWER. OUT OF FUEL.']],
      hunted: [["WE'RE UNDER FIRE! THIS WHOLE THING'S MADE OF GLASS. HELP!", 'UNDER FIRE! THESE WALLS ARE GLASS!']] },
  },
  {
    code: 'N34', name: 'TURTLE', scheme: 285,
    glyphs: [
      "    .-.    ",
      "   ( o )   ",
      "\\_.-----._/",
      "  | /^\\ |  ",
      "  | \\_/ |  ",
      " /'-----'\\ ",
      "     v     ",
    ],
    colors: [
      "    hhh    ",
      "   h g h   ",
      "tthhhhhhhtt",
      "  h ttt h  ",
      "  h ttt h  ",
      " thhhhhhht ",
      "     e     ",
    ],
    palette: { h: '#908B85', t: '#B1A9C9', g: '#AAC1D4', e: '#908B85', l: '#908B85' },
    // An odd one, slow: the turtle round BERYL. Its pace: a turtle, the slowest of them all.
    route: { sector: 'sector-k04', path: { kind: 'orbit', at: 'planet:BERYL', radius: 250, phase: 0.9, dir: -1 } }, speed: 88, job: 'SLOW BOAT', favor: 'word',
    replies: ["GO ON, PASS ME. I WON'T BE GETTING ANY FASTER."],
    words: {
      thanks: ['THANK YOU. SORRY TO HOLD YOU UP.', 'MUCH OBLIGED. YOU TAKE CARE.'],
      fuel: [['WOULD YOU LOOK AT THAT. OUT OF FUEL. COULD YOU SPARE A LITTLE?', 'OUT OF FUEL. CAN YOU SPARE SOME?']],
      hunted: [["PIRATES. I CERTAINLY WON'T OUTRUN THEM. CAN YOU HELP?", "CAN'T OUTRUN THE PIRATES. NEED HELP."]] },
  },
  // ---- SX's second round (labs/graphics/sketches/npc-ships-2.html; SX, 2026-10-06: «NPC NEW: N37, N38, N40, N41, N42, N43,
  // N44, N46»), each in its drawn paint (scheme 0).
  {
    code: 'N37', name: 'BEEKEEPER', scheme: 0,
    glyphs: [
      "·   .-.   ·",
      " _ ( o ) _ ",
      "/ \\_/ \\_/ \\",
      "\\_/ \\_/ \\_/",
      "  \\_/ \\_/  ",
      "   \"   \"   ",
    ],
    colors: [
      "l   ttt   l",
      " h t g t h ",
      "h hhh hhh h",
      "hhh hhh hhh",
      "  hhh hhh  ",
      "   e   e   ",
    ],
    palette: { h: '#B1A389', t: '#A4A8AD', g: '#D4C2A0', e: '#A4A8AD', l: '#D4C2A0' },
    // A beekeeper's boat, honey for APIARY: it circles CAIRN, a short run from the hive, as a bee keeps to its flowers. Its pace:
    // circling one place, unhurried.
    route: { sector: 'sector-k06', path: { kind: 'orbit', at: 'planet:CAIRN', radius: 500, phase: 1.2, dir: -1 } }, speed: 144, job: 'BEEKEEPER', favor: 'fuel',
    replies: ['BEEN TO HONEYCOMB? HOW ARE THINGS THERE?'],
    words: {
      thanks: ['THANK YOU. GLAD YOU ANSWERED.', 'THANK YOU VERY MUCH.'],
      fuel: [["I'M COMPLETELY OUT OF FUEL. COULD YOU SPARE A LITTLE?", 'OUT OF FUEL. COULD YOU SPARE A LITTLE?']],
      hunted: [['PIRATES COMING FOR ME! HIVES ABOARD. COVER ME!', 'PIRATES! HIVE ABOARD. COVER ME!']] },
  },
  {
    code: 'N38', name: 'NEWSREEL', scheme: 0,
    glyphs: [
      "    .-.    ",
      " .-.|o|.-. ",
      "(-+-)=(-+-)",
      " '-'|_|'-' ",
      "    \" \"    ",
    ],
    colors: [
      "    hhh    ",
      " ttthghttt ",
      "ttttthttttt",
      " ttthhhttt ",
      "    e e    ",
    ],
    palette: { h: '#7494AB', t: '#B9B3AC', g: '#D2C2A4', e: '#B9B3AC', l: '#D2C2A4' },
    // A newsreel camera filming the ruins coming back: between HALCYON and RELAY 12, two of the three a pilot may start by. Its
    // pace: chasing the news, the quickest of them.
    route: { sector: 'sector-j05', path: { kind: 'lane', from: 'station-halcyon-j05', to: 'station-relay-j05', phase: 0.35 } }, speed: 336, job: 'NEWSREEL', favor: 'signal',
    replies: ["SHUTTLE, YOU'RE IN SHOT. DON'T DO ANYTHING FOR THE CAMERA."],
    words: {
      thanks: ["THANKS. THAT'S DEFINITELY ENOUGH FILMING FOR NOW.", "THANKS. I'LL SEND THE FOOTAGE TO THE STATION."],
      fuel: [['GOT CARRIED AWAY FILMING. NOT A DROP OF FUEL LEFT. CAN YOU SPARE SOME?', 'OUT OF FUEL WHILE FILMING. CAN YOU HELP?']],
      hunted: [["PIRATES HAVE OPENED FIRE! I'M RECORDING, BUT I NEED HELP!", 'CAMERA SHIP UNDER PIRATE ATTACK.']] },
  },
  {
    code: 'N40', name: 'TINKER', scheme: 0,
    glyphs: [
      "    .-.    ",
      "   ( o )   ",
      " o-|   |-o ",
      "(_)| = |(_)",
      " o-|   |-o ",
      "   '---'   ",
      "    \" \"    ",
    ],
    colors: [
      "    hhh    ",
      "   h g h   ",
      " tth   htt ",
      "ttth t httt",
      " tth   htt ",
      "   hhhhh   ",
      "    e e    ",
    ],
    palette: { h: '#A4A8AD', t: '#AA9D83', g: '#A4C2D8', e: '#A4A8AD', l: '#A4C2D8' },
    // A tinker, pots and pans on its sides: a pedlar from station to station, SPOOL 8 and PHAROS. Its pace: a pedlar station to
    // station.
    route: { sector: 'sector-j06', path: { kind: 'lane', from: 'station-spool-j06', to: 'station-pharos-j06', phase: 0.15 } }, speed: 176, job: 'TINKER', favor: 'hull',
    replies: ["HI! BIT OF A RACKET, ISN'T IT? THAT'S THE POTS AND PANS, NOT THE SHIP FALLING APART."],
    words: {
      thanks: ['THANK YOU. REALLY APPRECIATE IT.', "WELL, THANK YOU. YOU'VE REALLY HELPED ME OUT."],
      fuel: [["COULD YOU HELP ME OUT WITH FUEL? TANK'S COMPLETELY DRY.", 'OUT OF FUEL. CAN YOU SPARE SOME?']],
      hunted: [["HELP, THEY'RE FIRING ON ME! I CAN'T FIGHT THEM OFF!", 'TRADING CRAFT UNDER FIRE. HELP.']] },
  },
  {
    code: 'N41', name: 'GLAZIER', scheme: 0,
    glyphs: [
      "   .-.   ",
      "  ( o )  ",
      " .-'-'-. ",
      " //|^|\\\\ ",
      " //| |\\\\ ",
      " //|_|\\\\ ",
      "   \" \"   ",
    ],
    colors: [
      "   hhh   ",
      "  h g h  ",
      " hhhhhhh ",
      " tthhhtt ",
      " tth htt ",
      " tthhhtt ",
      "   e e   ",
    ],
    palette: { h: '#A4A8AD', t: '#92C0CD', g: '#92C0CD', e: '#A4A8AD', l: '#92C0CD' },
    // A glazier, panes on an A-frame either side, leaving FOUNDRY 2 along the northern connection.
    // The initial lane avoids the hole on the direct line to DEPOT 7; the fleet then roams the open grid. Its pace: glass, careful.
    route: { sector: 'sector-k04', path: { kind: 'lane', from: 'station-foundry-k04', to: [0.7, 0.18], phase: 0.55 } }, speed: 112, job: 'GLAZIER', favor: 'hull',
    replies: ["BEAR WITH ME. I CAN'T TURN QUICKLY WITH THIS GLASS ABOARD."],
    words: {
      thanks: ["THANKS. I'D BETTER CHECK THE RESTRAINTS.", 'THANK YOU. THAT MAKES THINGS EASIER.'],
      fuel: [["I NEED FUEL. WON'T MAKE IT TO A FUEL STOP NOW. CAN YOU HELP?", "CAN'T REACH A FUEL STOP. GOT ANY FUEL?"]],
      hunted: [["PIRATES! IF I TURN TOO SHARPLY, I'LL BREAK THE GLASS. COVER ME!", 'PIRATES! GLASS ABOARD. COVER ME!']] },
  },
  {
    code: 'N42', name: 'HOUSEBOAT', scheme: 0,
    glyphs: [
      "    .^.    ",
      "  _/   \\_  ",
      " /  [o]  \\ ",
      " |  |=|  | ",
      " '-------' ",
      "  -v-Y-v-  ",
      "    \" \"    ",
    ],
    colors: [
      "    hhh    ",
      "  hh   hh  ",
      " h  tgt  h ",
      " h  ttt  h ",
      " hhhhhhhhh ",
      "  ttttttt  ",
      "    e e    ",
    ],
    palette: { h: '#AC96AF', t: '#B9B3AC', g: '#D2C2A4', e: '#B9B3AC', l: '#D2C2A4' },
    // A family's houseboat: it keeps round AMBERGRIS as a houseboat keeps to its mooring. Its pace: a home, never in a hurry.
    route: { sector: 'sector-j04', path: { kind: 'orbit', at: 'planet:AMBERGRIS', radius: 300, phase: 2.6, dir: 1 } }, speed: 96, job: 'HOUSEBOAT', favor: 'word',
    replies: ["HI. EVERYONE'S CROWDED ROUND THE WINDOW HAVING A LOOK AT YOU."],
    words: {
      thanks: ['WHAT A DAY. THANKS FOR HELPING US.', 'THANK YOU FROM THE WHOLE FAMILY.'],
      fuel: [["COULD YOU SPARE SOME FUEL? WE'RE COMPLETELY OUT.", 'FAMILY ABOARD. OUT OF FUEL.']],
      hunted: [["HELP US, WE'RE UNDER FIRE! THERE ARE CHILDREN HERE!", 'PIRATES CLOSE BY. CHILDREN ABOARD.']] },
  },
  {
    code: 'N43', name: 'SCARAB', scheme: 0,
    glyphs: [
      "   .---.   ",
      "  ( ::: )  ",
      "   '---'   ",
      "  \\ (o) /  ",
      " -|  |  |- ",
      " -|  |  |- ",
      "  '._|_.'  ",
      "    \" \"    ",
    ],
    colors: [
      "   ttttt   ",
      "  t ttt t  ",
      "   ttttt   ",
      "  h hgh h  ",
      " hh  h  hh ",
      " hh  h  hh ",
      "  hhhhhhh  ",
      "    e e    ",
    ],
    palette: { h: '#6795A0', t: '#B9B3AC', g: '#D2C2A4', e: '#B9B3AC', l: '#D2C2A4' },
    // A scarab rolling the loose dust into a ball: round DAMASK, the biggest planet of K-05. Its pace: pushing its ball.
    route: { sector: 'sector-k05', path: { kind: 'orbit', at: 'planet:DAMASK', radius: 250, phase: 0.6, dir: 1 } }, speed: 128, job: 'DUST ROLLER', favor: 'cache',
    replies: ["SEE THE SIZE OF THAT BALL? MORE DUST OUT HERE THAN YOU'D THINK."],
    words: {
      thanks: ["THANKS FOR THAT. I'D HAVE BEEN HERE A WHILE.", 'THANKS FOR NOT LEAVING ME TO IT.'],
      fuel: [['USED UP ALL MY FUEL COLLECTING THIS LOT. GOT ANY TO SPARE?', 'USED ALL MY FUEL COLLECTING. SPARE SOME?']],
      hunted: [["PIRATES AFTER ME. CAN'T TURN WITH THIS BALL IN THE WAY. HELP!", "PIRATES NEARBY. CAN'T ESCAPE WITH THE BALL."]] },
  },
  {
    code: 'N44', name: 'LEARNER', scheme: 0,
    glyphs: [
      "    .-.    ",
      "   /(o)\\   ",
      " .-|(o)|-. ",
      " '-|   |-' ",
      "   |[L]|   ",
      "    \" \"    ",
    ],
    colors: [
      "    hhh    ",
      "   hhghh   ",
      " tthhghhtt ",
      " tth   htt ",
      "   htlth   ",
      "    e e    ",
    ],
    palette: { h: '#7494AB', t: '#B9B3AC', g: '#D2C2A4', e: '#B9B3AC', l: '#D2C2A4' },
    // A flight school's trainer: circuits out of DRY DOCK into J-04's open middle. Its pace: a student's: slows and speeds up as
    // it goes.
    route: { sector: 'sector-j04', path: { kind: 'lane', from: 'station-drydock-j04', to: [0.40, 0.36], phase: 0.25 } }, speed: 192, job: 'STUDENT', favor: 'word',
    // Its pace swings about `speed` (src/npcFleet.js Walker): each [share, period s] a slow wave of that share of it.
    uneven: [[0.3, 13], [0.15, 4.7]],
    replies: ["HI. YOU'D BETTER GO ROUND ME. I'M STILL HAVING TROUBLE HOLDING A STEADY SPEED."],
    words: {
      thanks: ["THANKS. I JUST DIDN'T KNOW WHAT TO DO.", 'THANKS. I WAS AFRAID NO ONE WOULD ANSWER.'],
      fuel: [["DIDN'T REFUEL AT THE LAST STATION. DON'T KNOW WHAT I WAS THINKING. CAN YOU SPARE SOME FUEL?", 'MISSED MY FUEL STOP. GOT ANY FUEL?']],
      hunted: [["THEY'RE SHOOTING AT ME! PLEASE HELP!", "THEY'RE SHOOTING AT ME! PLEASE HELP!"]] },
  },
  {
    code: 'N46', name: 'LAMPLIGHTER', scheme: 0,
    glyphs: [
      "   ·   ",
      "  (|)  ",
      "   |   ",
      " .-+-. ",
      "( [o] )",
      " |=|=| ",
      " '---' ",
      "  \" \"  ",
    ],
    colors: [
      "   l   ",
      "  ttt  ",
      "   t   ",
      " hhthh ",
      "h tgt h",
      " hthth ",
      " hhhhh ",
      "  e e  ",
    ],
    palette: { h: '#6E91AB', t: '#B9B3AC', g: '#D4C2A0', e: '#B9B3AC', l: '#D4C2A0' },
    // A lamplighter, a lantern on a pole ahead: its round from PHAROS, the lighthouse, to COMMONS. Its pace: a round on a
    // timetable.
    route: { sector: 'sector-j06', path: { kind: 'lane', from: 'station-pharos-j06', to: 'station-commons-j06', phase: 0.7 } }, speed: 240, job: 'LAMPLIGHTER', favor: 'cache',
    replies: ["HELLO. HOW'S THE RUN? KEEPING OUT OF TROUBLE?"],
    words: {
      thanks: ["THANK YOU. I'M GLAD WE CROSSED PATHS.", 'THANKS FOR HELPING. LOOK AFTER YOURSELF.'],
      fuel: [['RAN OUT OF FUEL BEFORE FINISHING MY ROUND. GOT ANY TO SPARE?', 'OUT OF FUEL BEFORE FINISHING MY ROUND.']],
      hunted: [["PIRATES ON MY ROUTE. I CAN'T HANDLE THEM. HELP ME.", "PIRATES ON MY ROUTE. CAN'T HANDLE THEM."]] },
  },
].map(Object.freeze));
// One more ship (src/eggs.js): found by its code as these are, never listed with them.
const QUIET = Object.freeze([QUIET_SHIP]);

// The list's ships by their code (their drawing, paint, route, pace and words); `npcShip` finds any ship by its code.
export const NPC_ART = Object.freeze(Object.fromEntries(NPC_SHIPS.map((s) => [s.code, s])));
const BY_CODE = new Map([...NPC_SHIPS, ...QUIET].map((s) => [s.code, s]));
export const npcShip = (code) => BY_CODE.get(code) ?? null;
// The ships out only now and then (src/npcFleet.js Fleet.rareLook), by code.
export const RARE_SHIPS = Object.freeze(QUIET.map((s) => s.code));
// The ships a quest may be about: a pilot out of fuel (src/quests.js), a wreck (src/wrecked.js); every ship of the list.
export const QUEST_SHIPS = Object.freeze(NPC_SHIPS.map((s) => s.code));

// Where each flies from: `from` / `to` / `at` a station's id, `planet:NAME`, or [x, y] as fractions of the sector; its pace.
const routeOf = (s) => ({ code: s.code, sector: s.route.sector, path: { ...s.route.path, speed: s.speed } });
export const NPC_ROUTES = Object.freeze(NPC_SHIPS.map(routeOf));
export const NPC_CLEAR = 700;
// Drawn at the pilot's ship's own scale (SX, 2026-10-02: «сделай как бы и корабли NPC тоже по размеру. Один и пять. Вот
// сейчас кажется, что они мельче»; they were at 1, the hidden sector's craft's).
const NPC_SIZE = CONFIG.traffic.npcScale;
// What every friendly NPC ship is drawn at, from this one place: a route ship, a pilot out of fuel (npcCraft below), a ship the
// pirates pester (src/pester.js) and a wrecked one (src/wrecked.js); the NPC size times the traffic knob, read each time. The
// pestered and wrecked ones were drawn at CONFIG.traffic.craftScale alone, 1, until PLAN C1 (2026-10-03); SX had asked 1.5 for
// every NPC. It is presentation: no collider, range or physics value reads a craft's `scale`.
export const npcDrawScale = () => NPC_SIZE * CONFIG.traffic.craftScale;

// One of the ships as a craft src/traffic.js can draw (drawCraft, craftReach) away from its route: a pilot out of fuel
// (src/quests.js; SX, 2026-10-02: «это должны быть разные корабли нпс которых мы придумали»). In `palette` (the paint it was
// drawn in, src/npcPaint.js npcPalette; its own colours when none) at the route ships' own scale; a record made once for each
// ship and palette, its scale read from the knobs every time.
const drawn = new Map();
export function npcCraft(code, palette = npcShip(code).palette) {
  if (!drawn.has(code)) drawn.set(code, new Map());
  const byPalette = drawn.get(code);
  if (!byPalette.has(palette)) {
    const art = npcShip(code);
    byPalette.set(palette, { rows: art.glyphs, colors: art.colors, palette, ink: palette.h, inks: {}, name: art.name,
      get scale() { return npcDrawScale(); } });
  }
  return byPalette.get(palette);
}

const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;
// A place as world units in `sectorId`, and how big it is (a station's hull, a planet's radius with its cushion).
function place(ref, sectorId) {
  if (Array.isArray(ref)) return { x: ref[0] * W, y: ref[1] * H, r: 0 };
  if (ref.startsWith('planet:')) {
    const name = ref.slice(7), sector = SECTORS.find((s) => s.id === sectorId);
    const p = sector?.planets.find((q) => planetKey(q) === name);
    return p ? { x: p.x * W, y: p.y * H, r: p.radius + CONFIG.planet.orbit.height } : null;
  }
  const st = stationDefById(ref);
  return st && st.sectorId === sectorId ? { x: st.x * W, y: st.y * H, r: 0, station: true } : null;
}
// A route into craftPose's terms: fractions, a period from the speed. A lane's ends at a station stop NPC_CLEAR short
// of it, toward the other end. A route whose place is gone (moved to another sector by a new layout) is left out.
export function resolveRoute(route) {
  const P = route.path;
  if (P.kind === 'orbit') {
    const c = place(P.at, route.sector);
    if (!c) return null;
    const R = (c.station ? 0 : c.r) + P.radius;
    return { kind: 'orbit', at: [c.x / W, c.y / H], radius: R / W, period: (2 * Math.PI * R) / P.speed, phase: P.phase, dir: P.dir };
  }
  const a = place(P.from, route.sector), b = place(P.to, route.sector);
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const ca = a.station ? NPC_CLEAR : 0, cb = b.station ? NPC_CLEAR : 0;
  const from = [(a.x + ux * ca) / W, (a.y + uy * ca) / H], to = [(b.x - ux * cb) / W, (b.y - uy * cb) / H];
  const run = len - ca - cb;
  // craftPose eases a leg out and in, so its mean speed is the route's `speed`: a leg takes run / speed.
  return { kind: 'lane', from, to, period: run / P.speed, phase: P.phase * (run / P.speed) };
}

// The NPCs as src/traffic.js crafts: named (their name under them while the pilot is near), silent, at NPC_SIZE.
const craftsOf = (route) => {
  const art = npcShip(route.code), path = resolveRoute(route);
  if (!art || !path) return [];
  return [{
    id: `npc-${route.code.toLowerCase()}`, code: route.code, npc: true, sector: route.sector, label: art.name, hail: null,
    path, rows: art.glyphs, colors: art.colors, palette: art.palette, ink: art.palette.h, inks: {}, size: NPC_SIZE,
    ...(art.replies ? { replies: art.replies } : {}),
    ...(art.curses ? { curses: art.curses } : {}),     // what it says when rammed, if not the common lines (src/greetings.js NPC_CURSES)
  }];
};
export const NPC_CRAFTS = NPC_ROUTES.flatMap(craftsOf);
// A ship as a craft, by its code (the fleet's views, its boxes and pieces read it).
const CRAFT_BY_CODE = new Map([...NPC_CRAFTS, ...QUIET.map(routeOf).flatMap(craftsOf)].map((c) => [c.code, c]));
export const npcCraftDef = (code) => CRAFT_BY_CODE.get(code) ?? null;

// A ship's home (SX, 2026-10-19, N3 PERSONS on reports/2026-10-19-npc-rewrite-brief.md: «давай знакомых»): the station its route names,
// or else the station of its route's sector nearest where its route lies (the pilot's garage HOME is no ship's). It flies out of its home
// and back, never further than the sectors next to it, and is out only while its sector is open (src/npcFleet.js); so a new pilot meets
// the few ships of the first sectors, and each sector restored brings its own. { station, sector } (ids), or null for a ship with no route.
const HOMES = new Map();
export function npcHome(code) {
  if (HOMES.has(code)) return HOMES.get(code);
  const ship = NPC_ART[code] ?? null, sector = ship && SECTORS.find((s) => s.id === ship.route.sector);   // the list's only
  let home = null;
  if (sector) {
    const P = ship.route.path;
    const named = [P.from, P.to, P.at].find((ref) => typeof ref === 'string' && stationDefById(ref)?.sectorId === sector.id);
    if (named) home = { station: named, sector: sector.id };
    else {
      const r = resolveRoute(routeOf(ship)), at = r ? (r.kind === 'orbit' ? r.at : [(r.from[0] + r.to[0]) / 2, (r.from[1] + r.to[1]) / 2]) : [0.5, 0.5];
      const near = (sector.stations ?? []).filter((st) => !st.id.startsWith('station-home'))
        .sort((a, b) => Math.hypot(a.x - at[0], a.y - at[1]) - Math.hypot(b.x - at[0], b.y - at[1]))[0];
      if (near) home = { station: near.id, sector: sector.id };
    }
  }
  HOMES.set(code, home);
  return home;
}
