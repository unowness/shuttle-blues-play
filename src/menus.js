// The menus of what the ship is next to (chat N1, 2026-10-04: the roadmap's refactoring piece, the interaction seam of src/world.js):
// every candidate the selection may choose (an id, a title, a world anchor, an eligibility radius and its actions: src/interaction.js)
// and a station's rows. Moved out of src/world.js as they were (World.candidates and World.stationActions keep a one-line method of
// each name), so the opening's rows (src/opening.js) and later chats add to a module of its own rather than to the world's 4,600 lines.
// Since PLAN D3 (2026-10-09) a candidate comes in two steps: `candidatesNear` says what is there and where (an id, an anchor, a reach,
// and `menu()` to build the rest), `menuFor` builds the menu of one, `candidates` of all. The step chooses on the first and builds one.
// Pure functions of the world: nothing here keeps state.
import { CONFIG } from './config.js';
import { buoyMenu, buoyHere, BUOY_ID, chorusStationAction } from './chorus.js';
import { addressOf } from './sectors.js';
import { contractById, offersAt, parTime, clockText, cargoOf, cargoSize, quoteJob, jobQuote } from './contracts.js';
import { captionOf, signBox } from './signs.js';
import { sprite } from './sprites.js';
import { workingKind, invested, formatCR } from './ruins.js';
import { PAINT_TIN } from './paint.js';
import { findTitle, FREE_WORDS } from './rewards.js';
import { postHeld } from './raids.js';
import { drifterHere, helpDrifter, handInDrifter, drifterArt, currentQuests, questTone, QUEST_TONE } from './quests.js';
import { NPC_ART } from './npcShips.js';
import { craftPose, HAIL_REACH, isEnraged } from './traffic.js';
import { GREET_WORDS } from './greetings.js';
import { payFor } from './pacing.js';
import { pesterHere, handInPester, PESTER_ID } from './pester.js';
import { wreckHere, wreckArt, giveToWreck, handInWreck, WRECK_ID } from './wrecked.js';
import { planetMenu, pickupAction } from './errands.js';
import { specialCandidates, specialStationActions, boarded } from './specials.js';
import { droidFootprint } from './droids.js';
import { isHome, homeActions } from './home.js';
import { flagCandidates } from './flags.js';
import { serviceActions } from './stationService.js';
import { openingTalk, openingRepairAsked } from './opening.js';
import { guideQuest } from './guide.js';

// A repair quest's rows lit in the story's purple at once (SX, 2026-10-06: «квест с починкой не считается, там пусть сразу
// подсвечивается починка фиолетовым»): a ruin's FUND and RESTORE rows carry `story` while the radio line's FUND A RUIN or RESTORE step,
// or a side quest's RESTORE, names that ruin (rowTones below: the context window frames a `story` row's keycap in QUEST_INKS.story, its
// words white).
const REPAIR_STEPS = new Set(['first-coins-in', 'rebuild']);
function repairAsked(world, id) {
  if (openingRepairAsked(world, id)) return true;
  if (world.sideQuest?.kind === 'rebuild' && world.sideQuest.stationId === id) return true;
  return REPAIR_STEPS.has(world.guide?.step) && guideQuest(world)?.target?.stationId === id;
}
export const litRepair = (world, id, rows) => (repairAsked(world, id) ? rows.map((a) => (/^(FUND|RESTORE) /.test(a.label) ? { ...a, story: true } : a)) : rows);

// The opening's words at a station (src/opening.js), as the candidate's `talk`, or nothing.
const talkAt = (world, s) => { const talk = openingTalk(world, s); return talk ? { talk } : {}; };

// A friendly ship of the sector (the fleet's NPC ships, O-08's traffic: World.trafficHere) as a candidate: its name, a friendly ship, and
// one row, the pilot's greeting (src/greetings.js), within the reach a craft hails the pilot at itself (src/traffic.js HAIL_REACH). It
// opens no window: `greet` (the craft itself) has the page draw the offer beside the ship in GAMEPLAY's GREETING style instead
// (labs/graphics/greeting.js, context.js; SX, 2026-10-07: «не нравится что на это действие такая огромная табличка выводится»), when a
// window would come; its number key or a click on it greets. The pointer over one from afar shows the same offer, unlive
// (labs/graphics/world-pointer.js pointedMenu).
export const FRIENDLY_SHIP = 'FRIENDLY SHIP';
export function craftCandidate(world, craft, pose = craftPose(craft, world.time, world.width, world.height)) {
  let cols = 0;
  for (const row of craft.rows) cols = Math.max(cols, row.length);
  return {
    id: craft.id, title: craft.label ?? 'SHIP', subtitle: FRIENDLY_SHIP, x: pose.x, y: pose.y, interactRadius: HAIL_REACH,
    art: { model: { width: cols, height: craft.rows.length }, scale: craft.scale, turns: true }, greet: craft,
    actions: [{ label: GREET_WORDS.wave, run: () => world.greetCraft(craft.id) }],
  };
}

// ------------------------------------------------------------------------------------------------ the candidates
//
// A candidate before its menu (PLAN D3, 2026-10-09): what the selection rule reads of it (src/interaction.js pickCandidate and
// stillEligible: an id, a world anchor, a reach) and `menu()`, which builds it whole, its title, line, footprint and rows, with the
// strings and closures of them. Until then every physics step built every menu of the sector to choose one of them, or none; now
// the step asks which are near (`candidatesNear`) and builds the menu of the one it chooses (src/selection.js), and whoever shows
// a menu asks for that one (`menuFor`). `menu()` builds afresh at each call and reads the world as it stands then.
const near = (id, x, y, interactRadius, menu) => ({ id, x, y, interactRadius, menu });
// One built already: a quest's planet, a reference ship, a flag. Few, and some find their anchor only by building (a planet's limb).
const built = (c) => ({ ...near(c.id, c.x, c.y, c.interactRadius, () => c), ambient: !!c.greet });

// The friendly ships within the selection's hold of the ship (HAIL_REACH times CONFIG.interaction.exitTolerance): no farther one could be
// chosen or kept (src/interaction.js pickCandidate).
function craftsNear(world) {
  const out = [], ship = world.ship, hold = HAIL_REACH * CONFIG.interaction.exitTolerance;
  for (const craft of world.trafficHere(world.sector.id, world.time)) {
    if (isEnraged(craft)) continue;                  // no greeting offered to a ship that is coming at the pilot (src/npcFleet.js)
    const pose = craftPose(craft, world.time, world.width, world.height), d = world.delta(pose.x, pose.y, ship.x, ship.y);
    if (Math.hypot(d.x, d.y) <= hold) out.push({ ...near(craft.id, pose.x, pose.y, HAIL_REACH, () => craftCandidate(world, craft, pose)), ambient: true });
  }
  return out;
}

// A find says what it holds and what it costs this pilot (World.findPrice: nothing for a free claim); the action says whether the
// wallet can pay.
const costWords = (world, def) => { const price = world.findPrice(def); return price > 0 ? `${formatCR(price)} CR` : FREE_WORDS; };

// A quest ship's words as a window (`talk`, drawn as a dialog by labs/graphics/context.js) and the quest's HAND IN, which pays
// (SX, 2026-10-02, NPC_DIALOG_HANDOFF.md): so with a wreck helped, a planet's suitcase brought and a ship pestered driven clear.
const talk = (base, name, line, run) => ({ ...base, title: name, subtitle: '', talk: { name, lines: [line ?? ''] },
  actions: [{ label: 'HAND IN', run }] });

// A station's menu: a ruin (src/ruins.js) with what it would be, its price and its own rows, or a working station with its address
// and its rows.
function stationMenu(world, s) {
  return workingKind(world.ledger, s) === 'ruin' ? {
    // A ruin (src/ruins.js): what it would be, and its price in the action.
    id: s.id,
    title: `${s.label} / RUIN`,
    subtitle: postHeld(world, s.id) ? 'GUARDED BY PIRATES'
      : invested(world.ledger, s.id) > 0 ? `FUNDED ${formatCR(invested(world.ledger, s.id))} / ${formatCR(s.cost)} CR`
      : `WAS A ${s.becomes === 'garage' ? 'GARAGE' : 'FREIGHT HUB'}`,
    x: s.x, y: s.y,
    interactRadius: s.interactRadius,
    art: s.footprint ?? { model: s.model, scale: s.model.scale },
    actions: litRepair(world, s.id, world.ruinActions(s)),
  } : {
    id: s.id,
    title: world.ledger.broken.has(s.id) ? `${s.label} / DAMAGED` : s.label,
    subtitle: world.ledger.broken.has(s.id) ? `REOPEN FOR ${formatCR(world.ledger.broken.get(s.id))} CR`
      : `${addressOf(world.sector)}   VISIT ${world.visits.get(world.sector.id)}`,
    x: s.x, y: s.y,
    interactRadius: s.interactRadius,
    // Presentation hint for whoever lays out the menu: what is drawn here,
    // and at what size, so the menu can stand clear of it (`footprint` when
    // the lab draws the station's look, not its model).
    art: s.footprint ?? { model: s.model, scale: s.model.scale },
    actions: world.stationActions(s),
    // What its people say in the opening (src/opening.js): the menu is a dialog window then.
    ...talkAt(world, s),
  };
}

// A find (src/rewards.js): a souvenir cache, a paint cache. Closed, it says its kind and its price and never what is in it (SX,
// 2026-10-09: «В лутбоксах ... не подписывай, что внутри ... Это должен быть сюрприз»): the name comes with the notice of its opening.
const cacheMenu = (world, c) => ({
  id: c.id,
  title: findTitle(c.def),
  subtitle: costWords(world, c.def),
  x: c.x, y: c.y,
  interactRadius: c.interactRadius,
  art: { model: sprite('cache-sealed'), scale: CONFIG.cache.scale, turns: true },
  actions: world.cacheActions(c),
});
const paintMenu = (world, c) => ({
  id: c.id,
  title: findTitle(c.def),
  subtitle: costWords(world, c.def),
  x: c.x, y: c.y,
  interactRadius: c.interactRadius,
  art: { model: { width: PAINT_TIN.rows[0].length, height: PAINT_TIN.rows.length }, scale: PAINT_TIN.scale, turns: true },
  actions: world.cacheActions(c),
});
// A look found in open space (src/looks.js): free, a find and not a purchase; the tin is the paint tin's in the look's inks. Its
// name, like a closed cache's, is the surprise.
const lookMenu = (world, c) => ({
  id: c.id,
  title: findTitle(c.def),
  subtitle: 'FREE',
  x: c.x, y: c.y,
  interactRadius: c.interactRadius,
  art: { model: { width: PAINT_TIN.rows[0].length, height: PAINT_TIN.rows.length }, scale: PAINT_TIN.scale, turns: true },
  actions: [{ label: 'OPEN', run: () => world.openLookCache(c) }],
});

// A pilot out of fuel (src/quests.js, a rescue quest): give it fuel for pay. Given, its menu is its words and the quest's HAND IN.
// One of the thirteen friendly ships SX picked (src/npcShips.js), its footprint the ship's own; the sum it pays is the grown one
// the plate says (it said the base, 75, whatever the network had grown to).
const drifterMenu = (world, drifter) => (world.sideQuest.fueled ? talk({ id: drifter.id, x: drifter.x, y: drifter.y, interactRadius: CONFIG.stranded.interactRadius,
  art: drifterArt(drifter) }, NPC_ART[drifter.code]?.name ?? 'PILOT', world.sideQuest.thanks, () => handInDrifter(world)) : {
  id: drifter.id, title: 'PILOT OUT OF FUEL',
  subtitle: `ASKS ${CONFIG.quests.rescue.fuel} FUEL / PAYS ${payFor('rescue', world.ledger.restored.size)} CR`,
  x: drifter.x, y: drifter.y, interactRadius: CONFIG.stranded.interactRadius,
  art: drifterArt(drifter),
  actions: [{ label: `GIVE ${CONFIG.quests.rescue.fuel} FUEL`, disabled: world.fuel < CONFIG.quests.rescue.fuel,
    reason: `NEED ${CONFIG.quests.rescue.fuel} FUEL`, run: () => helpDrifter(world) }],
});

// A wrecked ship asks for money (src/wrecked.js, a wreck quest): give it, for a tip.
const wreckMenu = (world, wreck) => (world.sideQuest.wreck.given ? talk({ id: WRECK_ID, x: wreck.x, y: wreck.y, interactRadius: CONFIG.stranded.interactRadius,
  art: wreckArt(wreck.code) }, wreck.name, world.sideQuest.wreck.thanks, () => handInWreck(world)) : {
  id: WRECK_ID, title: `${wreck.name} / WRECKED`, subtitle: `GIVE ${wreck.ask} CR / GET A TIP`,
  x: wreck.x, y: wreck.y, interactRadius: CONFIG.stranded.interactRadius, art: wreckArt(wreck.code),
  actions: [{ label: `GIVE ${wreck.ask} CR`, disabled: world.ledger.credits < wreck.ask, reason: `NEED ${wreck.ask} CR`, run: () => giveToWreck(world) }],
});

// A ship the pirates pestered (src/pester.js), once they are driven off: it waits with its thanks.
const pesteredMenu = (world, held) => talk({ id: PESTER_ID, x: held.x, y: held.y, interactRadius: CONFIG.stranded.interactRadius,
  art: { model: { width: held.craft.rows[0].length, height: held.craft.rows.length }, scale: held.craft.scale, turns: true } },
  held.name, world.pester.thanks, () => handInPester(world));

// A cargo lying in space: the pilot's own, or another pilot's (src/strangers.js).
function lostMenu(world, c) {
  const contract = c.stranger ? contractById(c.contractId) : world.ledger.job(c.contractId);
  const own = contract?.from ? world.cargoArt?.(contract.from, cargoSize(contract)) : null;
  return {
    id: c.id,
    // Another pilot's is named after them, so it is never taken for the pilot's own.
    title: c.stranger ? `LOST CARGO / ${c.stranger.author}` : 'STRANDED CARGO',
    subtitle: `${contract ? contract.label : c.contractId} → ${world.stationLabelOf(contract?.to)}`,
    x: c.x, y: c.y,
    interactRadius: c.interactRadius,
    // Its sending station's own cargo when the page lends it (labs/graphics/cargo-art.js), else the plain container.
    art: own ? { model: own, scale: CONFIG.cargo.spriteScale, turns: true } : { model: sprite('cargo-container'), scale: CONFIG.cargo.spriteScale * cargoOf(contract).scale, turns: true },
    actions: world.lostCargoActions(c),
  };
}

// Only the pilot's own signs answer, and only to be taken down. Another pilot's sign is read, not handled. The frame is its
// drawing's box (src/signs.js signBox), offset from where it stands.
function signMenu(world, s) {
  const box = signBox(s.type, captionOf(s.words), world.pilot.nickname);
  return {
    id: s.id,
    title: 'YOUR SIGN',
    subtitle: captionOf(s.words),
    x: s.x, y: s.y,
    interactRadius: CONFIG.sign.interactRadius,
    // `box`: the menu's leader starts at the drawing's own corner, not a radius out from the anchor (a sign is
    // wide and low, and the radius put the menu far above it: SX, 2026-10-01, «менюшка ... слишком далеко»).
    art: { model: { width: box.width, height: box.height }, scale: 1, dx: box.dx, dy: box.dy, reach: Math.ceil(box.right) + 1, box: true },
    actions: [{ label: 'REMOVE SIGN', run: () => world.removeSign(s.id) }],
  };
}

// A droid (src/droids.js) sells what it carries, near it and at its speed, through its menu (it threw it for an
// hour on 2026-10-01; SX: «надо ее все-таки покупать ... чтобы менюшка была контекстуальная»).
const droidMenu = (world, dr) => ({
  id: dr.id,
  title: `${dr.name} / ${dr.label}`,
  subtitle: dr.kind === 'fuel' ? `${dr.stock} FUEL / ${dr.price} CR PER UNIT` : `${dr.stock} HULL / ${dr.price} CR PER POINT`,
  x: dr.x, y: dr.y,
  interactRadius: CONFIG.droids.interactRadius,
  art: droidFootprint(dr),
  actions: world.droidActions(dr),
});

// Everything the ship may be next to now, each with a way to build its menu: the stations (a ruin with its own rows), the finds, a
// lost cargo, the ships a quest is about, the pilot's signs and the map's flags, the droids, the friendly ships; a borrowed ship sees
// only its quest's and the stations' INFO. In the order the selection has always met them in (a tie in reach goes to the first).
export function candidatesNear(world) {
  if (!world.ship.alive) return [];
  // A borrowed ship (src/specials.js) is flown past everything but what its quest wants and the stations' INFO.
  const special = specialCandidates(world).map(built);
  // (a ruin's menu too: its rows are the pilot's own business, not a borrowed ship's)
  if (boarded(world)) {
    return [...world.stations.map((s) => near(s.id, s.x, s.y, s.interactRadius, () => ({ ...stationMenu(world, s), actions: world.stationActions(s) }))), ...special];
  }
  const stations = world.stations.map((s) => near(s.id, s.x, s.y, s.interactRadius, () => stationMenu(world, s)));
  const caches = world.caches.map((c) => near(c.id, c.x, c.y, c.interactRadius, () => cacheMenu(world, c)));
  const paints = world.paintCaches.map((c) => near(c.id, c.x, c.y, c.interactRadius, () => paintMenu(world, c)));
  const looks = world.lookCaches.map((c) => near(c.id, c.x, c.y, c.interactRadius, () => lookMenu(world, c)));
  const lost = world.lostCargo.map((c) => near(c.id, c.x, c.y, c.interactRadius, () => lostMenu(world, c)));
  // A voice's recorder lying in space (src/chorus.js, COMMONS's chain): TAKE THE RECORDER.
  const buoy = buoyHere(world);
  const recorder = buoy ? [near(BUOY_ID, buoy.x, buoy.y, CONFIG.quests.chorus.reach, () => buoyMenu(world))] : [];
  const drifter = drifterHere(world);
  const stray = drifter ? [near(drifter.id, drifter.x, drifter.y, CONFIG.stranded.interactRadius, () => drifterMenu(world, drifter))] : [];
  const wreck = wreckHere(world);
  const wrecked = wreck ? [near(WRECK_ID, wreck.x, wreck.y, CONFIG.stranded.interactRadius, () => wreckMenu(world, wreck))] : [];
  // A planet with an errand (src/errands.js) offers its job, and takes the suitcase back, at the point of its limb that faces the ship.
  const asking = planetMenu(world);
  const held = world.pester?.cleared ? pesterHere(world) : null;
  const pestered = held ? [near(PESTER_ID, held.x, held.y, CONFIG.stranded.interactRadius, () => pesteredMenu(world, held))] : [];
  const signs = world.signs.inSector(world.sector.id).map((s) => near(s.id, s.x, s.y, CONFIG.sign.interactRadius, () => signMenu(world, s)));
  const droids = world.droids.map((dr) => near(dr.id, dr.x, dr.y, CONFIG.droids.interactRadius, () => droidMenu(world, dr)));
  return [...special, ...stations, ...caches, ...paints, ...looks, ...lost, ...recorder, ...stray, ...wrecked, ...pestered, ...(asking ? [built(asking)] : []), ...signs,
    ...flagCandidates(world).map(built), ...droids, ...craftsNear(world)];
}

// The menu of the candidate `id` as it is now, or null when it is not near: whoever shows a menu asks for that one (the pointer's
// window over a station from afar, labs/graphics/world-pointer.js).
export function menuFor(world, id) {
  return candidatesNear(world).find((c) => c.id === id)?.menu() ?? null;
}

// Every candidate, each with its menu built: for whoever reads them all (the checks, the tools). The step does not: candidatesNear.
export function candidates(world) {
  return candidatesNear(world).map((c) => c.menu());
}

// A station's rows: a borrowed ship's, a broken station's, the home garage's; else the cargo to deliver or to take, the berth's way
// out and its services, the hangar of a garage, DOCK, and INFO.
export function stationActions(world, station) {
  // While a borrowed ship is flown: the quest's row if world is its stop, and INFO (src/specials.js).
  const quest = specialStationActions(world, station);
  if (quest) return [...quest.map((a) => ({ ...a, tone: QUEST_TONE.special })), { label: 'INFO', run: () => world.logStation(station) }];
  if (world.ledger.broken.has(station.id)) return world.brokenActions(station);
  // The pilot's home (src/home.js): no freight, and its own docking; INFO is every station's.
  if (isHome(station)) return [...homeActions(world, station), { label: 'INFO', run: () => world.logStation(station) }];
  const actions = [];
  const active = world.ledger.activeJob();
  // A planet's suitcase waiting here (src/errands.js).
  const suitcase = pickupAction(world, station);
  if (suitcase) actions.push({ ...suitcase, tone: QUEST_TONE.planet });
  // A voice's recorder aboard, played back at COMMONS (src/chorus.js).
  const playBack = chorusStationAction(world, station);
  if (playBack) actions.push(playBack);

  if (active && active.to === station.id) {
    actions.push({ label: `DELIVER ${active.label}`, run: () => world.deliver(station) });
  } else if (active) {
    // Refused here rather than on arrival, and the cargo is never touched.
    actions.push({
      label: 'DELIVER CARGO', disabled: true, cargo: true,
      note: `TO ${world.stationLabelOf(active.to)}`,
      run: () => {},
    });
  } else {
    // Every authored job the station sends, a row each (SX's M1 on labs/graphics/sketches/last-cargo.html, 2026-10-14: one row hid the
    // second, and his friend finished the game without HONEY JARS, reports/2026-10-14-friend-save.md); a run comes only once they are
    // done (offersAt), one at a time. Undocked only, as MARK below: docked, the berth's rows fill the seven keys
    // (CONFIG.interaction.maxActions) and the jobs come one at a time, as before.
    const offers = offersAt(station.id, world.ledger);
    for (const c of world.docked === station.id ? offers.slice(0, 1) : offers) {
      // Quoted at the tariff of now: the one the job will keep once accepted.
      const quote = jobQuote(quoteJob(c, world.ledger.restored.size));
      actions.push({ label: `ACCEPT ${c.label}`, cargo: true, offer: true, note: `${cargoOf(c).name} / ${formatCR(quote)} CR / ${clockText(parTime(c))}`, run: () => world.acceptContract(c) });
    }
  }

  if (world.docked === station.id) {
    actions.push({ label: 'UNDOCK', run: () => world.undock(station) });
    actions.push(...serviceActions(world, station));
    // The pilot's ships wait at every garage (src/hangar.js): the page opens
    // the hangar on world request, and buys or changes ships through
    // World.buyShip and World.flyShip.
    if (workingKind(world.ledger, station) === 'garage') {
      actions.push({ label: 'HANGAR', run: () => world.emit('hangarRequested', { stationId: station.id }) });
    }
  } else {
    const tooFast = Math.hypot(world.ship.vx, world.ship.vy) > CONFIG.station.dockSpeed;
    actions.push({
      label: 'DOCK', disabled: tooFast,
      note: tooFast ? `BRAKE BELOW ${CONFIG.station.dockSpeed}` : null,
      run: () => world.dock(station),
    });
    // (A restored station offered MARK SOUVENIR CACHE and MARK PAINT CACHE here until SX, 2026-10-17: «подсветка не работает, но я бы ее не
    // чинил, я бы просто вырезал это».)
  }

  // What the station is (src/stationInfo.js; SX, 2026-09-30: «напиши для каждой станции info с лорам»).
  actions.push({ label: 'INFO', run: () => world.logStation(station) });
  return actions;
}

// The quest each of a menu's rows belongs to, by its tone (src/quests.js questTone, a key of src/roles.js QUEST_INKS), or null: the
// context window frames a row's keycap in its quest's ink (SX, 2026-10-06: «обрамление у кнопки действия типо [1] в контекстном окне,
// рамочку кнопки подписывать в цвет типа квеста»). A row made for a quest says its own `tone` (a planet's suitcase waiting at a station,
// a reference ship's rows, the opening's at its stations: World.stationActions); every row of a thing a quest is about (the quest's
// target `mark`: a find, a ruin to fund, a lost cargo, a ship in trouble, a planet's errand) is that quest's but the rows that only tell
// about it (INFO, REPLAY FLIGHT: SX, 2026-10-06, a ruin's INFO framed purple was wrong); a working station's own rows (DOCK, REFUEL,
// INFO ...) are no quest's, whatever quest leads there. Read as the window is drawn, not kept.
const TELLS = new Set(['INFO', 'REPLAY FLIGHT']);
export function rowTones(world, target) {
  const rows = target?.actions ?? [];
  if (!rows.length) return [];
  const station = world.stations.find((s) => s.id === target.id);
  const own = !!station && workingKind(world.ledger, station) !== 'ruin';
  const quest = own ? null : currentQuests(world).find((q) => q.target?.mark === target.id) ?? null;
  // A reference ship asking for a pilot, and what its quest puts in space (src/specials.js), are the special quest's.
  const tone = quest ? questTone(quest) : !own && specialCandidates(world).some((c) => c.id === target.id) ? QUEST_TONE.special : null;
  // A repair the story asks for (`story`, litRepair above) is the story's whatever quest the ruin is the mark of.
  return rows.map((a) => a.tone ?? (a.story ? 'story' : TELLS.has(a.label) ? null : tone));
}
