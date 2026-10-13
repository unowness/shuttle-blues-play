// The pirates' numbers: where and how often a squad comes, the four kinds with their hulls, guns, brains and paints, the loot, the den,
// the characters and the ruins' guards. Moved out of src/config.js as they were (PLAN D5, 2026-10-09, the config split: the biggest
// theme of the file, owed by chat W2); CONFIG holds the section under its old name (CONFIG.pirates is PIRATES.pirates, the same object),
// so every reader is unchanged. The rules are src/pirates.js (their flight), src/encounters.js (the world's side), src/personas.js
// (characters) and src/raids.js (guards and raids); what a raid pays and costs is CONFIG.raids (src/economyConfig.js). The page binds
// `ink`, `bullet.color` and `flash.ink` to the palette once at boot (labs/graphics/style.js), then CONFIG is frozen deep.

import { PIRATE_ROLES, PIRATE_ROLE_ART, PIRATE_ROLE_DONORS } from './pirateRolesConfig.js';

export const PIRATES = {
  // Pirates (SX, 2026-09-29: "пираты тоже умеют стрелять, они гоняются за
  // кораблем ... у пиратов по 1 хп ... могут попасть друг в друга ... врезаться
  // в астероид"; "убитые пираты тоже роняют немного монет, по 10-20"; a pilot
  // destroyed by them loses every coin and the cargo, and "убежать от них можно
  // прыгая через черные дыры"). Step 1: the rules live in the shared engine and
  // nothing spawns by itself while `zones` is empty, which is how production
  // ships. `World.spawnPirates` is the manual entry the graphics lab uses.
  // Every number is a first proposal, tuned with tools/pirate-sim.mjs against
  // scripted pilots (reports/2026-09-29-pirates-step1.md); SX judges the feel.
  pirates: {
    roles: PIRATE_ROLES,
    // Where groups appear by themselves: { sectorId, x0, y0, x1, y1, rate }, a
    // rectangle in fractions of the sector and the expected number of
    // encounters per minute of flying inside it. Empty: nothing ever does.
    // 2026-09-29, with the game moved onto the lab: the lower row, K-04 (the big
    // black hole in its middle is the way out) and K-05, as proposed to SX;
    // never within `stationClear` of a station, `cooldown` between fights.
    // SX, 2026-09-30: «пусть пираты встречаются почаще». The lower row's rate is
    // doubled (0.5 -> 1.0) and the upper row, J-04 and J-05, joins it at half of
    // that, so the row a new pilot starts in stays the quieter one. Doubling the
    // rate alone would leave the 4 minute cooldown in charge (6.0 -> 5.0 minutes
    // between fights), so `cooldown` is halved with it. On open ground, away from
    // stations, the peace from one fight's end to the next one's start is
    // `cooldown` plus 1 / rate minutes:
    //   lower row  4 + 2 = 6.0 min  ->  2 + 1 = 3.0 min   (twice as often)
    //   upper row  never            ->  2 + 2 = 4.0 min
    // A delivery shuttle spends much of its time docked or inside `stationClear`,
    // so it sees fewer: tools/encounter-spacing.mjs measures it on the real rule
    // (DEPOT 7 <-> YARD 3: about 11.8 -> 5.5 min; DRY DOCK <-> RELAY 12: 11.4 min).
    // SX, 2026-09-30, after flying the upper row: «я че то вообще не встречаю
    // пиратов». Measured: 11.4 min between fights there, the first after 9.6 min
    // on the median. The rates go to 1.2 (upper row) and 1.8 (lower), the peace
    // to 75 s after a fight and 60 s after a load, the station bubble to 1500 u:
    //   DRY DOCK <-> RELAY 12  11.4 -> 4.0 min between fights
    //   DEPOT 7 <-> YARD 3      5.5 -> 2.7 min
    //   a new pilot's first fight, median 9.6 -> 2.8 min (55 % within 3 minutes)
    // Then, the evening of 2026-09-30: «Я опять не могу встретить пиратов, почему они
    // у нас постоянно пропадают». Measured on the day's rules: 5.5 min between fights on
    // DRY DOCK <-> RELAY 12 (the new ruin HALCYON, on that route, counted as a refuge;
    // it no longer does, src/ruins.js), 12.7 on the east column. The rates go to 2.2
    // (upper row) and 2.6 (lower), the peace after a fight to 60 s, the station bubble
    // to 1200 u (tools/encounter-spacing.mjs, 60 h a route):
    //   DRY DOCK <-> RELAY 12   5.5 -> 2.4 min between fights
    //   DEPOT 7 <-> YARD 3      2.7 -> 2.1 min
    //   DRY DOCK <-> DEPOT 7    5.8 -> 2.5 min;  RELAY 12 <-> YARD 3  12.7 -> 5.9 min
    //   a new pilot's first fight, median 1.7 min (81 % within 3 minutes)
    zones: [
      { sectorId: 'sector-j04', x0: 0, y0: 0, x1: 1, y1: 1, rate: 2.2 },
      { sectorId: 'sector-j05', x0: 0, y0: 0, x1: 1, y1: 1, rate: 2.2 },
      { sectorId: 'sector-k04', x0: 0, y0: 0, x1: 1, y1: 1, rate: 2.6 },
      { sectorId: 'sector-k05', x0: 0, y0: 0, x1: 1, y1: 1, rate: 2.6 },
      // The two sectors east (2026-09-30), at their rows' rates.
      { sectorId: 'sector-j06', x0: 0, y0: 0, x1: 1, y1: 1, rate: 2.2 },
      { sectorId: 'sector-k06', x0: 0, y0: 0, x1: 1, y1: 1, rate: 2.6 },
    ],
    // Squads of two to four, never one (SX, 2026-09-30: «пираты летают только отрядами по 2-4
    // корабля»; a lone pirate was 40 % of encounters until then).
    groupSize: [[2, 0.5], [3, 0.35], [4, 0.15]],   // [ships, share]
    // Before a new pilot's first delivery (the opening's guided stretch, src/opening.js openingCalm) a group is a patrol of `patrol`
    // ships, never a squad of three or four (SX, 2026-10-04, his answer 4 to chat SC: «a two-ship patrol instead of a squad»).
    patrol: 2,
    maxGroup: 4,
    cooldown: 60,           // s of peace after an encounter ends (240, 120, then 75 until the evening of 2026-09-30)
    // s of peace after the world starts or a save loads. 120 until 2026-09-30, when the
    // upper row got zones: a new pilot starts in J-04 by DRY DOCK, and the first three
    // minutes stay calm (a load into the lower row still meets its first fight after
    // about 4 minutes, as before: 3 of peace plus a minute of rolls).
    firstDelay: 60,         // 180 until SX's «не встречаю пиратов»: a reload bought three calm minutes
    checkEvery: 5,          // s between rolls while the ship is inside a zone
    stationClear: 800,      // no automatic encounter this close to a working station (2600, then 1500, then 1200 until the ship went two
                            // thirds as fast, W2 2026-10-04: as many seconds of a route inside it as before)
    // A group appears this far from the ship, well outside any view, and
    // arrives aimed at it with `spawnSpeed` of its top speed.
    spawnDistance: [2200, 2800],
    spawnSpread: 480,       // u: a squad arrives spread over a ring this wide (280 until SX's «не так тесно»)
    spawnSpeed: 0.5,

    // Four kinds of pirate. SX picked the first three from labs/graphics/sketches/pirate-squads.html
    // (2026-09-30, evening: «Я решил перевыбрать корабли пиратов, плюс оставь наш оригинальный Dart»):
    // the BRUTE, the MAW and the WARLORD of that sheet, and the DART of 2026-09-29, painted. The
    // TALON and the HOOK (the morning's pick) and the RAIDER (2026-09-29) are gone. A squad is one
    // kind (SX: «пираты летают только отрядами по 2-4 корабля в одном типе спрайта»), drawn by
    // `share` (all four equal for now: a placeholder until SX has met each); a type lists only what
    // differs from the blocks below. The numbers turn each role of the sheet into something a
    // pilot can tell from the flying: tools/pirate-sim.mjs has the fights they make.
    //   BRUTE    armoured: seven hit points to the base four, slower and heavier, closes at a
    //            steady pace and weaves little; a slow gun (a bolt every 2 s against 0.8), so it
    //            is a long fight rather than a deadly one: it soaks shots.
    //   MAW      the ram: wants the contact, not the shot. It flies straight in (`brain.ramSpeed`),
    //            never breaks away, fires seldom and only close; `ram` says what a contact costs:
    //            5 of the ship's 10 hull points (4 of 8 until 2026-10-01) and 1 of its own 4 (2 of 6 until the same day), so it is a threat and not a
    //            suicide (a rock's rule would have cost both the same, about 6, the MAW everything).
    //   WARLORD  the flagship: the largest hull, five hit points. The first of its squad is the lead and advances,
    //            to a closer range than the gunner's; the others, its covers, hang back behind it
    //            and fire over it (`cover`), holding fire more carefully for the lead in the way.
    //            Its guns and its pilot are the gunner's (the TALON's, which were the RAIDER's):
    //            they hold a range, weave and aim well.
    //   DART     a little faster and quicker off the mark than the base craft, turns worse, closes
    //            in, fires less often and less truly (as it has been since 2026-09-29).
    // `art` is drawn nose up at `scale`; `parts` says what each cell is: h hull, t trim,
    // m mark and e engine are the squad's paint (`paints` below); g guns are always `ink`,
    // the caution orange a pirate's shots are, so every paint keeps the one hostile cue.
    types: {
      brute: {
        label: 'BRUTE',
        share: 2,
        art: [' ╿  ╿ ', '[◢▲▲◣]', '[◥▼▼◤]', ' ▴  ▴ '],
        parts: [' g  g ', 'thmmht', 'thhhht', ' e  e '],
        hp: 7,              // 7 until SX's «у пиратов стало слишком много хп» (2026-10-01), 5 after, and 7 again on «убить их очень просто» (2026-10-02)
        craft: { radius: 48, thrust: 470, retro: 360, strafe: 360, turnRate: 1.9, turnAccel: 9, turnGain: 5, maxSpeed: 427 },
        weapon: { interval: 2.4, error: 0.05, cone: 0.12 },   // 2.0 until 2026-10-01, 3.0 and error 0.08 until 2026-10-02
        brain: {
          standoff: [420, 580], approachGain: 1.1, approachMax: 560, weaveAccel: 110, strafeSpeed: 70,
          breakRange: 220, dodgeSkill: 0.3,
        },
      },
      maw: {
        label: 'MAW',
        share: 2,
        art: [' ╿▲╿ ', '◢◤│◥◣', ' ◥▼◤ ', '  ▴  '],
        parts: [' gmg ', 'hhthh', ' hhh ', '  e  '],
        hp: 6,              // 6 until 2026-10-01, 4 after, 6 again on 2026-10-02
        craft: { radius: 42, thrust: 900, retro: 360, strafe: 500, turnRate: 2.3, turnAccel: 11, turnGain: 6, maxSpeed: 639 },
        weapon: { interval: 2.4, error: 0.05, cone: 0.09, range: 560 },   // 2.2 until 2026-10-01, 3.0 and error 0.08 until 2026-10-02
        brain: { ramSpeed: 520, breakRange: 0, strafeSpeed: 0 },
        // self 2 until its hit points went 6 -> 4 (2026-10-01): a ram still costs it a quarter. `ship` 5 of 10 until the
        // hull went to 100 the same night: 20, a fifth, since a ram is its weapon but no longer half a hull.
        ram: { ship: 20, self: 1 },
      },
      warlord: {
        label: 'WARLORD',
        share: 2,
        art: [' ╿ ╿ ╿ ', '◢◣◢▲◣◢◣', '◥◣ ▼ ◢◤', ' ▴ ▴ ▴ '],
        parts: [' g g g ', 'hhhmhhh', 'hh h hh', ' e e e '],
        hp: 6,              // 5 until 2026-10-01, 4 after, 6 on 2026-10-02
        craft: { radius: 52, thrust: 560, retro: 400, strafe: 480, turnRate: 2.2, turnAccel: 10, turnGain: 6, maxSpeed: 586 },
        weapon: {},
        brain: { standoff: [440, 600] },
        // What the others of its squad fly instead of the lead's brain numbers.
        cover: { standoff: [740, 900], clearSkill: 0.5, clearCone: 0.26 },
      },
      dart: {
        label: 'DART',
        share: 2,
        art: [' ╱╲ ', '◢╲╱◣', '▘  ▝'],
        // Its nose is its guns; the wings the paint, the mark down the middle.
        parts: [' gg ', 'hmmh', 'e  e'],
        craft: { radius: 32, thrust: 780, retro: 400, maxSpeed: 739, turnRate: 2.35, turnAccel: 9 },
        weapon: { interval: 1.2, error: 0.06, cone: 0.14, range: 800 },   // 0.95 until 2026-10-01, 1.5 and error 0.09 until 2026-10-02
        brain: { standoff: [260, 480], breakRange: 180, weaveAccel: 220, dodgeSkill: 0.6 },
      },
    },
    // The squads' paints. A BLOODLINE and F BONE of labs/graphics/sketches/pirate-squads.html
    // (SX, 2026-09-30: «расцветки A F»), MARROW between them (its hull the colour half way
    // from BLOODLINE's carmine to BONE's ivory: 44 and 38 apart in CIE Lab), and EMBER (SX, the
    // evening: a new paint in the same red family): a dark rust hull 36 from BLOODLINE, 32 from
    // MARROW and 62 from BONE, a soot trim, a bone mark, a red-hot drive. Soot is a dull warm
    // grey of about the hull's brightness and not a darker one: 3:1 on black is the floor.
    // Every ink is 3:1 or more on black and at least 35 from `ink` (CIE Lab), so the guns
    // stay the one orange on a pirate.
    paints: [
      { id: 'bloodline', label: 'BLOODLINE', hull: '#CF1B4E', trim: '#B81B48', mark: '#F1E7D0', drive: '#FF7A9A' },
      { id: 'bone', label: 'BONE', hull: '#E6DFC8', trim: '#9C9479', mark: '#DD2438', drive: '#E8546A' },
      { id: 'marrow', label: 'MARROW', hull: '#D98C8C', trim: '#B81B48', mark: '#F1E7D0', drive: '#E8546A' },
      { id: 'ember', label: 'EMBER', hull: '#A0492F', trim: '#75625C', mark: '#E8DBBA', drive: '#FF4D3A' },
    ],
    // Hit points (SX, 2026-09-29, after flying it: "пираты легко победились слишком,
    // можем попробовать им по 4 хп сделать"). Both kinds; a kind may list its own.
    // SX, 2026-10-01: «У пиратов стало слишком много хп» and «агрессивные пираты меня убивают, наверно у них
    // просто rate стрельбы должен быть поменьше». The base 4 -> 3 (the DART's), BRUTE 7 -> 5, MAW 6 -> 4,
    // WARLORD 5 -> 4; and every gun slower: the base 0.8 -> 1.3 s (the WARLORD's), BRUTE 2.0 -> 3.0, MAW
    // 2.2 -> 3.0, DART 0.95 -> 1.5. tools/pirate-sim.mjs, the steady fighting pilot, 120 fights a size:
    // survival against 1 / 2 / 3 / 4 went 97 / 88 / 72 / 54 % -> 99 / 94 / 83 / 66 %.
    // What a hit costs: the pilot's shot and a pirate's shot on a wingman one each
    // (`hurt`); a ram costs what a rock would cost the ship, and never less than
    // `ramMin`. A planet's surface or a hole destroys a pirate at once; a rock takes a part of its hit points (`rock` below).
    hp: 5,                  // the DART's, and the base: 4 until 2026-10-01, 3 after, 5 on 2026-10-02
    // `bump`: two pirates that collide (src/pirates.js collideWingmen, 2026-10-01), from `speed` u/s of closing.
    // `impact`: what a blow costs a pirate, on its own few hit points: the ship's rule as it was when the hull had 10
    // (World.pirateImpact), so pirates break as they did when the hull went to 100.
    // `rock`: a pirate that meets a rock (src/pirates.js rockBlow; SX, 2026-10-09: «Пиратам поменьше урон при столкновении с камнями, а то
    // они за один удар об камень взрываются»). It was destroyed at once, whatever it had left. Now it is bounced off the rock (the bump's
    // restitution) and pays `share` of its hit points at `refSpeed` u/s of closing, times (closing / refSpeed) to `power`, rounded, never
    // under one, and nothing under `touchSpeed` (the ship's own, CONFIG.hull); one contact counts once (`grace` s). Hit points 5 (DART),
    // 6 (MAW, WARLORD), 7 (BRUTE); closing at:        200  300  450  600  739 (the DART's top)
    //   a hit costs a DART (5)                          1    1    1    2    3
    //   a hit costs a MAW or a WARLORD (6)              1    1    2    3    4
    //   a hit costs a BRUTE (7; its top is 427)         1    1    2    3    5
    // so an ordinary hit (300 to 450 u/s) takes a fifth to a third of a pirate's hull and it lasts three to seven of them; a very fast
    // one (600 and over) takes two or three at once. (450 is the pirates' own refSpeed in `impact`.)
    hurt: { shot: 1, friendly: 1, ramMin: 1, bump: { speed: 60, min: 1, restitution: 0.35, grace: 0.6 },
      impact: { base: 2, refSpeed: 450, power: 2, touchSpeed: 60 },
      rock: { share: 0.25, refSpeed: 450, power: 2, touchSpeed: 140, grace: 0.6 } },
    // A hit that leaves a pirate alive has to be seen (no health bar): its glyphs
    // are drawn in `ink` for `time` seconds and it sheds `sparks` of the same kind
    // the ship sheds when it is bumped (CONFIG.asteroid.bump), thrown back the way
    // the shot came, with `chips` of its own glyphs among them.
    flash: { time: 0.14, ink: '#ffffff', sparks: 5, chips: 2 },
    // After a ram that does not finish it a pirate is knocked back (as the ship is
    // by a rock, `restitution` of the closing speed) and cannot be rammed for
    // `grace` seconds, so one contact counts once. `ship` and `self` are for a kind built to
    // ram (a type's own `ram`, the MAW's): what a contact at the touch speed or more costs
    // the ship in hull points and the pirate in hit points, in place of what a rock at that
    // closing speed would cost both (null: the rock's rule, which is every other kind's). A
    // slower touch costs such a pirate nothing: its nose is hard.
    ram: { restitution: 0.35, grace: 0.8, ship: null, self: null },
    scale: 1.5,             // the ship's default visual scale (CONFIG.ship.visualScale.cruise; 1.6 until 2026-10-02)
    ink: '#ff9d4d',         // the palette's orange, the caution role: a pirate's guns and shots, in every paint
    bullet: { color: '#ff9d4d' },

    // The craft: the ship's integrator (heading eases to a turn rate, thrust
    // along the heading, drag, a speed cap) with its own numbers. Top speed
    // stays under the ship's red step (749 u/s; 1125 until every top went to two thirds, W2 2026-10-04, 750 until every top went
    // to 0.85 of that and 637 until 0.8 of it, 2026-10-05, 600 until 0.9 of it and 675 until 0.999 of it, 2026-10-06, every kind's
    // with it: BRUTE 427, MAW 639, WARLORD 586, DART 739, the rest 666) so a pilot who accepts the
    // red pulls away; turning is weaker (ship: 3.4 rad/s, 16 /s) so a pilot can
    // out-turn one. `strafe` is the sideways thrusters, so a pirate can hold its
    // nose on the ship while circling it and step out of a shot's way. Step 1b:
    // with four hit points a pirate has to stay alive under fire for seconds, so
    // it steers (strafe, turnGain, turnAccel) and aims a little more sharply.
    craft: {
      radius: 36,           // collider, u (the ship's is 44)
      thrust: 620,          // u/s^2 forward (ship: 780 at full spool)
      retro: 380,           // u/s^2 backward (ship: 520)
      strafe: 600,          // u/s^2 sideways (was 450)
      turnRate: 2.1,        // rad/s
      turnAccel: 10,        // 1/s, how quickly the turn rate is reached (was 7)
      turnGain: 7,          // 1/s, turn rate per radian of heading error (was 5)
      drag: 0.12,           // per second; keep momentum through an attack (SX, 2026-10-10)
      maxSpeed: 666,        // u/s (1000; every kind's top two thirds of what it was with the ship's, W2 2026-10-04; 667 until 0.85 and 567 until 0.8, 2026-10-05; 534 until 0.9 and 600 until 0.999, 2026-10-06)
    },

    // The gun: slow, jittered, and it only fires with the nose inside `cone`
    // of the aim point. The aim point leads the ship's velocity as last seen
    // (see brain.react). `error` is the sigma of a random per-shot turn.
    // Bullets leave with the pirate's own velocity added, like the ship's.
    weapon: {
      interval: 1.0,        // s (0.8 until 2026-10-01, SX: «rate стрельбы должен быть поменьше»; 1.3 after; 1.0 on 2026-10-02, «не агрессивные»)
      jitter: 0.3,          // +-30 % on every interval
      firstDelay: [0.15, 0.5],   // [0.3, 1.0] until 2026-10-02: a pirate that has come in shoots at once
      muzzleSpeed: 800,     // u/s (the ship's is 900; was 680, and a slow bolt is one a pilot can leave)
      muzzleOffset: 56,
      life: 1.35,           // s, so the range from the muzzle is about 1080 u
      cone: 0.11,           // rad (was 0.09)
      error: 0.05,          // rad (0.03, then 0.06 until 2026-10-01, 0.08 until 2026-10-02)
      range: 1050,          // u: does not fire from further away
      bulletRadius: 8,
      damage: 10,           // hull points a hit costs (World.damageShip): 1 of 10 until the hull went to 100 (2026-10-01)
    },

    // The pilot of the craft. It sees the ship only every `react` seconds
    // (dead-reckoning the old velocity in between), so a change of course is
    // noticed late, and it flies to a wanted VELOCITY: the ship's velocity plus
    // an approach that slows as the standoff nears, plus a circling speed. The
    // craft's own limits (turn, thrust, retro, strafe) decide how well it gets
    // there, which is what makes it overshoot.
    brain: {
      // SX, 2026-10-01: «пираты стали слишком сложные, пусть они чуть чаще тупят, попадают друг в друга и
      // врезаются друг в друга и объекты, пока гоняются за персонажем». They look at the ship less often
      // (`react` 0.2 -> 0.32), watch where they fly less (`avoidAttention` 0.96 -> 0.8: an inattentive look
      // steers neither round rocks nor off a wingman, and two that touch collide, src/pirates.js), never hold
      // fire for a wingman (`clearSkill` 0.4 -> 0), dodge less (`dodgeSkill` 0.9 -> 0.55), aim worse (weapon
      // `error` 0.03 -> 0.06; the kinds' own errors went with it, still the worse aim). tools/pirate-sim.mjs,
      // the steady fighting pilot, 150 fights a size: survival against 1 / 2 / 3 / 4 went 93 / 85 / 54 / 42 % ->
      // 96 / 87 / 69 / 57 %; pirates lost to rocks a fight against 3 / 4, 0.19 / 0.25 -> 0.24 / 0.33, and to each
      // other's shots 0.03 / 0.07 -> 0.06 / 0.07 (with the kinds' own dodge, aim and cover numbers). A rock dead
      // ahead at 900 u/s now takes about half of them (checks/pirates.mjs).
      // SX the same night, after flying it: «почему-то пираты мало тупят». They look still less often (`react` 0.32 ->
      // 0.4), watch where they fly in fewer looks (`avoidAttention` 0.8 -> 0.7), dodge less (`dodgeSkill` 0.55 ->
      // 0.4), aim worse (weapon `error` 0.06 -> 0.08), and their minds wander (`lapse`, new): at a rate a second, for
      // `time` s a pirate looks neither at the ship nor where it flies and holds its fire, flying on its last look.
      // tools/pirate-sim.mjs before and after: DECISIONS.md, 2026-10-01, the garage chat's first step.
      // SX, 2026-10-02, after flying the characters: «Пираты стали слишком легкие и не аггрессивные многовато тупят и убить их
      // очень просто». The mind wanders a third as often and for less (`lapse` 0.12 -> 0.05 a second, 1.2-2.4 -> 0.8-1.6 s),
      // they look at the ship more often (`react` 0.4 -> 0.3), watch where they fly in more of their looks (`avoidAttention`
      // 0.7 -> 0.85: fewer free kills on rocks), and step out of the pilot's shots more (`dodgeSkill` 0.4 -> 0.8,
      // `dodgeAccel` 500 -> 800); the guns fire sooner and oftener and aim better (`weapon`, the kinds' own), and every
      // hull has more hit points (the kinds). tools/pirate-sim.mjs, the steady fighter, 300 fights a size: DECISIONS.md.
      react: 0.18,          // s between looks; SX, 2026-10-10: less waiting on an obsolete target
      reactJitter: 0.4,     // +-40 % on each
      velocityTau: 0.28,    // s in which it tries to close a velocity error
      standoff: [520, 720], // each pirate keeps its own range from this span
                            // (720-960 kept a RAIDER off screen 95 % of the time)
      approachGain: 1.5,    // 1/s: closing speed per unit of range still to cover
      approachMax: 1000,    // u/s of closing speed at the very most
      ramSpeed: 0,          // u/s: above 0 it does not hold a range at all but flies straight
                            // at the ship, this much faster than it (the MAW's; see `ram`)
      backSpeed: 260,       // u/s it will back away at when inside the standoff
      brake: 330,           // u/s^2 it plans its arrival with (it can do 380)
      brakeMargin: 0.6,     // of the standoff, where the planned stop is
      strafeSpeed: 110,     // u/s of slow circling round the ship, near the standoff
      strafeFlip: [3, 6],   // s between a change of the circling direction
      strafeFar: 3.5,       // circling fades out by this many standoffs
      weaveAccel: 320,      // u/s^2 of the sideways weave (its RCS share is `craft.strafe`)
      weavePeriod: [1.2, 2.2],  // s of one swing, each pirate its own
      weaveRange: 2000,     // u: it weaves from this far out
      breakRange: 300,      // u: closer than this it breaks away
      breakTime: 1.1,       // s of breaking away
      breakSpeed: 520,      // u/s it opens the range at, on top of the ship's velocity
      breakSwerve: 0.7,     // rad off straight away, to one side
      aimRange: 1400,       // u: inside it the nose stays on the aim point
      avoidHorizon: 1.0,    // s of look-ahead for rocks, planets and holes
      avoidLook: 650,       // u: and never less than this ahead, however slow
      avoidMargin: 60,      // u of air it wants past an obstacle
      avoidMinTime: 0.25,   // s: the shortest time it will plan a dodge in
      avoidBrake: 0.7,      // how much of its closing speed it gives up at the last moment
      avoidAttention: 0.85, // share of its looks in which it is watching for them (and for wingmen); 0.96, then 0.8, then 0.7 until 2026-10-02
      lapse: { rate: 0.025, time: [0.35, 0.7] }, // occasional mistakes, without seconds of stalled attacks
      avoidTau: 0.25,       // s in which it tries to gain the sideways speed a dodge needs
      avoidMinSpeed: 60,    // u/s: slower than this it does not look
      holeWide: 4,          // a hole is avoided out to this many horizons
      planetMargin: 120,    // u of air it wants over a planet's surface
      // A squad flies looser (SX, 2026-09-30, evening: «пусть отряд пиратов не так тесно друг с
      // другом летит»). Pirates push each other apart inside `spacing`, and once they have
      // settled round the ship the nearest wingman is about that far off. tools/pirate-sim.mjs
      // measures it (the steady fighting pilot, 300 fights a size, the mean distance from each
      // ship to its nearest wingman over the whole fight, every kind in turn or together):
      //   spacing 300, separation 400, spread 280   378 / 368 / 327 u for squads of 2 / 3 / 4
      //   spacing 700, separation 500, spread 480   644 / 603 / 566 u: 1.7 times, about 1.6 to 1.75
      // A looser squad is a harder fight (it flanks, and its ships stop blocking each other's
      // shots): the steady pilot's survival against 2 / 3 / 4 goes 70 / 53 / 44 % -> 75 / 47 / 30 %
      // with the four new kinds in it; the dials are here and in the kinds' hit points.
      spacing: 800,         // u: pirates push each other apart inside this (300, then 700 until 2026-10-01: SX's dumber pirates, watching less, drifted up to 8 % closer, under the 1.5 times of «не так тесно»)
      separation: 500,      // u/s of that push at contact (400 until SX's «не так тесно»)
      // Dodging the pilot's shots: while it is watching (`dodgeSkill` of its
      // looks) it steps aside from a shot it has had `dodgeReact` s to see, that
      // will pass within a hull's width and `dodgeMargin` u inside `dodgeHorizon`
      // s, with a push of `dodgeAccel` u/s^2 (capped by its own thrusters).
      dodgeSkill: 0.8,      // 0.9, then 0.55 until 2026-10-01, 0.4 until 2026-10-02
      dodgeReact: 0.1,
      dodgeRange: 1100,
      dodgeHorizon: 1.0,
      dodgeMargin: 40,
      dodgeAccel: 800,      // 500 until 2026-10-02
      // A gunner holds fire (`clearSkill` of its looks) when a wingman is inside
      // `clearCone` rad of the line to the ship and nearer than it. It sees
      // only that: a wingman that crosses the line later, or a shot that misses
      // and flies on, still hits.
      clearSkill: 0,        // 0.4 until 2026-10-01: now a wingman in the way is shot through
      clearCone: 0.2,
      // Greed (SX, 2026-09-29: "другой пират может их подхватить"). Any loose coin a
      // pirate touches goes into its hold (`reach` u beyond its hull); never the
      // pilot's authored coins or a cache's contents. A hunting pirate with loose
      // coins within `radius` u is tempted `rate` times a second (rolled at its
      // looks, so how often it looks does not change it): it breaks off to fetch the
      // nearest for up to `time` s, hunts again, and rests `cooldown` s before it can
      // be tempted again. It does not shoot while it grabs, and at most `max`
      // pirates are off for coins at once, so the rest go on with the fight. (Step
      // 1b: with every pirate free to go at once, four pirates spent a third of
      // their time on the first dead wingman's coins and lost the fight for it.)
      greed: { radius: 600, rate: 0.3, time: 2.5, cooldown: 8, max: 1, reach: 24, speed: 700 },
    },

    // A pirate that explodes drops loose 1 CR coins (SX: "по 10-20"): its own,
    // and everything it has picked up (`brain.greed`). Coins come out of a pirate
    // ship and nowhere else: a hit on the pilot spills nothing (SX, 2026-09-29).
    // Like the scatter from a wallet, they are untouchable for `delay` seconds.
    // `seized`: what pirates take from a pilot they wreck (CONFIG.economy.pirates) comes out as at most
    // `pieces` coins round the wreck, flung at `burst` u/s, and every pirate left gathers them (mode 'loot', at up
    // to `speed` u/s) for up to `time` s, any within `reach` u of it, then leaves. The camera stays on the wreck for `watch`
    // s instead of CONFIG.ship.respawnDelay, so the pilot sees it (SX, 2026-10-01: «Пираты после того как
    // тебя убили должны подбирать твои монеты, то есть ты успеваешь заметить это»).
    // `parts`: a pirate shot down also throws out `count` parts of its hull (SX, 2026-10-01: «детали будут вылетать из
    // пиратов. То есть ты взорвал пирата, и чуть-чуть денег, чуть-чуть деталей из него вылетает, ты восстанавливаешь
    // хп»): each mends `hull` points when the ship flies through it, while the hull is not whole, drawn as a droid's
    // part (CONFIG.droids.part) in the repair ink (src/droids.js DROID_INKS: the green since 2026-10-07), tumbling. They lie as long as coins do.
    // `fives`: besides its 1 CR coins a pirate throws out that many coins of 5 CR (SX, 2026-10-09: «Может, стоит немножко больше денег
    // выкидывать с пиратов, типа некоторые монетки делать не по плюс один, а плюс пять ... они должны чуть-чуть класть денег в копилку,
    // на покупку красок и сувениров»): 20-40 CR a pirate where it was 10-20. The same small coin as the others (half as large again
    // until SX's «Сделай монетки по +5 такими же маленькими как остальные пожалуйста», the same day); its +5 CR says what it was.
    loot: {
      coins: [10, 20], fives: [2, 4], burst: [70, 210], delay: 0.25,
      parts: { count: [2, 4], hull: 5 },
      seized: { pieces: 24, burst: [90, 240], time: 9, reach: 3000, speed: 900, watch: 4.5 },
    },

    // "Taken" cargo: it comes to rest about `distance` u from the wreck, as far
    // from a station as the sector allows (World.pirateDen, one place, so what
    // "taken" means can change). `shortfall` is how much a short distance costs
    // against a close station when scoring candidate points.
    den: { distance: 2500, stationClear: 2000, tries: 24, shortfall: 0.6 },

    // A station is a refuge: pirates do not enter its safe radius or fire into
    // it, and they give up a pilot who stays inside for `linger` seconds
    // (or who docks, at once).
    safe: { radius: 900, linger: 4 },
    // Pirates lose a ship that stays further than `range` u from all of them
    // for `time` seconds (a pilot who outruns them).
    lose: { range: 3800, time: 5 },
    // Pirates that break off fly away for this long, then are gone.
    leave: { time: 8 },

    // Characters (SX, 2026-10-02, PIRATE_PERSONAS_HANDOFF.md: «Жадность — быстрее всех бросается собирать монеты и
    // пренебрегает защитой / Авантюризм — ловко летает вокруг и прячется и стреляет, сложно угнаться / Агрессия — много
    // атакует и подлетает близко / Трусость — пытается убежать когда чувствует проигрышь команды или падение собственного
    // хп ... в отряде должен быть разброс рандомный но не больше 2 одного вида»; then «у каждой черты 10 поинтов ... с
    // основной чертой характера и 1 второстепенная, а остальне раскиданы уже так сяк»). Each trait its own scale of 0-10:
    // the main one `main`, one secondary `second`, the other two `rest`, at most `sameMain` of a squad with one main.
    // Every effect is per point over or under `ref`, where today's pirate stood on all four, so a pirate made without a
    // character (a check's, a tool's) flies as before. src/personas.js reads these and nothing else does.
    // Measured (tools/pirate-sim.mjs, the steady fighter, 300 fights a size, against 1 / 2 / 3 / 4): without characters
    // survival 100 / 98 / 96 / 94 %, hull lost 10 / 16 / 27 / 34; with these 99 / 99 / 99 / 99 %, 11 / 16 / 21 / 26, and
    // 0.2 / 0.4 / 0.5 / 0.8 of a squad running. A pair fights as before; a big squad that is losing now breaks and runs
    // («чувствует проигрышь команды»), which is what makes it cheaper. The first tries ran half of every squad off
    // (cowardice from 0 points) and kept a greedy or a daring one out of the fight half its time; `from`, greed's `rate`
    // and hiding's `chance` and `time` are the dials if SX wants them back harder.
    personas: {
      main: [8, 10], second: [5, 7], rest: [0, 4], sameMain: 2, ref: 2.5,
      // Greed: tempted sooner (`rate` a second, per point: 0.2 at the reference, 0.3 before) and from further, back sooner, faster to
      // the coin; from `reckless` points it grabs while another is grabbing and stops dodging shots while it does.
      greed: { rate: 0.08, radius: 80, speed: 40, time: 0.25, cooldown: -0.8, minCooldown: 1.5, reckless: 5 },
      // Daring: a longer range, quicker circling and weave, more dodging, a little faster and quicker on the turn (shares
      // per point); from `hide.from` points, after a shot, `hide.chance` per point over it of slipping behind the nearest
      // rock or planet within `hide.reach` u, `hide.time` s, held off it by `hide.gap` u, before it comes out to fire.
      daring: { standoff: 0.04, strafe: 0.12, weave: 0.06, dodge: 0.05, speed: 0.012, turn: 0.02,
        hide: { from: 5, chance: 0.06, time: [1.2, 2.2], reach: 1600, gap: 150, speed: 760 } },
      // Aggression: a shorter range, a quicker gun with a wider cone, breaks away later, fewer lapses, a harder ram.
      aggression: { standoff: -0.05, interval: -0.04, cone: 0.004, breakRange: -20, lapse: -0.08, ram: 0.03 },
      // Cowardice: counted from `from` points (a low one never runs: a pirate of the reference does not), it runs when its
      // own hull is down to `hull` per point over that of what it had, or when the squad has lost one or more and a share
      // of at least 1 - `squad` per point over it (a coward of 9 runs at half its hull, or when half its squad is down).
      // `from` 4 -> 5 (2026-10-02, with «убить их очень просто»: a coward should not leave a fight so early): a coward of 9 now runs at two fifths of its hull, not half.
      cowardice: { from: 5, hull: 0.1, squad: 0.1 },
      // Short shouts, said at the pirate when it acts on a trait of `voice` points or more (SX: «да отличная идея сделай
      // выкрики короткие»), as the hails stand at a craft: once in `gap` s a pirate, once in `apart` s of all of them.
      shouts: {
        greed: ['MINE.', 'CREDITS.', 'CLAIMED.'], daring: ['KEEP UP.', 'MISSED.'], aggression: ['CLOSE IN.', 'TAKE IT.'],
        cowardice: ['BREAK OFF.', "I'M OUT."],
      },
      voice: 5, gap: 7, apart: 1.5, life: 2.2,
    },
    // Pirates at a post (src/raids.js): a ruin's guards, a raid's besiegers. They circle the station `gap` u outside its
    // hull at `speed` u/s, aiming `lead` rad ahead of where they are on the ring, and fire at nothing; the squad wakes
    // and hunts once the pilot has been within `wake` u of any of them for `notice` s, or at once when one is hit. The
    // view reaches about 640 u to either side of the ship and 430 up and down (1280 x 960): from further they woke before
    // they were seen (1400 u, at once, on the first try), and «там группа пиратов» is a squad seen circling first.
    guard: { speed: 170, lead: 0.35, gap: 360, wake: 1000, notice: 1 },
  },
};

// Registered at configuration construction, before the page freezes CONFIG. Selection still allocates
// only the four base hulls, then pirateRoster replaces eligible donor slots; these shares are never rolled.
for (const [id, donor] of Object.entries(PIRATE_ROLE_DONORS)) {
  const source = PIRATES.pirates.types[donor];
  PIRATES.pirates.types[id] = {
    ...source, ...PIRATE_ROLE_ART[id], donor, share: 0, cover: undefined,
    craft: { ...source.craft }, weapon: { ...source.weapon },
    brain: { ...source.brain, ...(PIRATE_ROLES[id].standoff ? { standoff: [...PIRATE_ROLES[id].standoff] } : {}) },
  };
}
