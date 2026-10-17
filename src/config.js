// Single source of tunables. Nothing here is referenced by more than one name.
//
// The themes that grew large live in files of their own and come back into CONFIG under their old names, each the same object, so
// every reader still writes CONFIG.x.y (PLAN D5): the economy (src/economyConfig.js), the flight (src/flightConfig.js), the pirates
// (src/piratesConfig.js), the quests and the caches (src/questsConfig.js), the bodies (src/bodiesConfig.js) and the friendly craft
// with the droids (src/trafficConfig.js). A pointer comment stands where each section was. What is written here is the core.

import { BODIES } from './bodiesConfig.js';
import { ECONOMY } from './economyConfig.js';
import { FLIGHT } from './flightConfig.js';
import { PIRATES } from './piratesConfig.js';
import { BOSS } from './bossConfig.js';
import { QUESTS } from './questsConfig.js';
import { TRAFFIC } from './trafficConfig.js';
import { PALETTE } from './palette.js';
import { PIRATE_CUES } from './pirateCombatTheme.js';
import { PIRATE_ATTACKS } from './pirateAttackConfig.js';
import { GROUND } from './groundConfig.js';
import { MAP_PLACEMENT } from './mapContentConfig.js';

// The camera's height over the world (src/zoom.js; SX, 2026-10-17: «нам надо не уменьшать, не изменять размер мира и элементов. Нам надо
// просто как бы камеру чуть повыше взять, чтобы чуть-чуть побольше в экран помещался»; «в идеале было бы прикольно на плюс-минус дать
// пользователю выбирать масштаб»; his pick the same day: three steps, 90 % unless the pilot chooses). `steps` the screen px a world unit is
// drawn at, from the lowest camera to the highest, chosen on − and = and in the pause's GRAPHICS; `start` a browser's with none kept.
// How far from the ship the world is out of sight at the highest (UNSEEN): the widest window's half diagonal (2560 x 1600, 1,509 px) seen
// from it, the camera's lead (CONFIG.camera.leadMax) and a big rock's 130 u; rocks laid or put back come no nearer (`sector.spawnClear`,
// src/field.js refillClear). 1,300 and 1,900 until then, for the camera at 1.
const ZOOM = Object.freeze({ steps: Object.freeze([1, 0.9, 5 / 6]), start: 0.9 });
const UNSEEN = Math.ceil((Math.hypot(2560, 1600) / 2 / Math.min(...ZOOM.steps) + 220 + 130) / 100) * 100;

export const CONFIG = {
  pirateAttacks: PIRATE_ATTACKS,
  pirateCues: PIRATE_CUES,
  // The one plane's contact pass (src/groundPlane.js) and the NPC fleet's journeys (src/groundConfig.js).
  ground: GROUND,
  // How hard Map X's placement preferences try their areas before the ordinary search (src/mapContentConfig.js).
  mapPlacement: MAP_PLACEMENT,
  // The smoke's ink and strength, one place for the clouds (src/clouds.js, src/cloudDraw.js) and the fog past a dead edge (src/worldDraw.js
  // drawDeadEdges), so the two stay one substance. SX's K4 HEATHER at V1 FAINT on labs/graphics/sketches/space-tones.html (2026-10-04,
  // «R1 K4 V1 E1», after «у них ... должен быть другой оттенок не такой как у астероидов ... розово фиолетовый, не сильно заметный»),
  // and then the fog in it too (SX, the same evening: «Да дым перекрась тоже за границей ... Сиреневый, как облака»; it was the
  // cockpit's blue, PALETTE.blue, its outline at 0.7 and its '░' at 0.5). `ink` a cool lilac, OKLCH 0.60, chroma 0.07, hue 285;
  // `shade` the '░' step's strength, the whole of a cloud and of the fog; `edge` the outline where the smoke has one: the fog's front
  // (a cloud has none since SX's «дым брали без контура», 2026-10-04). The fog's went on 2026-10-07 in the morning («контур у внешнего
  // дыма тоже убери»), came back that evening with three contours inside it («верни контур ... в глубине дыма просто рисуй еще несколько
  // контуров»), and since 2026-10-08 is the front's alone («Нарисовать один контур только внешний, в глубине простая заливка ...
  // максимально экономно ... это условность не должна забирать ресурсы»).
  smoke: { ink: '#7B7BA9', shade: 0.28, edge: 0.35 },

  render: {
    fontSize: 15,          // px; cell width is measured from the font, height is derived
    // cellH = fontSize * lineRatio. 1.0 is deliberate: block and quadrant
    // glyphs are exactly one em tall in a monospace face, so at 1.0 they tile
    // with no seam. A terminal-like 1.18 leaves a visible gap between rows.
    lineRatio: 1.0,
    background: '#000000',
    maxDpr: 2,
    defaultShipScale: 1.5,  // applied only when the model file has no "scale" (1.6 until SX, 2026-10-02: «Сделай его ... один и пять»)
  },

  // Safe flight area and instrument footprints; the world draws full bleed.
  //
  // Doc 06 confirms the direction: most of the screen is the world, an
  // instrument area sits under it, and a narrow strip above it carries
  // collectible cards. The proportions are adjustable and deliberately live
  // here rather than in the drawing code.
  //
  // The pixel floors are not decoration. Below `cockpitMin` the instrument
  // rows stop fitting; below `worldMin` there is not enough sky left to fly
  // in. On a short window the world keeps its height and the bands give way,
  // because a cramped panel is survivable and a cramped sky is not.
  view: {
    topStripRatio: 0.07,
    cockpitRatio: 0.23,
    topStripMin: 60,
    topStripMax: 60,
    // 197 since 2026-10-01 (was 195): the THR and SPD gauges grew to a 112 px rail (SX:
    // «хотя бы до 112», labs/graphics/hud-layout.js GAUGE_RAIL) and stand 195.4 px tall.
    cockpitMin: 197,
    cockpitCompactMin: 120,
    cockpitMax: 260,
    worldMin: 260,
    // How far below the middle of the sky the camera holds the ship, px: half its drawn hull (3 rows of 24 px at the
    // standard ship's 1.6), SX, 2026-10-01: «отцентруй корабль на экране на пол корпуса вниз, он сейчас задран». The
    // cockpit below is taller than the strip above, so the sky's middle stood 80 px over the screen's at 1280x960.
    // Never more than a tenth of the sky's height (Renderer.layout).
    shipDrop: 36,
    // Since 2026-10-02 (Renderer.layout) the ship stands this share of the way from the screen's top to the top of the
    // helm's grip: 0.52, a little under the middle, the bottom's instruments being the heavier (at 1512 x 982: 424 px,
    // the grip's top at 815; it was 444). `shipDrop` stays for a cockpit without a helm.
    shipCentre: 0.52,
    // Under the MODERN interface (labs/graphics/hud-modern.js), which has no helm and whose two notches mirror each other, the ship
    // stands this share of the way down the screen (Renderer.layout, the page's `shipMiddleOf`): its middle (SX, 2026-10-17: «Насколько он
    // выше относительно центра экрана? Мне кажется, его стоит ставить чуть поближе к центру экрана. По вертикали»; it stood 0.52 of the
    // way to LEGACY's grip, drawn or not: 72 px over the middle at 1440 x 900).
    modernMiddle: 0.5,
    panel: '#000000',
    // How much of the light the screen behind an open panel keeps: the world and
    // the cockpit under the pilot card, the hangar, a sign, the controls (SX,
    // 2026-09-30: «Давай затемнять основной экран на 50% когда поп-апы открыты»).
    underPanel: 0.5,
  },

  // The playfield. `topology` is 'plane' for exploration, where edges lead to
  // neighbouring sectors, or 'wrap' for the original toroidal arena kept for
  // duels and the development sandbox. Size comes from the sector catalogue: the layout's sector, WORLD_SCALE times
  // (src/worldScale.js).
  world: {
    topology: 'plane',
  },

  sector: {
    // Seamless crossings (SX, 2026-09-24: "the picture blinks"). A ship keeps
    // its exact place across a seam: the old fixed 90 u entry inset jumped
    // every body on screen by 90 px. Instead the switch waits until the ship
    // is `seamSlack` u past the line, so skimming along it cannot flip
    // sectors back and forth. Rocks within `carryRange` of the ship, shots,
    // sparks and loose coins cross with it; objects past a live seam live on
    // for `neighbourStrip` u, where the next sector is drawn; a fresh field
    // tops up at least `spawnClear` u away, off screen (UNSEEN above: the highest camera's sight).
    seamSlack: 80,
    carryRange: 2200,
    neighbourStrip: 2400,
    spawnClear: UNSEEN,
    // The seam itself: a faint dashed line with a slow light running along
    // it, and the next sector's name beside it once the ship is within
    // `labelRange` u.
    seam: {
      color: '#8a93a0',
      alpha: 0.1,
      pulse: 0.18,
      wave: 240,           // u per radian of the running light
      speed: 0.7,          // rad/s
      labelRange: 1500,
    },
    bannerTime: 2.6,

    // An edge with no sector beyond it. It used to be an invisible line that
    // teleported the ship 90 units back, then (2026-09-23) a current in the last
    // 1000 u before it that slowed a ship before the line. Since 2026-10-02 (SX:
    // «после края карты должен какой-то постепенный туман начинаться, и ты можешь
    // залететь за линию (линия такая же как и линия между секторами, но там туман и
    // ты прорываешься через него, но потом тебя как резинкой обратно отталкивает, как
    // будто это резинка ринга, но должен быть эластичный достаточно быстрый и не
    // надоедливый эффект»): the sector is open to its very line, drawn as a seam is;
    // past it lies fog, and a rope. A ship that goes in is pulled back by a spring,
    // `rope` its stiffness (a = rope^2 x depth, stiffening with the square past
    // `stiffen`), its outward speed damped by `dampOut` a second while it sinks in
    // and its speed back by `dampBack`: a rope that gives and then throws back. Only
    // the part of the velocity across the line is touched; along it, nothing.
    //
    // Measured (scratch sim, 2026-10-02, the ship's own drag and thrust):
    //   coasting in at 1500 u/s  -> 394 u deep, out again in 1.05 s at 920 u/s
    //   coasting in at 400 u/s   -> 110 u deep, out in 1.15 s at 240 u/s
    //   full thrust from the line -> holds about 175 u deep
    //   full thrust at 1500 u/s  -> 490 u deep at most
    // `limit` is the backstop no flight reaches, and how far past the line things
    // (rocks, coins, pirates) live before they are gone; the fog is drawn to it.
    // A dive deeper than `soundDepth` plays the rope's sound once, as it throws back
    // (the old «NO SECTOR BEYOND» notice is gone with the wall it announced).
    // `clear` keeps authored places (caches, lost cargo, signs) that far inside a
    // dead edge, as the current's depth did.
    boundary: {
      rope: 2.6,           // 1/s
      stiffen: 700,        // u
      dampOut: 1.1,        // per second, outward speed while sinking in
      dampBack: 0.35,      // per second, speed on the way back
      limit: 1200,         // u past the line
      soundDepth: 120,     // u
      clear: 1000,         // u inside a dead edge
      // The fog (World.drawDeadEdges): shade glyphs in the seam's grey on the world's cells, `start` u past the line
      // the first, as thick as it gets at `full`; a slow drift of `drift` u/s through a noise `grain` u across, and
      // the ship's way through it (`cone`, `jet` below).
      // Its own slate once; the line a dot every `dots` cells at `dotAlpha`.
      // The way through it (SX, 2026-10-02: «след от корабля должен быть не квадратом, а таким пухлым конусом, который
      // раскидывает этот дым и пусть он еще реагирует когда на него выхлоп с корабля направлен»; it was a square `wake`
      // 120 u round the ship, closing over 1.4 s): puffs, round holes with lumpy sides (`lobes`, the 3rd and 5th
      // harmonics of their outline), the fog pushed aside heaped `rim` thicker round each for `rimWidth` of its radius.
      // `cone`: the hull leaves one every `every` s while past the line, `near` u across the ship's own and `bow` heaped
      // before it; each widens by `spread` u a second, a share `jitter` larger or smaller, and closes from `closeFrom` of
      // its `life` on, so the way behind the ship is a fat cone with puffy sides that the fog fills again from its far end.
      // `jet`: while the engine (or the retro, at `retro` of it) runs within `reach` u of the line, a puff every `every`
      // s leaves the hull's rear along the exhaust, `cone` rad either side, at `speed` u/s on the ship's own, slowing by
      // `drag` a second; it widens and closes the same way, so the exhaust pointed into the fog blows a widening stream in it.
      // Its look since SX's pick F2 DEEP WATER (labs/graphics/sketches/fog-looks.html, 2026-10-02: «думан слишком бледный и оттенок
      // серый, лучше другой вайб»): the cockpit's blue at `alpha` times the steps' strength, a navy mass (`deep`, solid blocks in the
      // interface's depth ink) where it is thick, the heaps in white (`heapColor`). It was the slate '#7d8796' at 1.
      // Then all of it in the one blue, the cockpit's and the rocks' (ROLES.structure), quieter (SX, 2026-10-03), and then painted
      // as the rocks are (SX, the same night: «забиткрашился ... эффекты друг на друга наложились, прозрачностью ... какой-то
      // заскейленный, какой-то огромный ... астероиды по-другому покрашены. Может, как-то их покраску просто применишь»; src/world.js
      // drawDeadEdges): its front one thin outline at the rocks' strength (`edge`, labs/graphics/world-art.js ROCK_EDGE) where the
      // thickness crosses `front`; a cell's black gap inside it; then one step of the rocks' shade (`shade`, '░') where it is
      // `shadeFrom` thick, at a little over half the rocks' 0.85, for it fills half a screen; the noise's blocks half as large
      // (2 and 6 cells, they were 4 and 12). The line's dots in the blue at 0.45.
      // Since 2026-10-04 its ink and strengths are the smoke's (`CONFIG.smoke`: SX, «Сиреневый, как облака»): the '░' at
      // `smoke.shade`, in `smoke.ink`; the line's dots keep the blue, the seams' family. On 2026-10-07 the outline and its gap went
      // (SX: «контур у внешнего дыма тоже убери») and came back the same evening, every cell past the gap the shade, one strength
      // (`shadeFrom` is no longer read; SX: «сделай дым однородного цвета как скраю»). Three contours inside it came with it and went on
      // 2026-10-08 (SX: «Нарисовать один контур только внешний, в глубине простая заливка как было максимально экономно»): the front's
      // outline alone, the rest the shade.
      fog: { start: 20, full: 560, drift: 14, front: 0.25, shadeFrom: 0.5,
        shade: { ch: '\u2591' },
        blocks: [2, 6], dots: 6, dotColor: PALETTE.blue, dotAlpha: 0.45,
        lobes: [0.13, 0.07], rimWidth: 0.4,
        cone: { every: 0.05, near: 54, bow: 0.42, spread: 150, jitter: 0.3, life: 1.5, closeFrom: 0.45, rim: 0.34 },
        jet: { every: 0.03, reach: 380, cone: 0.16, speed: 520, drag: 1.4, near: 18, spread: 95, jitter: 0.35, life: 0.85,
          closeFrom: 0.45, rim: 0.24, retro: 0.6 } },
      edgeColor: '#8a93a0',
    },
  },

  station: {
    // Stations half again as large since 2026-10-01 (SX: «Мне кажется, станции у нас слишком маленькие. Станции реально
    // слишком маленькие»): the looks drawn at LOOK_SCALE 1.95 (labs/graphics/station-art.js, it was 1.3), their
    // bodies below and this soft hull with them (it was 230).
    // Then back by half of that growth (SX, the same night: «ровно в половину от этого уменьши их снова ... никогда не
    // помещаются в экран»): a quarter over the old sizes, LOOK_SCALE 1.625, this hull 288 and the bodies below.
    hullRadius: 266,       // soft exclusion, matches the drawn footprint (288 until LOOK_SCALE went to 1.5, 2026-10-17)
    repelAccel: 900,       // world units / s^2 at the hull centre
    // A station drifts a little round its place (src/stations.js; SX, 2026-10-01: «Пусть станции чуть чуть
    // дрейфуют в космосе, а то они как вкопанные стоят это нереалистично»): up to `amount` u across and
    // `amount * 0.7` up and down, each way once in a period drawn from `period` s by the station's id, by
    // the world's clock, so the same station stands at the same place on either side of a seam. At the
    // clock's zero it stands exactly at its catalogue place. Its fastest is about 5 u/s.
    drift: { amount: 60, period: [70, 110] },
    // Solid since 2026-10-01 (SX: «корабль не может пролететь под станцией и над станцией, но при этом
    // столкновение со станцией в принципе приносит не очень сильный дамаг, но если ты влетел в нее на
    // большой скорости и разбился, станция ломается на 100 монет и ее снова нужно починить немного»).
    // A station's body is a box with rounded corners, `bodies[look]` its half width and half height in u,
    // nine tenths of what its look draws at LOOK_SCALE (a table of numbers, so nothing physical is read
    // from the art; one without a look is the hull's circle); `corner` of the smaller half rounds it. Each was
    // half again when the looks grew (2026-10-01), and is a quarter over the first sizes since they came back by half.
    // A hull that meets it pays the station's base by the speed rule (CONFIG.hull.base.station), is held
    // out and bounces; a container is held out too. Measured head-on (the soft repel above slows it first; checks/hull.mjs):
    // from 200 u/s nothing, 700 four, the top of 850 six (2026-10-05; 450 a point, 700 three, 1000 seven, 1300 a wreck on the old
    // hull of 10): a wreck only on a worn hull. A ship wrecked against a working
    // station by a blow of `breakSpeed` u/s or more breaks it: closed until the bill of a lost raid repairs it (src/ruins.js stationBill;
    // SX's W4 of 2026-10-15, a wreck's break costs a ram's; it was `breakCost` 100 CR, SX 2026-10-01)
    // (World.repairStation), drawn `brokenLook` rebuilt. A hull at its last point that only touches one does not.
    // Six looks grew on 2026-10-15 (SX's round 4 of labs/graphics/sketches/station-round4.html, «Внеси правки в игру»), and HOIST and
    // RELAY 12 again with his picks of round 5 (station-round5.html: HOIST's platforms on its axis with longer joints, RELAY's second
    // mast under it), and the five the illustrator redrew with his round 6 (HALCYON, FOUNDRY 2, SPOOL 8, PHAROS, WHARF 9): every body is
    // nine tenths of the station itself as drawn now (its `core`: the board without its external dock and docked ship),
    // checks/station-docks.mjs holding them to it.
    // Every length of the stations twelve thirteenths of what it was since 2026-10-17, when LOOK_SCALE went from 1.625 to 1.5 (SX, asked
    // what the stations should be, with the camera's height: «Сделать 1.5», the bodies with their drawings: «Да, вместе»).
    bodies: {
      ring: [370, 273], spindle: [377, 273], foundry: [339, 273], greenhouse: [282, 273],
      beacon: [301, 273], lattice: [358, 243], wheel: [308, 314], hive: [270, 273],
      depot: [408, 273], array: [257, 253], spire: [345, 273], anchor: [301, 273],
      // The home garage's: nine tenths of its rock's extent over a whole turn of its sway (48 x 25 cells of 13.95 x 22.5 u,
      // labs/graphics/garage-art.js stoneExtent; checks/home-garage.mjs measures it again).
      home: [301, 253],
    },
    corner: 0.5,
    breakSpeed: 600,
    brokenLook: 0.8,
    // A station remembers the hard blows on its hull (SX, 2026-10-08: «врезание в станции я еще хотел бы настроить. Я бы хотел, что
    // если ты прям сильно врезался в станцию, у нее уже минусуется и запоминается минус хп, и когда она, например, достигает минус
    // 10%, что ты наврезался, или минус 20% ... она ломается, и надо снова вложить деньги»). A blow at `hardSpeed` u/s of closing or
    // more (half the top; a bump, a docking and a cruise past it leave nothing) takes `base` of the station's hull at `refSpeed`,
    // times (v / refSpeed) to `power` (the hull's own curve, CONFIG.hull): 1.3 % at 500, 2.2 % at 600, 4.3 % at 749, 10.2 % at the top,
    // so two blows at the top break it. Kept in the save (ledger.wear: a missing field is a station undamaged, no version step) until
    // it is repaired; `warn` (his 10 %) says it once, `breaks` (his 20 %) breaks it: closed, drawn broken (`brokenLook`) and
    // reopened by money, for the bill of a lost raid (src/ruins.js stationBill: 150 CR and a twenty-fifth of its price, 210 to 338),
    // as a wreck against it is since SX's W4 of 2026-10-15. A ruin and HOME remember nothing (a ruin is already broken; HOME is where a
    // pilot with no money mends the hull free). While worn, a docked station's menu has REPAIR STATION for the bill pro rata
    // (the whole bill at `breaks`), and paying it clears the wear.
    wear: { hardSpeed: 500, base: 0.022, refSpeed: 600, power: 3, warn: 0.10, breaks: 0.20 },
    // Permission to act. It stayed when the stations grew half again (2026-10-01): the longest body's edge is then
    // 342 u out and the hull's 386, so the menu still opens 230 u or more before the hull meets it, and a larger
    // ring would reach the caches and planet orbits the sectors place around it.
    interactRadius: 620,
    // What is kept out of a station's menu reach (src/keepOut.js; SX, 2026-10-07, after flying: «РАмки неплохо вокруг станций летают
    // сейчас давай npc и дроиды а также грузы и сундуки, не будут сильно близко к станциям подлетать, нужно чтобы контекстные меню не
    // мешали друг другу, то есть можно мягко окраничить их радиусу действия контекстного меню станции»): the friendly ships' paths, the
    // droids, loose cargo and caches keep `interactRadius` times CONFIG.interaction.exitTolerance (731.6 u, where the station's window
    // goes) and `margin` more from a station: 1,001.6 u, past the station's reach and a cache's or a lost cargo's own (380) together, so
    // no thing's menu reaches where the station's does. A resting thing inside (lost cargo since 2026-10-01, with a 200 u margin; a
    // cache knocked in) eases straight out at `ease` u/s; a droid is pushed by up to `push` times its cruise over the keep-out's last
    // `margin` (a ring, so a droid bound past a station bends round it and one holding for a pilot waits at its edge): one drawn
    // straight in stops a quarter of the ring in, 934 u off, past where its own menu (300) would meet the station's (920).
    keepOut: { margin: 270, ease: 40, push: 4 },
    discoverRadius: 3400,  // shows a direction marker
    beaconRate: 2.1,
    // Arrive slower than this, or docking is refused; an object's menu offers its actions under it, and a sign is left under it.
    // 200 since SX, 2026-10-03 («порог скорости, который они требуют, чуть повыше ... давай 200, а то тормозить тяжело,
    // подлетать обратно»): it was 140, the speed a rock's touch stays a bump under (CONFIG.asteroid.bump.speed, which stays).
    dockSpeed: 200,
    undockPush: 220,       // gentle departure, never a launch
    // A station's look on its INFO panel (src/stationPanel.js): one scale for all, so
    // the largest (42 x 22 cells) fits the panel's picture and sizes compare. A cell 7 px tall at the game's 15 px, so the
    // rows of glyphs fall on whole px: 72 % of the 0.65 it was (SX, 2026-10-09: «Станция должна быть не в полный размер ... пусть
    // она будет там чтобы ровно сложились символы, да, 70, 75 процентов. От текущей станции»).
    panelScale: 7 / 15,
    // The pilot's home garage is not one of the twelve looks (src/home.js): its body and its soft hull stand in
    // these tables under its look's name, `home` (its body is `bodies.home`, above, measured off the drawn rock). The looks that grew
    // on 2026-10-15 keep their soft hull a little past their bodies' longest half, as `hullRadius` was past the old ones'.
    hulls: { home: 277, ring: 374, lattice: 362, wheel: 318, hive: 277, depot: 412, spire: 349, spindle: 381, foundry: 343, greenhouse: 286, beacon: 305, anchor: 305 },
    // Where a look's docks are (SX, 2026-10-15; the rule in docs/station-art.md section 4, the drawing in labs/graphics/station-art.js,
    // checks/station-docks.mjs holding this table to it): u from the station's own place, in its own frame (turned with it in the
    // float). `pad` [dx, dy, nose]: where the pilot's own ship stands on the pad and which way its nose points ('up', or 'left' on
    // HOIST's platform as SX marked it), null at a station without one. `ext` [dx, dy, dir, face]: the external dock's root, the side
    // it reaches out to (1 right, -1 left) and how far out the module's face is at full stretch (its module five cells wide since SX's
    // pick M0 of 2026-10-15); a ship hangs there nose up, `gap` past the face. Every reference ship docks at `ext` («корабль отсылка точно не должен вставать на станцию. Он внешним доком всегда
    // соединяется»), and every ship at a station with no pad.
    docks: {
      ring: { pad: null, ext: [404.6, 0, 1, 139.5] },
      spindle: { pad: [-327.8, -22.5, 'up'], ext: [-104.6, 202.5, -1, 139.5] },
      foundry: { pad: [258.1, 0, 'up'], ext: [-369.7, 0, -1, 139.5] },
      greenhouse: { pad: [83.7, 0, 'up'], ext: [293, 0, 1, 139.5] },
      beacon: { pad: [202.3, 0, 'up'], ext: [-327.8, 0, -1, 139.5] },
      lattice: { pad: [0, 0, 'up'], ext: [390.6, 11.3, 1, 139.5] },
      wheel: { pad: [0, 0, 'up'], ext: [320.9, 0, 1, 139.5] },
      hive: { pad: null, ext: [279, 0, 1, 125.6] },
      depot: { pad: null, ext: [390.6, 67.5, 1, 125.6] },
      array: { pad: null, ext: [279, -45, 1, 139.5] },
      spire: { pad: [293, 0, 'left'], ext: [-376.7, 0, -1, 139.5] },
      anchor: { pad: [48.8, 0, 'up'], ext: [327.8, 0, 1, 139.5] },
    },
    // How a ship docks (SX, 2026-10-15: «когда докаешься, то наш корабль уходит вниз в глубину, а потом всплывает в доке ... как при
    // респауне»; «Ныряет обратно» to leave; «Нужна анимация, короче, как на респауне. Ныряет внутрь, выплывает снизу»), s: it dives where
    // it is, coasting to rest, is under the station a moment while the dock gets ready, and rises in the dock as a respawned ship rises
    // (rise 1.1 s, labs/graphics/reboot.js REBOOT.rise); leaving, it dives out of the dock and rises outside, `exitAir` u off the station as
    // drawn (its external dock counted) on the side it came from, nose out, a towed cargo as clear. `gap`: a hanging ship's clearance from
    // the external dock's face (a cell); `grip` how long the claws take to close.
    docking: { arrive: { dive: 0.5, under: 0.8, rise: 1.1 }, leave: { dive: 0.45, under: 0.65, rise: 1.1 }, gap: 14, exitAir: 60, grip: 0.6 },
    // ... and its body's corners are fully round (a stadium, `corner` 1): the rock is lumpy and the box's corners stood up
    // to 61 u out of it at the turn of its sway, 44 u (one hull's radius) with the round ends (checks/home-garage.mjs).
    corners: { home: 1 },
  },

  // The pilot's home garage (src/home.js, labs/graphics/garage-art.js). SX, 2026-10-01, picking the look (round three,
  // the S0 tile of labs/graphics/sketches/garage-setting.html): «Вот этот гараж берем»; where it stands: in the start
  // sector (J-04 until SX's second map layout of 2026-10-02 moved it to J-05), and a new game starts at its berth; on docking: «Когда в него докаешься, открывается вот эта
  // иллюстрация» (the room, the page's popup). Outside, without going in, it mends the hull for free (agreed) and
  // refuels («из доступных в гараже запасных деталей»: the hose and the crane do it while the ship stands in the berth,
  // before the bridge).
  // The price of that fuel, SX, 2026-10-02: «платная но 1 за 10»: a CR for ten units, so a whole tank is ten CR where a
  // station sells it at 1 CR a unit (`fuel.price`). The charge is the ceiling of the units taken times this (a unit
  // taken is never free), paid as the tank fills and never more than the wallet holds: a pilot with no CR is given
  // no fuel, the same as at any station.
  home: {
    id: 'station-home-j04',
    // A board cell is a glyph cell times this, and `cellEm` ems wide (the game's cells are 0.62 x 1.0 em): the scale
    // the stations' looks are drawn at (labs/graphics/station-art.js LOOK_SCALE; checks/home-garage.mjs holds them
    // equal), so the ship's place in the berth is worked out in the world's units without a renderer.
    scale: 1.5,
    cellEm: 0.62,
    // 0.5 since 2026-10-04 (the economy SX chose, proposal.json `fuel`: a station's is 2, a droid's 3); a whole tank 50 CR.
    fuelPrice: 0.5,                       // CR a unit
    // The crane mends the hull free up to `freeShare` of the chassis' whole hull, and the rest at `repairPrice` CR a point as far
    // as the wallet goes (2026-10-04, proposal.json `hull`: free to 60 %, the rest at 1; it was all free). DOCK's row says
    // what it will cost before the ship goes in (src/home.js homeQuote).
    freeShare: 0.6,
    repairPrice: 1,
    // The docking (seconds): the ship comes in (`approach`, below), settles, is refuelled and mended (each left out when
    // there is nothing to do), the bridge runs out and the door opens (the page opens the room there); leaving, the door
    // closes, the bridge goes, the ship backs out and flies off. The way out quicker (SX, 2026-10-03: «Он должен чуть пораньше
    // входить в свободный доступ, когда мы ... из гаража выходим. Как-то пошустрее надо»): 2.8 s from the room's closing to the
    // controls, 5.2 until then (close 0.6, unbridge 0.8, backout 1.8, leave 2.0). The way in quicker too (SX, 2026-10-04:
    // «корабль должен быстрее подключаться в док и открывать интерьер»; chat G): from the start's place to the room 2.8 s with
    // a full tank and a whole hull, 4.7 with fuel and the crane to wait for (4.5 and 8.3 until then: settle 0.7, fuel 1.8,
    // repair 2.0, bridge 1.0, door 0.8, the way in at cruise 420, accel 260, gate 160).
    phases: { settle: 0.3, fuel: 0.9, repair: 1.0, bridge: 0.45, door: 0.4, close: 0.35, unbridge: 0.45, backout: 1.1, leave: 0.9 },
    // The way in, flown by src/approach.js (SX, 2026-10-03: «красивый плавный движок заезда в гараж»): from the ship's own
    // course and speed, out to `cruise` u/s at most and never pushed harder than `accel` u/s^2, slowed for the bends round
    // the rock, lined up at the gate under the mouth at `gate` u/s, and the glide up the axis into the berth. A ship that
    // was moving swings round on a tight arc only (`swing`, u), clear of the stone. Until then (2026-10-02) it was a fixed
    // curve walked in `speed` 100 u/s's time, 2.2-4.6 s, fast at first and slow at the berth. Quicker since 2026-10-04 (above).
    approach: { cruise: 560, accel: 380, gate: 200, glide: 1.67, swing: [40, 110] },
    // The ship is handed back outside the mouth at this speed, u/s: below `station.dockSpeed`, so DOCK is at hand again.
    exitSpeed: 80,
    // Where DOCK can be chosen from: below the berth, in a cone that widens downward (board cells; `top` rows under the
    // berth's middle, which is where the stone ends, `width` cells either side there, `widen` more per row).
    // A ship beside or above the rock would be drawn in through it. `start`: rows under the berth a new game starts at.
    bay: { top: 3, width: 6, widen: 0.9, deep: 7, wide: 2.4, start: 7 },
  },

  cargo: {
    // A body on a tether since 2026-10-01 (SX: «проработал в этом заходе физику грузов, они
    // должны одергивать и влиять на корабль, они должны сталкиваться с препятствиями, если ты
    // грузом снес пирата ему наносится дамаг, когда ты тормозишь тяжелый груз может врезаться
    // в твой корабль и задамажить его на 1-2»; «Груз задамажится сам при столкновении не
    // может»). src/tow.js has the physics; until then it was a follower that touched nothing.
    //
    // Measured from the drawings at the ship's scale of 1.6-2.0: 36-45 px of
    // hull behind the pivot, 31 px of container ahead of its own, and 34-43 px
    // of tether between them. Both numbers shrank with the ship (it was drawn
    // at 3.0 before); the container keeps roughly the hull's own length. The
    // braking scale is 1.8 since 2026-09-30, so the hull behind the pivot now
    // tops out at 40.5 px (36 at cruise).
    // SX, 2026-09-26: "контейнер с грузом ... совсем крошечный. Нужно сделать
    // его заметно крупнее". 1.0 draws it ~46x105 px (was ~28x63), about three
    // quarters of the hull's length; the tether grows so the gap stays ~40 px.
    // Where the container hangs at rest: its centre this far behind the ship's pivot (a
    // bigger one further, `sizes.scale`), the tether's length plus the anchor's offset.
    // 200 since 2026-10-01 (SX: «цепочка у груза коротковата»; it was 140); 170 the same night, with a stiffer
    // tether that stretches less (SX: «Резинка ... слишком эластичная ... слишком длинная»).
    trailDistance: 170,
    spriteScale: 1.0,
    // Cargo comes in three sizes (SX, 2026-09-30: «Сделай разные размеры
    // грузов, большие замедляют корабль сильнее»). A size's `mass` is in ships (the ship
    // is 1): towed on a taut tether the pair gains speed at 1 / (1 + mass) of the ship's
    // own rate (0.83, 0.71, 0.57; it was `thrust`, a flat 0.92, 0.8 and 0.62 of the engine,
    // until the tether carried the load). The top speed is still `top` of the chassis's.
    // It pays `reward` times a medium cargo over the same run and gives `par` times the
    // time; it is drawn `scale` times the container, and towed further back to match. A
    // contract names its size (src/contracts.js); a run's is drawn from its id.
    // Placeholder numbers, for SX to fly.
    sizes: {
      small: { name: 'SMALL', mass: 0.2, top: 0.95, reward: 0.85, par: 1, scale: 0.8 },
      medium: { name: 'MEDIUM', mass: 0.4, top: 0.88, reward: 1, par: 1.1, scale: 1 },
      large: { name: 'LARGE', mass: 0.75, top: 0.76, reward: 1.4, par: 1.25, scale: 1.3 },
    },
    // A station's own cargo (labs/graphics/cargo-art.js, SX's twelve of 2026-10-16) is built, not scaled, so its body is its drawing's:
    // [radius, half] in u for SMALL, MEDIUM and LARGE, a capsule along the tether as the plain container's is (`tow.radius` and
    // `tow.half` times the size's `scale`), each its drawing's half width and half height (cells of 9.3 by 15 u) times 0.95, as the
    // container's is its own. By the sending station's look; a station without one (HOME) sends the container. checks/cargo-art.mjs holds
    // the table to the drawings.
    bodies: {
      wheel: [[40, 43], [57, 57], [75, 71]],
      spire: [[31, 50], [31, 64], [31, 78]],
      array: [[40, 36], [40, 57], [40, 78]],
      greenhouse: [[40, 36], [40, 50], [40, 64]],
      depot: [[40, 36], [40, 50], [40, 64]],
      foundry: [[40, 36], [40, 50], [40, 64]],
      lattice: [[22, 43], [22, 71], [40, 71]],
      ring: [[40, 36], [40, 57], [40, 78]],
      spindle: [[31, 50], [31, 71], [31, 93]],
      beacon: [[40, 29], [40, 43], [40, 57]],
      hive: [[40, 29], [40, 43], [40, 57]],
      anchor: [[31, 29], [31, 57], [35, 86]],
    },
    // The tether and the container's body (src/tow.js). The tether is made fast `anchor` u
    // behind the pivot and only pulls: slack, the container coasts on its own `drag` (more
    // than the hull's 0.16, so a coasting pair stays strung out); taut, it takes the stretch
    // out of both ends by their masses, a snap giving back `snap` of the closing speed. A pull
    // across the hull turns it, `yaw` rad/s per u/s of the tug's share on the ship, so a
    // swinging load is felt in the stick. The container turns toward the tether at `align`
    // 1/s while it pulls and tumbles freely (`spinDrag`) while slack. A tether longer than it
    // should be (a cargo taken back from where it lay) is reeled in at `reel` u/s. The body
    // is a capsule `radius` u round and `half` u from its middle to either end, times the
    // size's `scale`, and it gives back `bounce` of the closing speed off whatever it meets.
    // It feels gravity as the hull does, a planet's cushion and its surface, a dead edge's
    // current, and a black hole: a container that falls past a horizon takes the ship
    // through with it. A station's body holds it out, as it does the hull (2026-10-01).
    // The hull meets its own container at `shipReach` u from the pivot (its tail is drawn
    // further back than the 44 u circle rocks meet), and a free rock weighs its radius over
    // `rockUnit`, squared, in ships.
    // SX, 2026-10-01: «Грузы должны чуть плавнее двигаться в космосе, сейчас ощущение что у них вообще нет
    // веса». The tether stretches: a spring of `spring` rad/s at `damping` of critical, rigid past `give` of
    // its length (src/tow.js). Full thrust holds it about 39 u long whatever the load (the stretch is the
    // engine's 780 u/s^2 over spring^2), a fifth of its length. And the load keeps more of its own way:
    // `drag` 0.3 -> 0.2 (the hull's is 0.16) and `align` 7 -> 3, so it swings round rather than snapping
    // to the tether's line.
    // SX, the same night: «Грузы сейчас слишком активно летают вокруг ... как будто вообще невесомые, крутятся.
    // Резинка не эластичная или слишком эластичная ... слишком длинная». Measured on a scripted flight (thrust, turns,
    // the brake): the load went right round the hull at about 370 u/s. Now its swing across the tether is taken out at
    // `swing` 1/s (src/tow.js), so it hangs back and sways instead of circling (about 110 u/s); the tether is stiffer
    // and damped near critical (`spring` 4.5 -> 5.5, `damping` 0.55 -> 0.9), stretches half as far at most (`give` 0.3 ->
    // 0.15), and the container turns no faster than `maxSpin` rad/s and stops tumbling sooner (`spinDrag` 1.4 -> 3).
    tow: {
      anchor: 36,
      drag: 0.2,
      spring: 5.5,
      damping: 0.9,
      give: 0.15,
      swing: 2.2,
      snap: 0.2,
      yaw: 0.012,
      align: 4,
      spinDrag: 3,
      maxSpin: 2.5,
      reel: 420,
      radius: 22,
      half: 50,
      bounce: 0.3,
      shipReach: 56,
      rockUnit: 44,
      // A tug of `pull` u/s or more on the hull is heard (the tether's twang), at most every `every` s.
      // A slack tether pulled taut by ends parting at `speed` u/s or more is heard as well.
      snapCue: { pull: 40, every: 0.35, speed: 160 },
    },
    // What a container's blow costs (it never costs the container anything). Against the
    // ship (a braking hull is overtaken by its load): `ship` is the impulse, mass times
    // closing speed, for one point and for two, never more: a large container costs a point
    // from 320 u/s of closing speed and two from 480, a medium from 600 and 900, a small
    // from 1200. Measured with the brake held from a steady cruise (SPACE, src/tow.js) on the
    // longer tether (trailDistance 200, SX, 2026-10-01: «цепочка у груза коротковата»): a
    // large one hits at 257 / 356 / 441 / 519 u/s from 400 / 600 / 800 / 1000, so it costs
    // nothing from 400, a point from 600 and 800, and two from 1000; braked on S alone it hits
    // at about 300 and costs nothing; a medium one (249 to 541) and a small one never cost a
    // point. Against a
    // pirate: a point for every `pirate.per` of impulse, rounded, at least one from
    // `pirate.speed` u/s and at most `pirate.max`; the pirate is knocked away by its own mass
    // (`pirate.mass` ships). A large container swung into a pirate at 400 u/s takes three of
    // its hit points, a medium two, a small one. `sparks` u/s: slower contacts are quiet.
    // `shipPoints`: what the two blows on the ship cost (1 and 2 of 10 until the hull went to 100, 2026-10-01).
    hit: {
      ship: [240, 360],
      shipPoints: [2, 5],
      pirate: { speed: 120, per: 90, max: 6, mass: 1, grace: 0.4 },
      sparks: 40,
    },
    glyph: '\u2593',          // fallback when sprites/cargo-container.json is missing
    tetherGlyph: '\u00b7',
    color: '#c7a76a',
  },

  // What the hull takes by touch (loose coins, fuel canisters): the reach is added to the ship's
  // collider radius, so a coin is taken by touching it with the hull, not by passing near it.
  // `scale` was the authored 25 CR coin's size; those coins were cut on 2026-10-01 (SX: «вот такие
  // огромные гредитсы мы вырезаем»), and it stays only for the scales sheet, which measures by it.
  pickup: {
    collectRadius: 26,
    // 1.3 until SX, 2026-09-30: «Сделай монетки на 20% крупнее» (the drawing only:
    // the reach is the same), then «Монетки чуть побольше еще, горючее оставь
    // такого размера»: 15 % more again (1.56 to 1.8), the canister as it is. Then,
    // the same evening: «Монеты сделай на 5% меньше»: 1.71. Then, with the scales sheet
    // (labs/graphics/sketches/scales.html, deleted 2026-10-03): «текущую монетку сделай на 10% меньше и все
    // дальше мерий от нее»: 1.539, 60 x 71 px of ink, the unit every size is measured in. That `scale` went on 2026-10-17: no coin
    // lies authored any more and nothing read it (the loose coin's drawing is CONFIG.asteroid.drops.coinScale).
    sparkColor: '#ffe7a3',
  },

  // cache: src/questsConfig.js, the caches' numbers in a file of their own (PLAN D5, 2026-10-09).
  cache: QUESTS.cache,

  // Word signals (doc 04: "find words in space"). Flown through within
  // `reach` u; a direction marker appears within `discoverRadius`.
  signal: {
    reach: 90,
    discoverRadius: 2600,
    rate: 0.55,            // breaths per second
    color: '#b2c9b8',      // the interface accent: a thing to go to
    // SX, 2026-09-26: signals were "практически никогда не видно". The mark
    // and its breathing brackets draw at this glyph scale (was one cell): 2.4,
    // then half that at SX's «Сигналы на 50% меньше сделай» (2026-09-30), now
    // the locator and the bearings find them. The reach is the same. Then, the
    // same day: «Сигнал должен быть на 25% крупнее тоже, опять стал очень
    // мелким»: 1.5.
    scale: 1.5,
  },

  // Signs left in space (doc 03). One is left where the ship is, no faster
  // than docking allows, and never over something a pilot has to reach: at
  // least `objectClear` u from a cache, signal, credit, moored rock or lost
  // cargo (a station: its hull plus that), `spacing` u from another sign,
  // `wellMargin` u past a planet's orbit or a hole's disc and pull, and
  // `edgeClear` u inside the sector, so none straddles a seam. A pilot's own
  // sign offers REMOVE SIGN within `interactRadius` u.
  sign: {
    objectClear: 280,
    spacing: 320,
    wellMargin: 160,
    edgeClear: 200,
    interactRadius: 220,
    frame: '#929ca8',      // plating, as the stations' hull strokes
    hatch: '#596571',      // rivets and hatched bays, as the stations' bays
    text: '#d6dce3',
    seal: '#b2c9b8',
    author: '#6f7780',     // quieter than the caption (SX, 2026-10-01), the keys' hint gray, 4.6:1
    // Every sign another pilot left (the authored ones, World.signsIn) is drawn as this type, whatever it was
    // authored as (SX, 2026-10-01: «Все сообщения ... которые оставляют другие игроки и выдуманные игроки, давай
    // переведем пока вот на такую версию», a screenshot of STARS). The pilot's own keep the type chosen. null: each
    // its own again.
    others: 'stars',
  },

  // Cargo lost in a wreck, where it came to rest (doc 03). The resting point
  // keeps the way back open: clear of lethal radii by `wellMargin`, of gravity
  // stronger than `gravityShare` of main thrust, of station hulls by
  // `hullMargin`, and of a dead edge's current by `edgeMargin` past its depth.
  stranded: {
    interactRadius: 380,
    discoverRadius: 3400,
    wellMargin: 160,
    gravityShare: 0.5,
    hullMargin: 140,
    edgeMargin: 200,
    spin: 0.18,            // rad/s, a slow tumble where it lies
    // A lost cargo not taken back within `returnAfter` seconds of the pilot's clock goes
    // back to the station that sent it, and is offered there again (SX, 2026-10-01: «если
    // ты потерял груз то через 5 минут если ты его не забрал он возвращается на станцию»).
    returnAfter: 300,
    // Cargo lying within a station's menu drifts out of it (World.driftLostCargo, SX, 2026-10-01), so the cargo's own menu is met
    // first: at CONFIG.station.keepOut.ease u/s, out of the station's keep-out (src/keepOut.js) since 2026-10-07. Its own `drift`
    // (40 u/s, 200 u past the window's reach) until then.
  },

  // The last seconds of flight, kept for the ghost a wreck leaves beside its
  // cargo. Doc 03 proposes 5-8 s at 10-20 samples/s as an experiment.
  trace: {
    rate: 12,
    seconds: 6,
  },

  // The replay itself. Black and white (SX, 2026-09-24): one neutral grey and
  // a label, never the ship's own palette, so it cannot be mistaken for a live
  // pilot (doc 06).
  ghost: {
    color: '#d2d2d2',
    alpha: 0.72,
    pathEvery: 2,          // one dot of the path per this many samples
    hold: 1.4,             // seconds the wreck stays on screen after the trace ends
    // The pilot watches from beside the cargo, so the replay starts where the
    // ghost comes within `reach` of the wreck; the rest would play off screen.
    // A fast crash whose visible part is shorter than `minReplay` seconds is
    // slowed to last that long instead of passing in a blink.
    reach: 1100,
    minReplay: 1.2,
  },

  save: {
    // Persist on meaningful outcomes, and otherwise at this interval. A frame
    // is never a reason to write to disk.
    intervalSeconds: 12,
  },

  // The optional CRT filter (V; SX, 2026-09-24): a curved tube over the game's
  // own colours. `bend` bows each axis by the square of the other, in
  // coordinates running -1..1 across the screen; `inset` leaves a thin black
  // margin round the whole tube; `corner` rounds it, as a share of the shorter
  // side. SX, 2026-09-30: "CRT эффект все равно тормозной, убери шейдер,
  // сделай прям на 5% больше изгиб и добавь виньетку (очень аккуратную и
  // красивую)". So the shader, its glow and its scanlines are gone, the tube is
  // bent by Canvas 2D strips (src/crt.js), and the bend went 5 % over the 0.0225
  // it had (itself half the first 0.045, at SX's "перебор с изгибом"). After
  // flying it: «сделай изгиб сильнее», so 0.034, half again as strong and a
  // quarter under the 0.045 that was too much; Timothy Lottes' CRT shader bows
  // its sides by 1/32 and 1/24 in this same form, and this sits between them.
  // `stripStep` is the most, in device px, that a straight line at the very edge
  // of the picture may jump between two neighbouring strips; under a pixel, so
  // no step shows. It sets how many strips a frame costs: 0.7 with the stronger
  // bend keeps that where 0.5 had it before (about 220 at 2880 x 1800). `vignette` is the
  // share of the light taken at the deepest corner and `vignetteReach` how far
  // in from each edge it begins, in CSS px (2026-09-30, below), so the middle,
  // where the ship flies, is untouched. Its ceiling is contrast: at 0.25 the
  // gray text (#929CA8) falls to 4.5:1 on black. The vignette and the rounded
  // corners are one static layer painted once per canvas size, `settle` ms
  // after a resized window stops changing, at `veilScale` of the canvas's
  // resolution and stretched by the browser: the layer is smooth, and a quarter
  // of the pixels takes the first V from about 65 ms to about 16 (QA, 2026-09-30).
  // The front glass's light (`glare`, 2026-09-30, reports/2026-09-30-crt-glass-
  // reflection.md) was removed the same day: «Блик дисплея из шейдера убери он
  // некрасиво реализован и только мешает».
  // Then SX, the same day: «При изогнутом экране не видно ни виньетки на
  // интерфейсе, ни блика»: at 0.2 the vignette took a tenth of the light at the
  // middle of an edge, and the glass lifted black to #090909 at most. Shown three
  // strengths (A as it was, B 0.4 / 0.09, C 0.5 / 0.12), SX: «Давай пробовать
  // что-то между B и C». So the vignette 0.45 from 0.45 (0.22 of the light at
  // the middle of each edge, 0.16 where the bottom text stands, 0.3 by HULL,
  // 0.45 in the very corners) and the glass three times as bright as it was
  // (black up to #1B1B1B up and to the left, #090909 along the top). Its price
  // is contrast at the edges while the filter is on: the gray text keeps AA
  // (4.5:1) over the middle of every edge (4.8 at worst), 4.0 by HULL and 3.4
  // at worst where corner text stands; the quiet key (ROLES.textHint) 3.5 where
  // the legend stands. The primary text keeps AA everywhere. The flat game is
  // untouched. Fainter, if SX wants AA back: vignette 0.24 keeps the gray text
  // at AA everywhere. And not a WebGL shader: why, in src/crt.js (Safari and
  // Firefox copy each frame through the CPU, 16-25 ms).
  // Then, after flying it: «Изгиб сделай меньше и я понял что у тебя виньетка
  // растянута прям от центра экрана, она должна начинаться где-то на 200
  // пикселях от края экрана». The bend 0.034 to 0.024 (about the 0.0236 it had
  // before «сильнее»), and the vignette measured from the edges: it starts
  // `vignetteReach` CSS px in from each edge and the middle of the picture is
  // untouched (src/crt.js vignetteAt). The corners 0.42 (from 0.45: the
  // band is narrower, so its rim is darker than before at the same corner, and
  // the gray text there keeps AA); the middle of an edge takes 0.24 of the light
  // at the very rim, 0.19 where the bottom text stands.
  // Since 2026-10-02 the game's screens (V; src/display.js, SX's film-grade editor) draw the tube: `bend`, `inset`,
  // `stripStep` and `vignetteReach` are what CURVE 100 % of a screen means (src/filmGradeScreen.js
  // reads them from here), and `maxPixels`, `settle` and `veilScale` still hold. `corner` and `vignette` here are the
  // old CrtFilter's (src/crt.js, kept by checks/crt.mjs); a screen's own are in SCREENS (film-grade.js).
  crt: {
    bend: 0.024,
    inset: 0.012,
    corner: 0.025,
    stripStep: 0.7,
    vignette: 0.42,
    vignetteReach: 200,
    settle: 200,
    veilScale: 0.5,
    // The most device pixels the canvas has while the filter is on. Its bend copies the whole frame twice a
    // frame, canvas to canvas, and that is cheap up to a canvas of 3840 x 2160 (8.29 Mpx: 4.1 ms of script a
    // frame) and then falls off a cliff in Chrome: 8.40 Mpx took 19.7 ms, 2240 x 1260 at 2x 24 ms, 2560 x 1440 at
    // 2x 30 ms, 32 frames a second (measured 2026-09-30, M1 Pro, headless Chrome 151; the cliff sits at
    // 4096 x 2048 = 8.39 Mpx). Above the budget the page lowers its pixel ratio while the filter is on, so text on
    // a very large window is a little softer; with the filter off nothing changes.
    maxPixels: 8.3e6,
  },

  // Sound (SX, 2026-09-30: «Сделай звуки в игре»; src/audio.js). `master` is
  // the whole mix, kept low (a quiet game, and a limiter behind it); `buses`
  // share it between the world's sounds, the interface, the engine's hum and
  // brake, and the score. `engine` sets the hum and the brake's hiss at full
  // output. A sound in the world is panned by where it is
  // on the screen (`panWidth` at the edges) and falls away past the screen's
  // edge to nothing at `hearing` units beyond it. A hull down to a quarter beeps
  // every `hullAlarmEvery` seconds.
  sound: {
    master: 0.55,
    // The engine's running voices 70 % under the rest (SX: «гул двигателя был на
    // 70% тише всех остальных звуков»): it is heard for minutes at a time. Then
    // half that again (SX, 2026-09-30: «Звук двигателя еще можно на 50% тише»).
    // Then: «Убери шум движка то есть именно когда летишь» and «простой звук
    // полета пусть останется»: the breath, the retro and the room tone are
    // gone; the plain hum and the brake's hiss are what is left on the engine
    // bus. `music` is the generative score's bus (src/music.js): «фоновую
    // тихую эмбиент мелодию космоса».
    buses: { sfx: 1, ui: 0.8, engine: 0.15, music: 0.6 },
    // The player's volumes before they set any (the pause's AUDIO, its DEFAULTS; SX, 2026-10-16: «по умолчанию сразу делай звуки 75%
    // громкости, музыка 50% громкости. В настройках можно поправить»): the whole mix full, the music half, the interface's and the
    // space's sounds three quarters. A volume this browser keeps (src/prefs.js) is the player's and stays.
    volumes: { master: 1, music: 0.5, ui: 0.75, space: 0.75 },
    // `hum` and `brake` are the levels as they stood until 2026-10-07; then (SX: «нужно чуть громче звук мотора сделать и сделать его
    // нарастающим в зависимости от скорости + отдельный звук нужен для дрифта») the hum is set over `hum` by `rise`, and the drift has
    // its own voice, `slide`. All three run on the engine bus, so the space's volume, the master and O hold them as they hold the rest.
    //   rise    the hum's loudness over `hum` in dB, at rest and at the hull's top speed (its own maxSpeed, 999 u/s for the standard),
    //           and its pitch in Hz: `hz`, plus `spoolHz` at full spool, plus `speedHz` at the top. Both follow the speed's share on
    //           a smoothstep: evenly through the middle, no step at rest or at the top. The hum is heard while thrusting only, as
    //           before; coasting is silent.
    //   slide   the drift's slide: the shared noise through a lowpass whose cutoff opens from `cutoff[0]` Hz with the nose straight
    //           on the course to `cutoff[1]` at the drift's widest angle (its preset's maxSlide), resonance `q` dB, a soft whoosh,
    //           no screech; its level `level` times `angle` (straight .. widest) times `speed` (rest .. the top); in over `attack` s
    //           as the drift begins, out over `release` s after the let-go (time constants).
    engine: {
      hum: 0.07, brake: 0.03,
      rise: { db: [2, 6], hz: 42, spoolHz: 26, speedHz: 34 },
      slide: { level: 0.1, q: 3, cutoff: [380, 1100], angle: [0.5, 1], speed: [0.6, 1], attack: 0.08, release: 0.25 },
    },
    // The mix's last stage: a peak limiter only («звуки заменяют друг друга,
    // они должны скорее параллелиться»). It was a compressor at -14 dB, 4:1,
    // that ducked everything under each shot and crash. -4 dB is over what a
    // volley, a crash and the score reach together after `master`. Below the
    // threshold it does not compress, but Chrome adds make-up gain (about +1.7 dB
    // at these settings, measured 2026-09-30), so the mix leaves it that much
    // louder than the sum of its buses; `master` was set by ear with it included.
    limiter: { threshold: -4, knee: 3, ratio: 12, attack: 0.002, release: 0.1 },
    // The engine's hum and the brake's hiss follow the ship a frame at a time. If
    // the frames stop (an error thrown in the frame, a hang) the audio clock does
    // not, and they would hold their last level for good (measured 2026-09-30: a
    // hum at 0.07 twelve seconds after the frame began to throw). Each frame also
    // sets them falling to nothing `after` s from now, time constant `fall` s, and
    // cancels that fall at the next frame, so it only ever begins when frames stop.
    deadman: { after: 0.35, fall: 0.1 },
    // The score: a chord every `chordEvery` s (never so late that one ends
    // before the next begins), each note swelling over `attack`, holding,
    // fading over `release`, its notes entering `stagger` apart; `pad` is one
    // voice's peak, `detune` the cents between a note's two voices, `cutoff`
    // the lowpass closed and open, `spread` how wide the notes sit. A star (a
    // single high note) first after `stars.first` s, then every `stars.every`.
    // `reverb`: the impulse's length and its 60 dB decay, and each part's
    // [dry, wet] shares (the impulse's noise is seeded: src/music.js). Scheduled
    // `lookahead` s ahead of the audio clock.
    music: {
      chordEvery: [13, 20],
      attack: [4, 6.5],
      hold: [3, 6],
      release: [7, 10],
      stagger: [0.15, 0.9],
      pad: 0.03,
      detune: 6,
      cutoff: [360, 980],
      spread: 0.7,
      stars: { first: [3, 7], every: [5, 14], gain: 0.02, decay: [2.5, 4.5], spread: 0.65 },
      // A rest after one chord in `rest.chance`: silence for `rest.length` s
      // once it has faded. The impulse is 3.5 s: a convolver's cost grows with
      // its length (Obsidian note 15, padenot's web-audio-perf).
      rest: { chance: 0.25, length: [6, 16] },
      reverb: { seconds: 3.5, decay: 3.2, chords: [0.55, 0.6], stars: [0.3, 0.9] },
      lookahead: 2,
    },
    // The conductor (src/score.js) and the fight's breakcore (src/breakcore.js), SX's S1 of 2026-10-16 (labs/graphics/sketches/
    // breakcore.html, six rounds: «Dust Life неплохой», «надо отмастерить трек», «пэды ... как ... в оригинальном фоновом»; «Вносим в игру
    // брейк с дирижёром»). `calm` s with no fight before the way out; `fadeAmbient` the time constant of the ambient fading under a
    // fight; `roomTop` the lowpass on the one room's return (both pieces'; Butterworth). `fight`: the breakcore. `bpm`; `chordBars`
    // bars a chord; `shuffle` the share of bars cut and reordered, `cut` the lengths they are cut into (sixteenths, by weight),
    // `stutter` the share of cuts stuttered; `fills` the end of a phrase's choices, `fill4` the chance of a small one in its fourth
    // bar, `fill8` of one at its end; `roll` hits a sixteenth in a roll, `rollPitch` its last hit's rate; `drums` the break's
    // level, `wet` its share of the room, `sat` the soft curve's drive, `top` the hats', ride's and crash's level in the kit,
    // `tone` the drums' lowpass open, where ARRIVE starts it (`arrive`) and LEAVE ends it (`closed`); `leaveLevel` the
    // drums' level at LEAVE's end; `arriveCrash` the crash on a fight's first downbeat; `sub` the sub's peak and `subTop`,
    // `subQ` its lowpass (Q in dB, as Web Audio counts a lowpass's: -6 is soft, no bump); `jitter` how far a slice's level wanders;
    // `master` the piece's level (a fight 1 LU over the ambient's peace, K-weighted). Scheduled `lookahead` s ahead.
    score: {
      calm: 4,
      fadeAmbient: 3,
      roomTop: 3000,
      fight: {
        bpm: 160, chordBars: 8,
        shuffle: 0.25, cut: { 4: 3, 2: 2 }, stutter: 0.06,
        fills: { roll: 1, stop: 1, reverse: 1, gap: 2, stutter: 0.5 }, fill4: 0.15, fill8: 0.75, roll: 2, rollPitch: 1.25,
        drums: 0.075, wet: 0.07, sat: 1, top: 0.55, tone: { open: 6500, closed: 260, arrive: 700 }, leaveLevel: 0.35, arriveCrash: 0.22,
        sub: 0.03, subTop: 140, subQ: -6, jitter: 0.2, master: 0.89, lookahead: 2.5,
      },
    },
    panWidth: 0.75,
    hearing: 900,
    hullAlarmEvery: 2.4,
  },

  interaction: {
    // The held target keeps its claim over this multiple of its radius, so the
    // menu does not flicker on the boundary.
    exitTolerance: 1.18,
    // The ship stands once it has been at or under the dock's speed (CONFIG.station.dockSpeed) this long, s, and flies again as soon
    // as it is past that speed by `exitTolerance` (src/interaction.js shipStands): the one moment an object's window comes, the quest
    // list opens and the marks of what is near show (SX, 2026-10-07: «только если ты 0,5 секунды в непосредственной близости к
    // предмету контакта стоишь», then «MARKS: A1, B1, C0»). The same wait is a window's for its object chosen or pointed at.
    standDwell: 0.5,
    // The speed it stands under, u/s: 350 since SX, 2026-10-08 («я бы снизил порог скорости при которой открываются контекстные панели,
    // сейчас очень медленным надо быть, корабль долго так сильно замедляется»); it was the dock's (CONFIG.station.dockSpeed, 200), which
    // stays the speed a station takes the ship at.
    standSpeed: 350,
    // A docked garage lists seven (2026-09-29): cargo, undock, refuel, repair,
    // chalk, hangar, log. Keys 1-7.
    maxActions: 7,
  },

  camera: {
    follow: 0.085,         // lerp factor per 60fps step
    lead: 0.28,            // how much the camera leads the velocity vector
    leadMax: 220,
    zoom: ZOOM,            // its height: the steps and a new browser's (above)
    unseen: UNSEEN,        // u from the ship that no window shows at any step (above)
  },

  // sim: src/flightConfig.js, the flight's numbers in a file of their own (chat F1, 2026-10-04).
  sim: FLIGHT.sim,

  // ship: src/flightConfig.js, the flight's numbers in a file of their own (chat F1, 2026-10-04).
  ship: FLIGHT.ship,

  // Hull points (SX, 2026-09-26: "корабль имеет hp, выдерживает 10
  // попаданий"; repair "ремонт делай по 20"). Until 2026-10-01 a rock past the
  // SAFE step cost 5 to 8 of 8 points and a planet's surface wrecked outright;
  // the rule now is below, at `hull`. `grace` is a flat second after any hit
  // (World.damageShip, World.hullGrace) so one continuous contact is not
  // charged every physics step, independent of the ship's own respawn/undock
  // invulnerability. `repairPrice` is CR per point at a garage station (a
  // repair droid asks more, CONFIG.droids).
  // delivery: src/economyConfig.js, the economy's numbers in a file of their own (chat E1, 2026-10-04).
  delivery: ECONOMY.delivery,

  // fuel: src/economyConfig.js, the economy's numbers in a file of their own (chat E1, 2026-10-04).
  fuel: ECONOMY.fuel,

  // economy: src/economyConfig.js, the economy's numbers in a file of their own (chat E1, 2026-10-04).
  economy: ECONOMY.economy,

  // The frontier (src/frontier.js; SX, 2026-10-02: «я просто вкидываю по чуть чуть во все разрушенные базы и ни одну так и
  // не открыл ... видимо нам надо постепенно открывать сектора»; his pick «Руина открывает сектор»). The sectors of the grid
  // open in `order`: the first `start` from the beginning (HOME's J-05 and K-05 beside it), then one more for every ruin
  // restored, so money goes into one ruin at a time. Derived from the ledger's `restored`, never saved.
  frontier: {
    start: 2,
    order: ['sector-j05', 'sector-k05', 'sector-k04', 'sector-j04', 'sector-j06', 'sector-k06'],
  },

  // wallet: src/economyConfig.js, the economy's numbers in a file of their own (chat E1, 2026-10-04).
  wallet: ECONOMY.wallet,

  // support: src/economyConfig.js, the first-dock support's numbers (chat N2 part 2, 2026-10-08).
  support: ECONOMY.support,

  // chalk: src/economyConfig.js, the economy's numbers in a file of their own (chat E1, 2026-10-04).
  chalk: ECONOMY.chalk,

  // SX, 2026-10-01, late: «давай, короче, сделаем 100 хп и перерасчет дамага. Дело в том, что я слишком часто
  // врезаюсь, взрываюсь. Давай восстанавливаться будет персонаж. После взрыва ... с 50 процентами хп ... дамаг должен
  // быть рассчитан более гибко ... в зависимости от скорости ... астероиды жестче, чем станции. Если ты врезался ... в
  // пирата или сундук или еще что-то давай отнимать ну совсем чуть-чуть типа 5 или 2». 100 points (10 until then), and
  // a blow closing at v u/s costs `base` points at `refSpeed`, times (v / refSpeed) to `power`, rounded, never under 1
  // from `touchSpeed` (World.impactDamage). The power went from 2 to 1.75, so a fast blow grows less steeply. What a
  // thing weighs is its base: a rock 15, a planet's surface 30, a station's body 6 (built to be bumped). A light thing,
  // a droid, a pirate or a cache the ship runs into (`light`), costs its base by the same rule but always `light.min` to
  // `light.max`: 2 to 5. Head-on, closing at:
  //                  140  200  300  450  600  800  1000  1125 (red)  1500 (top)
  //   rock             1    2    4    9   15   25    37    45           75
  //   planet           2    4    9   18   30   50    73    90          100
  //   station          1    1    2    4    6   10    15    18           30
  //   light            2    2    2    2    3    5     5     5            5
  // So a rock at a 600 u/s cruise costs 15 (it cost 40 of 100), at the red step 45 (a wreck); a pilot meets a rock at
  // any angle, the closing speed v times its cosine, so at 600 u/s it takes about nine blows to lose a whole hull.
  // `respawnShare`: a real wreck brings the ship back with 70 % of its hull (SX, 2026-10-17: «Возрождаться с 50-процентным здоровьем ...
  // 70-процентное давай сделаем пока что. А то что-то как душно»; half from 2026-10-01, «с 50 процентами»; 40 % before).
  // `repairPrice` is per point: 2 CR, so a whole hull costs what it did (10 points at 20).
  // A third off every base that is not light (SX, 2026-10-05, after flying the field three times as dense: «много стало врезаний надо
  // снижать урон при столкновениях»): a rock 15 -> 10, a planet's surface 30 -> 20, a station's body 6 -> 4, an NPC ship 30 -> 20; the
  // light things as they were. With the top at 800 (src/chassis.js; 850 for a few hours that evening, red at 637), head-on, closing at:
  //                  200  300  450  600 (red)  700  800 (top)  850
  //   rock             1    3    6   10        13   17         18     (28 at 850, 37 at 1,000 before)
  //   planet, npc      3    6   12   20        26   33         37     (55, 73)
  //   station          1    1    2    4         5    7          7     (11, 15)
  // A blind pilot's hull lost a flying minute on RELAY 12 <-> YARD 3, J-05's field (scratch sim, 3 seeds x 20 min, 0.8 and 0.95 of
  // the top): 52 and 48 points at 1,000 with the old bases, 37 and 36 at 850, 25 and 24 at 850 with these: about half.
  //
  // The curve again (SX, 2026-10-08, measured first: docs/decisions/2026-10.md): «еще можешь сбалансировать, пожалуйста, дамаг по
  // кораблю? Как будто снова надо посмотреть его по экономике, по том, как он с какой скорости врезается, сколько дамага получает»,
  // and of a jump: «я предлагаю повышенный дамаг давать, если ты во время прыжка приземлился сверху на предмет. Кроме черной дыры,
  // конечно ... чтобы чаще показывать взрывы в этот момент». A threshold and a power: nothing under `touchSpeed` 140 (the rocks' bump
  // line, CONFIG.asteroid.bump.speed; 60 until then), `base` points at `refSpeed` 600, times (v / 600) to the CUBE (1.75 until then).
  // At a careful 450 u/s a rock costs what it cost (mean 4.9 a blow against 4.2, 17 % more); the cost climbs with the cube of the speed
  // after it: a careless 600 hurts (20, mean 11.8), the top is a wreck or near it (92 head-on, mean 54: two blows). Bases: a rock and
  // a planet's surface 20 (a fall that gets through the cushion at the top still stops short of a wreck, 92), an NPC ship 24 (the
  // pilot's equal in weight: both break from 965 u/s of closing, 111 at the top), a station's body 8 (built to be bumped), the light
  // things as they were. Head-on, closing at:
  //                    140  200  300  450  600  749 (red)  850  999 (top)
  //   rock, planet       1    1    3    8   20      39      57     92     (before: 1 1 3 6 10 15 18 24; a planet 2 3 6 12 20 29 37 49)
  //   npc                1    1    3   10   24      47      68    111     (before: as a planet)
  //   station            1    1    1    3    8      16      23     37     (before: 1 1 1 2 4 6 7 10)
  //   light              2    2    2    2    3       5       5      5     (as before)
  // Landing on a thing from a jump (`landing`, World.impactDamage): the blow is the full speed the hull has on it, times `landing.mult`
  // (src/contact.js, src/trick.js landedNow); a planet is never landed on (the jump bounces off it) and a black hole takes the ship
  // before any blow. A rock landed on at 450 costs 24, at 600 60, from 713 u/s a whole hull.
  hull: {
    max: 100,
    touchSpeed: 140,
    refSpeed: 600,
    power: 3,
    // `npc`: a friendly NPC ship (src/npcFleet.js), a ship as heavy as the pilot's, which pays the same blow out of its own hull
    // (CONFIG.traffic.npcSolid): a blow that wrecks the pilot breaks it too (on a whole hull, from 965 u/s of closing).
    base: { rock: 20, planet: 20, station: 8, droid: 3, pirate: 3, cache: 3, npc: 24 },
    light: { kinds: ['droid', 'pirate', 'cache'], min: 2, max: 5 },
    landing: { mult: 3 },
    respawnShare: 0.7,
    grace: 1,
    repairPrice: 2,
    // A freight station patches the hull up to `patchShare` of the chassis' whole hull, at `repairPrice` a point; a garage mends
    // it whole (src/stationService.js; 2026-10-04, the economy SX chose, proposal.json `hull`: freight docks had no repair).
    patchShare: 0.75,
    // The tow back after a wreck is paid for (World.chargeRescue; SX, 2026-10-02: «давай брать деньги»), at this share of
    // the shop's prices, repairPrice a point and CONFIG.fuel.price a unit (SX, at the full price: «че то дорого, давай
    // самопочинка дешевле будет чем та что в магазе»): at most (50 x 2 + 40 x 2) x 0.5 = 90 CR since fuel is 2 CR a unit at a station
    // (2026-10-04; 70 when it was 1).
    rescueShare: 0.5,
  },

  // pirates: src/piratesConfig.js, the pirates' numbers in a file of their own (PLAN D5, 2026-10-09).
  pirates: PIRATES.pirates,

  // boss: src/bossConfig.js, the boss TOLLKEEPER's numbers and drawing (chat 6 of docs/plans/2026-10-13-next-chats.md, 2026-10-14).
  boss: BOSS.boss,

  // raids: src/economyConfig.js, the economy's numbers in a file of their own (chat E1, 2026-10-04).
  raids: ECONOMY.raids,

  // quests: src/questsConfig.js, the quests' numbers in a file of their own (PLAN D5, 2026-10-09).
  quests: QUESTS.quests,

  // A shot is a short double stroke laid along its flight: `glyph` at the
  // head and `trailGlyph` one cell behind, so each bolt reads as two parallel
  // lines (SX, 2026-09-24: brighter, a double line). It stays near full
  // brightness until the end of its life.
  bullet: {
    life: 1.45,
    glyph: '═',
    trailGlyph: '═',
    color: '#fff6dc',
    minAlpha: 0.55,
    trailAlpha: 0.55,
  },

  // asteroid: src/bodiesConfig.js, the asteroids' numbers in a file of their own (PLAN D5, 2026-10-09).
  asteroid: BODIES.asteroid,

  // planet: src/bodiesConfig.js, the planets' numbers in a file of their own (PLAN D5, 2026-10-09).
  planet: BODIES.planet,

  // blackHole: src/bodiesConfig.js, the black holes' numbers in a file of their own (PLAN D5, 2026-10-09).
  blackHole: BODIES.blackHole,

  // traffic: src/trafficConfig.js, the friendly craft's numbers in a file of their own (PLAN D5, 2026-10-09).
  traffic: TRAFFIC.traffic,

  // droids: src/trafficConfig.js, the service droids' numbers in a file of their own (PLAN D5, 2026-10-09).
  droids: TRAFFIC.droids,

  // gravity: src/bodiesConfig.js, gravity's numbers in a file of their own (PLAN D5, 2026-10-09).
  gravity: BODIES.gravity,

  starfield: {
    tileScale: 1.3,        // tile side = viewport diagonal * tileScale
    // `parallax` is the fraction of the camera's movement a layer follows.
    // Far to near. There is no `spin`: see src/starfield.js for why.
    // `look` is how far a layer leans under the mouse (CONFIG.depth): 1 the whole reach, 0 the flight's plane.
    layers: [
      // More of the far and middle layers (320 and 190 until SX, 2026-09-30:
      // «видно только первый слой звезд»), so their slower drift is seen.
      { count: 400, parallax: 0.06, look: 1.0, glyphs: '.', colors: ['#3a4048', '#434a53'], alpha: 0.75, twinkle: 0.0 },
      { count: 250, parallax: 0.16, look: 0.7, glyphs: '.\u00b7,', colors: ['#5b646e', '#6a7480', '#4f6a72'], alpha: 0.9, twinkle: 0.22 },
      { count: 88,  parallax: 0.34, look: 0.46, glyphs: '\u00b7*+', colors: ['#96a2ae', '#b9c4cf', '#c7b79a', '#9fc0c9'], alpha: 1.0, twinkle: 0.45 },
    ],
    // Each star's lean is its layer's times 1 +- lookSpread / 2, so a layer is a depth of its own, not a flat card.
    lookSpread: 0.4,
    // The whole sky's strength on top of every layer's own alpha and its lift (labs/graphics/world-art.js STAR_LIFT, the lab's `sky`):
    // SX, 2026-10-04, «звезды давай сделаем на 30% прозрачнее», so 0.7 (1 was the sky before). The flight's stars and the ones behind
    // the garage's open room read it; the title's keep their own (labs/graphics/title-final.js).
    opacity: 0.7,
  },

  // The mouse leans the world (SX, 2026-10-02: «когда мышкой в открытом мире кружишь ты управляешь паралаксом, который из всех
  // слоев мира состоит, чтобы получалось такое объемное изображение»), labs/graphics/depth.js. The eye moves with the pointer
  // round the ship: the flight's plane (the ship, rocks, stations, pirates, everything the hull meets or a mark frames)
  // stays where it is, what is behind it slides with the pointer by its depth, what is in front against it. Presentation
  // only: nothing is moved, and the plane the game is played on is never drawn off its place.
  depth: {
    reach: 0.05,           // the far stars' lean at the pointer's edge, of the window's shorter side (45 px at 900)
    vertical: 0.75,        // up and down lean less than sideways
    omega: 6.5,            // the spring the lean follows the pointer on, rad/s, and its damping (under 1: a little swing)
    zeta: 0.82,
    bodies: 0.16,          // planets and black holes: behind the flight's plane, before the stars
    // Dust in front of the flight's plane: few specks, leaning against the pointer and running past faster than the
    // rocks in flight (parallax over 1), the cue that something is between the eye and the ship.
    dust: { count: 46, parallax: 1.5, look: -0.6, glyphs: '\u00b7.', size: [1.1, 1.7], alpha: [0.3, 0.6] },
  },

  // The pointers given for random quests (src/cursors.js; SX, 2026-10-02: «давай курсоры будем дарить за случайные квесты»): three
  // in all, each by a gate of two numbers, [ordinary quests done, stations restored] (the economy handoff's section 8, accepted by SX
  // 2026-10-04: RING (3, 1), CROSS (9, 3), DIAMOND (18, 6)). Both must be met; one given is never taken back, whatever the numbers say
  // (a pilot of the first gates, one in every two quests, keeps what they were given). It was one for every two quests, in that order.
  cursors: { gates: { C2: { quests: 3, restored: 1 }, C1: { quests: 9, restored: 3 }, C4: { quests: 18, restored: 6 } } },

  // The float of a station round its place (src/float.js; SX's item 17, picked G11 on labs/graphics/sketches/garage-edits.html):
  // a turn of `turn` degrees either way over `turnPeriod` s and an orbit `orbit` u round its place once in `orbitPeriod` s, in place
  // of its drift (CONFIG.station.drift); the game's since SX's word of 2026-10-04 (a check's World may keep the drift).
  // Its body, its berth and the way in turn and move with it. `home`: the home garage's own, by the same function, softer and slower
  // (SX, 2026-10-04: «плавание гаража медленнее и 4 процента нужно, его слишком шатает»: read as 4 degrees either way, half the
  // stations', and each period half as long again as theirs; its orbit half theirs since SX's word on the picks hub, 2026-10-04: 18 u,
  // it was 36). `step`: the drawn turn is held to steps of so many degrees, so the
  // browser draws each of a station's turned glyphs once a step and takes the rest from its cache (a glyph turned anew every frame
  // costs Chrome about 80 µs, tools/debris-cost.mjs; beside RELAY 12, 390 cells, the float cost +0.4 ms a frame in steps and +3.1
  // turned smoothly, 2026-10-04); the body itself turns smoothly.
  float: { turn: 8, turnPeriod: 36, orbit: 36, orbitPeriod: 44, step: 0.25,
    home: { turn: 4, turnPeriod: 54, orbit: 18, orbitPeriod: 66 } },

  particles: {
    life: [0.5, 1.5],
    speed: [60, 330],
    drag: 1.5,
    spin: 3.0,
  },

  // What a broken body leaves hanging in space (src/debris.js; SX's item 8, 2026-10-04: «у любых небесных тел после крупной аварии
  // где-то 2 минуты висят в космосе отбитые куски и детали в их стиле, пропадать начинают через 1:20 постепенно, даже у станций даже
  // у нпс, пираты и прочее»): the pilot's wreck, a broken NPC, a destroyed pirate, a broken rock, a broken station, a borrowed
  // ship's wreck. Every piece is the body's own glyph in its own ink, lasts `life` s and is whole until its last `fade` s (from 25 s
  // it fades out), flies out at its kind's `speed` u/s with `carry` of the body's way, slows by `drag` a second (so it hangs a
  // few hundred u from where it broke), and stops turning in about three seconds (its turn dies away by `settle` a second), resting
  // at its own tilt: a glyph turned anew every frame is drawn afresh, path by path, and a still one comes from the browser's cache
  // (tools/debris-cost.mjs, 2026-10-04, Chrome at 1512 x 982 @2x, every piece on the screen: 600 turning +50 ms a frame, 600 at
  // rest +4.7, 300 at rest +0.9, 100 just thrown +4.2 over their first seconds). At most `max` hang at once: past it the oldest go first. A
  // station breaks, it is not destroyed: `share` of its cells come off it, at most `most`.
  // Fewer and shorter since SX, 2026-10-05: «детали в космосе должны висеть меньше по времени. Слишком много деталей ... поменьше
  // выбрасывать детали»: `life` about 40 s, whole until 25 s (two minutes, from 80 s, until then); of a body that comes apart whole
  // (a wreck, a pirate, a rock's shards) `share` of its glyphs hang, drawn at random (every one until then); a station's share 0.2 -> 0.1,
  // at most 40 -> 20. A hanging piece is turned back off a station's body as it comes to it (SX, 2026-10-07: «дом гараж не должен быть
  // прозрачным»; src/field.js holdOutOfStations): a piece of `size` u, only within `held` u of the body's face and closing on it, so a
  // station's own pieces, flung out from inside it, go their way.
  debris: {
    life: [38, 42], fade: 15, carry: 0.4, drag: 0.35, settle: 1.2, max: 600, share: 0.5, size: 8, held: 60,
    ship: { speed: [40, 220] },
    pirate: { speed: [50, 200], drag: 0.5 },
    rock: { speed: [30, 150], drag: 0.6 },
    station: { speed: [30, 140], share: 0.1, most: 20 },
  },

  hud: {
    color: '#929ca8',
    // Quieter than `color`: the pilot card's heading and keys (SX, 2026-09-30: «приглуши
    // по цвету сильнее»), the gray dimmed to 4.6:1 on black (AA for its size).
    hint: '#6f7780',
    hot: '#d6dce3',
    // A coin's +N CR where it was picked up (src/feedback.js): a dark gold, half seen (SX, 2026-10-02: «надписи от них не
    // должны быть зеленые ... какие-то не очень яркие. Возможно, желтые, но темные. Сильно прозрачные»; they were the
    // gains' green). The coin's rim gold (src/roles.js creditsLabel) a step darker, at half its light.
    coinLabel: '#B08A3A80',
    // A fuel canister's +N FUEL where it was picked up (src/feedback.js; SX, 2026-10-02: «при подборе горючего цвет текста об
    // этом должен быть приглушенным и цвета горючего»): the oil's blue (src/oil.js OIL_LOOK's heart, #4980AF, 4.99:1 on black)
    // with its chroma cut to 60 % and a hair more light, so it is quieter by colour and not by darkness: the heart is already
    // near the 4.5:1 a label needs, and the grade (src/grade.js) takes a little more. 5.21:1 on black as written, 4.78:1 after the grade.
    fuelLabel: '#62829E',
    accent: '#b2c9b8',
    // The alarm inks (style.js binds them to the palette's caution and danger): a
    // loss or a hit on a label, the lost-cargo route (src/feedback.js, src/interface.js).
    caution: '#ff9d4d',
    danger: '#e2603a',
    // The route's middle state, between the active green and late's danger: the warm
    // yellow the palette already had for the brake lamp and the engine flame (roles.js
    // PALETTE.amber; SX, 2026-10-01: «Выбери желтый оттенок который уже есть в системе»).
    warning: '#ffd27f',
    frame: '#596571',
    // The interface's own blue: the cockpit's structure lines (src/roles.js
    // PALETTE.blue), for a panel's outer frame (SX, 2026-10-01: «сделай внешнюю рамку
    // голубого оттенка как основной интерфейс», the pilot card).
    edge: '#4980af',
    margin: 18,
    lineRatio: 1.3,
  },
};
