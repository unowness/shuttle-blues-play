// The flight's numbers that are rules of the session rather than of a hull: the simulation's fixed step, and the ship's (its
// respawn, invulnerability, chips and wreck, its drawn scale, its inks). Moved out of src/config.js as they were (chat F1,
// 2026-10-04, the roadmap's refactoring piece: the flight part of the config in its own file); CONFIG holds each section under its
// old name (CONFIG.ship is FLIGHT.ship, the same object), so every reader is unchanged. How a hull flies (thrust, turn, drag,
// brake, collider) is its chassis's, src/chassis.js, never derived from art. The drift and the trick (chat F1) are added here: the
// game's one of each (the lab's others to compare went once SX had picked, 2026-10-07).

const DEG = Math.PI / 180;

export const FLIGHT = {
  sim: {
    step: 1 / 120,         // fixed physics step, seconds
    maxStepsPerFrame: 8,
  },

  // Flight, weapon and collider numbers live in src/chassis.js, because they
  // decide play and must stay independent of anything presentational. What is
  // left here is session rules and palette.
  ship: {
    respawnDelay: 1.6,
    invulnTime: 2.4,
    // How long a ship that has come back from a wreck cannot be hurt, s, the same for every pilot (PLAN C1, 2026-10-03; it was
    // 2.4 s with reduced motion and 2.4 + the reboot's length without it, because the page added the return's time only when it
    // played it). The 3.925 is `invulnTime` and the return's 1.525 s (labs/graphics/respawn-fx.js respawnLength: the sweep up to
    // the ship's rise and the rise itself), so the ship is still untouchable as it comes up; checks/wreck-respawn.mjs holds the
    // two together. Reduced motion may skip the animation, never the protection. Set by the world (World.step, the respawn).
    respawnInvuln: 3.925,
    // Every `every` hull points lost knock `parts` of the hull's own glyphs off it (src/debris.js chipHull; SX's item 9, 2026-10-04:
    // «при каждом –10 от хп, от корабля гг отлетает от 1-3 деталей от корабля с искрами висят 5 секунд пропадают постепенно»; it was
    // one glyph a pirate's shot, SX 2026-10-01): at the hull's size, nearest the blow, tumbling away at `speed` u/s with `carry` of
    // the ship's way and `push` u/s along the blow's, slowing by `drag` a second so they hang, gone after `life` s and fading over the
    // last `fade` (a third, as a broken body's pieces fade, CONFIG.debris); `sparks` sparks of a rock's bump at the blow. One part for
    // 3 s since SX, 2026-10-05 («детали в космосе должны висеть меньше по времени ... поменьше выбрасывать детали»; 1 to 3 for 5 s,
    // fading over 1.7, until then).
    chip: { every: 10, parts: [1, 1], speed: [60, 150], carry: 0.5, push: 90, drag: 0.9, life: 3, fade: 1, sparks: 5 },
    // A wreck's pieces hang in space (SX, 2026-10-03: «обломки твои которые должны висеть после того как ты врезался в космосе
    // дольше»), as every broken body's do since SX's item 8 (2026-10-04): CONFIG.debris, about 40 s. The ship comes back `near`
    // u off its wreck (SX: «кораблик ... в каком-то радиусе от события в рандомном месте появится»), where its pieces still drift:
    // anywhere in the sector until then.
    wreck: { near: [500, 1200] },
    // Visual scale follows the speed TREND (SX, 2026-09-23): 1.60 by default,
    // easing toward 1.80 while the ship slows and back toward 1.60 while it
    // speeds up (1.5 and 1.4 since 2026-10-05, below: smaller while it slows). SX, 2026-09-30: "когда тормозит 2.0, давай при тормозе сделаем
    // скейл до 1.80" (it was 2.00). Values are for the default model; a model
    // file with its own `scale` gets the same ratio (1.80 / 1.60) applied to
    // that. Presentation only: the collider, muzzle and flight come from the chassis.
    //
    // `deadband` keeps coasting from counting as slowing: drag at full speed
    // is 0.16 x 1000 = 160 u/s^2, inside it, while retro thrust (650),
    // dampers above ~90 u/s, and main thrust (1150) are all well outside.
    visualScale: {
      // 1.6 and 1.8 until SX, 2026-10-02: «Наш корабль-то он один и шесть. Сделай его, кстати, один и пять»; the braking
      // scale kept in the same proportion (1.8 / 1.6 of the cruise).
      // Smaller, not bigger, while it slows since SX, 2026-10-05: «у нас было правило, что при торможении кораблик становится больше,
      // теперь это мешает, пусть он становится слегка меньше при тормозе, и темнее (прям чуть чуть попробуй просто опасити 5% накинуть
      // или 10%»: `slow` 1.7 -> 1.4, and the hull's cells drawn `fade` less opaque at the slow scale, eased with it (src/visualScale.js
      // brakeShade). The renderer keeps alpha in sixteenths: 0.05 shows as one, 0.1 as two.
      // `fade` 0.05 -> 0.2 since SX looked at 0.1 in the lab (2026-10-05: «можно побольше ... еще 10% прибавить»): it shows as three
      // sixteenths (0.8125 of the hull's ink). (The lab's `?brakefade=` to compare others went once SX had picked it, 2026-10-07.)
      cruise: 1.5,
      slow: 1.4,
      fade: 0.2,
      deadband: 250,       // u/s^2 of speed change before the trend counts
      smoothing: 0.15,     // s, low-pass on the measured speed change
      rate: 6,             // 1/s: about 0.5 s to reach the slow scale (2.2 stalled short of it)
    },
    colors: {
      hull: '#e8edf2',
      accent: '#7fd1c8',
      flame: ['#ffd27f', '#ff9d4d', '#e2603a'],
    },
  },

  // The drift (SX's item 10, 2026-10-03: «отдельная механика дрифта ... хочу что-то клевое даже получше чем мариокарт, в целом это
  // должно быть казуально, но эффектно, с дополнительным дымом как скраю экрана, и небольшим ускорением на выходе из дрифта») in
  // grammar D (SX's pick on labs/graphics/sketches/movement-grammar.html, 2026-10-04): Space is the brake; Space and a turn key, in
  // either order (SX, 2026-10-05: «пробел это тормоз, если пробел плюс кнопка направления, это занос по выбранному направлению»),
  // above `start` u/s, a drift to that key's side (a turn input of `turning` or more counts; the pointer's steer with Space only
  // brakes, src/drift.js driftTurn); once begun, Space and the turn key hold it until either is let go or the ship slows under `keep`.
  // The turn key let go with Space still down ends the drift that very step and Space is the ordinary brake (SX, 2026-10-09: «когда
  // мы входим в дрифт, и потом отпускаем А или Д, нужно, чтобы пробел переключался на обычный тормоз ... гораздо больше контроля»;
  // Space alone held a drift, with no brake at all, until 2026-10-09); the key pressed again, above `start`, begins a new drift. A
  // slide past `side` has a side (the camera's lean, the console).
  // The game's drift is G1 GLIDE (SX, 2026-10-06, after flying it: «да по заносу это то что я хотел»), after D2 SKID, D1 SNAP, ARC,
  // KART and the lab's K2, K3, K2R, S2 and K2S (their numbers and SX's words on each: docs/decisions/2026-10.md, 2026-10-04 to
  // 2026-10-06; their code and the lab's `?drift=` to fly them went once he had picked, 2026-10-07).
  //   G1 GLIDE   (SX, after K2S: «...когда корабль входил в дрифт, во-первых, не было вот этого тормоза ... он начинает очень строго в
  //              своей конве двигаться по кругу, и диаметр этого круга не очень понятен ... он должен ощущаться мягче. Мы не в гонке от
  //              третьего лица ... мы сверху смотрим ... скорее просто скользящий, приятный эффект ... И замедляет, и очень строго
  //              держит»): a top-down slide (Micro Machines, GTA 2), src/drift.js stepGlide. No band and no circle: the stick turns the
  //              nose at `steer` times the hull's rate (eased in over `steerIn` s), never more than `maxSlide` off the course; the
  //              course follows the nose with a lag of `lag` s; the speed kept (no scrub, bite, hop or coast drag; the throttle still
  //              pushes along the nose), and a brake's bite in the `refund.window` s before the turn key given back over `refund.time`
  //              s. The charge is the angle the course turned (`tiers`, rad: the notch's scale). Let go: the course caught `caught` of
  //              the way onto the nose over `exit` s from the glide's own turn (a grip that fades, at most `catchMost` 1/s), no push, no
  //              reflex. No brake's look or hiss (`surf`).
  // The way out is every drift's (src/drift.js endDrift, stepDriftPush): a blow of more than `blow` u/s in a step ends it where it is,
  // so a bounce off a rock is never turned back into it. Its push (`boost` by tier, `flat`: the tier's whatever the drift cost; `back`)
  // and the tail's counter-flick (`reflex`, over `reflexSpan` of the way out) were the earlier drifts' and are none in G1. PRO
  // (GAMEPLAY, `pro`): each tier opens a window of `gate` s; let go in it for the whole push, `link` more for each link of the combo
  // (a new drift within `chain` s of a clean exit), up to `links`; outside it `late` of it. G1 pays no push, so that part of PRO
  // changes nothing.
  // NORMAL and PRO (the pause's DRIFT row; SX, 2026-10-07: «режим про пусть будет таким же а не про наоборот помягче вход и выход из
  // дрифта, побольше контроля в дрифте, чтобы поменьше было столкновений», then «в нормальном дрифте еще не ускоряй так сильно
  // корабль при дрифте можно чуть чуть»): PRO flies G1 as it is; NORMAL, the default, flies it with `normal` laid over it
  // (src/drift.js driftPreset). NORMAL's numbers softened on 2026-10-15 (the preset's own note: its course at most 63 deg/s at 999); what
  // follows is as measured on 2026-10-07. Measured at 999 u/s, Space and a turn key held (PRO -> NORMAL): the way in, the stick's extra eased
  // in over 0.35 s, the slide growing at most 179 -> 142 deg/s; inside, the course a 0.35 s lag behind the nose, the stick 1.3 times
  // the hull's and the slide at most 60 deg: 90 deg of turn in 1.23 -> 0.83 s, the arc's radius 649 -> 394 u, the slide 61 -> 50 deg;
  // the way out over 0.7 s catching 0.9 of the lag: the course 15 -> 2 deg off where the nose was let go, the course's turn at most
  // 1.63 -> 1.13 times its turn at the let-go; the throttle's gain in a drift a tenth (`throttle`): 2 s held from 600 u/s with W,
  // +361 -> +116 u/s (none without W, as before). In J-05's field by YARD 3, a rock seen 0.5-1 s ahead and drifted round (a
  // scratch sim, 720 paired runs): 62 -> 42 % of the runs hit a rock, hull lost 44 % less (docs/decisions/2026-10.md).
  // Then, in both, never more than flying straight would gain from the same speed (src/drift.js stepGlide; SX, the same day, with
  // A1's push: «особенно чтобы дрифт не выкручивал быстро скорость в максимальную»): the glide cancels the coast's drag, so the
  // push gained undragged and a drift reached the top first. On A1's push, 2 s held from 600 u/s with W: PRO +361 -> +324, NORMAL
  // +101, straight flight +327; from 850 PRO +141 -> +115 (straight +115), the top in 1.2 -> 3.6 s (straight 3.6), never past it
  // (1,000.3 before); NORMAL's tenth is under the cap but for the last few u/s.
  drift: {
    start: 300,
    keep: 150,
    turning: 0.25,          // a turn input this strong counts as turning (the keys give 1, the pointer's steer less)
    side: 20 * DEG,         // a slide past this has a side (the camera's lean, the console; PRO's links)
    blow: 60,               // u/s of change in one step that only a blow gives (the throttle gives 6.5): it ends the way out
    reflexSpan: [0.55, 1.45], // the reflex's time in the way out, in `exit`s: most at the catch's end, gone 0.45 of it after
    pro: { gate: 0.35, link: 0.25, late: 0.5, chain: 0.6, links: 4 },
    presets: {
      G1: { code: 'G1', name: 'GLIDE', kind: 'glide', steer: 1.2, steerIn: 0.2, maxSlide: 70 * DEG, lag: 0.7,
        refund: { window: 0.12, time: 0.15 }, tiers: [25 * DEG, 50 * DEG, 80 * DEG], boost: [0, 0, 0, 0], flat: true, back: 0,
        exit: 0.5, caught: 0.7, catchMost: 4, reflex: 0, surf: true, throttle: 1,
        // NORMAL softened (SX, 2026-10-15: «нажимаешь дрифт, и тебя как-то резко кидает с инерции, сворачивает. Очень быстро, очень
        // неожиданно. Не ощущается, как тягучий дрифт ... мега ускорение ... И тормозить не надо, просто это должен быть такой плавный
        // угол ... перебор какой-то есть в кривой»): it was steer 1.3, steerIn 0.35, maxSlide 60 deg, lag 0.35, exit 0.7, caught 0.9, the
        // course turning 145 deg/s at any speed, 2,500 u/s² across the way at 999 (twice the hull's own thrust), 90 deg in 0.83 s, a
        // spike of 2,900 at the let-go. Now, measured at 999 (Space and a turn key held 2.2 s): the course at most 63 deg/s, about
        // 1,100 u/s² across the way (the hull's thrust), 90 deg in 1.7 s, the nose up to 47 deg off the course, no spike at the let-go
        // (1,040); at 600 two thirds of that. The speed is kept as before (no brake). Then halfway between the two (SX, 2026-10-16, after
        // flying it: «сейчас неплохо но ... я хочу как будто ровно между этими двумя состояниями Сейчас немного мало влево уходит»): every
        // number the middle of the two, the course at most 95 deg/s at 999, about 1,650 u/s² across the way, 90 deg in 1.22 s (0.83 and
        // 1.68 the two), the nose up to 50 deg off, 1,635 at the let-go (no spike over the turn itself).
        normal: { steer: 1.15, steerIn: 0.42, maxSlide: 55 * DEG, lag: 0.55, exit: 0.85, caught: 0.75, throttle: 0.1 } },
    },
  },

  // The trick (SX's item 11: «скачок вверх с кувырками типа флип, 360, просто прыжок ... корабль наверху только пока скорость
  // позволяет и пока держат кнопку прыжка ... после приземления возвращаться к такой скорости что и была до прыжка») in grammar D:
  // Q or E jumps (the first pressed) and, held, hangs, at most `perSpeed` s for every u/s of the speed at the press, between `hang`; the
  // other key in the air plays, turned to its side (SX, 2026-10-05), the next figure of a sequence drawn ahead from the world's seed by
  // `weights` (`repeat` the share of its weight a figure keeps for
  // the draw after it: 1 pure weights, less shuns a repeat), each `figure` times its base length (FIGURES in src/trick.js); none is
  // a plain jump. A figure starts when it is asked in the scale's green (J2's `scale` below), while the key that jumped still holds it
  // up, and only when the air left (the hang's end, then the fall) takes it at its own pace; else the soft abort (`abort`). A landing
  // never cuts one short.
  // At the top the speed is `top` more, following the height; after the contact it is taken back off
  // over `motion.settle` s. In the air the course is held: no steering, brake, throttle, fire or pick-up; rocks, droids, stations,
  // pirates and their shots, the NPC ships and the cargo's blows are passed over; a planet is a sphere the ship bounces off like a
  // pinball at any speed, with no harm and no gain (`bounce` the restitution, at most 1; SX, 2026-10-03). A landing is clean unless it
  // was let go in the scale's red or held to the hang's end; then the ship drops hard and the hull is jolted (`wobble`, the orbit's
  // weak grip) for half a second, no hull lost.
  // The height's motion is J1 SMOOTH UP, FIRM DOWN (SX's pick, docs/plans/2026-10-04-jump-motion.md), the same in every preset: a
  // `push` s squash overlapping a `rise` s ease-out cubic rise; a `fall` s ease-in cubic fall; the contact one frame, the impact's
  // squash held `impact.hold` s and back over `impact.back` s with no bounce. A tap is a hop: the rise, then the fall.
  // The game's jump is J2 (SX, 2026-10-06, after flying it), after T2, the M0 page's (the game's from 2026-10-04: a figure only at the
  // top, its scale's let-go green and the 80 ms after a figure's end landing it clean), and the lab's T1 and T3 beside it; their
  // numbers in docs/decisions/2026-10.md, their presets and the lab's `?trick=` and `?jump=` gone once SX had picked, 2026-10-07.
  trick: {
    motion: {
      rise: 0.3, fall: 0.17, push: 0.06, settle: 0.3, buffer: 0.15,
      impact: { across: 0.06, along: 0.036, hold: 0.033, back: 0.09 },
    },
    // The scale's red in the helmet's notch (S8 V1+, SX's pick 2026-10-04 on labs/graphics/sketches/helmet-top.html: «провал только
    // последние два квадрата»): the last two of its 30 cells, the drift's scale's (labs/graphics/stunt-fx.js driftZones). The jump's
    // own scale is J2's (its preset's `scale`); T2's trick green and let-go green went with it.
    scale: { red: 2 / 30 },
    bounce: 1,
    // The share of the hull's coast drag (src/chassis.js `drag`) the jump's own speed keeps losing up there (SX's chained-jump
    // question, F1 2026-10-04): 0 held the speed of the press to the contact, so a chain of jumps flew on for free, faster than the
    // throttle; 1 loses it as a coasting ship does, the top's lift riding on it.
    airDrag: 1,
    wobble: 0.85,
    swing: { angle: 35 * DEG, stiffness: 320, damping: 14 },
    // The figures' motion, SX's pick of T1 SLOW on labs/graphics/sketches/trick-readable.html (2026-10-05: «T1 SLOW Берем вот этот
    // вариант ... нужно его прям блин чуть-чуть ... побыстрее»): each figure `pace` times as long as it was that morning (the page's
    // T1 was 1.5; 1.3 until SX flew the lab's `?figure=1.2 | 1.3 | 1.5` on 2026-10-15: «по трюку нравится третий вариант 1,5»; the switch
    // went with his pick; 1.2 since MODERN, the larger hull, turned too slowly: SX, 2026-10-16, «скорость трюка должна быть побольше.
    // Сейчас 1.5 ... смело, наверное, 1.2 возвращать ... хочется хлесткости добавить обратно трюку»; 1.3 since he flew it, 2026-10-17:
    // «скорость анимации трюка 1.3 можно поставить. Сейчас немножко быстровато»), its turn at an even speed, eased in
    // over the first `ease` of its length
    // and out over the last (src/trick.js figureTurn), never past its end and back (the back-out it had did 95 % of the turn in the
    // first 37 % of the figure and then rocked); the hull drawn in every frame (the blink at a figure's start is gone); a PLAIN tips
    // the hull `tip` (17 degrees until then: hardly seen).
    figures: { pace: 1.3, ease: 0.12, tip: 30 * DEG },
    // The soft abort (SX, 2026-10-05: «превентивное аккуратное завершение трюка если ты сделал его на не очень большой высоте ... как
    // будто бы пробел нажали в воздухе, чтобы он чуть-чуть занес угол, но не стал ничего делать»): a figure asked with too little air
    // for it plays nothing; the hull swings `angle` to the key's side, out over `out` s on an ease-out and back over `back` s on an
    // ease-in-out, no overshoot, on through the contact if it comes meanwhile (a third of Space's swing above).
    abort: { angle: 12 * DEG, out: 0.12, back: 0.3 },
    // `perSpeed` half as long again since the top speeds went to two thirds (src/chassis.js, 2026-10-04): the same hang at the same
    // share of the top (T2's longest from 1,320 u/s to 880).
    presets: {
      // J2 (SX, 2026-10-06: «по прыжкам сделай тайминги какие-ото более узкии, в том плане что корабль очень долго в воздухе может
      // висеть и плоска индикатора там тоже зеленые области неинтересно расположены»): T2's jump, its hang 36 % shorter (`perSpeed`
      // 1/400 -> 1/625, the longest 2.2 -> 1.4 s: at 800 u/s 2.0 -> 1.28 s), and the scale's one green (src/trick.js lateZones):
      // `window` s on the hang's middle where a figure plays, yellow after it, the red the last `red` of the hang, a let-go there
      // dropping the ship hard, `drop` of its speed off.
      // The game's since SX flew it (2026-10-06: «так по шкале, момент для трюка нужно расширить и влево и вправо, желтуй короче
      // делать»): the green 0.25 -> 0.5 s on the hang's middle (at 900 u/s 0.57-0.82 -> 0.45-0.95 s), the yellow shorter by as much
      // (0.41 -> 0.28 s), the red as it was. A figure from `scale.from` s after the take-off (SX, that evening: «трюк можно было
      // сделать почти сразу после прыжка, иначе неинтересно ощущается»; it waited for the rise's end, 0.3 s, and the green began at
      // 0.45 s): the green 0.10-0.95 s, the yellow and the red as they were.
      // The time in the air shorter (SX, 2026-10-07: «возмоность лететь в прыжке я бы сделал покороче»), then, told that 1.05 s left no
      // room for two figures (FLIP 0.54 + SPIN 0.58 s from 0.1 s after the take-off: 1.22 s), «давай тогда под 1.20 подгоним, до ближайшей
      // в большую сторону»: the longest hang 1.4 -> 1.25 s, `perSpeed` 1/625 -> 1/795 (at 999 u/s 1.25 s, at 800 1.28 -> 1.01 s, at 600
      // 0.96 -> 0.75 s); the scale's zones as they were.
      J2: { code: 'J2', name: 'SHORT', perSpeed: 1 / 795, hang: [0.3, 1.25], top: 0.08, figure: 0.75,
        weights: { FLIP: 3, SPIN: 3, ROLL: 2, PLAIN: 2 }, repeat: 0.5, scale: { window: 0.5, from: 0.1, red: 0.12, drop: 0.1 } },
    },
  },

  // The warning before a heavy hit (SX's 3B on economy-decisions.html, 2026-10-04: the novice's losses are damage, not pay, so «a
  // clear warning before a heavy hit»; src/hitWarning.js). The ship's way is flown ahead as it would coast (or brake, while the
  // brake is held), gravity and a planet's orbit and all, for at most `most` s in steps of `step` s; the first rock, station or
  // planet's surface it would meet is weighed by the hull's own rule (World.impactDamage). It is heavy at `heavy` points or more,
  // or when it would wreck the ship. It is said as soon as braking could still take the blow under heavy: `react` s for the hand,
  // and the time the brake (the chassis' damperDrag) needs to bring the closing speed down to where it costs less than `heavy`.
  // `heavy` a third lower with the hull's bases (15 until 2026-10-05, CONFIG.hull.base): said at the speeds it was said at. Kept at 10 points,
  // a tenth of the hull, through the cube of 2026-10-08 (CONFIG.hull): the warning solves the hull's own rule for it (hitWarning.js safeSpeed), so
  // a rock is now said from 468 u/s of closing (583 before), a station's body from 635 (985), an NPC ship from 440.
  // SX to say if it is said too often in a dense field: 15 would put a rock back at 540.
  warn: { heavy: 10, react: 0.5, most: 1.6, step: 1 / 30 },
};
