// The friendly craft: the hidden sector's traffic, the grid's NPC ships (their walk, paints, solid hulls, rage, the rare visitor out of
// O-08) and the service droids. Moved out of src/config.js as they were (PLAN D5, 2026-10-09, the config split; the NPC walk was owed
// by chats W2 and SC); CONFIG holds each section under its old name (CONFIG.traffic is TRAFFIC.traffic, CONFIG.droids is
// TRAFFIC.droids, the same objects), so every reader is unchanged. The code is src/traffic.js, src/npcFleet.js, src/npcRage.js,
// src/npcPaint.js and src/droids.js. The walk's legs are the layout's u grown with the world (`spread`, src/worldScale.js).

import { spread } from './worldScale.js';

export const TRAFFIC = {
  // The hidden sector's friendly craft (src/traffic.js). SX, 2026-09-30: the traffic
  // should be bigger, and he will pick the exact size from the scales sheet
  // (labs/graphics/sketches/scales.html, deleted 2026-10-03), so the size of every named craft sits behind
  // this one multiplier. Each craft's own size (`size` in src/traffic.js) is 1.0 =
  // Codex's sheet at 1x, one cell of the game's grid per cell of the drawing; the tour
  // shuttles are a separate small class and do not follow it.
  traffic: {
    craftScale: 1,
    // The friendly NPC ships of the grid's sectors (src/npcShips.js), at the pilot's ship's own scale (SX, 2026-10-02:
    // «корабли NPC тоже по размеру. Один и пять»). Named `...Scale` so the boot's glyph warm-up finds it.
    npcScale: 1.5,
    // Where the NPC ships go (src/npcFleet.js; SX, 2026-10-02: «нпс корабли должны иметь разные рандомные пути и не летать
    // кругами, у них должен быть спектр гораздо шире радиус полета»): each is a walker over the whole grid, a run of straight legs
    // of `minLeg` to `maxLeg` u between free places (`spotStep` apart, `edge` u inside the grid's edge), never turning more than
    // `maxTurn` rad (`maxTurnMore` more when no leg is clear, any under `maxTurnAll` when still none) at a corner, made only at a place with `hub` ways on from it, which is rounded over at most `cut` u, and the ship points along the path `smooth` u either side of it; a path keeps `air` u clear of a station's menu, a planet's
    // cushion (`planetAir` more) or a hole's disc (`holeAir` more). A path is laid `ahead` u past the ship, `batch` corners a step at most (`tries` draws a leg).
    // The mixing: every `mixEvery` s a ship the pilot has met a lot lately, out of sight (more than `hide` u off) but in its part
    // of the grid (within `zone` u), is exchanged for one far off (past `zone`) that it has met little, if the first has been met
    // `gap` more (a ship that changed `hold` s ago stays as it is). A ship is met within `sight` u of the pilot, looked for every
    // `look` s, and again after it has been `rearm` u off. The legs, `ahead` and `zone` are the layout's u grown with the world
    // (src/worldScale.js spread): the ships keep the map's pace; what is about sight (`hide`, `sight`, `rearm`) stays as it is.
    walk: { minLeg: spread(2400), maxLeg: spread(9000), maxTurn: 1.5, maxTurnMore: 0.6, maxTurnAll: 2.7, hub: 12, cut: 1000, smooth: 150, air: 80, planetAir: 150, holeAir: 350, edge: 700, spotStep: 450,
      ahead: spread(24000), batch: 1, tries: 150, sight: 700, rearm: 2000, look: 0.5, mixEvery: 1.5, hide: 2800, zone: spread(7000), hold: 60, gap: 0.3,
      // A ship within `zone` of the pilot looks for its next corner within `pass` u of the pilot `toward` of the time (W2, 2026-10-04:
      // a ship in a 1512 x 860 view 7 % of the flying time on the start's routes, where SX found «мало ... NPC и других кораблей»).
      // A ship sent out of a closed sector comes out at the farthest from the other ships of `spread` free places drawn (Fleet.keepOpen;
      // SX, 2026-10-07: «все скапливается в одном месте»).
      toward: 0.85, pass: 2000, spread: 12 },
    // The NPC ships in the pilot's paints (src/npcPaint.js, src/npcFleet.js; SX, 2026-10-02: «По системе весов перекрашивай
    // корабли нпс в разные цвета, ну примерно в наших палитрах»). A paint's hue up to `shift` degrees inside a colour the NPC rule
    // forbids is moved `margin` degrees past its edge; its accent is `turn` degrees or more round from its main; two paints look
    // alike when their looks are under `alike` apart (CIE76). A ship is repainted when it comes into the pilot's part of the grid
    // (within walk.zone, out of sight past walk.hide), not sooner than `hold` s after its last paint unless its paint is worn
    // there already; a pilot who moved more than `jump` u in one look (a hole, a wreck, O-08) finds every ship repainted. A ship's
    // own scheme (SX's pick) weighs `own` of a paint in the draw.
    npcPaint: { shift: 15, margin: 3, turn: 40, alike: 7, hold: 60, jump: 3000, own: 0.5 },
    // The NPC ships are solid (src/npcFleet.js Fleet.contacts; SX, 2026-10-02: «Сделай еще что в корабли npc можно врезатсья и если
    // ты на большой скорости влетел то оба корабля могут взорваться»): each a box `fill` of its drawing, in the game's cells
    // (CONFIG.render.fontSize high, `cellEm` of it wide), turned to its heading; `hull` points, as many as the pilot's ship has.
    // A blow costs both the hull rule's points (CONFIG.hull.base.npc): 30 at 600 u/s closing, 100 (both broken) at about 1,190.
    // `knock` (SX, 2026-10-03: «когда я врезаюсь в NPC, они как вкопанные стоят, но они же тоже должны двигаться чуть-чуть ...
    // Это же как бы автокатастрофа»): a ship rammed and not broken is knocked off its path, as heavy as the pilot's: it takes
    // `share` of the closing speed (the pilot keeps the rest of the bounce), slows off it and comes back on in some
    // 4 / `omega` s, and turns at up to `maxSpin` rad/s by where it was struck (`spin`), straightening in 4 / `turnBack` s.
    // A ram that wrecks the pilot breaks the NPC as well, whatever its hull (SX: «надо как бы что они вдвоем взрывались»).
    npcSolid: { hull: 100, fill: 0.8, cellEm: 0.62, knock: { share: 0.675, omega: 0.9, spin: 1.6, maxSpin: 2.2, turnBack: 1.1 } },
    // A friendly ship the pilot rams curses, and may rage (src/npcRage.js, src/npcFleet.js Fleet.rammed; SX, 2026-10-08: «когда
    // врезаешься в NPC, он выдавал какую-нибудь фразу, ругался на наш корабль ... NPC может взбеситься от того, что мы в него
    // врезались, и преследовать нас и таранить какое-то время, пока мы не взорвемся или не улетим совсем далеко»).
    //   curse   a blow the hull feels, closing at CONFIG.hull.touchSpeed or more (under it is a graze, whatever the damage rule's speed
    //           is: it is read, not copied), has the ship say one line (src/greetings.js NPC_CURSES) and rolls the rage; not again for
    //           the same ship within `again` s
    //   chance  the rage's chance: `from` at the least such blow, `to` at `full` u/s of closing or more, straight between
    //   most    ships raging at once, at most
    //   chase   a raging ship goes for the pilot's ship, led by `lead` s of its way, at its pace `mul` times its own, between `floor`
    //           and `cap` u/s and never over `share` of the pilot's top speed (so the pilot can always outrun it); it pushes `accel`
    //           u/s^2 along its nose, turns at `turn` rad/s, and loses `grip` a second of the speed sideways of its nose. It keeps
    //           `margin` u outside a station's keep-out, a planet's cushion and a hole's disc (`range` u out they steer it round) and
    //           `edge` times the walk's `edge` inside the grid's edge. It gives up when `time` s are over, when the pilot is `far` u off, when the
    //           pilot has been docked, or inside a block it keeps out of with the ship held off at its wall, `refuge` s, or when
    //           the pilot is wrecked or out of the grid (O-08); it goes back to roaming from where it stands, easing to its own pace over
    //           `ease` s
    //   say     it speaks as it turns on the pilot `turn` s after the blow, at a ram with the chance `ram`, and calming when the
    //           pilot is within `calmReach` u; not twice within `again` s
    // Fewer and shorter since SX, 2026-10-09 («снизь количество агрессивных нпс значительно и пусть они меньшее время гоняются за
    // тобой»): the chance 0.2-0.8 -> 0.06-0.25, one ship at a time (two), the chase 50 -> 20 s and 3,600 -> 2,400 u.
    npcRage: {
      curse: { again: 6 },
      chance: { from: 0.06, to: 0.25, full: 800 },
      most: 1,
      chase: { time: 20, far: 2400, mul: 3, floor: 300, cap: 620, share: 0.62, accel: 380, turn: 2.6, grip: 2.2, lead: 0.8,
        margin: 40, range: 500, edge: 0.5, refuge: 3, ease: 3 },
      say: { turn: 2.4, ram: 0.5, calmReach: 1800, again: 3 },
    },
    // The rare visitor out of O-08 (src/traffic.js stepVisitor; SX, 2026-10-01: «изредка ты можешь их встретить и
    // в открытом космосе, это должно ощущаться как приятное событие, так что довольно редкое»): the first after
    // `first` s of flight, then once in `every` s (12 to 20 minutes). It crosses `pass` u at `speed` u/s, through
    // a point `offset` u to one side of where a moving ship will be in `lead` s (at most `ahead` u on).
    visit: { first: 360, every: [720, 1200], pass: 3600, speed: 260, offset: [180, 420], lead: 3, ahead: 1400 },
  },

  // Service droids (src/droids.js; SX, 2026-10-01: «8 артов для дроида заправщика и 8 артов
  // для дроида починщика которые летают в космосе и о них можно починиться или заправится, на
  // станциях тоже можно, дроиды летают не часто но летают ... эти дроиды должны перемещаться но
  // довольно медленно, с ними можно столкнуться со станциями нельзя»).
  //
  // One droid at a time in the pilot's sector, never in the hidden one: `every` seconds of
  // flight after the last one left (never docked, never during a fight), `first` after a start.
  // It appears `spawn` u from the ship, off screen, and works its way through `stops` points
  // `leg` u apart at `speed` u/s, resting `rest` s at each, then leaves: out of the pilot's
  // way and gone `gone` u off. `kind` is drawn by need: a hull or a tank below half makes
  // that kind more likely, by as much as it is missing. A droid is solid (`radius`, `mass` in
  // ships): a ship that hits one pays the droid's hull base (CONFIG.hull.base.droid) by the
  // same speed rule as a rock, and a container shoves it. Shots stop at it and do nothing.
  // Near a slow ship it stops and waits (`hold` u, ship slower than CONFIG.station.dockSpeed
  // against it, at most `holdTime` s): service within `interactRadius`, matched to under that
  // speed. It sells what it carries (`stock`) at `price`, dearer than a station (fuel 1 CR a
  // unit, a garage's repair 20 a point), and leaves when it is empty.
  //
  // Economy (reports/2026-10-01-cargo-damage-droids.md): a rock hit costs 2.9 points on
  // average at a 550 u/s cruise, 58 CR at a garage and 87 from a droid. A repair droid
  // carries 6 points (180 CR), a fuel droid half a tank (50 units, 100 CR).
  droids: {
    // SX, 2026-10-01: «Я за 10 минут не встретил ни разу дроида заправщика и починщика, нужно чаще гораздо».
    // They came every 150-300 s of flight (60 after a start) and appeared at a random bearing: a ship flying on
    // at a cruise had left long before a droid at 60-90 u/s reached it. Now every 50-100 s (25 after a start),
    // and `ahead`: a ship flying faster than `ahead.speed` u/s meets it on its way, within `ahead.spread` rad of
    // its heading.
    every: [50, 100],
    first: 25,
    spawn: [2200, 3000],
    ahead: { speed: 150, spread: 0.6 },
    stops: 3,
    leg: [1400, 2600],
    speed: [60, 90],
    accel: 60,
    rest: 6,
    gone: 3200,
    // The hull's touch and a shot's stop: about half the R08B TANKER's width at `scale` (11-12 cells; SX on the picks hub,
    // 2026-10-04, as labs/graphics/sketches/droids-v2.html proposed: «радиус удара 40 мал для танкера — около 60»). 40 until then; 60 until the
    // droids were drawn at 1.5 (2026-10-17), the body grown with them.
    radius: 72,
    mass: 0.6,
    hold: 350,             // 700 until 2026-10-01: it waited further off than its menu reaches (interactRadius)
    holdTime: 30,
    interactRadius: 300,
    // A bearing points to it from this far (most of a sector), and the locator shows it.
    discoverRadius: 5200,
    // How far it keeps from what could hurt it: a planet's orbit, a hole's disc, a
    // station's hull, a rock, each plus this.
    avoid: 220,
    // What is bought is seen to cross from the droid to the hull (src/droids.js startServiceFx; SX, 2026-10-01:
    // «надо ее все-таки покупать ... чтобы какой-то эффект был»): `pieces` (a drop of oil for six units, a part for
    // ten points, within the range), `stagger` s apart, each `time` s on its way.
    fx: { pieces: [3, 8], stagger: 0.12, time: [0.7, 0.95] },
    fuel: { price: 3, stock: 50 },     // 3 since 2026-10-04 (proposal.json `fuel`: a station's 2, HOME's 0.5)
    repair: { price: 3, stock: 60 },   // per point: 30 and 6 until the hull went to 100 (2026-10-01)
    // A part on its way: one of these glyphs, tumbling at up to `spin` rad/s; welded on, `sparks` sparks.
    part: { glyphs: ['╬', '╪', '╫', '┼'], spin: 5, sparks: 10 },
    // Their drawing's scale: the friendly ships' and the pirates' 1.5 since SX's scales of 2026-10-17 («дроиды могут быть как NPC»); 1.25 until then.
    scale: 1.5,
    bob: { amount: 2, rate: 1.1 },
    // The repair droid the opening chapter binds near the start ruin (src/opening.js, stage `service`; src/droids.js spawnStoryDroid;
    // codex HANDOFF section 4: «D must remain reachable until the lesson is resolved, including after reload»): it holds `air` u
    // outside the ruin's hull, clear of its menu's reach, `clear` u from every cache, signal and cargo lying in the sector (a window of
    // theirs would hold the selection while the pilot is beside the droid: found by the rhythm run, 2026-10-08), and does not leave while
    // the lesson stands.
    story: { air: 1100, clear: 800 },
  },
};
