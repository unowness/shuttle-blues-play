// Trusted physical profiles.
//
// Everything here is in world units and seconds, and nothing in it is derived
// from artwork, font metrics or visual scale. A drawing decides how a ship
// looks; a chassis decides how it moves, how large its body is and how far its
// weapon reaches. An imported model file cannot reach these numbers.
//
// This is the file to edit when flight feel needs tuning. It is deliberately
// separate from CONFIG.render, which holds presentation settings that must
// never affect play.
//
// Every top speed is two thirds of what it was until 2026-10-04 (SX, after flying the world twice as wide: «в космосе скорость
// слишком большая ... тысяча максимальная наверное ... баланс скорости и времени, которое ты летишь, до квеста мне нравится»; chat
// W2): the standard 1,500 -> 1,000 u/s and every other hull in proportion, so each keeps its place among them. Pushes, turns, drag
// and the brake are as they were (the pulls of planets and holes are measured against the push), so a hull reaches its lower top
// sooner. The world is smaller to match (src/worldScale.js, WORLD_SCALE 2 -> 1.5): the start's routes take the seconds they took.
//
// Then every top 0.85 of that (SX, 2026-10-05, after flying it: «скорость полета слишком высокая некомфортно»): the standard
// 1,000 -> 850 u/s, every other hull in proportion, the push, turn, drag and brake as they were, and the world as it is: the start's
// ten routes flown flat out take 72.4 s where they took 64.5 (the push to the top is as quick, so a short route loses less than
// 1/0.85), and the delivery's par and the timed runs' clocks go as the tops do (src/economyConfig.js parPace, CONFIG.quests.special),
// so their bonus is no harsher.
//
// Then 0.8 of the W2 tops (SX, 2026-10-05, after comparing them on `?top=`: «скорость можно смело делать 800»): the standard 850 -> 800
// u/s, every other hull 0.8 of its W2 top to 5 u/s (COURIER 880, HAULER 720, the six reference ships 665-1,015, SCOOTY JR. 585), the
// rest as above: the pars, the timed runs, the pirates' tops and the planets' cushion at 0.8 too. The start's routes take about 5 %
// longer than at 850 (the push to the top is as quick).
//
// Then 0.9 of the W2 tops (SX, 2026-10-06: «Скорость у корабля надо делать 900 все-таки», and «только космос не увеличивай»): the
// standard 800 -> 900 u/s, every other hull 0.9 of its W2 top to 5 u/s (COURIER 990, HAULER 810, the six reference ships 745-1,145,
// SCOOTY JR. 655), the danger thrust floor 0.22 x 0.9; the pars, the timed runs and the pirates' tops at 0.9 too. The world as it is:
// the sector, the places, the gaps and the edges untouched (no save step).
//
// Then 0.999 of the W2 tops (SX, the same day, after flying 900: «в целом на 900 корабль все еще медленный сейчас, наверное, надо
// тысячу делать. Или 999 давай делать ... корабль поощущается медленно»): the standard 900 -> 999 u/s (three figures on the gauge),
// every other hull 0.999 of its W2 top to 5 u/s, which is its W2 top (COURIER 1,100, HAULER 900, the six reference ships 830-1,270,
// SCOOTY JR. 730), the danger thrust floor 0.22 x 0.999; the pars, the timed runs and the pirates' tops at 0.999 too. The world as it
// is (no save step).

import { smoothstep } from './util.js';

export const CHASSIS = {
  standard: {
    id: 'standard',
    label: 'STANDARD',

    // Flight
    thrust: 780,           // world units / s^2, at full spool, below the danger taper
    retro: 650,            // 520 until SX, 2026-10-08 («думаю в целом кораблю стоит тормозить чуть резче», «Я про тормоз когда типо задним
                           // ходом тормозишь»): every hull's retro a quarter up
    turnRate: 3.4,        // rad / s at full deflection
    turnAccel: 16,        // how quickly the turn rate is reached
    drag: 0.16,           // per second
    damperDrag: 2.6,      // per second, while the brake (SPACE) is held
    maxSpeed: 999,         // 1,500 until 2026-10-04, 1,000 and then 850 until 2026-10-05, 800 and then 900 until 2026-10-06 (above)

    // Engine spool. SX, 2026-09-26: acceleration read as "too sharp", so
    // forward thrust stopped being all-or-nothing. SX, 2026-09-29: the spool
    // read as "слишком плавным ... где-то между", and the THR/RET gauge should
    // rise with how long the key is held. So thrust sits between the old 1150
    // and the 540 of 09-26, and the spool climbs slowly enough to be seen.
    // The instant W is pressed, spool snaps to `spoolFloor` (a tap is never
    // dead), then climbs at a constant rate of 1/spoolUpTime while held,
    // reaching 1 in (1 - spoolFloor) * spoolUpTime seconds from the floor
    // (0.8 s here); spoolUpTime is the hypothetical 0-to-1 time the rate is
    // defined against. Released, it falls at 1/spoolDownTime and reaches 0
    // in exactly spoolDownTime, the way a turbine spools down quicker than it
    // spools up. Retro (S) spools the same way from the same floor, only
    // quicker (full in 0.4 s), so RET rises with the hold too; the brake on
    // SPACE (the dampers) never spools. See Ship.step().
    spoolFloor: 0.6,
    spoolUpTime: 2,        // seconds; climb rate is 1/spoolUpTime (see above)
    spoolDownTime: 0.15,   // seconds, spool -> 0 once W is released
    retroSpoolFloor: 0.6,
    retroSpoolUpTime: 1,   // seconds; retro climbs from the floor to 1 in 0.4 s

    // Speed steps (SX, 2026-09-26): SAFE up to the real docking threshold,
    // DANGER across the top two of the speed gauge's segments, CRUISE
    // between. Eight segments since 2026-10-01 (SX: the speed gauge «чуть-чуть
    // уменьшим»), so the top two start at 3/4 of top speed (7/9 with nine). `safeSpeed` anchors to the same real number as
    // CONFIG.station.dockSpeed (SAFE is a speed a station takes the ship at), not an
    // invented one; it was the rocks' bump speed too until the docking went to 200 (SX, 2026-10-03). `dangerFraction` is resolved against whatever maxSpeed is
    // in play (see dangerSpeedOf/speedStep below), so "top two of eight" holds
    // for a chassis with a different maxSpeed. Past dangerSpeed,
    // forward thrust authority tapers from 1 down to
    // `dangerThrustFloor` at maxSpeed: entering red costs a deliberate extra
    // push, and holding it to true top speed takes seconds more. On a straight
    // ramp until 2026-10-07, on an ease-out since (quick as the red begins,
    // slow into the floor: the push's curve below has why).
    safeSpeed: 200,
    dangerFraction: 6 / 8,
    // 0.35 until the tops went to two thirds (2026-10-04): with the same push the last stretch to a top of 1,000 took 0.72 s; at
    // 0.22 it takes 1.1 s again (1.57 to 1,500), and the push at the top (172 u/s^2) still beats the drag there (160).
    // In proportion to the top since (2026-10-05): 0.22 x 0.85 = 0.187 at the top 850, 0.22 x 0.8 = 0.176 at 800, 0.22 x 0.9 = 0.198
    // at 900 and 0.22 x 0.999 at 999 (2026-10-06), so the push at the top (171) beats the drag there (160) by the same 7 %; the last
    // stretch from red is 250 u/s (225 at 900, 200 at 800, 212 at 850, 250 at 1,000).
    dangerThrustFloor: 0.21978,

    // Weapon
    fireInterval: 0.13,   // seconds between shots
    muzzleSpeed: 900,     // world units / s, added to the ship's velocity
    muzzleOffset: 72,     // world units forward of the pivot

    // Body
    colliderRadius: 44,   // world units

    // After touching a planet's orbit the hull answers weakly: these shares
    // of turn and thrust authority are left at full jolt, easing back to 1.
    joltTurnGrip: 0.5,
    joltThrustGrip: 0.8,

    // Hull points and tank: the standard's are CONFIG.hull.max and
    // CONFIG.fuel.tank; a chassis of its own kind names its own (World.hullMax,
    // World.fuelTank). `burn` scales CONFIG.fuel's burn rates.
    burn: 1,

    // What the hull can do besides flying (F1d, SX 2026-10-04): drift (src/drift.js, the brake in a turn), fire (Ship.wantsToFire)
    // and jump (src/trick.js). Each reader asks this one place; the controls list says only what the flown hull can
    // (src/controls.js helpColumns).
    can: Object.freeze({ drift: true, fire: true, jump: true }),
  },
};

// Ships to buy (E4; SX, 2026-09-29: «покупные корабли с характеристиками»,
// looks COURIER B and HAULER B). The numbers are the proposal on the sheet
// (labs/graphics/sketches/ships.html) until SX flies them: each moves one way
// from the standard by about a tenth to a fifth, so none is simply better. The
// drawings (ships/courier.json, ships/hauler.json) decide nothing here. Only
// what differs from the standard is written; the spool, the speed steps, the
// weapon and the brake (SX likes it as it is) are the standard's.
CHASSIS.courier = {
  ...CHASSIS.standard,
  id: 'courier',
  label: 'COURIER',
  thrust: 860,           // a tenth more push
  retro: 700,
  turnRate: 4.1,         // a fifth quicker to turn
  turnAccel: 20,
  maxSpeed: 1100,        // a tenth faster; red from 825 (dangerFraction)
  colliderRadius: 40,    // light and narrow
  hull: 80,              // a fifth less hull (6 of 8 until the hull went to 10, 2026-10-01; 8 of 10 until 100),
  tank: 80,              // a fifth less tank,
  burn: 1.2,             // and it burns a fifth more
};

CHASSIS.hauler = {
  ...CHASSIS.standard,
  id: 'hauler',
  label: 'HAULER',
  thrust: 700,           // a tenth less push
  retro: 590,
  turnRate: 2.7,         // a fifth slower to turn
  turnAccel: 12,
  maxSpeed: 900,         // a tenth slower; red from 675
  colliderRadius: 50,    // broad
  hull: 150,             // half as much hull again (12 of 8 until 2026-10-01; 15 of 10 until the hull went to 100),
  tank: 160,             // most of twice the tank,
  burn: 0.85,            // burning 15 % less: nearly three times the range
};

// The six reference ships the pilot flies in their rare quests (src/specials.js; SX, 2026-10-02: «И у каждого из этого
// корабля есть свои плюсы»). Each moves one way from the standard by a good deal more than the hangar's ships do, and
// none is simply better: they are borrowed for a quest, not kept. `gun` is what a shot costs a pirate (the standard's is
// one hit point, CONFIG.pirates.hurt.shot), `tank` and `burn` are kept easy so a quest is never a fuel puzzle, and no ship has more
// hull than the HAULER's 150 (the HULL bar is a segment to ten points and the cockpit's screen holds fifteen). Only what
// differs from the standard is written.
//   DELOREAN         fast: a tenth over the top speed of the COURIER and quick to push, light and fragile
//   SWORDFISH II     a fighter: quick to turn, and a gun that fires twice as often and hits twice as hard
//   PLANET EXPRESS   slow and strong: a broad hull with the most points of any ship, heavy to turn
//   MILLENNIUM FALCON  tough: much hull, a fast gun, a sulky turn
//   SERENITY         fragile: a big drawing and a thin hull (it is going down, besides: src/specialQuests.js)
//   X-WING           agile: the quickest turn there is, a quick gun, a small body
CHASSIS['special-delorean'] = {
  ...CHASSIS.standard, id: 'special-delorean', label: 'DELOREAN',
  thrust: 1050, retro: 780, turnRate: 3.6, turnAccel: 18, maxSpeed: 1270, colliderRadius: 36,
  hull: 60, tank: 100, burn: 0.5,
};
CHASSIS['special-swordfish'] = {
  ...CHASSIS.standard, id: 'special-swordfish', label: 'SWORDFISH II',
  thrust: 920, retro: 700, turnRate: 4.4, turnAccel: 22, maxSpeed: 1170, colliderRadius: 46,
  fireInterval: 0.065, muzzleSpeed: 1100, gun: 2, hull: 110, tank: 100, burn: 0.5,
};
CHASSIS['special-express'] = {
  ...CHASSIS.standard, id: 'special-express', label: 'PLANET EXPRESS',
  thrust: 640, retro: 540, turnRate: 2.3, turnAccel: 10, maxSpeed: 830, colliderRadius: 62,
  hull: 150, tank: 160, burn: 0.6,
};
CHASSIS['special-falcon'] = {
  ...CHASSIS.standard, id: 'special-falcon', label: 'MILLENNIUM FALCON',
  thrust: 820, retro: 650, turnRate: 3.0, turnAccel: 13, maxSpeed: 1070, colliderRadius: 58,
  fireInterval: 0.1, gun: 1, hull: 140, tank: 100, burn: 0.5,
};
CHASSIS['special-serenity'] = {
  ...CHASSIS.standard, id: 'special-serenity', label: 'SERENITY',
  thrust: 720, retro: 590, turnRate: 2.6, turnAccel: 12, maxSpeed: 970, colliderRadius: 56,
  hull: 70, tank: 100, burn: 0.5,
};
CHASSIS['special-xwing'] = {
  ...CHASSIS.standard, id: 'special-xwing', label: 'X-WING',
  thrust: 980, retro: 750, turnRate: 4.8, turnAccel: 24, maxSpeed: 1200, colliderRadius: 34,
  fireInterval: 0.09, hull: 90, tank: 100, burn: 0.5,
};
// All six are reference ships: whatever the dock has, one docks outside (src/docking.js), and so does a crew's ship below.
for (const id of ['delorean', 'swordfish', 'express', 'falcon', 'serenity', 'xwing']) CHASSIS[`special-${id}`].reference = true;

// The crews' ships in the pilot's hangar once their run is won (src/hangar.js CREW_SHIPS): each its quest's chassis (its top, its turn,
// its body, its hull), with the STANDARD's tank and gun (SX's W6 «B», 2026-10-15, labs/graphics/sketches/firefox-checks.html: the
// quest's tank and burn gave twice the STANDARD's range, 11:07 to 5:33, and SWORDFISH II's gun four times its fire). In its quest the
// ship is borrowed and keeps all of its own (`special-<id>`).
const STANDARD_TANK_AND_GUN = ['tank', 'burn', 'fireInterval', 'muzzleSpeed', 'gun'];
for (const id of ['delorean', 'swordfish', 'express', 'falcon', 'serenity', 'xwing']) {
  const own = { ...CHASSIS[`special-${id}`], id: `crew-${id}` };
  for (const key of STANDARD_TANK_AND_GUN) if (key in CHASSIS.standard) own[key] = CHASSIS.standard[key]; else delete own[key];
  CHASSIS[`crew-${id}`] = own;
}

// SCOOTY JR., the mechanic's courtesy shuttle of the opening (src/loaner.js; SX, 2026-10-04: «нет scooty jr.», its look L01 SCOOTER
// of labs/graphics/sketches/loaner-shuttle.html, whose line on its feel is «nimble and light; turns on a coin, tops out early»). Flown
// once, HOME to the first station, by a pilot who has not flown before: quick to turn and to answer, slower at the top than any
// ship the pilot will own, so the first leg is short and forgiving; the brake is the standard's (the leg's braking practice is the
// brake the pilot keeps), and its hull as much as the standard's, so a missed approach is not the end of it. Its drawing decides
// nothing here (ships/scooty-jr.json).
// It only jumps (SX, 2026-10-04: «скути не умеет заносы и стрелять он умеет только прыгать»): the brake in a turn stays the brake,
// and there is no gun.
CHASSIS.loaner = {
  ...CHASSIS.standard, id: 'loaner', label: 'SCOOTY JR.',
  thrust: 700, retro: 650, turnRate: 4.4, turnAccel: 24, maxSpeed: 730, colliderRadius: 32,
  hull: 100, tank: 60, burn: 0.6,
  can: Object.freeze({ drift: false, fire: false, jump: true }),
};

export const DEFAULT_CHASSIS = 'standard';

export function resolveChassis(id) {
  return CHASSIS[id] || CHASSIS[DEFAULT_CHASSIS];
}

// The body a hull has in the drawing it wears (SX, 2026-10-08, of the pilot's ship looks THUNDER, EDGES and BLACKBIRD: «боксы рисуй
// по их размеру», each look's hit box at its own drawing's size). A look is a drawing (src/shipLooks.js) and the body is still the
// chassis's: this table, by chassis and then by the drawing's file id (`id` in ships/<id>.json, src/asciiModel.js), is the only way a
// drawing reaches `colliderRadius`, and only by naming a row the chassis wrote. A file cannot put a number here; a hull or a drawing
// with no row has the chassis's own body (CLASSIC, SX's ships/spaceship.json, 44 u; the COURIER, the HAULER, SCOOTY JR. and the six
// reference ships, whatever they wear).
//
// Each number is the drawing's farthest painted point from its pivot at the game's scale, in u (1 px a unit at scale 1): the farthest
// corner of the farthest cell, `hypot((|x| + 0.5) cellW s, (|y| + 0.5) cellH s)` over the drawing's cells, with the cell the page's font
// gives (9.2724609375 x 15 px, CONFIG.render.fontSize) and s the file's scale (1.5), rounded. Not typed by eye: checks/ship-looks.mjs
// recomputes it from each file and fails when a row is not the drawing's reach, so a redrawn look gets its number from the check.
//   thunder 83 (7 x 6 cells: the wing tips and the tail)   edges 74 (7 x 5)   blackbird 77 (9 x 6)
// against the STANDARD's 44 u in SX's drawing: the hit circle is 1.9, 1.7 and 1.75 times as wide, and about 3.6, 2.8 and 3.1 times the
// area. Everything that asks the ship's size reads `Ship.radius`, so the contact, the way in and the pirates' shots follow.
export const LOOK_BODIES = Object.freeze({
  standard: Object.freeze({ thunder: 83, edges: 74, blackbird: 77 }),
});

// The body of `chassis` in the drawing whose file id is `drawingId` (null for a drawing without one).
export function bodyRadius(chassis, drawingId) {
  return LOOK_BODIES[chassis.id]?.[drawingId] ?? chassis.colliderRadius;
}

// The one place "top two of nine speed-gauge segments" becomes a number.
// `maxSpeed` is whatever is actually in play (the chassis's own), so the fraction,
// not a fixed speed, is what stays true.
export function dangerSpeedOf(maxSpeed, chassis = CHASSIS[DEFAULT_CHASSIS]) {
  return maxSpeed * chassis.dangerFraction;
}

// SAFE / CRUISE / DANGER for a given speed. Shared by the flight model (the
// thrust taper) and the lab speed gauge (segment colour), so the boundary
// between them is defined exactly once.
export function speedStep(speed, maxSpeed, chassis = CHASSIS[DEFAULT_CHASSIS]) {
  if (speed < chassis.safeSpeed) return 'safe';
  if (speed < dangerSpeedOf(maxSpeed, chassis)) return 'cruise';
  return 'danger';
}

// The push's curve: the share of a hull's forward thrust at `speed`, against the hull's own top, so every hull's curve is the same
// against its top. A1 S-CURVE (SX, 2026-10-07, after flying the lab's three S-shapes against the J: «Вариант A устраивает больше всего
// по управлению, я бы максимальную скорость еще подольше брал, особенно чтобы дрифт не выкручивал быстро скорость в максимальную»):
// `lo` of the thrust at rest, rising on a smoothstep to `hi` at `mid` of the top and holding it there: a firm start, the strongest
// push in the middle. `hi` is 1 (the lab's A1 had 0.95): the even push at the top, which the danger floor was tuned against, so every
// hull still reaches its own top (at 0.95 the MILLENNIUM FALCON and the SERENITY never did). The ease into the top is the danger
// taper's, past 3/4 of the top (Ship.step), on an ease-out since the same day: the push falls quickly as the red begins and slowly
// into the floor, so 900 -> 990 u/s takes 2.4 s where A1's straight taper took 0.9 (the J's 0.2), and 999 comes 1.5 s later still.
// A drift gains no more than flying straight would from the same speed (src/drift.js stepGlide), so it never reaches the top first.
// `pull` (the gravity on the hull over its thrust, src/shipStep.js) raises the floor by as much, so near a planet or a hole the hull
// climbs out as it did: the push left over after the pull is never less than `lo` of the thrust. An empty tank's limp keeps the even
// push (Ship.step). Head-on from rest, the standard hull in a quiet world, seconds to each speed:
//                           100    300    600    900    950    990    999
//   J (the game until now)  0.76   1.66   2.41   2.80   2.89   2.99   3.02
//   A1 in the lab           0.51   1.08   1.61   2.22   2.49   3.13   4.01
//   A1, the game            0.51   1.07   1.57   2.32   3.01   4.76   5.49
// Before it: the even push (share 1 at every speed) until the morning of 2026-10-07, 0 -> 300 u/s in half a second, too soon to use a
// station's menu on the way; then the J, `0.2 x e^(v / 0.4 top)` at most 3 (SX: «сделай разгон корабля медленнее, пусть он будет по
// экспаненьте»), flown the same day: «сейчас слишком медленный старт, потом линейный разгон до максимума ... последние 100 вроде должны
// уже медленнее набираться». The lab's A2 FIRM START and A3 STRONG MIDDLE flew beside A1; they went with the J and the lab's `?accel=`
// once SX had picked (docs/playbook/movement-feel.md has all four).
export const THRUST_SHAPE = Object.freeze({ lo: 0.35, hi: 1, mid: 0.6 });
// `curve` false is the even push, the same at every speed: the game never sets it; checks set it to measure something else on it (the
// tether's mass, a limp).
export const ACCEL = { curve: true };
export function thrustShare(speed, top, pull = 0) {
  if (!ACCEL.curve) return 1;
  const S = THRUST_SHAPE;
  return Math.max(S.lo + (S.hi - S.lo) * smoothstep(speed / (S.mid * top)), Math.min(1, S.lo + pull));
}
