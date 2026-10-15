// The boss TOLLKEEPER's numbers and drawing (chat 6 of docs/plans/2026-10-13-next-chats.md, step 2): the pirates' tug after the last
// restoration, a core towing two gun sleds on tethers, launching its escort out of a bay. Held in CONFIG as CONFIG.boss. The rules are
// src/boss.js (its fight) and its drawing labs/graphics/boss-art.js; the prototype it grew from, with what each number did to a pilot, is
// labs/graphics/sketches/boss-arena.js (reports/2026-10-14-boss-first-patterns.md).
//
// SX's picks (2026-10-14, docs/decisions/2026-10.md, the last entry): the body B1C TWIN CAPSTAN in Q7C SALVAGE, its escort in ASH; «A1 A4 A9»:
// the aimed burst and the spiral, the launch (the brief's), under a third the rage with the charge; the sleds «S2 По своим часам» at
// «X1C Поток», «Да, отстреливаются»; «E2 DART ×3»; «M1 Держит дистанцию»; «Босс должен быть сложный»; its health read from its coming
// apart, as a station's, «номер фазы тоже не нужно». The wine of Q7C is W1 (#A15863, Codex's #AD6374 moved so that no NPC palette changes).
//
// The body is a record of its own, in world units: measured once from the art at the game's cell (9 x 15 u, times the pirates' scale
// 1.5) and kept as numbers, never read from the drawing (src/chassis.js's rule for every hull). A part's local frame has x to the right and
// y toward the stern, the nose up, as the art is drawn.

export const BOSS = {
  boss: {
    label: 'TOLLKEEPER',
    // The core's hit points: a pilot's shot takes one (a chassis's `gun` more, as from a pirate). The sleds have their own. 160 until SX
    // flew it (2026-10-15, FC5: «может на 10% хп срезать»).
    hp: 144,
    // A hit flashes the core or a sled white as a pirate flashes (CONFIG.pirates.flash), at most once in `flashEvery` s: the STANDARD
    // fires seven times a second, and a boss flashed at each hit is white all the time, read as its warning.
    flashEvery: 0.6,
    // Its drawing's scale, the pirates' 1.5 times 1.12 (SX, 2026-10-14: «босса сделай по сетке немного крупнее, то есть аккуратно заскейль его
    // процентов на 10-15»); its body below grew with it, every length times 1.12.
    scale: 1.68,
    body: {
      core: { radius: 96, maxSpeed: 230, accel: 170, turnRate: 0.7, drag: 0.12 },
      sled: { radius: 45, hp: 8, rest: { x: 156, y: 145 }, hook: { x: 76, y: 50 }, tether: 123, stiffness: 8, damping: 3.2 },
      // The sleds move as arms (SX: «они не должны просто так висеть, они двигаются как руки»): each swings round its hook on its tether,
      // `sway` rad at `rate` rad/s, the two half a turn apart; reaching forward `reach` rad while the core aims, spread aside `spread` rad
      // while they spin their spiral.
      arms: { sway: 0.35, rate: 0.9, reach: 0.7, spread: -0.55 },
      // Where its shots leave and its escort comes out, local u.
      muzzles: { shoulders: [{ x: -45, y: -50 }, { x: 45, y: -50 }], middle: { x: 0, y: 0 }, bay: { x: 0, y: 81 } },
      // A touch costs the pilot a ram's price (CONFIG.hull: the pirates' heavy contact) and pushes the hull off at `push` u/s.
      ram: { damage: 25, push: 220 },
    },
    // M1: it holds `range` from the pilot, sliding to and fro across the line between them by up to `slide` u, the line turning at
    // `level` rad/s to `tilt` rad above the level (it fights beside the pilot and a little above it: the 1280 x 960 view is wide and low,
    // and the cockpit is below).
    hold: { range: 560, slide: 120, rate: 0.35, gain: 0.9, level: 0.5, tilt: 0.3 },
    // It starts a pattern only this near the pilot (inside a 1280 x 960 view): Sinistar's warriors fire only on the screen.
    reach: 900,
    // Its quest (src/bossQuest.js): the smoke's square `arena` u a side (SX: «ограничивая 1/4 сектора в квадрат», «Четверть стороны»: a
    // quarter of the sector's 10,800), placed `margin` u clear of everything round it and of the sector's edge; the boss wakes when the
    // pilot comes within `wake` u of its mark (inside the square), its sleds folding in for `entrance` s; the smoke is the world's fog, its
    // rope throwing a hull back (a dive at full speed goes some 400 u in: `margin` keeps that clear too), `backstop` u past its line the
    // backstop behind the rope; beaten, its pieces fly `gone` s before it is gone.
    // It lies at its mark, waiting, from `seen` u off (drifting, its arms swaying, no gun); it reacts when the pilot comes within `wake` u
    // (inside the square) or hits it, and only then the smoke closes (SX: «Зона ограничевается как только с боссом начинается схватка, то
    // есть он реагирует»).
    quest: { arena: 2700, margin: 650, seen: 3400, wake: 1100, entrance: 2.5, backstop: 600, gone: 6 },
    // The NPC ships that watch its fight from the smoke's edges (SX: «нпс пусть нервно у краев стоят и суетятся говорят фразочки типо
    // "behind you!"»): `count` of them, each `out` u past a side, fussing within `fuss` u of its place at up to `speed` u/s, a new spot every
    // `every` s; one of them calls a line every `say` s; their lines by what is going on.
    crowd: { count: 5, out: [60, 200], fuss: 90, speed: 260, every: [0.5, 1.3], say: [2.5, 5],
      lines: {
        any: ['BEHIND YOU!', 'LOOK OUT!', 'WATCH THE SLEDS!', 'KEEP MOVING!', 'HIT THE CORE!', 'IT\'S TURNING!', 'GET OUT OF THERE!', 'YOU GOT THIS!'],
        launch: ['MORE OF THEM!', 'THE BAY\'S OPEN!', 'FIGHTERS!'],
        sled: ['ONE ARM DOWN!', 'TAKE THE OTHER!'],
        rage: ['IT\'S MAD NOW!', 'CAREFUL!'],
        won: ['YOU DID IT!', 'IT\'S DOWN!', 'THE ROUTES ARE OURS!'],
      } },
    // The camera in its fight (src/worldDraw.js updateCamera): it leans toward the boss by `lean` of the way, at most `max` u, while the
    // boss is within `far` (at its range it would stand at the edge of a 1280 x 960 view; the sheet's camera, measured there).
    camera: { lean: 1 / 3, max: 260, far: 1600 },
    // Its shots: a pirate's bolt, slower; what one costs the pilot's hull, and a pirate it meets on its way (a DART has 5: two flash it,
    // the third breaks it).
    shot: { damage: 10, onPirates: 2 },
    // The patterns: each warned for `prepare` s (its cells in the warning white), worked for `commit` s (the guns' orange), then `recover`
    // s of rest (the resting gray, the pirates' dot), src/pirateAttacks.js's three steps. The rests are about 15 % longer than the first
    // tuning's (SX, 2026-10-15, FC5: «чуть чуть длинее паузы между атаками»): aimed 1.8, spiral 2.2, launch 1.6, charge 2.6 until then.
    patterns: {
      // The core's central guns, a little less often than the sheet's (SX: «пусть он сам из своих центральных пушек попадает чуть реже»):
      // two pairs, not three.
      aimed: { prepare: 0.9, commit: 0.75, recover: 2.1, cue: 'shoulders', shots: 2, every: 0.34, speed: 520, life: 2.2 },
      // The circular attack comes out of the sleds, `arms` streams from each (SX: «а круговые атаки происходят из боковых»); a sled shot off
      // takes its streams with it.
      spiral: { prepare: 1.0, commit: 3.4, recover: 2.5, cue: 'sleds', arms: 2, spin: 0.75, every: 0.3, speed: 330, life: 2.6 },
      // The sleds' streams (S2, X1C), each live sled's gun at once: warned on the gun, `sledGun.shots` at where the pilot is. Their own
      // clocks until SX flew it (SX, 2026-10-15, FC5: «пусть порядок атак будет структуированым»): a slot of the turn now, so one attack
      // flies at a time and every one is followed by its rest.
      stream: { prepare: 0.8, commit: 0.6, recover: 2.0, cue: 'sleds' },
      // Now and then (CONFIG.boss.escort: `below`, `apart`); at most `slots` of it attack at once (the pirates' own pressure slots).
      launch: { prepare: 1.3, commit: 1.0, recover: 1.8, cue: 'bay', every: 0.35, out: 260 },
      charge: { prepare: 1.1, commit: 1.1, recover: 3.0, cue: 'drives', speed: 760, push: 1400, lane: 900, lockTurn: 1.3 },
    },
    // What it does in turn, by the share of its hit points left (highest first): under a third, the rage. The turn is a fixed order, one
    // attack at a time (SX, 2026-10-15: «пусть порядок атак будет структуированым»): a launch it cannot make is an aimed burst in its place,
    // so the order never shifts. Until then the sleds fired on their own clocks over it, and a launch put off moved the turn on.
    phases: [
      { from: 1, script: ['aimed', 'stream', 'spiral', 'stream', 'launch'] },
      { from: 1 / 3, script: ['aimed', 'stream', 'charge', 'spiral', 'stream', 'launch'], rage: true },
    ],
    // Both sleds shot off: its own turn, whatever its phase, charging every other attack in long dashes from farther off instead of shoving
    // close (SX, 2026-10-15: «пусть он когда без саней остается начинает чаще таранить длинными выбросами а не запинывать впритык»). It holds
    // `range` u off (the hold's 560 else), a charge's commit is `commit` s (1.1 else: some 1,200 u of dash against 630), its warned line `lane`.
    bare: { script: ['charge', 'aimed', 'charge', 'launch'], range: 820, commit: 1.8, lane: 1500 },
    // The rage: warnings and rests this much as long, shots this much faster.
    rage: { prepare: 0.8, recover: 0.6, speed: 1.1 },
    // The sleds' guns, a stream (X1C) in the turn's `stream` slot: `shots` at where the pilot is, `every` s apart. Six until SX flew it
    // (2026-10-15: «чуть нужно его очереди уменьшить»), each sled on its own clock (S2) with a 0.8 s warning and a 2.2 s rest.
    sledGun: { shots: 4, every: 0.14, speed: 520, life: 2.2, turn: 1.4, muzzle: 30 },
    // Its escort: three DARTs a launch, at most `cap` alive.
    // «иногда»: a launch only once the last escort is all down (`below` 0), `apart` s after the last. (18 s and one still out until
    // 2026-10-14's fight sim: three DARTs a launch then cost the pilot as much as an ordinary squad of three, about 40 of 100 hull by
    // tools/pirate-sim.mjs's own fighting pilot, every 18 s.)
    escort: {
      types: ['dart', 'dart', 'dart'], cap: 4, below: 0, apart: 30, slots: 2,
      // Codex's Q7 ASH: only the boss's escort wears it, never a squad of its own (src/pirates.js piratePaint finds it; pickPaint never).
      paint: { id: 'ash', label: 'ASH', hull: '#737F83', trim: '#5E6B73', mark: '#E4D6C0', drive: '#BAC6CE' },
    },
    // The drawing (labs/graphics/sketches/pirate-paints-boss.js, B1C TWIN CAPSTAN with Q7C SALVAGE's mask): glyphs nose up at the
    // pirates' scale, each cell's role in `parts` (h hull, t trim, m mark, e drive, g gun, and Q7C's a pale steel, b warm replacement
    // steel, r wine), the inks in `palette`.
    art: {
      core: { art: ['  ◢▲◣   ◢▲◣  ', '◢▐▌▐▌━━━▐▌▐▌◣', '[▐▌▲▐▌│▐▌▲▐▌]', '┌━[╋]━┴━[╋]━┐', '└┐ ▴     ▴ ┌┘'],
        parts: ['  aam   hhh  ', 'aaaaabbthhhhh', 'taaaabthhhbht', 'aabmbtrtthttt', 'ab e     e tt'] },
      sled: { art: ['  ╿  ', '[▐▲▌]', '▐▌┼▐▌', '◥━┴━◤'], parts: ['  g  ', 'taamh', 'aatbh', 'abttt'] },
      palette: { h: '#737F83', t: '#5E6B73', m: '#E4D6C0', e: '#BAC6CE', a: '#A7B1B6', b: '#9B968B', r: '#A15863' },
      // The core's cells each warning lights (row, column).
      cues: {
        shoulders: [[0, 3], [0, 9]],
        middle: [[1, 6], [2, 6], [2, 3], [2, 9], [3, 6]],
        bay: [[3, 5], [3, 6], [3, 7]],
        drives: [[4, 3], [4, 9]],
      },
    },
  },
};
