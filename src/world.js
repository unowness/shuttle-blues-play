import { suspendPirateCombat, pirateVisible } from './pirateCombat.js';
import { stepNewPiratePattern, onNewPirateShot, stepNewEnemySystems } from './pirateRoles.js';
import { CONFIG } from './config.js';
import { TAU, clamp, lerp, between, mulberry32, hashId, hypot2 } from './util.js';
import { settlePlaces } from './cachePlaces.js';
import { Planet, BlackHole, Asteroid } from './bodies.js';
import { spawnRocks, stepRocks, cullRocks, keepField, holdOutOfStations } from './field.js';
import { stepClouds } from './clouds.js';
import { Starfield } from './starfield.js';
import { Particles } from './particles.js';
import { Ship } from './ship.js';
import { makeTopology, PLANE, WRAP } from './topology.js';
import { SECTOR_SIZE, START_SECTOR, sectorById, neighbourOf, addressOf, sectorTitle, stationDefById, otherHoles, holeDef, START_STATIONS, startRuinOf } from './sectors.js';
import { SECRET_HOLE_ID, SECRET_EXIT_ID, newSecretStream, secretHoleBodies, setSecretHole, moveSecretHole, rollSecretHole, secretHoleSectors,
  newLure, stepSecretHole } from './secretHole.js';
import { sectorOpen } from './frontier.js';
import { Progress } from './contracts.js';
import { buildStations } from './stations.js';
import { Collection, signalsIn, wordDef } from './progression.js';
import { Pilot } from './pilot.js';
import { SignBoard, SIGN_WORDS_MAX, fixedSigns, captionOf } from './signs.js';
import { stepEggs } from './eggs.js';
import { TraceRecorder } from './trace.js';
import { workingKind, formatCR } from './ruins.js';
import { lookFindsIn } from './looks.js';
import { availableIn, findTitle, placeOf, rollDeal } from './rewards.js';
import { trafficIn, craftPose, HAIL_REACH, stepVisitor, visitorPose } from './traffic.js';
import { Fleet } from './npcFleet.js';
import { Hangar, shipById, shipLimits } from './hangar.js';
import { spawnBoss, stepBoss, resolveBossHits } from './boss.js';
import { stepBossQuest } from './bossQuest.js';
import { npcCraft } from './npcShips.js';
// The four sides of the boss's smoke square as dead edges (World.edgeDepths): an axis and the way out.
const ARENA_EDGES = Object.freeze([['x', -1], ['x', 1], ['y', -1], ['y', 1]].map(([axis, dir]) => Object.freeze({ axis, dir, arena: true })));
import { stepPirates, stepEncounters, pirateGround, inSafeZone, spawnPirates, hurtPirate, killPirate, removePirate, pirateGone, endEncounter,
  scatterSeized, pirateDen, resolvePirateHits, pirateImpact } from './encounters.js';
import { ruinActions, investStation, openFrontier } from './ruinWork.js';
import { stepQuests } from './quests.js';
import { questPlaces, giveCursors, giveRadio, stepRadioCall, drawDrifter, questCraftAt } from './questHooks.js';
import { stepTow, towBehind } from './tow.js';
import { stepShip, stepOrbits, holdOffSurfaces } from './shipStep.js';
import { impactPoints } from './contact.js';
import { landedNow } from './trick.js';
import { wreckDebris, shipSparks, shred, stationDebris } from './debris.js';
import { wreckShip as wreckFlow, chargeRescue, respawnShip } from './wreck.js';
import { addDrawing, seedOf, fogHash } from './worldDraw.js';
import { worldToJSON, restoreWorld } from './worldSave.js';
import { discoveries } from './discoveries.js';
import { wakePuff, stepWake, enginePower, jetPuff } from './fogCells.js';
import { stepDroids, droidActions, droidService } from './droids.js';
import { isHome, homeStation, startPose, stepHome, leaveHome } from './home.js';
import { floatOf } from './float.js';
import { PILOT_HAIL_ID, greetCraft } from './greetings.js';
import { emptyFlags } from './flags.js';
import { candidates as menuCandidates, candidatesNear as menusNear, menuFor as menusFor, stationActions as menuStationActions } from './menus.js';
import { updateSelection, runAction } from './selection.js';
import { stepOpening, openingActions, openingHangarBar } from './opening.js';
import { findPrice, cacheActions, openCache, giveLook, openLookCache } from './finds.js';
import { refuelAction, refuel, chalkAction, buyChalk, repairAction, repairHull, patchAction, patchHull, brokenActions,
  breakStation, repairStation, wearStation } from './stationService.js';
import { driftLostCargo, easeCaches } from './keepOut.js';
import { buildLostCargo, restingPoint, clearOfStrangers, lostCargoActions, recoverCargo, returnLostCargo, takeStrangerCargo } from './lostCargo.js';
import { collectPickups, stepDrops, releaseDrop, spillCoins } from './pickups.js';
import { settleGround } from './groundPlane.js';
import { dock, undock, leaveStation, onStation, stepDocked } from './docking.js';
import { damageShip, bumpShip, stepBullets, resolveHits, breakAsteroid, ramAsteroid } from './hits.js';
import { acceptContract, deliver } from './delivery.js';

// The most events the queue holds before the oldest go (World.emit).
const EVENT_QUEUE_MAX = 512;

// The pairs `gravityAt` and `orbitAccel` hand back: two objects of this module's, refilled by the next call, so read one before asking
// again (a caller holds `g` and `o` together, as they are two). A rock, a shot, a pirate, a warning's step each asked for one:
// an {x, y} a call, tens of KB of garbage a frame (2026-10-09).
const PULL = { x: 0, y: 0 }, PUSH = { ax: 0, ay: 0 };

// The seed of the world's stream called `name`: the world's seed and the name's hash mixed (murmur3's finalizer), so two names
// under one seed are not one sequence moved along, and one name under two seeds is two.
function streamSeed(seed, name) {
  let h = (seedOf(name) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export class World {
  // `seed`: the world's one source of chance (PLAN D1, 2026-10-03). Every draw the simulation or its look makes comes from a
  // stream called by name (`rng`), each derived from this seed, so one seed is one world: the same seed stepped by the same
  // inputs gives the same rocks, NPC ships, pirates, drops and snapshots (checks/determinism.mjs), and a draw added to one
  // system moves no other system's. The game's page builds its world with a seed drawn from Math.random, so play is as varied as
  // ever (`world.seed` says which). A World built without one is a tool's or a check's: it draws a seed from Math.random (a run
  // seeded through Math.random is still one run). `rollSecret`: the secret hole's place is rolled from the world's own 'secret'
  // stream (the game's page asks for it); without it the hole stands where SECRET_SEED puts it (src/secretHole.js), like the
  // droids and the visitors that are off until asked, so a flight a check makes is not met by a hole it did not place.
  // `secretLure` (the game's, since SX's pick of 2026-10-04): the hole stands nowhere until it comes to a pilot alone in the void
  // (src/secretHole.js, H3 LURE); false keeps it as it was before, always standing where it was rolled (the checks of its place).
  // `quiet` (a check's or a tool's, PLAN D4): the sky's chance taken out before the first rock is laid, so a flight is not a test of
  // luck: no rock laid or put back, no pirate coming by itself (World.quieten). The game's page does not ask for it.
  constructor(model, { seed, rollSecret = false, secretLure = true, quiet = false } = {}) {
    this.seed = seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed >>> 0;
    this.streams = new Map();
    this.time = 0;
    this.score = 0;
    this.pirateRoleSystems = new Map();
    this.newEnemySystems = null;
    this.pirateCombatDt = 0;
    this.wrecks = 0;
    // What the last wreck was (src/wreck.js: 'rock', 'station', 'reset' and the rest), null before the first; and the parts of the
    // hull a blow had still to knock off, carried to the next blow (src/debris.js chipHull, a look's own count, never saved).
    this.lastWreckCause = null;
    this.chipDebt = 0;
    // Why the world stands still (the code review's arch#9, chat P, 2026-10-04): one set of reasons instead of seven writers of one
    // flag. `paused` is read, never written: each owner holds or lets go of its own reason (holdPause), so letting go of one never
    // lets go of another's. The page's reasons: 'key' (P's pause, labs/graphics/pause.js), 'tabs' (the two-tabs window,
    // labs/graphics/screens.js), 'tab-locked' (a newer tab plays: held for good). Nothing of it is saved.
    this.pauseReasons = new Set();

    // Hull points (CONFIG.hull). A respawn restores it; only World.damageShip
    // and World.repairHull change it otherwise. `hullGrace` is the flat
    // post-hit cooldown described there, counted down in step() like
    // ship.holeGrace. How much hull and fuel there can be is the flown ship's
    // (hullMax, fuelTank); the pilot's ships are in the hangar (src/hangar.js).
    this.hangar = new Hangar();
    this.hull = CONFIG.hull.max;
    this.fuel = CONFIG.fuel.tank;
    this.chalk = CONFIG.chalk.start;
    this.hullGrace = 0;

    this.width = SECTOR_SIZE.width;
    this.height = SECTOR_SIZE.height;
    this.topology = makeTopology(CONFIG.world.topology, this.width, this.height);

    this.starfield = new Starfield();
    // The mouse's lean, in px at the far stars (labs/graphics/depth.js sets it each frame, CONFIG.depth): what is drawn
    // behind or before the flight's plane slides by its share of it. Presentation only, never saved.
    this.lean = { x: 0, y: 0 };
    // Sparks and debris are a look and read by nothing: the 'fx' stream is theirs alone.
    this.particles = new Particles(this.rng('fx'));
    this.bullets = [];
    this.asteroids = [];
    // Whether rocks are laid at all (World.spawnAsteroids, which the sector's entry, a load and the field's refill all go through): off
    // in a quiet World (`quiet`, World.quieten), which lays none, by itself or asked, and puts none back into an emptied sky.
    this.autoRocks = true;
    this.ship = new Ship(model);

    // Small, bounded outcome list. Whoever owns the frame drains it; nothing
    // in here reaches into the renderer or a menu directly.
    this.events = [];

    // Visit counts are the whole of M2's persistence: in memory, per session.
    this.visits = new Map();

    this.docked = null;
    // The home garage's docking while it has the ship (src/home.js): the phase, how far through it, and what the
    // garage is doing; null the rest of the time. `homeGuide` is the page's pointer to the garage (G), which the
    // drawing shows as rings from the dish; nothing here reads it.
    this.home = null;
    this.homeGuide = false;
    // A docking at a station (src/docking.js): `berth` while the ship dives and rises into its dock (or out of it, `leaving`), null
    // once it is held there; `dockHeld` which dock holds it (the pad or the external one) and since when, null when not docked.
    this.berth = null;
    this.dockHeld = null;
    // The station a ship has just left the berth of (or loaded inside): its body does not hold the ship
    // until the ship is clear of it (World.resolveHits).
    this.leavingStation = null;
    // What the ship is next to and would act on (World.updateSelection, every step): its id and the candidate itself, whose menu
    // the page shows; null when there is none.
    this.selectedId = null;
    this.selected = null;
    // The sector the ship is in and its bodies, laid by World.loadSector (from the end of this constructor on): the planets, holes
    // and stations built for it (sectorBodies) and what pulls in it (`attractors`, rebuildAttractors).
    this.sector = null;
    this.planets = [];
    this.holes = [];
    this.stations = [];
    this.attractors = [];
    this.deadEdges = [];
    // A dive into a dead edge's fog: how deep it went, and whether the rope's sound was played (World.stepBoundary);
    // the fog's wake, where the ship has been in it lately (World.drawDeadEdges).
    this.ropeDive = { deepest: 0, told: false };
    this.fogWake = [];
    // The fog puffs' own clock (World.stepFogWake): a counter for their jitter, and when the hull and the exhaust last left one;
    // and the cells the fog is worked in, a buffer the drawing keeps (src/worldDraw.js), null until the fog is first drawn.
    this.fogSerial = 0;
    this.fogHullAt = -Infinity;
    this.fogJetAt = -Infinity;
    this.fogCells = null;

    // Progress. Held here so the simulation can read it, written to disk by
    // whoever owns the frame: persistence is not a job for a physics step.
    this.ledger = new Progress();
    this.collection = new Collection();
    this.pilot = new Pilot();
    // The crews' ships the hangar holds are the pilot's notes (src/hangar.js CREW_SHIPS): it reads them as they are.
    this.hangar.crews = this.pilot.notes;
    // Signs this pilot has left (signs.js). Not to be confused with `signals`,
    // the broadcasts that teach the words a sign is written in.
    this.signs = new SignBoard();
    // The flags the pilot put on the map (src/flags.js), one slot a colour: they stand in the world where the map landed them,
    // are taken down by hand, and are in the save.
    this.flags = emptyFlags();
    this.cargo = null;
    this.signals = [];
    // The finds in this sector that can be opened now (src/rewards.js): the souvenir
    // caches, and the paint caches beside them. Then the friendly craft that have
    // hailed the pilot this visit (src/traffic.js).
    this.caches = [];
    this.paintCaches = [];
    // SUNSET's cache and any other look found in open space (src/looks.js LOOK_FINDS): a third kind beside the two.
    this.lookCaches = [];
    this.hailed = new Set();
    // The pilot's greetings (World.greetCraft, src/greetings.js): when each craft was last greeted, the last lines said (so neither
    // is said twice running), and the crafts' answers waiting for their moment (said in World.step).
    this.greeted = new Map();
    this.lastHello = null;
    this.lastReply = null;
    this.greetings = [];
    // A named craft out of O-08 passing through this sector now and then (src/traffic.js stepVisitor); only
    // where the world asks for them (the game's page), like the droids.
    this.visitor = null;
    this.autoVisitors = false;
    this.visitorIn = CONFIG.traffic.visit.first;
    // The friendly NPC ships of the grid, each going where it likes over the whole grid (src/npcFleet.js), and the memory of the last
    // 20 minutes they lean on (`recent`, src/pacing.js); its own stream, so a seeded check's others are not disturbed.
    this.fleet = new Fleet();
    this.recent = [];
    // The last line said for each kind of thing an NPC says (src/voices.js pickLine), so none is said twice running.
    this.said = new Map();
    this.lostCargo = [];
    // The last seconds of flight, frozen into a ghost when a wreck strands cargo.
    this.recorder = new TraceRecorder();
    // Credits released by broken rocks: in memory only, per sector visit.
    this.drops = [];
    this.dropSerial = 0;
    // The secret hole into O-08 (src/secretHole.js): where it stands now ({ sectorId, x, y }, fractions, saved) and its
    // body in that sector's list, and the stream its place is rolled with: the world's own when `rollSecret` (the game's page),
    // else a fixed one, so the hole of a check's or a tool's World is where it always is.
    this.secretHole = null;
    this.secretBody = null;
    if (!rollSecret) this.streams.set('secret', newSecretStream());
    // When it comes and goes (src/secretHole.js, the lure; saved since v18), on the pilot's clock.
    this.secretLure = secretLure;
    this.lure = newLure(0);
    // Where the finds are laid as they open (src/cachePlaces.js; SX, 2026-10-02: «тут нужно интереснее сгенерировать логику»).
    // The game's page turns it on; a World of a check or a tool lays nothing, and its finds lie at the catalogue's places, as
    // the checks have always flown to them.
    this.placeCaches = false;
    this.rockCredits = 0;          // this session, for the H diagnostics
    this.rockFuel = 0;             // fuel units taken from rocks this session, likewise
    this.spillReadyAt = -Infinity; // collisions spill coins at most this often
    this.tankFullCueAt = -Infinity; // a canister left for a full tank is named at most this often
    // Pirates (src/pirates.js): in memory only, never saved. `encounter` is the
    // fight in progress, or null; the 'pirate' stream steers them and places them. `shoutAt`: when one last shouted (src/pirates.js
    // pirateShout), for the shouts' spacing.
    suspendPirateCombat(this);
    this.pirates = [];
    this.shoutAt = -Infinity;
    // The boss TOLLKEEPER (src/boss.js) while its fight is on, or null: in memory only, never saved. Its quest (src/bossQuest.js): where it
    // waits ({ sectorId, x, y, from, stage }, in the save as a quest), and the smoke's square round its fight ({ x, y, half }) or null.
    this.boss = null;
    this.bossQuest = null;
    this.bossArena = null;
    // The NPC ships watching its fight from the smoke's edges (src/bossQuest.js gatherCrowd), and when the next calls a line.
    this.bossCrowd = [];
    this.bossCrowdSayAt = 0;
    this.bossCrowdGoAt = 0;
    this.bossRageSaidAt = null;
    // Whether the stations and the home garage float round their places (src/float.js, CONFIG.float; SX's item 17), the game's since
    // SX's word of 2026-10-04; off only for a check (still stations, on their old drift).
    this.floating = true;
    // Whether the fog past a dead edge is worked cell by cell only in its band and laid as rows deeper in (src/worldDraw.js, chat R),
    // the game's since SX's word of 2026-10-04; off only for a check that reads the whole field cell by cell (the same glyphs).
    this.fogBand = true;
    // Whether the smoke at the view's sides is drawn while the hull is in smoke (src/cloudDraw.js drawCloudSides): GRAPHICS' COCKPIT
    // SMOKE, kept in the browser (SX, 2026-10-07: «дайь возможность тогда отключать дым в настройке графики ... именно который в кабине
    // когда ты дыму»). Only the drawing: the state it reads (`cloudSide`) goes on.
    this.cockpitSmoke = true;
    // The smoke clouds (src/clouds.js, whose head says each): the lab's switch (`clouds`, the look the page asks for; none in the
    // game yet, nor in a check's World that does not ask), the clouds laid per sector, the hull in one and since when, the side
    // smoke's share, the wisps where a hull went in or out, whether the ship was up last step, the wake in the ship's sector and
    // which sector that is, and the wake's own clock (a counter for its jitter, when the hull and the exhaust last puffed).
    this.clouds = null;
    this.cloudCache = new Map();
    this.inCloud = null;
    this.cloudSide = 0;
    this.cloudPuffs = [];
    this.cloudWasUp = false;
    this.cloudWake = [];
    this.cloudWakeIn = null;
    this.cloudSerial = 0;
    this.cloudHullAt = -Infinity;
    this.cloudJetAt = -Infinity;
    // The drift and the jump (src/drift.js, src/trick.js, src/shipStep.js, whose heads say each): the presets in force (`stunts`,
    // the page sets them from its switches; null, none: a check's or a tool's World unless it asks), the keys held for them, the
    // drift under way, its way out, a chained drift's chance and the last boost; the jump under way, its landing, its times and
    // the figures drawn ahead; the counts the drawing starts its effects from.
    this.stunts = null;
    this.stuntHands = { jump: false, figure: false, left: false, right: false, buffered: -Infinity, by: 0 };
    this.drift = null;
    this.driftPush = null;
    this.driftChain = null;
    this.lastBoost = null;
    this.air = null;
    this.landing = null;
    this.airLog = null;
    this.trickSeq = null;
    // The trick's soft abort under way (src/trick.js resolveFigures): null, or { at (the world's time it began), side }; a look the
    // drawing reads, on through the contact.
    this.trickAbort = null;
    this.stuntLog = { drifts: 0, boosts: 0, jumps: 0, landings: 0, bounces: 0, aborts: 0 };
    // Whether pirates may find the pilot by themselves (CONFIG.pirates.zones).
    // The graphics lab turns it off and calls them with its buttons.
    this.autoEncounters = true;
    this.pirateSerial = 0;
    this.encounter = null;
    this.pirateReadyAt = CONFIG.pirates.firstDelay;
    this.pirateRollIn = CONFIG.pirates.checkEvery;
    // Squads at posts (src/raids.js): a ruin's guards, how many it has and how many are down; in memory, so a reload
    // brings a ruin's whole squad back (a raid's tally is the ledger's).
    this.posts = new Map();
    // Seconds to the posts' next look (src/raids.js stepPosts): the first at the world's first step. A quiet World holds it at
    // Infinity (checks/lib/world.mjs).
    this.postCheckIn = 0;
    // Quests (src/quests.js): the side quest on now (saved while it is open, src/questSave.js), how each quest that ended went,
    // for the page's plates ('done' or 'late', by quest id), and the stream that offers side quests (seeded in checks).
    this.sideQuest = null;
    this.sideReadyAt = 0;
    // The freight hint's pace (src/freight.js): since when the pilot has been stuck at a ruin with an empty wallet and no cargo, and when the
    // hint may next come; in memory, a load begins them flat.
    this.freightPace = { since: null, readyAt: 0 };
    // The guide's slot (src/guide.js): the radio step on now and the world's time it may next be offered.
    this.guide = null;
    this.guideReadyAt = 0;
    // The guide's steps, numbered as they are offered (src/guide.js, src/questSave.js): the number is in the quest's id.
    this.guideSerial = 0;
    // The opening chapter (src/opening.js): its record, saved (v17), or null for a world with none (a check's, a tool's: the game as
    // it was); the page begins it for a new pilot. `openingState` is its step's memory, never saved.
    this.opening = null;
    this.openingState = null;
    this.supportSaid = false;     // the first-dock support's 'the run is in' call said (src/starterSupport.js; memory only, said again after a load)
    this.questOutcomes = new Map();
    // Seconds to the quests' next look (src/quests.js stepQuests): the first CONFIG.quests.firstAfter into the flight, then one
    // every checkEvery. And the pointers given for random quests (World.giveCursors): how many outcomes have been read, and the
    // random quests already counted.
    this.questCheckIn = CONFIG.quests.firstAfter;
    this.outcomesRead = 0;
    this.questsCounted = new Set();
    this.drifterLeaving = null;    // a pilot just refuelled, flying off: { x, y, angle, t }
    // The second round of quests (QUESTS_V2_HANDOFF.md), saved while open like the first: a ship pestered by pirates with
    // the clock to free it, and the one going away (src/pester.js); a wrecked ship given money and flying off (src/wrecked.js).
    this.pester = null;
    this.pesterLeaving = null;
    this.pesterNext = undefined;
    this.pesterSerial = 0;         // the pestered ships numbered as they come (src/pester.js, src/questSave.js), in their ids
    this.wreckLeaving = null;
    // The reference ships' rare quests (src/specials.js): the ship met or flown with its quest, the borrowed one drifting off,
    // and the pacing of the next (`specialClock`: the pilot's clock when one was first due and when the last ended;
    // src/pacing.js specialDue); `autoSpecials` lets them come by themselves (the game's page; a check's or a tool's world
    // has none unless it asks, like the droids and the visitors).
    this.special = null;
    this.specialLeaving = null;
    this.specialClock = { since: null, endedAt: null };
    this.specialLook = undefined;
    this.specialSerial = 0;
    this.autoSpecials = false;
    // Service droids (src/droids.js): in memory only, like pirates. `droidIn` counts down
    // the seconds of flight until the next one comes. They come by themselves only where the
    // page says so (`autoDroids`, the game's page); a World built by a check or a tool has none
    // unless it asks, so a long headless flight is never met by a droid placed at random.
    this.droids = [];
    this.autoDroids = false;
    this.droidSerial = 0;
    this.droidIn = CONFIG.droids.first;
    // A droid's service drawn as it is done (src/droids.js): a look, in this sector only.
    this.serviceFx = [];
    // The strongest tug the tether gave the hull this step, u/s (src/tow.js), for the sound.
    this.towPull = 0;
    // When the tether's snap was last named (src/tow.js), so it is named at most every CONFIG.tow's snapCue.every.
    this.tetherCueAt = -Infinity;
    // Planets whose orbit the ship is inside, so contact is felt once, each with the
    // speed it was falling at when it crossed the orbit line (what reaching the surface
    // costs, World.resolveHits).
    this.orbitContact = new Map();
    // Bodies and moored rocks are built once per sector and kept, so a sector
    // looks the same from across a seam as from inside it, and everything in
    // it keeps turning when the ship crosses. `neighbours` are the sectors
    // around this one, drawn in place beyond the seams.
    this.bodyCache = new Map();
    this.neighbours = [];
    this.reach = { west: 0, east: 0, north: 0, south: 0 };
    // The page's own (labs/graphics): what the pointer is over (world-pointer.js stepPointed), and how a station's look breaks into
    // pieces (world-art.js; src/debris.js stationDebris asks it, and a World without the page breaks a station into plain boxes).
    this.pointed = null;
    this.stationPieces = null;
    // And how the boss is drawn (labs/graphics/boss-art.js through world-art.js; a World without the page draws none: src/boss.js).
    this.drawBoss = null;
    // And how faint the towed cargo is drawn while the hull dives into a station's dock and rises (world-art.js; src/worldDraw.js reads
    // it, and a World without the page draws its cargo whole).
    this.cargoShade = null;
    this.egg = { held: 0, done: false }; // src/eggs.js's own

    if (quiet) this.quieten();
    if (!secretLure) setSecretHole(this, rollSecretHole(this.rng('secret'), { sectors: secretHoleSectors(this.ledger) }), false);
    this.loadSector(sectorById(START_SECTOR), { announce: false });
    // A new game starts at the home garage's berth (src/home.js): at rest in its bay, nose away from the mouth, not docked: the
    // DOCK row of its menu is the first thing there is to do. Without a home, near the first station.
    const home = homeStation(this), first = this.stations[0];
    if (home) this.placeAtHome(home);
    else this.placeShip(first
      ? { x: first.x, y: first.y, min: first.interactRadius * 1.6, max: first.discoverRadius * 0.7 }
      : null);
    this.cam = { x: this.ship.x, y: this.ship.y };
    this.spawnAsteroids(this.sector.asteroids);
  }

  // The stream called `name`: one generator for each name, made the first time it is asked for from the world's seed and
  // the name, and the same function every time after (so it goes on where it left off). Systems that draw name their own stream,
  // and a draw added to one moves no other's. Every caller asks for its stream here, by name: there is no other handle on one
  // (the `*Rng` fields that copied ten of them went on 2026-10-05, the roadmap's refactoring piece for chat W); a check that pins a
  // stream sets it in `streams` (checks/lib/world.mjs pinStreams). The secret hole's stream is a fixed one in a World not asked to
  // roll it (the constructor's `rollSecret`, src/secretHole.js SECRET_SEED). Streams in use: visit, npc, paint, drop, hole, secret,
  // cache, pirate, quest, droid, spawn (where the ship is placed), field (the rocks: their
  // number, place, size, heading and the splits of a broken one), sky:<sector> (the turn that sector's planets and holes start
  // at), word (which word a signal teaches), fx (sparks and debris, a look only); and the page's own: deal and startRuin (a new
  // pilot's roll, labs/graphics/main.js) and flag (where a map flag lands).
  rng(name) {
    let stream = this.streams.get(name);
    if (!stream) this.streams.set(name, stream = mulberry32(streamSeed(this.seed, name)));
    return stream;
  }

  // A rock of `tier` at (x, y), its size, heading, spin and outline drawn from the 'field' stream.
  newRock(x, y, tier) {
    return new Asteroid(x, y, tier, undefined, this.rng('field'));
  }

  // The page drains the queue every frame. The cap is only for a world stepped with
  // nobody draining (a check, a tool); at 32 it dropped real events in one frame of a
  // pirate squad's loot, 13 of 60, so pickups went unheard (audit EN-08, 2026-10-01).
  emit(type, data = {}) {
    this.events.push({ type, ...data });
    if (this.events.length > EVENT_QUEUE_MAX) this.events.shift();
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------- sectors ---

  loadSector(sector, { announce = true } = {}) {
    this.sector = sector;
    const bodies = this.sectorBodies(sector);
    this.planets = bodies.planets;
    this.holes = bodies.holes;
    this.stations = bodies.stations;
    this.buildProgressObjects(sector);
    this.layEdges(sector);
    this.rebuildAttractors();

    // Anything selected or docked belonged to the sector just left, and so did
    // any loose credits and any orbit the ship was touching. So did a fight
    // with pirates, unless the ship carried it across a seam (enterSector).
    this.selectedId = null;
    this.docked = null;
    this.home = null;
    this.berth = null;
    this.dockHeld = null;
    this.leavingStation = null;
    this.drops = [];
    suspendPirateCombat(this);
    this.pirates = [];
    // A boss's fight is the sector's: loading another ends it (it waits whole for the next visit: src/boss.js).
    this.boss = null;
    this.bossArena = null;
    this.bossCrowd = [];
    this.droids = [];
    this.encounter = null;
    this.orbitContact.clear();
    this.hailed.clear();
    this.fogWake = [];

    const seen = (this.visits.get(sector.id) || 0) + 1;
    this.visits.set(sector.id, seen);
    if (announce) this.emit('sectorEntered', { sectorId: sector.id, label: sector.label, title: sectorTitle(sector), visit: seen });
  }

  // Edges with no sector beyond them, or a closed one (src/frontier.js): computed from the grid and the ledger, not listed,
  // so adding a sector or opening one removes the boundary on that side by itself. With them the sectors drawn round this
  // one and how far past each side things live. Laid by loadSector, and again when a restoration opens a sector beside the
  // pilot (World.openFrontier), so the edge opens at once.
  layEdges(sector = this.sector) {
    this.deadEdges = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .filter(([dx, dy]) => !this.openNeighbour(sector, dx, dy))
      .map(([dx, dy]) => ({ axis: dx ? 'x' : 'y', dir: dx || dy }));
    this.neighbours = this.neighbourSectors(sector);
    const strip = CONFIG.sector.neighbourStrip;
    const open = (dx, dy) => (this.topology.mode === PLANE && this.openNeighbour(sector, dx, dy) ? strip : 0);
    this.reach = { west: open(-1, 0), east: open(1, 0), north: open(0, -1), south: open(0, 1) };
  }

  // The sector one step away when it is open to the pilot, else null: a closed sector (src/frontier.js; SX, 2026-10-02,
  // «Руина открывает сектор») is a dead edge, with the rope and the fog, as the grid's own end is.
  openNeighbour(sector, dx, dy) {
    const s = neighbourOf(sector, dx, dy);
    return s && sectorOpen(this.ledger, s) ? s : null;
  }

  // Planets, holes and stations of a sector, built once per session: the same
  // instances are drawn from across a seam and used inside, so nothing about
  // them (a planet's turn, a beacon's blink) resets when the ship crosses.
  sectorBodies(sector) {
    let b = this.bodyCache.get(sector.id);
    if (!b) {
      // The turn each body starts at is drawn from its sector's own stream, so it does not depend on which sectors were built first.
      const sky = this.rng(`sky:${sector.id}`);
      b = {
        planets: (sector.planets || []).map((p) => new Planet({ ...p, x: p.x * this.width, y: p.y * this.height }, sky)),
        holes: [...(sector.holes || []).map((h) => new BlackHole({ ...h, x: h.x * this.width, y: h.y * this.height }, sky)), ...secretHoleBodies(this, sector)],
        stations: buildStations(sector, { width: this.width, height: this.height }, this.ledger),
      };
      this.bodyCache.set(sector.id, b);
    }
    return b;
  }

  // The up to eight sectors around this one, with the offset that places their
  // sector-local coordinates in this sector's frame. None on a torus.
  neighbourSectors(sector) {
    if (this.topology.mode !== PLANE) return [];
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const s = this.openNeighbour(sector, dx, dy);
        if (s) out.push({ sector: s, dx, dy, ox: dx * this.width, oy: dy * this.height });
      }
    }
    return out;
  }

  // True past a dead edge's fog (CONFIG.sector.boundary.limit, plus `pad`), or
  // more than the neighbour strip past a live seam. What is just across a seam
  // stays: the next sector is drawn there; what is in the fog stays too, until
  // the rope brings it back or it drifts out past the limit.
  beyondLimits(x, y, pad = 0) {
    if (this.topology.mode !== PLANE) return false;
    const R = this.reach, dead = CONFIG.sector.boundary.limit + pad;
    return x < -(R.west || dead) || x >= this.width + (R.east || dead) ||
      y < -(R.north || dead) || y >= this.height + (R.south || dead);
  }

  // Finds that can be opened and signals not yet heard, for this sector only. Opened
  // ones, and finds still sealed behind a ruin, are simply not built: the ledger is
  // the record, and the world is derived from it. (The three authored 25 CR coins on
  // their moored rocks were cut on 2026-10-01, SX: «вот такие огромные гредитсы мы
  // вырезаем»; coins come from rocks and pirates now, and nowhere else.)
  buildProgressObjects(sector) {
    const W = this.width, H = this.height;
    this.buildFinds(sector);
    this.signals = signalsIn(sector.id)
      .filter((def) => !this.ledger.heard.has(def.id))
      .map((def) => ({
        id: def.id, def, x: def.x * W, y: def.y * H,
        interactRadius: CONFIG.signal.reach,
        discoverRadius: CONFIG.signal.discoverRadius,
      }));
    this.buildLostCargo(sector);
  }

  // The finds of this sector that can be opened (src/rewards.js), souvenirs and
  // paints apart: each kind has its own drawing. Built again when one is opened
  // and when a restoration here unlocks two.
  // Each floats and turns (CONFIG.cache.float): its way and phase from its id. One already here keeps where it was
  // knocked to and how it moves.
  buildFinds(sector = this.sector) {
    const W = this.width, H = this.height, F = CONFIG.cache.float;
    const was = new Map([...this.caches, ...this.paintCaches, ...this.lookCaches].map((c) => [c.id, c]));
    const built = [...availableIn(sector.id, this.ledger), ...lookFindsIn(sector.id, this.pilot.looks)].map((def) => {
      const seed = hashId(def.id);
      const prev = was.get(def.id);
      return {
        id: def.id, def, x: prev ? prev.x : def.x * W, y: prev ? prev.y : def.y * H,
        vx: prev?.vx ?? 0, vy: prev?.vy ?? 0,
        paint: def.kind === 'paint' ? def.content : null,
        interactRadius: CONFIG.cache.interactRadius,
        discoverRadius: CONFIG.cache.discoverRadius,
        angle: prev?.angle ?? ((seed & 1023) / 1023) * TAU,
        spin: ((seed >> 10) & 1 ? 1 : -1) * lerp(F.spin[0], F.spin[1], ((seed >>> 11) & 1023) / 1023),
        whirl: prev?.whirl ?? 0,
        bobPhase: ((seed >>> 21) & 1023) / 1023 * TAU,
      };
    });
    this.caches = built.filter((c) => c.def.kind === 'souvenir');
    this.paintCaches = built.filter((c) => c.def.kind === 'paint');
    this.lookCaches = built.filter((c) => c.def.kind === 'look');
  }

  // Cargo lost here on an earlier flight, where it came to rest, and other pilots' (src/lostCargo.js): built from the ledger.
  buildLostCargo(sector) { buildLostCargo(this, sector); }

  // Lost cargo lying where a station's menu reaches drifts out of it (src/keepOut.js).
  driftLostCargo(dt) { driftLostCargo(this, dt); }

  // A fresh asteroid field for the current sector, up to the sector's count.
  spawnField(sector) {
    this.asteroids.length = 0;
    this.spawnAsteroids(sector.asteroids);
  }

  rebuildAttractors() {
    this.attractors = [
      ...this.holes.map((h) => ({ kind: 'hole', x: h.x, y: h.y, mass: h.mass, kill: h.horizon })),
      ...this.planets.map((p) => ({ kind: 'planet', x: p.x, y: p.y, mass: p.mass, kill: p.radius * 0.97,
        orbit: p.radius + CONFIG.planet.orbit.height })),
    ];
  }

  // A corner crossing is resolved as two explicit single-axis transitions, each
  // validated against the grid on its own, so a diagonal exit cannot skip a
  // sector or fire two entry events for the same one.
  resolveTransitions() {
    if (this.topology.mode !== PLANE) return;
    const ship = this.ship;
    const slack = CONFIG.sector.seamSlack;
    for (let guard = 0; guard < 4; guard++) {
      const ex = ship.x < 0 ? -1 : ship.x >= this.width ? 1 : 0;
      const ey = ship.y < 0 ? -1 : ship.y >= this.height ? 1 : 0;
      if (!ex && !ey) return;
      let crossed = false;
      for (const [dx, dy] of [[ex, 0], [0, ey]]) {
        if (!dx && !dy) continue;
        const next = this.openNeighbour(this.sector, dx, dy);
        if (!next || next.id === this.sector.id) { this.holdAtLimit(dx, dy); continue; }
        // Past a live seam, but not yet by the slack: still this sector.
        const past = dx > 0 ? ship.x - this.width : dx < 0 ? -ship.x : dy > 0 ? ship.y - this.height : -ship.y;
        if (past < slack) continue;
        this.enterSector(next, dx, dy);
        crossed = true;
        break;
      }
      if (!crossed) return;
    }
  }

  // The backstop behind the rope. The rope is tuned so that a ship never gets
  // near `limit` in flight (a full-speed dive goes some 400 u in); if one does
  // (a teleport, a respawn, a future faster chassis) it is held AT the limit
  // with its outward speed removed, and the rope takes it from there.
  holdAtLimit(dx, dy) {
    const ship = this.ship, L = CONFIG.sector.boundary.limit;
    if (dx < 0 && ship.x < -L) { ship.x = -L; ship.vx = Math.max(0, ship.vx); }
    else if (dx > 0 && ship.x > this.width + L) { ship.x = this.width + L; ship.vx = Math.min(0, ship.vx); }
    if (dy < 0 && ship.y < -L) { ship.y = -L; ship.vy = Math.max(0, ship.vy); }
    else if (dy > 0 && ship.y > this.height + L) { ship.y = this.height + L; ship.vy = Math.min(0, ship.vy); }
  }

  // How far past each dead edge's line a point is, into the fog; 0 inside. In the boss's fight the four sides of its smoke's square are
  // dead edges too (src/bossQuest.js world.bossArena; SX, 2026-10-14: «арена должна быть ограничена ... буквально нашим туманом, то есть
  // отскакивать от них можно»): the same rope throws a hull back off them, a pirate and the cargo too (boundaryAccel).
  edgeDepths(x, y) {
    const out = this.deadEdges.map((e) => {
      const p = e.axis === 'x' ? x : y;
      const size = e.axis === 'x' ? this.width : this.height;
      return { edge: e, depth: Math.max(0, e.dir < 0 ? -p : p - size) };
    });
    const A = this.bossArena;
    if (A) for (const e of ARENA_EDGES) {
      const p = e.axis === 'x' ? x - A.x : y - A.y;
      out.push({ edge: e, depth: Math.max(0, e.dir < 0 ? -A.half - p : p - A.half) });
    }
    return out;
  }

  // The rope's pull along an edge's outward normal on a body `depth` past the line moving out at `out` u/s
  // (negative coming back): a spring that stiffens deep in, its give damped one way more than the other.
  static ropeAccel(depth, out) {
    const B = CONFIG.sector.boundary;
    if (depth <= 0) return 0;
    return -B.rope * B.rope * depth * (1 + (depth / B.stiffen) ** 2) - (out > 0 ? B.dampOut : B.dampBack) * out;
  }

  // The rope on the ship. Applied to velocity before the ship integrates, like gravity. A dive deeper than
  // `soundDepth` reports itself once, as the rope throws the ship back ('boundaryBlocked'); leaving the fog ends it.
  stepBoundary(dt) {
    if (this.topology.mode !== PLANE || (!this.deadEdges.length && !this.bossArena)) return;
    const ship = this.ship, B = CONFIG.sector.boundary;
    let deepest = 0, back = false;
    for (const { edge, depth } of this.edgeDepths(ship.x, ship.y)) {
      if (depth <= 0) continue;
      const key = edge.axis === 'x' ? 'vx' : 'vy';
      const out = ship[key] * edge.dir;          // positive while heading out
      ship[key] += World.ropeAccel(depth, out) * edge.dir * dt;
      deepest = Math.max(deepest, depth);
      if (ship[key] * edge.dir < 0) back = true;
    }
    this.stepFogWake(dt, deepest);
    const dive = this.ropeDive ?? (this.ropeDive = { deepest: 0, told: false });
    if (deepest <= 0) { dive.deepest = 0; dive.told = false; return; }
    dive.deepest = Math.max(dive.deepest, deepest);
    if (back && !dive.told && dive.deepest >= B.soundDepth) {
      dive.told = true;
      this.emit('boundaryBlocked', { sectorId: this.sector.id, label: this.sector.label, depth: Math.round(dive.deepest) });
    }
  }

  // The fog's puffs (presentation, kept here so it runs on the world's clock; drawDeadEdges draws them, CONFIG
  // sector.boundary.fog `cone` and `jet` say how): the hull's while it is past the line, the exhaust's while it runs near
  // the line. Each is { x, y, t, life, near, spread, rim, phase, size } and a jet's flies on { vx, vy }.
  stepFogWake(dt, deepest) {
    const F = CONFIG.sector.boundary.fog, K = F.cone, J = F.jet, ship = this.ship, t = this.time, wake = this.fogWake;
    stepWake(wake, dt, t, J.drag);
    if (!ship.alive) return;
    // Their jitter from a counter, not the page's random: the same flight leaves the same puffs (src/fogCells.js wakePuff).
    const rnd = () => fogHash(++this.fogSerial, 9173);
    if (deepest > 0 && t - this.fogHullAt >= K.every) {
      this.fogHullAt = t;
      wake.push(wakePuff(K, t, rnd, { x: ship.x, y: ship.y }));
    }
    const power = enginePower(ship, J);
    if (power > 0 && t - this.fogJetAt >= J.every && this.nearDeadEdge(ship.x, ship.y, J.reach)) {
      this.fogJetAt = t;
      // The engine blows out of the hull's rear, the retro out of its nose (src/fogCells.js jetPuff).
      wake.push(jetPuff(ship, J, t, rnd, power));
    }
  }

  // Is (x, y) within `reach` u of a dead edge of this sector, on either side of its line?
  nearDeadEdge(x, y, reach) {
    for (const e of this.deadEdges) {
      const p = e.axis === 'x' ? x : y, size = e.axis === 'x' ? this.width : this.height;
      if ((e.dir < 0 ? -p : p - size) > -reach) return true;
    }
    const A = this.bossArena;
    return !!A && (Math.abs(x - A.x) > A.half - reach || Math.abs(y - A.y) > A.half - reach);
  }

  // The same rope as an acceleration on any body, for craft that are not the
  // ship (pirates, the towed cargo). It is stepBoundary's arithmetic without
  // the ship or the sound, and checks/pirates.mjs holds the two equal.
  boundaryAccel(x, y, vx, vy) {
    let ax = 0, ay = 0;
    if (this.topology.mode !== PLANE || (!this.deadEdges.length && !this.bossArena)) return { ax, ay };
    for (const { edge, depth } of this.edgeDepths(x, y)) {
      if (depth <= 0) continue;
      const out = (edge.axis === 'x' ? vx : vy) * edge.dir;
      const a = World.ropeAccel(depth, out);
      if (edge.axis === 'x') ax += a * edge.dir; else ay += a * edge.dir;
    }
    return { ax, ay };
  }

  // Crossing a seam changes coordinates, not the picture. Everything is moved
  // by exactly one sector (no inset), so the ship, the camera, the follower,
  // nearby rocks, shots, sparks and coins keep their places relative to each
  // other and to the bodies drawn beyond the seam; the old sector becomes one
  // of the neighbours drawn in place. Heading and velocity are untouched.
  enterSector(next, dx, dy) {
    const ship = this.ship;
    const fromId = this.sector.id;
    const shiftX = -dx * this.width, shiftY = -dy * this.height;
    const near = CONFIG.sector.carryRange;
    const carried = this.asteroids.filter((a) => !a.moored &&
      Math.hypot(a.x - ship.x, a.y - ship.y) < near);
    const drops = this.drops;
    // Recovery cargo belongs to its NPC's sector; its squad returns there when the pilot crosses a seam.
    const pirates = this.pirates.filter((p) => p.post?.kind !== 'pester'), encounter = this.encounter;
    const roleSystems = this.pirateRoleSystems;
    // A droid close by crosses too (the one the pilot is flying to); the rest stay behind.
    const droids = this.droids.filter((d) => Math.hypot(d.x - ship.x, d.y - ship.y) < near);

    ship.x += shiftX; ship.y += shiftY;
    this.cam.x += shiftX; this.cam.y += shiftY;
    if (this.cargo) { this.cargo.x += shiftX; this.cargo.y += shiftY; }
    for (const a of carried) { a.x += shiftX; a.y += shiftY; }
    for (const b of this.bullets) { b.x += shiftX; b.y += shiftY; }
    for (const p of this.particles.items) { p.x += shiftX; p.y += shiftY; }
    for (const d of drops) { d.x += shiftX; d.y += shiftY; }
    // Pirates follow across a seam, or it would be a way out of the fight:
    // they move with everything else, and so does what they last saw of the ship.
    for (const p of pirates) {
      p.x += shiftX; p.y += shiftY;
      if (p.seen) { p.seen.x += shiftX; p.seen.y += shiftY; }
    }
    for (const d of droids) {
      d.x += shiftX; d.y += shiftY;
      for (const at of [...d.route, d.leaveTo]) if (at) { at.x += shiftX; at.y += shiftY; }
    }

    this.loadSector(next);
    this.drops = drops;
    // Carry hunting squads' depleted resources across the seam, but leave mines in the departed sector.
    this.pirateRoleSystems = new Map([...roleSystems].filter(([id]) => pirates.some((p) => p.mode !== 'guard' && p.roleSystemId === id)));
    for (const sys of this.pirateRoleSystems.values()) { sys.closed = false; sys.reason = null; sys.sectorId = next.id; }
    // A squad still circling its post (src/raids.js) stays there; one that is hunting follows.
    this.pirates = pirates.filter((p) => p.mode !== 'guard');
    this.droids = droids;
    this.encounter = encounter;
    if (this.encounter && !this.pirates.some((p) => p.mode !== 'guard' && p.mode !== 'leave')) this.endEncounter('lost');
    this.asteroids = [...carried];
    this.spawnAsteroids(next.asteroids, CONFIG.sector.spawnClear);
    this.emit('sectorLeft', { from: fromId, to: next.id });
  }

  // ------------------------------------------------------------- spawning ---

  delta(ax, ay, bx, by) {
    return this.topology.delta(ax, ay, bx, by);
  }

  clearance(x, y, need) {
    const topo = this.topology;
    for (const a of this.attractors) {
      if (hypot2(topo.dx(x, a.x), topo.dy(y, a.y)) < a.kill + need) return false;
    }
    for (const s of this.stations) {
      if (hypot2(topo.dx(x, s.x), topo.dy(y, s.y)) < s.hullRadius + need) return false;
    }
    return true;
  }

  // `near` biases placement towards a point, used for the opening spawn so the
  // first station is within sight of the start rather than somewhere in 7200
  // units of empty sector. Respawns after a wreck are unbiased.
  // Resuming is not spawning. `clearance` keeps a fresh spawn away from
  // everything including stations, which is right for a respawn and wrong for a
  // reload: a pilot is entitled to have parked next to a station, or inside its
  // berth. Resuming only requires a real position that is not inside something
  // lethal.
  isSafeResume(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (this.beyondLimits(x, y)) return false;
    // Just past a live seam is a real place (the switch waits for the slack),
    // but not further: a save from there resumes where the ship was.
    const slack = CONFIG.sector.seamSlack;
    if (x < -slack || y < -slack || x >= this.width + slack || y >= this.height + slack) return false;
    const topo = this.topology;
    for (const a of this.attractors) {
      if (hypot2(topo.dx(x, a.x), topo.dy(y, a.y)) < a.kill + 40) return false;
    }
    return true;
  }

  // The ship at rest in the home garage's bay (src/home.js startPose), alive and blinking as a fresh spawn is.
  placeAtHome(station) {
    const s = this.ship, at = startPose(station);
    s.x = at.x; s.y = at.y; s.vx = 0; s.vy = 0;
    s.angle = at.angle; s.angVel = 0;
    s.alive = true; s.invuln = CONFIG.ship.invulnTime;
  }

  placeShip(near = null) {
    const s = this.ship, rng = this.rng('spawn');
    for (let i = 0; i < 400; i++) {
      let x, y;
      if (near && i < 200) {
        const a = between(rng, 0, TAU);
        const d = between(rng, near.min, near.max);
        x = clamp(near.x + Math.cos(a) * d, 200, this.width - 200);
        y = clamp(near.y + Math.sin(a) * d, 200, this.height - 200);
      } else {
        x = between(rng, 0, this.width);
        y = between(rng, 0, this.height);
      }
      if (!this.clearance(x, y, 520)) continue;
      let clear = true;
      for (const a of this.asteroids) {
        const d = this.delta(x, y, a.x, a.y);
        if (Math.hypot(d.x, d.y) < a.radius + 320) { clear = false; break; }
      }
      if (!clear) continue;
      s.x = x; s.y = y; s.vx = 0; s.vy = 0;
      s.angle = -Math.PI / 2; s.angVel = 0;
      s.alive = true; s.invuln = CONFIG.ship.invulnTime;
      return;
    }
    s.x = this.width * 0.5; s.y = this.height * 0.12;
    s.vx = 0; s.vy = 0; s.alive = true;
  }

  // The rock field (src/field.js); none while `autoRocks` is off.
  spawnAsteroids(n, clear = 700, toward = null) { if (this.autoRocks) spawnRocks(this, n, clear, toward); }

  // The sky's chance taken out (the constructor's `quiet`; checks/lib/world.mjs `quiet` does it for a World a check built itself): no
  // rock now and none laid or put back (`autoRocks`), no pirate coming by itself (`autoEncounters`, which a check about pirates sets
  // on again). What is put in by hand stays.
  quieten() {
    this.autoRocks = false;
    this.autoEncounters = false;
    this.asteroids = [];
  }

  // The pull of every attractor on a point as { x, y } (u/s^2): the module's pair PULL, refilled by the next call.
  gravityAt(x, y) {
    let gx = 0, gy = 0;
    const soft = CONFIG.gravity.softening, topo = this.topology;
    for (const a of this.attractors) {
      const dx = topo.dx(a.x, x), dy = topo.dy(a.y, y);
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2) || 1;
      const acc = Math.min(a.mass / Math.max(r2, soft * soft), CONFIG.gravity.maxAccel);
      gx += (dx / r) * acc;
      gy += (dy / r) * acc;
    }
    PULL.x = gx; PULL.y = gy;
    return PULL;
  }

  // ----------------------------------------------------------- simulation ---

  step(dt, input) {
    this.time += dt;
    // The pilot's clock: it times deliveries, and it is saved (CONFIG.delivery).
    this.ledger.clock += dt;
    if (this.ledger.stranded.size) returnLostCargo(this);
    const ship = this.ship;

    for (const p of this.planets) p.update(dt);
    for (const h of this.holes) h.update(dt);
    // The stations float (src/float.js; `floating`, off only for a check), drift otherwise; the home garage on its own,
    // softer float (CONFIG.float.home).
    const float = this.floating ? CONFIG.float : null;
    for (const s of this.stations) s.update(dt, this.time, floatOf(s, float));
    this.fleet.step(this, dt);
    // What is drawn beyond the seams keeps moving too, so it is already in
    // step when the ship crosses.
    for (const n of this.neighbours) {
      const b = this.sectorBodies(n.sector);
      for (const p of b.planets) p.update(dt);
      for (const h of b.holes) h.update(dt);
      for (const s of b.stations) s.update(dt, this.time, floatOf(s, float));
    }

    // A wreck or a sector load takes the ship out of the garage's hands: its docking ends with them.
    if (this.home && this.docked !== this.home.stationId) this.home = null;
    if (this.berth && this.docked !== this.berth.stationId) this.berth = null;
    if (this.dockHeld && this.docked !== this.dockHeld.stationId) this.dockHeld = null;
    if (this.docked) {
      if (this.home) stepHome(this, dt);
      else stepDocked(this, dt);
    } else {
      // The pulls on the hull, the engine's share and the ship's own step (src/shipStep.js).
      stepShip(this, dt, input);
      this.burnFuel(dt);
      stepEggs(this, dt);
      this.stepTraffic();
      stepVisitor(this, dt);
      this.holdOffSurfaces();
      const c = this.topology.contain(ship.x, ship.y);
      if (this.topology.mode === WRAP) { ship.x = c.x; ship.y = c.y; }
      else this.resolveTransitions();
      if (ship.alive) this.recorder.sample(this.time, this.sector, ship);
    }

    // A greeted craft's answer, when its time comes (greetCraft).
    if (this.greetings.length) {
      for (const g of this.greetings.filter((q) => this.time >= q.at)) {
        const at = this.craftAt(g.craftId);
        if (at) this.emit('trafficHail', { craftId: g.craftId, label: g.label, line: g.line, x: at.x, y: at.y, sectorId: this.sector.id, greet: true });
      }
      this.greetings = this.greetings.filter((q) => this.time < q.at);
    }

    // Back near the wreck once its time is up (src/wreck.js).
    respawnShip(this);
    ship.holeGrace = Math.max(0, ship.holeGrace - dt);
    this.hullGrace = Math.max(0, this.hullGrace - dt);

    if (!this.docked && ship.wantsToFire(input)) {
      const shot = ship.fire();
      this.bullets.push(shot);
      // For the page's sound, like every event: nothing here listens to it.
      this.emit('shotFired', { owner: 'pilot', x: shot.x, y: shot.y, sectorId: this.sector.id });
    }

    stepOpening(this);
    // The secret hole comes to a pilot alone in the void, and goes (src/secretHole.js, H3 LURE).
    stepSecretHole(this, dt);
    // The smoke clouds (src/clouds.js; the game's since 2026-10-06): a hull going through one, or coming down in one.
    stepClouds(this, dt);
    stepPirates(this, dt);
    stepBoss(this, dt);
    stepBossQuest(this, dt);
    stepQuests(this, dt);
    giveCursors(this);
    giveRadio(this);
    stepRadioCall(this);
    stepDroids(this, dt);
    this.stepBullets(dt);
    this.stepAsteroids(dt);
    // Absorb a touched pile before its solid pieces spread apart. A second
    // collection below catches what drifts into reach during this step.
    this.collectPickups();
    this.stepDrops(dt);
    this.driftLostCargo(dt);
    this.collectPickups();
    this.updateCargo(dt);
    this.pirateCombatDt = dt;
    this.resolveHits();
    this.pirateCombatDt = 0;
    this.stepCaches(dt);
    // A cache knocked into a station's menu reach eases out of it (src/keepOut.js).
    easeCaches(this, dt);
    settleGround(this, dt);
    this.particles.update(dt);
    // A broken body's hanging pieces turned back off the stations' bodies as they come to them (src/field.js; SX, 2026-10-07): only
    // within `CONFIG.debris.held` u of a body's face and closing on it, so a station's own pieces flung out from inside go their way.
    holdOutOfStations(this, this.particles.items, (p) => (p.hang ? CONFIG.debris.size : -1), CONFIG.asteroid.drops.body.bounce, CONFIG.debris.held);
    this.cullAsteroids();
    this.updateSelection();

    keepField(this);
  }

  // The pickups and the loose coins and canisters (src/pickups.js): what the hull takes by touching it, the drops' step, a broken rock's
  // scatter, and the coins a blow spills. Methods because the step, the wreck, the contact, the tools and the checks call them on the world.
  collectPickups() { collectPickups(this); }
  stepDrops(dt) { stepDrops(this, dt); }
  releaseDrop(rock) { return releaseDrop(this, rock); }
  spillCoins(x, y) { return spillCoins(this, x, y); }

  // Whether the world stands still: any reason held (pauseReasons). Read only: a write is a TypeError (an ES module is strict).
  get paused() {
    return this.pauseReasons.size > 0;
  }
  // `reason` held (`on`), or let go; returns whether the world stands still now.
  holdPause(reason, on = true) {
    if (on) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
    return this.paused;
  }
  // Every reason let go: a lab's scene or drawer jump starts the flight afresh.
  clearPause() {
    this.pauseReasons.clear();
  }

  // The flown ship's hull points and tank: its chassis's own, or the
  // standard's (CONFIG) for a chassis without them (src/chassis.js).
  get hullMax() {
    return this.ship.chassis.hull ?? CONFIG.hull.max;
  }

  get fuelTank() {
    return this.ship.chassis.tank ?? CONFIG.fuel.tank;
  }

  // What a real wreck gives back: a share of the flown ship's hull (CONFIG.hull.respawnShare).
  get respawnHull() {
    return clamp(Math.round(this.hullMax * CONFIG.hull.respawnShare), 1, this.hullMax);
  }

  // What a blow closing at `closing` u/s costs the hull (CONFIG.hull; SX, 2026-10-01: «высокая
  // скорость является множителем для дамага», then «более гибко»): nothing below `touchSpeed`;
  // otherwise the obstacle's `base` points at `refSpeed`, times (closing / refSpeed) to `power`,
  // rounded, and never under one; a light thing (`light.kinds`: a droid, a pirate run into) always
  // between `light.min` and `light.max`. `kind` names the base: 'rock', 'planet', 'station',
  // 'droid', 'pirate', 'cache' or 'npc'; `landed`: the hull came down on it from a jump, `landing.mult`
  // times as heavy (src/contact.js impactPoints is the rule).
  impactDamage(closing, kind = 'rock', landed = false) {
    return impactPoints(closing, kind, landed);
  }

  // A rock's price at a closing speed.
  rockDamage(closing) {
    return this.impactDamage(closing, 'rock');
  }

  // What a blow costs a pirate, on its own few hit points (src/encounters.js).
  pirateImpact(closing) { return pirateImpact(closing); }

  // Shots and blows (src/hits.js): what costs the hull points (the one entry point), a touch against a rock, the shots in flight and what they
  // hit, and a rock broken. Methods because the contact, the pirates, the tow, the tools and the checks call them on the world.
  damageShip(amount, cause = 'impact', detail = {}) { return damageShip(this, amount, cause, detail); }
  bumpShip(rock, nx, ny, closing, touch) { bumpShip(this, rock, nx, ny, closing, touch); }
  stepBullets(dt) { stepBullets(this, dt); }
  resolveHits() { resolveHits(this); }
  breakAsteroid(index) { breakAsteroid(this, index); }
  ramAsteroid(index, nx, ny, closing) { ramAsteroid(this, index, nx, ny, closing); }

  // A wreck's pieces hanging in space (src/debris.js).
  wreckDebris(x, y, pieces, vx = 0, vy = 0) { wreckDebris(this, x, y, pieces, vx, vy); }


  // ---------------------------------------------------------- solid bodies ---

  // The planet whose solid body contains a point, grown by `pad`, or null. The rocks' cull asks this and consumedByHole of every rock every
  // step, so the plane's two differences come from the topology (Topology.dx / dy) and the length from hypot2: `delta()`'s {x, y} and
  // Math.hypot's boxed numbers, a call each, were 13 KB a step in J-05 (tools/garbage-probe.mjs --call, 2026-10-09; now 38 bytes).
  insidePlanet(x, y, pad) {
    const topo = this.topology;
    for (const p of this.planets) {
      if (hypot2(topo.dx(x, p.x), topo.dy(y, p.y)) < p.radius + pad) return p;
    }
    return null;
  }

  // A planet's orbit on the ship (src/shipStep.js stepOrbits): kept as a method, checks/pirates.mjs and the tools step it.
  stepOrbits(dt) {
    stepOrbits(this, dt);
  }

  // The orbit's push and braking as an acceleration on any body, for craft that
  // are not the ship (pirates): stepOrbits' arithmetic without the tumble, the
  // jolt or the contact event. checks/pirates.mjs holds the two equal. { ax, ay }: the module's pair PUSH, refilled by the next call.
  orbitAccel(x, y, vx, vy) {
    const O = CONFIG.planet.orbit, topo = this.topology;
    let ax = 0, ay = 0;
    for (const p of this.planets) {
      const dx = topo.dx(x, p.x), dy = topo.dy(y, p.y);
      const dist = hypot2(dx, dy);
      const surface = p.radius * 0.97;
      const orbit = p.radius + O.height;
      if (dist >= orbit || dist < 1e-6) continue;
      const nx = dx / dist, ny = dy / dist;
      const f = clamp((orbit - dist) / (orbit - surface), 0, 1);
      const out = vx * nx + vy * ny;
      let a = O.push * f * f;
      if (out < 0) a += O.damping * f * f * -out;
      ax += nx * a; ay += ny * a;
    }
    PUSH.ax = ax; PUSH.ay = ay;
    return PUSH;
  }

  // A planet held solid under a ship that cannot be wrecked (src/shipStep.js holdOffSurfaces).
  holdOffSurfaces() {
    holdOffSurfaces(this);
  }

  // A black hole is a passage, not a death (SX, 2026-09-24). The ship comes out
  // of another hole, rolled at random on every passage and never the one it
  // fell into, on the heading it fell in with, just outside the exit's strong
  // pull and fast enough to leave it, and that hole cannot take it again for a
  // moment. Cargo, camera and follower keep their offsets from the ship. The
  // trace starts again: a ghost never slides across the map.
  transitHole(hole) {
    const ship = this.ship;
    const B = CONFIG.blackHole;
    const from = this.sector;
    // Pirates never follow through a hole: the fight is over, and they lose the
    // trail (SX: "убежать от них можно прыгая через черные дыры"). The event is
    // held back until the ship is out, because arriving in a sector wipes the
    // feedback lines and this one is meant to be read there.
    const ended = this.endEncounter('hole', { deferEvent: true });
    // The secret hole leads to O-08's own, the only way in; every other hole, O-08's among them, to an ordinary one
    // (SX, 2026-10-02: «выкидывает наружу из рандомной дыры которая не является секретной»).
    // Only into a sector open to the pilot (src/frontier.js): with none (the start's J-05 has the one hole of its two sectors), the
    // hole throws the ship back out of itself.
    const others = hole.id === SECRET_HOLE_ID ? [holeDef(SECRET_EXIT_ID)] : otherHoles(hole.id).filter((h) => sectorOpen(this.ledger, h.sectorId));
    const exitDef = others.length
      ? others[Math.min(others.length - 1, Math.floor(this.rng('hole')() * others.length))]
      : null;
    const to = exitDef ? sectorById(exitDef.sectorId) : from;
    const oldX = ship.x, oldY = ship.y;

    const speed = Math.hypot(ship.vx, ship.vy);
    const ux = speed > 1 ? ship.vx / speed : Math.cos(ship.angle);
    const uy = speed > 1 ? ship.vy / speed : Math.sin(ship.angle);

    if (to.id !== from.id) this.loadSector(to);
    const exit = this.holes.find((h) => h.id === exitDef?.id) || hole;
    // Out of O-08 the secret hole moves, away from where the pilot comes out, and before the heading is chosen, so that
    // the coast is checked against it too (SX: «а секретная переезжает»).
    // Under the lure it has gone already (met, and the pilot far off in O-08), and comes again as the lure says.
    if (hole.id === SECRET_EXIT_ID && !this.secretLure) moveSecretHole(this, { sectorId: to.id, x: exit.x, y: exit.y });
    // Surface where the pull falls below a share of the engine's thrust, but
    // never past the disc: the ship comes out of the swirl, not out of empty
    // space. A weaker engine (2026-09-26: thrust 1150 -> 540) needs no further
    // reach, because the ejection below already beats the escape speed there.
    const thrust = ship.params().thrust;
    const pull = Math.sqrt(exit.mass / (thrust * CONFIG.stranded.gravityShare));
    const reach = Math.max(exit.horizon * 3, Math.min(exit.disc * 0.95, Math.max(exit.disc * 0.7, pull)));
    const escape = Math.sqrt((2 * exit.mass) / reach);
    const leave = Math.min(ship.params().maxSpeed, Math.max(speed, escape * B.ejectMargin));
    // On the heading it fell in with, or the nearest one from which a coast is not
    // taken by a hole or a planet again (World.exitHeading).
    const fell = Math.atan2(uy, ux);
    const heading = this.exitHeading(exit, reach, leave, fell);
    const hx = Math.cos(heading), hy = Math.sin(heading);
    ship.x = exit.x + hx * reach;
    ship.y = exit.y + hy * reach;
    ship.vx = hx * leave;
    ship.vy = hy * leave;
    ship.angle = heading;
    ship.angVel = 0;
    ship.holeGrace = B.grace;

    this.cam.x += ship.x - oldX;
    this.cam.y += ship.y - oldY;
    // The container comes out behind the hull on its new heading, moving with it.
    if (this.cargo) this.cargo = towBehind(this);
    if (to.id !== from.id) {
      this.bullets.length = 0;
      this.particles.items.length = 0;
      this.spawnField(to);
    }
    this.recorder.reset();
    // Thrown out: a ring of the hole's own light where the ship surfaced.
    this.particles.burst(ship.x, ship.y, Array.from({ length: 12 }, (_, k) => ({
      dx: Math.cos((k * TAU) / 12) * 18, dy: Math.sin((k * TAU) / 12) * 18,
      ch: k % 2 ? '·' : '*', color: k % 3 ? B.color : '#ffffff',
    })), { vx: ship.vx * 0.2, vy: ship.vy * 0.2, speed: [80, 260], life: [0.4, 1.0] });
    this.emit('holeTransit', {
      from: from.id, to: to.id, label: to.label, title: sectorTitle(to),
      holeId: hole.id || null, exitId: exit.id || null,
      // Degrees the exit heading was turned from the one it fell in with; 0 when straight.
      turned: Math.round(Math.abs(Math.atan2(Math.sin(heading - fell), Math.cos(heading - fell))) * 180 / Math.PI),
    });
    if (ended) this.emit('encounterEnded', { ...ended, sectorId: this.sector.id });
  }

  // The heading a ship thrown out of `exit` leaves on: the one it fell in with, or
  // the nearest to it, turning a step at a time either way, from which a coast
  // with no input is not taken by a hole or a planet again within `exitClear`
  // seconds. Thrown straight at a dead edge's current or a planet's cushion, a ship
  // came back down the same line into the hole, and no speed could help: the wall
  // turned it at any speed (QA, 2026-09-30: 21 of 150 coasting exits from O-08,
  // whose hole lies 700-900 u from two dead edges, and 2-4 % elsewhere).
  exitHeading(exit, reach, leave, heading) {
    const B = CONFIG.blackHole;
    const step = (B.exitTurnStep * Math.PI) / 180;
    for (let k = 0; k * step <= Math.PI + 1e-9; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const a = heading + sign * k * step;
        const ux = Math.cos(a), uy = Math.sin(a);
        if (this.coastsClear(exit.x + ux * reach, exit.y + uy * reach, ux * leave, uy * leave, B.exitClear)) return a;
      }
    }
    return heading;
  }

  // Whether a ship left to coast from (x, y) at (vx, vy) stays out of every hole's
  // horizon (a hole's own grace aside) and every planet's surface for `seconds`.
  // The ship's own forces as a point, stepped coarsely: gravity, the planets'
  // cushion, a dead edge's current, drag. Leaving the sector through an open edge
  // ends it: what lies beyond is not known here.
  coastsClear(x, y, vx, vy, seconds) {
    const dt = 1 / 20;
    const drag = Math.max(0, 1 - this.ship.params().drag * dt);
    const grace = CONFIG.blackHole.grace;
    for (let t = 0; t < seconds; t += dt) {
      const g = this.gravityAt(x, y), o = this.orbitAccel(x, y, vx, vy), b = this.boundaryAccel(x, y, vx, vy);
      vx = (vx + (g.x + o.ax + b.ax) * dt) * drag;
      vy = (vy + (g.y + o.ay + b.ay) * dt) * drag;
      x += vx * dt; y += vy * dt;
      // Across a live seam the coast is another sector's business; past a dead edge the rope throws it back
      // (boundaryAccel above), so it is followed on.
      if (this.topology.mode === PLANE && (x < 0 || y < 0 || x > this.width || y > this.height)) {
        const dx = x < 0 ? -1 : x > this.width ? 1 : 0, dy = y < 0 ? -1 : y > this.height ? 1 : 0;
        if ((dx && this.openNeighbour(this.sector, dx, 0)) || (dy && this.openNeighbour(this.sector, 0, dy))) return true;
      }
      // Half a step of travel is added to a horizon, so a fast coast cannot step over it.
      const slack = Math.hypot(vx, vy) * dt * 0.5;
      for (const a of this.attractors) {
        if (a.kind === 'hole' && t < grace) continue;
        const d = this.delta(x, y, a.x, a.y);
        if (Math.hypot(d.x, d.y) < a.kill + slack) return false;
      }
    }
    return true;
  }

  // The container in tow (src/tow.js): made where it hangs at rest when a cargo is taken on,
  // then a body on its tether. A container taken back from where it lay keeps its place and is
  // reeled in (World.recoverCargo).
  updateCargo(dt) {
    this.towPull = 0;
    if (!this.ledger.active) { this.cargo = null; return; }
    if (!this.cargo) this.cargo = towBehind(this);
    for (const p of this.pirates) if (p.cargoGrace > 0) p.cargoGrace -= dt;
    if (this.ship.alive) stepTow(this, dt);
  }

  // A container's blow against something (src/tow.js): sparks where it met, and an event for
  // the sound. What the blow costs is the tow's to decide.
  cargoBumped({ x, y, speed, what }) {
    const H = CONFIG.cargo.hit, B = CONFIG.asteroid.bump;
    if (speed < H.sparks) return;
    const n = Math.round(clamp(speed / 60, 3, 9));
    const sparks = Array.from({ length: n }, (_, k) => ({ ch: B.sparks[k % B.sparks.length], color: B.colors[k % B.colors.length] }));
    this.particles.burst(x, y, sparks, { vx: this.cargo ? this.cargo.vx * 0.3 : 0, vy: this.cargo ? this.cargo.vy * 0.3 : 0, speed: [60, 200], life: [0.2, 0.55] });
    this.emit('cargoBumped', { sectorId: this.sector.id, x, y, speed: Math.round(speed), what });
  }

  stepAsteroids(dt) { stepRocks(this, dt); }

  cullAsteroids() { cullRocks(this); }

  // The hole whose horizon contains a point, grown by `pad`, or null (the same cut as insidePlanet).
  consumedByHole(x, y, pad) {
    const topo = this.topology;
    for (const h of this.holes) {
      if (hypot2(topo.dx(x, h.x), topo.dy(y, h.y)) < h.horizon + pad) return h;
    }
    return null;
  }

  // Sparks and a few of the hull's glyphs where it met something along -n (bumpShip's look),
  // and the event the sound listens for.
  // Caches drift where they were knocked and slow down, turn, and are knocked away by the hull (CONFIG.cache.float).
  // One knocked about stays inside its sector.
  stepCaches(dt) {
    const F = CONFIG.cache.float, ship = this.ship;
    for (const c of [...this.caches, ...this.paintCaches, ...this.lookCaches]) {
      if (c.vx || c.vy) {
        const slow = Math.exp(-F.drag * dt);
        c.vx *= slow; c.vy *= slow;
        if (Math.hypot(c.vx, c.vy) < 2) { c.vx = 0; c.vy = 0; }
        c.x = clamp(c.x + c.vx * dt, F.radius, this.width - F.radius);
        c.y = clamp(c.y + c.vy * dt, F.radius, this.height - F.radius);
      }
      c.whirl *= Math.exp(-F.spinDrag * dt);
      c.angle = (c.angle + (c.spin + c.whirl) * dt) % TAU;
      if (!ship.alive || this.docked) continue;
      const d = this.delta(ship.x, ship.y, c.x, c.y);
      const dist = Math.hypot(d.x, d.y), touch = ship.radius + F.radius;
      // Come up to it, within the reach its menu opens at: the place is the pilot's from now on (the ledger's `reached`: SX,
      // 2026-10-02, «когда ты до него долетел то можно оставить только на общей»: the locator stops blinking it, the map keeps it).
      if (dist <= c.interactRadius && c.def.kind !== 'look') this.ledger.reached.add(c.id);
      // A hull up in a jump (src/trick.js) passes over a cache.
      if (dist >= touch || ship.airborne) continue;
      const nx = dist > 1e-6 ? d.x / dist : 1, ny = dist > 1e-6 ? d.y / dist : 0;   // from the cache to the hull
      const closing = -((ship.vx - c.vx) * nx + (ship.vy - c.vy) * ny);
      c.x = ship.x - nx * touch; c.y = ship.y - ny * touch;
      // Come down on it from a jump (src/trick.js landedNow): struck with all the speed the hull has on it, at CONFIG.hull.landing.mult.
      const landed = landedNow(this), struck = landed ? Math.max(closing, Math.hypot(ship.vx - c.vx, ship.vy - c.vy)) : closing;
      if (struck < F.touchSpeed) continue;
      if (closing >= F.touchSpeed) {
        c.vx -= nx * closing * F.kick; c.vy -= ny * closing * F.kick;
        c.whirl += (c.spin >= 0 ? 1 : -1) * Math.min(F.knockSpin, closing / 200);
        ship.vx += nx * closing * F.give; ship.vy += ny * closing * F.give;
      }
      this.damageShip(this.impactDamage(struck, 'cache', landed), 'cache', { findId: c.id, ...(landed ? { landed } : null) });
      if (!ship.alive) return;
      this.shipSparks(nx, ny, struck, 'cache');
    }
  }

  // The sparks of a blow (src/debris.js).
  shipSparks(nx, ny, closing, what) { shipSparks(this, nx, ny, closing, what); }

  // A rock's shards (src/debris.js).
  shred(a, intensity) { shred(this, a, intensity); }

  // The pilot's wreck: what it does to the ship, its cargo and the wallet (src/wreck.js).
  wreckShip(cause = 'reset', obstacle = null) { wreckFlow(this, cause, obstacle); }

  // The rescue's bill, charged at the wreck (src/wreck.js).
  chargeRescue(at) { chargeRescue(this, at); }

  // Where a lost container comes to rest (src/lostCargo.js), and clear of another pilot's.
  restingPoint(x, y) { return restingPoint(this, x, y); }
  clearOfStrangers(at) { return clearOfStrangers(this, at); }

  // --------------------------------------------------------------- pirates ---

  // The encounters (src/encounters.js): the zones' roll, a squad spawned, the hits and the kills, the fight's end, the loot, the
  // den. Methods because the pirates, the raids, the quests, the wreck and the checks call them on the world.
  stepEncounters(dt) { stepEncounters(this, dt); }
  pirateGround(x, y, pad = 0) { return pirateGround(this, x, y, pad); }
  inSafeZone(x, y, pad = 0) { return inSafeZone(this, x, y, pad); }
  spawnPirates(count = 1, options = {}) { return spawnPirates(this, count, options); }
  hurtPirate(p, cause, hit) { return hurtPirate(this, p, cause, hit); }
  killPirate(p, cause) { return killPirate(this, p, cause); }
  removePirate(p, how) { return removePirate(this, p, how); }
  pirateGone(p) { pirateGone(this, p); }
  endEncounter(cause, how) { return endEncounter(this, cause, how); }
  scatterSeized(x, y, amount) { return scatterSeized(this, x, y, amount); }
  pirateDen(from) { return pirateDen(this, from); }
  patternVisible(p) { return pirateVisible(this, p); }
  stepNewPiratePattern(world, p, dt, context) { return stepNewPiratePattern(world, p, dt, context); }
  onNewPirateShot(world, p) { onNewPirateShot(world, p); }
  resolvePirateHits() { stepNewEnemySystems(this, this.pirateCombatDt ?? 0); resolvePirateHits(this); }
  // The boss: made at a place (the lab's scene, later its quest), and the pilot's shots and hull against its core and sleds.
  spawnBoss(at) { return spawnBoss(this, at); }
  resolveBossHits() { resolveBossHits(this); }

  // ---------------------------------------------------------- interaction ---

  // The open quests' places, what a new quest keeps apart from (src/questHooks.js).
  questPlaces() { return questPlaces(this); }

  // The menus (src/menus.js): what the ship may be next to with the way to build each menu, one candidate's menu as it is now, every
  // candidate with its actions, and a station's rows (stationActions below). The step chooses on the first and builds one (updateSelection).
  candidatesNear() { return menusNear(this); }
  menuFor(id) { return menusFor(this, id); }
  candidates() { return menuCandidates(this); }

  // A droid's one service, its menu row and its purchase (src/droids.js): what it carries, as much as the ship takes and the wallet
  // pays for. Methods because the menu (src/menus.js) and the checks ask the world.
  droidActions(dr) { return droidActions(this, dr); }
  droidService(dr) { droidService(this, dr); }

  // Doc 06 menu: take the delivery on again, or watch how it was lost (src/lostCargo.js).
  lostCargoActions(c) { return lostCargoActions(this, c); }
  recoverCargo(c) { recoverCargo(this, c); }
  takeStrangerCargo(c) { takeStrangerCargo(this, c); }

  // What a find costs this pilot, a cache's one row, and a cache opened (src/finds.js).
  findPrice(def) { return findPrice(this, def); }
  cacheActions(cache) { return cacheActions(this, cache); }
  openCache(cache) { openCache(this, cache); }

  // The pointers given for random quests done (src/questHooks.js).
  giveCursors() { giveCursors(this); }
  // The radio given for the next quest handed in (src/questHooks.js).
  giveRadio() { giveRadio(this); }

  // A look given and a look cache opened (src/finds.js): a look recolours the whole interface, so the pilot wears it from the card (C).
  giveLook(id, source, at = null) { return giveLook(this, id, source, at); }
  openLookCache(cache) { openLookCache(this, cache); }

  // -------------------------------------------------------------- traffic ---

  // A pilot out of fuel, drawn (src/questHooks.js).
  drawDrifter(r, t) { drawDrifter(this, r, t); }

  // The pilot greets a friendly craft (src/greetings.js greetCraft). Returns whether it was greeted.
  greetCraft(craftId) { return greetCraft(this, craftId); }

  // Where a named craft is now (O-08's traffic, or the visitor out of it) and the craft itself, so its hail stays
  // with it as it flies (src/feedback.js drawHail); null once it is gone from this sector.
  craftAt(craftId) {
    // The pilot's own ship, when it greets a craft (greetCraft): its hail stands over it as a craft's does.
    if (craftId === PILOT_HAIL_ID) {
      const m = this.ship.model;
      return { x: this.ship.x, y: this.ship.y, craft: { rows: ['   ', '   ', '   '], scale: m?.scale ?? 1.5 } };
    }
    // A quest's ship (src/questHooks.js): a pilot out of fuel, a ship pestered, a wreck, a planet speaking, a reference ship.
    const quest = questCraftAt(this, craftId);
    if (quest !== undefined) return quest;
    // A ship watching the boss's fight (src/bossQuest.js): its line stands with it.
    const watcher = this.bossCrowd.find((w) => w.id === craftId);
    if (watcher) return { x: watcher.x, y: watcher.y, craft: npcCraft(watcher.code) };
    // A pirate's shout (src/pirates.js pirateShout) stands with it as its hails do with a craft.
    const pirate = this.pirates.find((p) => p.id === craftId);
    if (pirate) return { x: pirate.x, y: pirate.y, craft: { rows: CONFIG.pirates.types[pirate.type].art, scale: CONFIG.pirates.scale } };
    const v = this.visitor;
    if (v && v.craft.id === craftId && v.sectorId === this.sector.id) {
      const p = visitorPose(v);
      return { x: p.x, y: p.y, craft: v.craft };
    }
    const craft = this.trafficHere(this.sector.id, this.time).find((c) => c.id === craftId);
    if (!craft) return null;
    const p = craftPose(craft, this.time, this.width, this.height);
    return { x: p.x, y: p.y, craft };
  }

  // The friendly craft in a sector at time `t`: O-08's (src/traffic.js), or the NPC ships of the grid that are in it now
  // (src/npcFleet.js: a ship's sector is where it is).
  trafficHere(sectorId, t) {
    return sectorId === 'sector-hidden' ? trafficIn(sectorId) : this.fleet.in(sectorId, t);
  }

  // Friendly craft (src/traffic.js) hail the pilot who flies close, once each
  // visit. Their poses are the clock's; nothing here moves them.
  stepTraffic() {
    if (!this.ship.alive) return;
    for (const craft of this.trafficHere(this.sector.id, this.time)) {
      if (!craft.hail || this.hailed.has(craft.id)) continue;
      const p = craftPose(craft, this.time, this.width, this.height);
      if (Math.hypot(p.x - this.ship.x, p.y - this.ship.y) > HAIL_REACH) continue;
      this.hailed.add(craft.id);
      this.emit('trafficHail', { craftId: craft.id, label: craft.label, line: craft.hail, x: p.x, y: p.y, sectorId: this.sector.id, greet: true });
    }
  }

  // --------------------------------------------------------------- signs ---

  // Every sign standing in a sector, other pilots' and this pilot's, in that
  // sector's coordinates. An own sign carries the pilot's current name. Read only:
  // with none of the pilot's own in the sector the list is the kept, frozen one of
  // the authored signs (src/signs.js fixedSigns), the same array every call.
  signsIn(sectorId) {
    const own = this.signs.inSector(sectorId), fixed = fixedSigns(sectorId, this.width, this.height);
    if (!own.length) return fixed;
    return [...fixed, ...own.map((s) => ({ id: s.id, x: s.x, y: s.y, words: s.words, author: this.pilot.nickname, type: s.type, own: true }))];
  }

  // Why a sign cannot stand at (x, y) in this sector, or null when it can.
  // Doc 03: never over a docking or interaction point. Also out of a planet's
  // orbit and a hole's disc and pull, where nobody could stop to read it, off
  // the sector's edges, so it never straddles a seam, and clear of other signs.
  // `ignoreId` lets a standing sign be held to the rule without meeting itself.
  signIssue(x, y, ignoreId = null) {
    const S = CONFIG.sign;
    const near = (ox, oy, need) => { const d = this.delta(x, y, ox, oy); return Math.hypot(d.x, d.y) < need; };
    if (x < S.edgeClear || y < S.edgeClear || x > this.width - S.edgeClear || y > this.height - S.edgeClear) {
      return 'TOO CLOSE TO THE SECTOR EDGE';
    }
    const thrust = this.ship.params().thrust;
    for (const h of this.holes) {
      const pull = Math.sqrt(h.mass / (thrust * CONFIG.stranded.gravityShare));
      if (near(h.x, h.y, Math.max(h.disc, pull) + S.wellMargin)) return 'TOO CLOSE TO A BLACK HOLE';
    }
    for (const p of this.planets) {
      if (near(p.x, p.y, p.radius + CONFIG.planet.orbit.height + S.wellMargin)) return 'TOO CLOSE TO A PLANET';
    }
    for (const s of this.stations) if (near(s.x, s.y, s.hullRadius + S.objectClear)) return 'TOO CLOSE TO A STATION';
    const objects = [
      ...this.caches.map((o) => [o, 'A CACHE']),
      ...this.paintCaches.map((o) => [o, 'A PAINT CACHE']),
      ...this.lookCaches.map((o) => [o, 'A LOOK CACHE']),
      ...this.signals.map((o) => [o, 'A SIGNAL']),
      ...this.lostCargo.map((o) => [o, 'CARGO']),
    ];
    for (const [o, name] of objects) if (near(o.x, o.y, S.objectClear)) return `TOO CLOSE TO ${name}`;
    for (const s of this.signsIn(this.sector.id)) {
      if (s.id !== ignoreId && near(s.x, s.y, S.spacing)) return 'TOO CLOSE TO ANOTHER SIGN';
    }
    return null;
  }

  // Whether a sign can be left where the ship is now: afloat, undocked, no
  // faster than docking allows (SX: "как для стыковки"), and at a place
  // signIssue allows. Asked when the composer opens and again when it places.
  signCheck() {
    const ship = this.ship;
    if (!ship.alive) return { ok: false, reason: 'NOT WHILE WRECKED' };
    if (this.docked) return { ok: false, reason: 'UNDOCK FIRST' };
    // Every sign uses a piece of chalk (CONFIG.chalk); without any, that comes first.
    if (this.chalk < 1) return { ok: false, reason: 'NO CHALK · BUY AT A STATION' };
    const limit = CONFIG.station.dockSpeed;
    if (Math.hypot(ship.vx, ship.vy) > limit) return { ok: false, reason: `BRAKE BELOW ${limit}` };
    const issue = this.signIssue(ship.x, ship.y);
    return issue ? { ok: false, reason: issue } : { ok: true };
  }

  // Leaves a sign where the ship is, captioned with one to three words the
  // pilot knows. On a full board the oldest sign is taken down to make room.
  leaveSign(words, type = undefined) {
    const check = this.signCheck();
    if (!check.ok) { this.emit('actionRefused', { reason: check.reason }); return null; }
    const known = Array.isArray(words) && words.length >= 1 && words.length <= SIGN_WORDS_MAX &&
      words.every((id) => wordDef(id) && this.collection.words.has(id));
    if (!known) { this.emit('actionRefused', { reason: 'CHOOSE 1 TO 3 KNOWN WORDS' }); return null; }
    const { sign, replaced } = this.signs.add({
      sectorId: this.sector.id, x: Math.round(this.ship.x), y: Math.round(this.ship.y), words, type,
    });
    this.chalk -= 1;
    this.emit('signPlaced', {
      signId: sign.id, sectorId: sign.sectorId, x: sign.x, y: sign.y, text: captionOf(sign.words), chalk: this.chalk,
      replaced: replaced ? {
        signId: replaced.id, sectorId: replaced.sectorId, text: captionOf(replaced.words),
        sectorLabel: sectorById(replaced.sectorId)?.label || replaced.sectorId,
      } : null,
    });
    return sign;
  }

  // Only an own sign can be taken down; another pilot's has no such action.
  removeSign(id) {
    const gone = this.signs.remove(id);
    if (!gone) { this.emit('actionRefused', { reason: 'SIGN IS GONE' }); return false; }
    if (this.selectedId === id) this.selectedId = null;
    this.emit('signRemoved', { signId: id, sectorId: gone.sectorId, x: gone.x, y: gone.y, text: captionOf(gone.words) });
    return true;
  }

  stationLabelOf(stationId) {
    const def = stationDefById(stationId);
    return def ? `${def.label} / ${def.sectorLabel}` : stationId;
  }

  // The opening's own rows among them (src/opening.js) are the story's (`tone`: the context window frames their keycaps in its purple).
  stationActions(station) {
    const base = menuStationActions(this, station), own = new Set(base);
    return openingActions(this, station, base).map((a) => (own.has(a) || a.tone ? a : { ...a, tone: 'story' }));
  }

  // The station service (src/stationService.js): a broken station's menu, a station broken by a wreck, and its repair.
  brokenActions(station) { return brokenActions(this, station); }
  // A station a wreck broke loses pieces that hang in space (src/debris.js stationDebris; SX's item 8).
  breakStation(station) {
    const broke = breakStation(this, station);
    if (broke) stationDebris(this, station);
    return broke;
  }
  // A hard blow on a working station's hull is remembered, and breaks it at CONFIG.station.wear.breaks (src/stationService.js).
  wearStation(station, closing) { return wearStation(this, station, closing); }
  repairStation(station) { return repairStation(this, station); }

  // The ship at a station (src/docking.js): DOCK glides it into the berth, UNDOCK lets it go, the page's forward thrust leaves a berth without
  // the menu, and a pose of the way in follows a station that floats. Methods because the menus, the garage, the tools and the checks ask.
  dock(station) { dock(this, station); }
  undock(station) { undock(this, station); }
  leaveStation() { return leaveStation(this); }
  onStation(station, p, plan) { return onStation(station, p, plan); }

  // Freight at a station (src/delivery.js): a job accepted, a cargo delivered.
  acceptContract(contract) { return acceptContract(this, contract); }
  deliver(station) { deliver(this, station); }

  // The page's room is shut: the garage's door closes and the ship backs out (src/home.js leaveHome). Only from inside.
  leaveHome() {
    return leaveHome(this);
  }

  // Fuel (CONFIG.fuel): the engine burns it by output, forward and retro, once a
  // step; turning, coasting and the brake are free. The pilot is told once when
  // it runs low and once when it runs out.
  burnFuel(dt) {
    const F = CONFIG.fuel, ship = this.ship;
    if (!ship.alive || this.fuel <= 0) return;
    // A ship of its own kind burns at its own rate (its chassis's `burn`).
    const rate = ship.chassis.burn ?? 1;
    const burn = dt * rate * (F.burn * (ship.thrusting ? ship.spool : 0) + F.retroBurn * (ship.retroing ? ship.retroSpool : 0));
    if (burn <= 0) return;
    const before = this.fuel;
    this.fuel = Math.max(0, this.fuel - burn);
    if (before > F.low && this.fuel <= F.low && this.fuel > 0) this.emit('fuelLow', { fuel: this.fuel });
    if (this.fuel <= 0) this.emit('fuelEmpty', {});
  }

  // The station service (src/stationService.js): fuel, chalk, a garage's hull repair and a freight hub's patch, each a menu row and
  // its purchase.
  refuelAction() { return refuelAction(this); }
  refuel() { return refuel(this); }
  chalkAction() { return chalkAction(this); }
  buyChalk() { return buyChalk(this); }
  repairAction() { return repairAction(this); }
  repairHull() { return repairHull(this); }
  patchAction() { return patchAction(this); }
  patchHull() { return patchHull(this); }

  // The hangar at the garage the ship is docked at (src/hangar.js). Buying pays
  // for a ship and flies it at once, delivered full; changing ships leaves the
  // one flown until now in the hangar as it was, hull and fuel, and takes the
  // other as it was left. Neither repairs, refuels or touches the cargo.
  hangarStation() {
    const station = this.stations.find((s) => s.id === this.docked);
    return station && (workingKind(this.ledger, station) === 'garage' || isHome(station)) ? station : null;
  }

  // ---------------------------------------------------------------- ruins ---

  // The ruins (src/ruinWork.js): a ruin's rows, the credits put into one (the last restores it, and gives what it gives), and the
  // sector a restoration opens.
  ruinActions(station) { return ruinActions(this, station); }
  investStation(station, amount = null, options = {}) { return investStation(this, station, amount, options); }
  openFrontier(was, at = {}, laid = []) { return openFrontier(this, was, at, laid); }

  // A new pilot's own deal of the finds (src/rewards.js; SX, 2026-10-02: «сувениры и цвета доступные на старте для каждого
  // юзера рандомно генерировались»): which souvenirs and paints the start, the sectors and the ruins hold, kept in the save.
  // Only for a game with nothing found or laid yet; a loaded save keeps the deal it has (Progress.fromJSON). The deal is the
  // ledger's, and so this world's alone: what reads a find reads it there (src/rewards.js findsFor).
  dealNew(rng) {
    if (this.ledger.found.size || this.ledger.placed.size) return this.ledger.deal;
    this.ledger.deal = rollDeal(rng);
    this.buildFinds();
    return this.ledger.deal;
  }

  // A new pilot's own broken station (src/sectors.js START_STATIONS; SX, 2026-10-02: «каждому игроку из 3 станций рандомно
  // достается первая сломанная»): RELAY 12, HALCYON or YARD 3, one in three, kept in the save. Only for a game nothing has
  // gone into a ruin in yet; a loaded save keeps the one it has (Progress.fromJSON), an older save HALCYON. `force`
  // (the lab's `?startRuin=`) gives one to any save: what the three had of a ruin's record (restored, funded, guards
  // beaten) goes, the rest is kept. The roll is the ledger's, and so this world's alone (src/sectors.js stationDefById). Returns the
  // pilot's start ruin.
  rollStartRuin(rng, { force = null } = {}) {
    const L = this.ledger;
    const forced = START_STATIONS.includes(force) ? force : null;
    if (forced) {
      for (const id of START_STATIONS) {
        L.restored.delete(id); L.invested.delete(id); L.cleared.delete(id); L.guardsAt.delete(id); L.restoredAt.delete(id);
        this.posts.delete(id);
      }
    } else if (L.restored.size || L.invested.size || L.cleared.size) return startRuinOf(L);
    L.startRuin = forced ?? START_STATIONS[Math.min(START_STATIONS.length - 1, Math.floor(rng() * START_STATIONS.length))];
    this.recastStations();
    this.buildFinds();
    return L.startRuin;
  }

  // The stations of every sector built so far, built again under the pilot's start ruin: after it changed (a load, a new pilot's
  // roll), so the one rolled stands as a ruin and the others as what they work as. Their places, drift and look come from the
  // catalogue, so nothing a pilot sees moves.
  recastStations() {
    const size = { width: this.width, height: this.height };
    for (const [id, b] of this.bodyCache) b.stations = buildStations(sectorById(id), size, this.ledger);
    if (this.sector) this.stations = this.sectorBodies(this.sector).stations;
  }

  // Lays every find the rule has opened and that lies nowhere yet (src/cachePlaces.js), and builds this sector's caches
  // again if one came here. Returns the ids laid. Nothing in a World that does not lay its finds (`placeCaches`).
  settleCaches() {
    if (!this.placeCaches) return [];
    const laid = settlePlaces(this.ledger, this.rng('cache'), this.sector?.id ?? null);
    if (laid.length) this.buildFinds();
    return laid;
  }

  // Restoring a ruin with all that is left of its price.
  restoreStation(station) {
    this.investStation(station);
  }

  // The bearing to a find (src/navigation.js): kept in the ledger, so it survives a
  // reload, and dropped when the find is opened.
  markFind(find) {
    if (!find || !availableIn(placeOf(find, this.ledger).sector, this.ledger).some((f) => f.id === find.id)) { this.emit('actionRefused', { reason: 'NOTHING TO MARK' }); return; }
    this.ledger.marked = find.id;
    this.ledger.reached.delete(find.id);   // asked for again, it is shown again until the ship comes up to it
    this.emit('findMarked', { findId: find.id, label: findTitle(find), kind: find.kind, sectorId: this.sector.id });   // its kind, not what it holds (SX, 2026-10-09)
  }

  buyShip(id) {
    const bar = openingHangarBar(this);
    if (bar) { this.emit('actionRefused', { reason: bar }); return false; }
    const def = shipById(id);
    const station = this.hangarStation();
    if (!def || !station) { this.emit('actionRefused', { reason: 'NO HANGAR HERE' }); return false; }
    // A crew's ship is never sold: had, it is flown; not had, flyShip says so.
    if (this.hangar.owns(id) || def.crew) return this.flyShip(id);
    if (this.ledger.credits < def.price) {
      this.emit('actionRefused', { reason: `NEED ${formatCR(def.price)} CR, HAVE ${formatCR(this.ledger.credits)}` });
      return false;
    }
    this.ledger.credits -= def.price;
    this.hangar.owned.add(id);
    const full = shipLimits(id);
    this.hangar.stored.set(id, { hull: full.hull, fuel: full.tank });
    this.emit('shipBought', {
      shipId: id, label: def.label, price: def.price, credits: this.ledger.credits,
      stationId: station.id, sectorId: this.sector.id, x: station.x, y: station.y,
    });
    return this.flyShip(id);
  }

  flyShip(id) {
    const bar = openingHangarBar(this);
    if (bar) { this.emit('actionRefused', { reason: bar }); return false; }
    const def = shipById(id);
    const station = this.hangarStation();
    if (!def || !station) { this.emit('actionRefused', { reason: 'NO HANGAR HERE' }); return false; }
    // (A crew's ship not had yet: its crew's run comes first.)
    if (!this.hangar.owns(id)) { this.emit('actionRefused', { reason: def.crew ? `HELP ${def.who} FIRST` : `${def.label} NOT OWNED` }); return false; }
    if (this.hangar.flying === id) return true;
    const from = this.hangar.flying;
    this.hangar.stored.set(from, { hull: this.hull, fuel: this.fuel });
    const full = shipLimits(id);
    const next = this.hangar.stored.get(id) || { hull: full.hull, fuel: full.tank };
    this.hangar.stored.delete(id);
    this.hangar.flying = id;
    this.ship.setChassis(def.chassis);
    this.hull = clamp(next.hull, 1, this.hullMax);
    this.fuel = clamp(next.fuel, 0, this.fuelTank);
    this.emit('shipChanged', {
      shipId: id, from, label: def.label, hull: this.hull, fuel: this.fuel,
      stationId: station.id, sectorId: this.sector.id, x: station.x, y: station.y,
    });
    return true;
  }

  logStation(station) {
    this.emit('stationLog', {
      stationId: station.id,
      label: station.label,
      sector: addressOf(this.sector),
      visit: this.visits.get(this.sector.id),
    });
  }

  // What the ship is next to and its menu, chosen each step, and a row of it pressed (src/selection.js).
  updateSelection() { updateSelection(this); }
  runAction(index) { return runAction(this, index); }

  // Stations far enough to be worth a direction marker but not yet in range (src/discoveries.js).
  discoveries(options) { return discoveries(this, options); }

  // ------------------------------------------------------------ progress ---

  // What a save holds, and the load of one (src/worldSave.js): progress and a place to resume, not a serialisation of the simulation;
  // a save is untrusted input, read whole before anything is applied. Methods because the page, the checks and the tools ask the world.
  snapshot() { return worldToJSON(this); }
  restore(data) { return restoreWorld(this, data); }
}

addDrawing(World);
