// The bodies of space: the asteroids (their tiers, what a broken rock releases, the bump), the planets (their looks and the orbit's
// cushion), the black holes (the passage, the secret one) and the gravity that pulls on them. Moved out of src/config.js as they were
// (PLAN D5, 2026-10-09, the config split); CONFIG holds each section under its old name (CONFIG.asteroid is BODIES.asteroid, and so
// on, the same objects), so every reader is unchanged. The code is src/bodies.js, src/field.js, src/secretHole.js and src/progression.js
// (the rocks' drops).

export const BODIES = {
  asteroid: {
    tiers: [
      { radius: 130, glyph: '#', speed: 42,  splits: 2, score: 20 },
      { radius: 74,  glyph: '%', speed: 74,  splits: 2, score: 50 },
      { radius: 38,  glyph: 'o', speed: 118, splits: 0, score: 100 },
    ],
    color: '#8c8579',
    // What a broken rock releases. SX, 2026-09-24, second pass: always, a scatter
    // of 1 CR coins. SX, 2026-09-29: "сократим количество монет которые выпадают
    // из астероидов в 4 раза" (a whole big rock paid 19 CR, then 4.75).
    // SX, 2026-09-30: «пусть из астероидов с шансом 70/30 вылетало либо горючее либо
    // монетки (также по единичкам или чуть больше)». Every break now releases EITHER a
    // scatter of fuel canisters (`fuelShare`, 70 %) OR a scatter of 1 CR coins (the
    // other 30 %), never both and never nothing (World.releaseDrop, progression.js
    // rollRockScatter). `coins` and `fuel.pieces` give the EXPECTED number of pieces
    // per break for a big / medium / small rock as a range: a draw in it, whole part
    // certain and the fraction a chance of one more (progression.js rollRockDrop),
    // and at least one whatever the range says. A canister holds a whole number of
    // fuel units drawn from `fuel.units`, 1.5 on average, against 1 CR a coin.
    // A big rock breaks 1 + 2 + 4 times, so its whole family is worth:
    //   pieces a break  3.0 / 2.0 / 1.25        12 pieces (2-4, 1-3 and 1-2 a break)
    //   coins (30 %)    0.9 / 0.6 / 0.375 CR    3.6 CR     (4.75 before, -24 %)
    //   fuel (70 %)     3.15 / 2.1 / 1.31 u     12.6 units (nothing before)
    // Fuel costs 1 CR a unit at a station and full thrust burns 0.16 a second
    // (CONFIG.fuel: 2, then 0.8, until SX's "слишком быстро заканчивается" twice),
    // so a rock family was about 80 seconds of thrust, an eighth of a tank. The table above is of 2026-09-30: since
    // 2026-10-01 (fewer, half-unit canisters, then x1.5 coins on 2026-10-02) a family at a quarter of a tank gives
    // 2.6 units and 10.9 CR, about 8.5 s of full thrust (6 s before the burn went to 0.30): rocks top the tank up a
    // little, the droids and the stations fill it (the garage chat's balance pass, 2026-10-02).
    // Placeholder economy.
    drops: {
      // Then, the same day: «напиши механику чем больше горючего тем реже оно
      // выпадает и наоборот». The share of breaks that are fuel follows the
      // tank: [on an empty tank, on a full one], straight between (progression.js
      // fuelShareAt). 70 % at a quarter of a tank, as it was; half and half at
      // half; one break in ten on a full tank, where a canister would only lie
      // there (TANK FULL), so a full pilot is paid in coins instead.
      fuelShare: [0.9, 0.1],
      // Twice as many coins a break as before SX's «Из астероидов давай побольше монет чем сейчас»
      // (2026-10-01; they were [[2.5, 3.5], [1.5, 2.5], [1, 1.5]]): a big rock's family 7.2 CR at a quarter tank.
      // [[3, 5], [2, 3], [1, 2]] since 2026-10-04 (the economy SX chose, his 11B: «rock coins and the 2-unit fuel canister as
      // Codex has them»; proposal.json `fuel`): a rock is fuel more than money, so a full tank does not make rock farming the
      // best wage. [[8, 10], [5, 8], [3, 4]] until then; [[5, 7], [3, 5], [2, 3]] until 2026-10-02.
      coins: [[3, 5], [2, 3], [1, 2]],
      // A canister is drawn in the engine green (the lab's ROLES.driveActive) by
      // sprites/fuel-canister.json; `color` is its ink (checks/material-art.mjs holds the two equal). The hull takes one
      // only while the tank has room.
      // SX, 2026-10-01: «слишком дофига горючего падает из астероидов»: about 2.5 times less. A rock family
      // (a big rock and its splits) gave 12.6 units at a quarter of a tank; now 5.1: fewer canisters a break
      // (they were [[2.5, 3.5], [1.5, 2.5], [1, 1.5]]) and one unit each (1 or 2). How often a break is fuel
      // stays as it was, so the coins from rocks stay as SX left them.
      // Then, the same day, with the droids that sell fuel in space (CONFIG.droids): \u00ab\u043a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e \u0433\u043e\u0440\u044e\u0447\u0435\u0433\u043e
      // \u0438\u0437 \u0430\u0441\u0442\u0435\u0440\u043e\u0438\u0434\u043e\u0432 \u0432 \u0441\u0432\u044f\u0437\u0438 \u0441 \u044d\u0442\u0438\u043c \u043c\u043e\u0436\u0435\u0448\u044c \u0435\u0449\u0435 \u0441\u043e\u043a\u0440\u0430\u0442\u0438\u0442\u044c\u00bb: half a unit a canister (was one), a rock family
      // 2.6 units at a quarter of a tank, a hundredth of the tank against the 5.1 of the morning. The same
      // canisters as often, so the scatter looks the same and the coins are untouched.
      // SX, 2026-10-02, after flying a long save: «мало бензина падает из астероидов, буквально и капли мало и они дают слишком
      // мало, я бы повысил на 10%». Both by a tenth: a tenth more canisters a break and a tenth more in each (0.5 -> 0.55), so
      // a rock gives 1.21 times the fuel (a family at a quarter of a tank: 2.56 -> 3.10 units, about ten seconds of full thrust).
      // The count is the EXPECTED one a break, and a break always gives at least one, so for the medium and the small rock the
      // old ranges (0.6-1.2, 0.4-0.8) were under that floor and meant "one" (1.03 and 1.00 a break in fact); a tenth more of that
      // is a range from one up: 1.0-1.27 (1.13 a break) and 1.0-1.2 (1.10), the big rock's 1.0-1.5 (1.25) times 1.1 (1.375).
      // Every canister is 0.55 of a unit, which is the same number the oil's drop is drawn from (oil.unit stays 0.5: a drop's
      // area holds its fuel, so it is 5 % wider across).
      // Then the economy SX chose (2026-10-04, proposal.json `fuel`): two units a canister (0.55 until then), the pieces and how
      // often a break is fuel as they were: a family of rocks at a quarter of a tank about 11 units, a refuel at a station's
      // price of about 22 CR, so shooting rocks is the way out of an empty tank and a saving, not a chore.
      fuel: { pieces: [[1.1, 1.65], [1.0, 1.27], [1.0, 1.2]], units: [2, 2], color: '#79a78f' },
      value: 1,            // CR per coin
      burst: [60, 180],    // u/s outward, on top of the rock's carried velocity
      carry: 0.5,          // share of the rock's velocity a coin keeps
      drag: 1.2,           // per second, so a scatter settles within ~150 u
      life: 24,            // seconds an uncollected coin lasts
      fadeFrom: 4,         // its last seconds are drawn fading
      // A coin's drawing: 0.7 until SX's «монетки на 20% крупнее», then «чуть побольше еще» (+15 %), then «на 5% меньше», then «на 10% меньше»
      // (0.92 -> 0.828), then a round 0.8 with the camera's height (SX, 2026-10-17: «Почему не 0,80 хотя бы?»). (A fuel canister's drawing,
      // `scale` 0.7, went the same day: fuel lies loose as drops since 2026-10-08, src/oil.js, and nothing read it.)
      coinScale: 0.8,
      // A coin that the hull passes close to is drawn in, so a flight through
      // the scatter gathers it. Authored pickups have no pull: those are
      // taken by touch, which is what makes braking into them matter.
      magnet: { radius: 120, accel: 1600, maxSpeed: 560 },
      // Loose pieces are solid to each other (src/pickups.js separateDrops; SX, 2026-10-01: «Монеты не должны
      // залезать друг на друга и на канистры»): a coin's and a fuel piece's radius in u, about the ink
      // of their drawings; an overlap is taken out at `ease` per second, and `bounce` of the speed that
      // closed them comes back.
      body: { coin: 17, ease: 12, bounce: 0.2 },
      // Fuel lies loose as oil (src/oil.js; SX, 2026-10-01, labs/graphics/sketches/oil-shades.html): a drop of
      // `unit` fuel units is `radius` u across its heart, one of more the square root bigger. A drop just thrown
      // out flies with its scatter for `settle` s; then drops within `reach` u draw together at up to `pull`
      // u/s^2, and two whose middles are `merge` of their radii apart run into one, which swells for `swell` s.
      // A coin meets a drop at its radius.
      oil: { unit: 0.5, radius: 9, reach: 170, pull: 90, merge: 0.75, settle: 0.9, swell: 0.35 },
    },
    // A slow touch is a bump, not a wreck (SX, 2026-09-24): below `speed`
    // u/s of closing speed along the contact the hull is pushed off with
    // `restitution` and sheds bright sparks and a few of its own glyphs.
    // Faster, the ship is wrecked as before. `speed` matches docking speed.
    // `restitution`: the share of the closing speed that a rock, a station's body or a planet's surface gives back to the hull along the
    // contact (src/hits.js bumpShip, src/contact.js rebound). 0.35 until SX's word of 2026-10-09 («фрикшн от столкновений слишком
    // большой. Можешь сделать его поменьше»), 0.65 since: the speed a touch takes off the hull falls by about half (a head-on blow
    // leaves the hull at 0.65 of the closing speed where it left it at 0.35; a blow 45 degrees off the normal keeps 0.84 of the hull's
    // speed where it kept 0.75). 0.3 since SX's FC1 of 2026-10-15 («отскок от камней очень сильный, нужно значительно уменьшить ...
    // должен быть некоторый отскок, но не как от резинки»): a head-on rock sends the hull back at 0.3 of its closing speed, not 0.65;
    // a hard blow breaks the rock instead (`ram` below), so a fast head-on hit no longer stops the hull dead. `knockRestitution`: the same for a thing that is knocked along, a droid or a friendly ship, whose share
    // of the blow is worked out from it (CONFIG.droids.mass; CONFIG.traffic.npcSolid.knock.share is (1 + 0.35) / 2 of equal masses):
    // raised there, the thing would take more of the blow and the hull keep less of its way, so it stays 0.35, as it was.
    bump: {
      speed: 140,
      restitution: 0.3,
      knockRestitution: 0.35,
      sparkMin: 15,        // u/s: resting contact makes no sparks
      sparks: ['*', '+', '\u2726', '\u00b7', '\u00d7'],
      colors: ['#ffffff', '#ffe7a3', '#ffd27f', '#ff9d4d'],
      rockPush: 0.25,      // share of the closing speed a free rock takes away
      // A hard blow breaks the rock (SX's FC1, 2026-10-15: «камень должен разбиться если столкновение сильное»; src/hits.js ramAsteroid):
      // one of `breaks` points or more by the hull's rule (CONFIG.hull, the cube), the heavy blow the warning says (FLIGHT.warn.heavy 10):
      // head-on from about 470 u/s of closing, or a jump landed on it from about 335. The hull pays it as before (SX: the rocks' damage stays), is
      // not bounced, and loses `loss` of its closing speed along the contact; the pieces go `gap` u clear either side of its way, flung
      // off at `scatter` u/s.
      // Then lower (SX, 2026-10-16: «камни не разломались когда я в них врезался»): a blow of 6 points (about 400 u/s of closing; 10, the
      // warning's heavy blow, was about 470, and a rock met off its middle is met slower than the hull flies), so at 600 u/s about three
      // blows in four break it, at 500 three in five.
      ram: { breaks: 6, loss: 0.5, scatter: 140, gap: 6 },
      // A collision costs coins (SX, 2026-09-24): `spill` CR leave the wallet
      // as a scatter of 1 CR coins around the contact, flung past the hull's
      // pull and untouchable for `spillDelay` seconds, then free to gather
      // again. At most once per `spillCooldown`, so scraping along a rock is
      // not a drain. A wreck against a rock or a planet spills too.
      // Off since SX, 2026-10-01: «При столкновении с астероидом вылетает слишком много монет, давай не
      // будем этого делать»: neither a bump nor a wreck against a rock or a planet spills the wallet.
      spillOnBump: false,
      spill: [10, 20],
      spillBurst: [200, 360],
      spillDelay: 1.2,
      spillCooldown: 1.0,
      spillOnWreck: false,
    },
  },

  planet: {
    // Density ramp, darkest to brightest.
    ramp: ' .:-=+*#%@',
    // A classic planet's cell mixes its dark into its tint in steps of a sixth, so a planet is five tones and its rim (its mix runs
    // from 0.34): it was a smooth mix, a few hundred near-identical colours a planet (SX, 2026-10-17, of SPAWN's study: «очень много
    // красных оттенков, одинаковых практически? Откуда эти бесконечные красные?»; «Вносим T4 ... планеты в пять тонов»).
    mixSteps: 6,
    rimGlyphs: '.·',
    light: { x: -0.55, y: -0.42, z: 0.72 },
    // How a planet looks (SX, 2026-10-02, of the map editor: «генерировать ... внешний вид ... в стилях, которые мы применили ...
    // Двухцветные планеты»). A planet's record may carry `style` (one of the ids below), `tint2` (a second hue) and
    // `bands`, `spin`, `seed`: the picture is redrawn from them at the planet's own radius, cell by cell (never an
    // image made bigger). A record without `style` looks as it always did: `classic`, or `blocks` for the seeds
    // labs/graphics/world-art.js names. `two` says what `tint2` is for (null: nothing, the style is one hue).
    //   classic   the density ramp of ASCII glyphs, `bands` stripes the shading with latitude (src/bodies.js Planet)
    //   blocks    the block family: strata of shade blocks in steps of one hue (labs/graphics/world-art.js drawPlanet)
    //   split     the classic shading in two hues, the second a zone whose edge wobbles round the planet and sweeps as it spins
    //   ringed    the classic body with a thin ring of dots, a tilted ellipse in two or three lines (`tint2` its colour);
    //             its far half goes behind the body. The ring reaches `outer` radii, and so does the planet's `rim`
    //   cratered  a moon: dull blocks in the planet's hue, empty bowls with bright rims, one crater to `perRadius` u of
    //             radius, each `size` u across the same on a big planet as on a small one (angular radius at most
    //             `maxRho`); a rim is the `rim` shares of a crater's radius (`tint2` tints the floors)
    styles: {
      classic: { name: 'CLASSIC', two: null },
      // `seeds`: the planets of the catalogue that were always block planets (by seed: the seed is a body's identity).
      // A record with no `style` is blocks if its seed is here, classic if not; a `style` says it outright.
      blocks: { name: 'BLOCKS', two: null, seeds: [43, 58, 88, 101, 113, 163, 181, 197] },
      split: { name: 'TWO-TONE', two: 'zone', wobble: 0.22, lean: 0.16, seam: 0.035 },
      ringed: { name: 'RINGED', two: 'ring', lines: [1.4, 1.52, 1.72], outer: 1.72, open: [0.26, 0.42], tilt: 0.5, step: 1.1 },
      cratered: { name: 'CRATERED', two: 'dust', perRadius: 13, size: [24, 90], maxRho: 0.45, rim: [0.74, 1.2], least: 8 },
      // The eight SX picked on labs/graphics/sketches/planets-stations.html (2026-10-14; their painters labs/graphics/planet-types.js):
      // `two` what the second ink is (`tint2`), null for one ink.
      storm: { name: 'STORM', two: 'band' },
      glacier: { name: 'GLACIER', two: 'crack' },
      forge: { name: 'FORGE', two: 'lava' },
      tidewater: { name: 'TIDEWATER', two: 'land' },
      dunes: { name: 'DUNES', two: null },
      facets: { name: 'FACETS', two: null },
      nightside: { name: 'NIGHTSIDE', two: 'lights' },
      shell: { name: 'SHELL', two: 'lattice' },
    },
    // The size the map editor offers (a planet's radius in u) and what follows it: `pull` keeps its ratio, a new
    // planet's is `pullShare` of its radius. Over `wall` a planet stops being a body (checks/planets.mjs).
    size: { min: 180, max: 520, wall: 500, pullShare: 0.6 },
    // The colour rules for a planet's hue (checks/planets.mjs holds them for the catalogue, checks/planet-styles.mjs for
    // what the generator makes): the lit tone reads `legible` to 1 on black, saturation at most `saturation`, a colour
    // distance (CIE76) of at least `reserved` from the route green, caution orange and danger red, `sector` from every
    // other planet of its sector and `grid` from every other on the grid. `pair`: the two hues of a two-colour planet.
    colour: { legible: 7, saturation: 0.6, reserved: 20, sector: 30, grid: 15, pair: 20 },
    // The name under a named planet's body (World.drawPlanetLabel), in the
    // planet's own tint dimmed until it reads `contrast` to 1 on black (SX,
    // 2026-09-30: every planet has a name). 5 is what the grey label it replaced
    // read (#929ca8 at 0.8): quiet, and above the 4.5 a small text needs.
    // It goes round the planet slowly (SX, 2026-10-01: «название планет пусть летает вокруг их орбиты
    // медленно»): once in `period` s, each planet from its own angle and in its own direction, the side
    // of the text nearest the planet always `gap` rows off the drawn rim, so it never crosses the body.
    label: { contrast: 5, period: 150, gap: 1.5 },
    // Planets are solid, inside a repelling orbit (SX, 2026-09-24). From the
    // orbit line down to the surface a push grows with depth and brakes
    // inward speed: a grazing ship is turned away and a slow one pushed back
    // out, while a fast, straight one still reaches the surface and is
    // wrecked. Crossing the line sets the hull tumbling by its sideways speed,
    // and control stays weak (chassis `jolt*Grip`) until `recover` seconds
    // after the ship is out. Tuned by simulation; see DECISIONS.md.
    // Softened after SX's first flight ("aggressive, not pleasant"): a deep,
    // gentle cushion instead of a trampoline. A slow fall comes back out at
    // about 40 % of its speed (it was 76 %), the peak push stays near main
    // thrust, and the tumble and weak control are mild and short.
    //   straight in: wrecked from about 860 u/s, pushed back out below that
    //   20 deg off straight: wrecked from about 1210 u/s at radius 300; the
    //     cushion is 200 u deep whatever the radius, so a bigger planet is a
    //     little flatter to an oblique approach (about 1090 at 450)
    //   30 deg or flatter: turned away at any speed the chassis can reach
    // The cushion is no longer drawn (SX, 2026-09-30, "убери полоски орбит"); it
    // acts exactly as tuned.
    // The fall it lets through in proportion to the ships' tops since they went to 0.85 (2026-10-05; src/chassis.js): straight in
    // the surface is reached from 0.85 of the speed it was, 740 u/s where it was 870, under the top of 850 (left as it was, no hull
    // could reach a planet any more), by the damping alone (9 -> 7); the push stays, as it is weighed against the engine's, which
    // stays (a hull pressed down under full thrust is still held). The tumble per u/s over 0.85, so a graze at a share of the top
    // tumbles as it did at that share of 1,000. And 0.8 of it with the tops at 800 (2026-10-05): straight in from 694 u/s (0.8 of
    // 870), the tumble per u/s 1.2 / 0.8. The damping alone (6.3) would let a slow fall of 300 u/s back out at 152, over half; with
    // the push a little lower too (700 -> 660) it comes out at 148 (147 at 850), and a hull pressed down under full thrust is held.
    // And 0.9 of it with the tops at 900 (2026-10-06): the depth (`height`) as it is, a distance (SX: «только космос не увеличивай»),
    // the rates with the top. Left at 800's, a fall straight in reached the surface from 693 u/s, 0.77 of the top, and one 20 degrees
    // off reached DAMASK (K-05, radius 520) from 844, under the top: hits no top ever gave before. Damping 7.6 and push 740: straight
    // in from 786 (0.87 of the top, as at 800), 20 degrees off never; a slow fall of 300 out at 146; the tumble per u/s 1.2 / 0.9.
    // And with the tops at 999 (the same day) the rates the cushion had at 1,000 until 2026-10-05: left at 900's, a fall 20 degrees off
    // reached DAMASK from 961 u/s, under the top; with these straight in from 868 (0.87 of the top again), 20 degrees off never, a slow
    // fall of 300 out at 135.
    orbit: {
      height: 200,         // world units above the surface
      push: 700,           // u/s^2 at the surface (660 at the top 800, 740 at 900, 2026-10-05 and 06)
      damping: 9,          // per second at the surface, inward speed only (7 at 850, 6.4 at 800, 7.6 at 900, 2026-10-05 and 06)
      spin: 1.2,           // rad/s of tumble per 1000 u/s of sideways speed (1.41 at 850, 1.5 at 800, 1.33 at 900)
      maxSpin: 2,
      recover: 0.6,        // seconds to full control after leaving the orbit
    },
  },

  blackHole: {
    armCount: 6,
    samples: 74,
    twist: 3.4,
    armWidth: 0.075,
    ramp: '@#*+=:-.',
    color: '#b79bff',
    // A passage, not a death (SX, 2026-09-24). A ship past the horizon comes
    // out of another hole, picked at random on every passage and never the
    // one it fell into, on the same heading, at least `ejectMargin` times the
    // escape speed at the exit point, and cannot be taken again for `grace`
    // seconds.
    ejectMargin: 1.2,
    grace: 1.5,
    // The exit heading is the one it fell in with unless a coast along it would be
    // taken by a hole or a planet again within `exitClear` seconds (a wall of
    // current or a planet's cushion turns a ship back into the hole it left); it
    // is then turned `exitTurnStep` degrees at a time, either way, to the nearest
    // heading that is clear (World.exitHeading).
    exitClear: 15,
    exitTurnStep: 10,
    // The secret hole, the way into the hidden sector (src/secretHole.js; SX, 2026-10-02: «юзер должен узнать ее по тому что
    // она крутится в другую сторону и внутри себя имеет кольцо другого цвета или некоторые символы в ее рисунке розовые»).
    // It turns the other way (SECRET_HOLE.spinDir in src/sectors.js) and wears one tell, `tell`: 'glyphs' is H1 PINK GLYPHS,
    // 'ring' is H2 PINK RING (labs/graphics/sketches/secret-hole.html shows both; this one switch picks which the game
    // draws, at both ends of the passage). `ink` is the pink of the map's flag swatches (labs/graphics/map-screen.js PINK);
    // the palette (src/roles.js) has none, and the hidden sector's sky pink (world-art.js STAR_PINK, #C684A3 at
    // its middle) is too dusty to tell from the violet arms at a glance.
    secret: {
      // Whether the way into O-08 is open: false since SX's word of 2026-10-19 («Убери, кстати, черную дыру вообще розовую с
      // секреткой. Она только мешает сейчас ... Ты прям контент не удаляй розовой дыры, просто путь туда скрой»). Shut, the hole
      // never comes nor stands anywhere (src/secretHole.js secretWayOpen), so no way leads into O-08; everything of it below, its
      // drawing, its rules, its lure and the sector itself, is kept as it is for the day the way opens again.
      way: false,
      tell: 'glyphs',
      ink: '#EC9AC8',
      // H1: glyph `s` of arm `a` along its strand is pink when (s + a * stagger) % every is 0, so the pink beads
      // lie on slanting lines across the arms and turn with them; `floor` is the faintest a pink glyph is drawn.
      glyphs: { every: 4, stagger: 1, floor: 0.8 },
      // H2: a ring at `at` of the way from the horizon's edge to the disc's, a glyph every `step` cells.
      ring: { at: 0.5, step: 1.5, glyph: '•', alpha: 0.9 },
      // Where it may stand (src/secretHole.js): its centre `edge` u inside every sector edge (a dead edge's authored places
      // keep 1000, boundary.clear), `gap` u of clear sky between its disc and a planet's orbit, `apart` times its own and
      // another hole's discs between the two, far enough from a station, and from a cache, a signal or a lost cargo, that its
      // pull there is `pull.station` and `pull.reach` of the flown ship's main thrust (the authored places are held to 1 %,
      // checks/planets.mjs; at this hole's mass that is 1790 u, and no sector has a spot so far from all of them), `lane` u
      // from a friendly ship's lane or orbit; and, when it moves, `away` u from the pilot.
      place: { edge: 1100, gap: 300, apart: 2, pull: { station: 0.03, reach: 0.04 }, lane: 400, away: 3000 },
      // When it comes (src/secretHole.js, H3 LURE; SX's pick on labs/graphics/sketches/secret-hole-rules.html, 2026-10-04, after
      // «Постоянно встречаешь розовую секретную черную дыру, надо гораздо реже и придумать интересный алгоритм появления»): to a
      // pilot alone in the void, `void` u clear of every station, planet's orbit and hole's disc for `alone` s, no sooner than `rest`
      // minutes of the pilot's clock after the last meeting; a chance of `chance` every `look` s, and past `pity` minutes without one
      // at the first lonely moment. It opens `ahead` u along the pilot's course, up to `spread` rad either side (off the screen),
      // lives `life` s unseen, and once seen (its middle within `sight` u) stays while the pilot is near, going when the pilot is
      // `rearm` u off. The page's simulated median: one sighting every 22.9 minutes (checks/secret-hole.mjs holds it). `chance` was 0.4
      // in a sector of 7,200 u, where a pilot was seldom alone in the void and the pity set the pace; in sectors twice as wide (chat SC,
      // src/worldScale.js) a pilot is alone most of a flight and 0.4 brought it every 15.4 minutes: 0.03 keeps SX's rhythm (22.5).
      lure: { rest: 14, pity: 22, alone: 5, void: 1000, chance: 0.03, look: 15, life: 180, ahead: [1500, 2600], spread: 0.5, sight: 900, rearm: 3000 },
    },
  },

  gravity: {
    softening: 90,         // avoids the singularity at r -> 0
    maxAccel: 2600,
  },
};
