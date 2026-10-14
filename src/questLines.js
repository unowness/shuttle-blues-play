// Every line a quest's plate shows, and the few banner lines that carried the same names, in one table (SX, 2026-10-04, on the quests
// cut to the locator's width: «shorten the texts, keep the narrow column»). A plate's row at the locator's width holds 19 characters
// (labs/graphics/quest-list.js questGeometry at the column's 237 px); a row with a clock before it holds the clock, a spaced middle dot
// and what is left (12 beside «4:59 · »); a banner (labs/graphics/rail.js) holds 27. Every line here fits its row with the longest
// real value of each of its parts (checks/quest-lines.mjs): no line is cut with an ellipsis. Each line is a function of its parts,
// `args` naming what each is (a station's label, a sector's, a planet's, an amount of money ...), `row` 0 (the title) or 1 (under it),
// `timed` when a clock stands before it, `banner` when it is a banner's and not a plate's. (`lostCargo` another pilot's cargo, `step` an
// instalment of a ruin's funding, `charge` a cache's price or its NO CHARGE, `ruin` the pilot's own broken first station, one of the
// three, `ships` the pirates sitting on it.) `act` marks a detail whose last part (after its last
// slash) is what the pilot does now, under a title that names the quest (SX, 2026-10-05, on the helmet's notch: «там надо направление
// таймер и действие писать а что конкретно за квест выбран будет подсвечено слева в списке квестов»): the notch says that part and
// not the title (labs/graphics/helmet.js notchLine); a detail that is a place, a count or a state is not marked.
//
// The words were rewritten from the lines of the quests' own files, the meaning kept, the game's vocabulary kept (CR, FUEL, HULL,
// DELIVER, HAND IN, the slash between a place and what to do there); what each line was is listed in
// reports/2026-10-04-quest-lines.md for SX.

const line = (row, args, text, { timed = false, banner = false, act = false } = {}) => Object.freeze(Object.assign((...v) => text(...v), { row, args, timed, banner, act }));

export const QUEST_LINES = Object.freeze({
  // A raid on a station (src/quests.js raidQuest): red, with its clock.
  raid: Object.freeze({
    title: line(0, ['station'], (station) => `RAID ON ${station}`),
    subRuin: line(1, ['percent'], (share) => `${share}% AT RISK`, { timed: true }),
    subStation: line(1, ['percent'], (share) => `${share}% AT RISK`, { timed: true }),
    done: line(0, ['station'], (station) => `${station} IS SAFE`),
    paid: line(1, ['cr'], (cr) => `+${cr} CR / CLEARED`),
    ended: line(0, [], () => 'RAID ENDED'),
    lostRuin: line(1, ['cr'], (cr) => `REPAIR: ${cr} CR`),
    lostStation: line(1, ['percent'], (share) => `${share}% DAMAGE TAKEN`),
  }),
  // A ship pestered by pirates (src/pester.js): red, with its clock until it is driven off. `pestered`: one of the small ships the
  // pirates pester (CONFIG.quests.pester.ships), not any NPC ship.
  pester: Object.freeze({
    title: line(0, ['pestered'], (ship) => `DEFEND ${ship}`),
    sub: line(1, [], () => 'UNDER FIRE', { timed: true }),
    recover: line(1, [], () => 'GET CAPSULE', { timed: true, act: true }),
    handIn: line(1, ['sector'], (sector) => `${sector} / HAND IN`, { act: true }),
    done: line(0, ['pestered'], (ship) => `${ship} SAFE`),
    paid: line(1, ['cr'], (cr) => `+${cr} CR / REWARD`),
    late: line(0, [], () => 'SHIP DEPARTED'),
    lateSub: line(1, ['pestered'], (ship) => `${ship} LEFT DAMAGED`),
  }),
  // A cache to open (src/quests.js, the side quest `find`): its title names the kind of find (SOUVENIR or PAINT), never the find itself
  // (SX, 2026-10-09: a closed cache is a surprise); the done row, which comes once it is opened, names what it held.
  find: Object.freeze({
    title: line(0, ['kind'], (kind) => `FIND A ${kind}`),
    sub: line(1, ['sector'], (sector) => `CACHE IN ${sector}`),
    done: line(0, ['find'], (find) => `${find} FOUND`),
    doneSub: line(1, ['what'], (what) => `${what} COLLECTED`),
  }),
  // A signal to fly through (`signal`).
  signal: Object.freeze({
    titleNear: line(0, ['station'], (station) => `SIGNAL BY ${station}`),
    titleIn: line(0, ['sector'], (sector) => `SIGNAL IN ${sector}`),
    newWord: line(1, ['sector'], (sector) => `${sector} / NEW WORD`),
    tuneIn: line(1, ['sector'], (sector) => `${sector} / TUNE IN`, { act: true }),
    done: line(0, [], () => 'SIGNAL RECEIVED'),
    doneWord: line(1, [], () => 'NEW WORD FOR SIGNS'),
    doneAll: line(1, [], () => 'ALL WORDS KNOWN'),
  }),
  // Another pilot's lost cargo (`stranger`).
  stranger: Object.freeze({
    title: line(0, ['author'], (author) => `${author}'S CARGO`),
    sub: line(1, ['sector', 'lostCargo'], (sector, cargo) => `${sector} / ${cargo}`),
    done: line(0, [], () => 'CARGO RECOVERED'),
    doneSub: line(1, ['station'], (station) => `TO ${station}`),
  }),
  // A pilot out of fuel (`rescue`).
  rescue: Object.freeze({
    title: line(0, [], () => 'PILOT OUT OF FUEL'),
    bring: line(1, ['sector', 'count'], (sector, fuel) => `${sector} / ${fuel} FUEL`),
    handIn: line(1, ['sector'], (sector) => `${sector} / HAND IN`, { act: true }),
    done: line(0, [], () => 'FUEL TRANSFERRED'),
    paid: line(1, ['cr', 'sector'], (cr, sector) => `+${cr} CR / ${sector}`),
  }),
  // A ruin the wallet can restore (`rebuild`), and the radio's step to it.
  restore: Object.freeze({
    title: line(0, ['station'], (station) => `RESTORE ${station}`),
    sub: line(1, ['sector', 'cr'], (sector, cr) => `${sector} / ${cr} CR`),
    done: line(0, ['station'], (station) => `${station} RESTORED`),
    doneSub: line(1, [], () => 'STATION OPEN'),
  }),
  // The freight hint (src/freight.js; SX, 2026-10-09): a pilot with a ruin to fund and too little in the wallet, and no cargo, is sent to
  // the nearest station with a job on offer. The title is `FREIGHT: <station>` and not `FREIGHT AT <station>`: with FOUNDRY 2 the second
  // is 20 columns against the plate's 19. `ruin` is any ruin's label (the cheapest to finish), so its part is `station`, the longest of
  // them all. The quest pays nothing of its own, and its done row says so: the job pays when it is delivered.
  freight: Object.freeze({
    title: line(0, ['station'], (station) => `FREIGHT: ${station}`),
    sub: line(1, ['station'], (ruin) => `EARN FOR ${ruin}`),
    done: line(0, [], () => 'FREIGHT TAKEN'),
    doneSub: line(1, [], () => 'PAID ON DELIVERY'),
  }),
  // A wrecked ship asking for money (src/wrecked.js), and the tip it gives.
  wreck: Object.freeze({
    title: line(0, ['ship'], (ship) => `HELP ${ship}`),
    give: line(1, ['sector', 'ask'], (sector, ask) => `${sector} / GIVE ${ask} CR`, { act: true }),
    handIn: line(1, ['sector'], (sector) => `${sector} / HAND IN`, { act: true }),
    done: line(0, ['ship'], (ship) => `${ship} HELPED`),
    tipNone: line(1, [], () => 'NO NEW INFORMATION'),
    tipCache: line(1, ['sector'], (sector) => `CACHE IN ${sector}`),
    tipSignal: line(1, ['sector'], (sector) => `SIGNAL IN ${sector}`),
    tipWord: line(1, ['word'], (word) => `SIGN WORD: ${word}`),
  }),
  // A planet's errand (src/errands.js): ask, fetch the suitcase, return it, hand it in.
  errand: Object.freeze({
    askTitle: line(0, ['planet'], (planet) => `${planet} ASKS`),
    askSub: line(1, ['sector'], (sector) => `${sector} / APPROACH`, { act: true }),
    fetchTitle: line(0, ['station'], (station) => `SUITCASE: ${station}`),
    fetchSub: line(1, ['planet'], (planet) => `FOR ${planet}`),
    returnTitle: line(0, [], () => 'DELIVER SUITCASE'),
    returnSub: line(1, ['planet'], (planet) => `TO ${planet}`),
    thankedTitle: line(0, [], () => 'HAND IN SUITCASE'),
    thankedSub: line(1, ['planet'], (planet) => `AT ${planet}`),
    done: line(0, [], () => 'SUITCASE DELIVERED'),
    paid: line(1, ['cr'], (cr) => `+${cr} CR / PAYMENT`),
    late: line(0, [], () => 'SUITCASE LOST'),
    lateSub: line(1, [], () => 'DELIVERY FAILED'),
  }),
  // The radio's steps (src/guide.js): a title, what to do, how it ends, and its bonus.
  guide: Object.freeze({
    firstRun: line(0, [], () => 'FIRST DELIVERY'),
    firstRunSub: line(1, ['station'], (station) => `CARGO AT ${station}`),
    firstRunDone: line(0, [], () => 'FIRST DELIVERY DONE'),
    souvenir: line(0, [], () => 'OPEN A CACHE'),
    cacheSub: line(1, ['sector', 'charge'], (sector, charge) => `${sector} / ${charge}`),
    souvenirDone: line(0, [], () => 'SOUVENIR COLLECTED'),
    radio: line(0, [], () => 'TUNE IN'),
    radioSub: line(1, ['sector'], (sector) => `SIGNAL IN ${sector}`),
    radioDone: line(0, [], () => 'SIGNAL RECEIVED'),
    guards: line(0, [], () => 'CLEAR GUARDS'),
    guardsSub: line(1, ['station'], (station) => `AT ${station}`),
    guardsDone: line(0, [], () => 'GUARDS CLEARED'),
    fund: line(0, [], () => 'FUND A RUIN'),
    fundSub: line(1, ['station', 'step'], (station, cr) => `${station} / ${cr} CR`),
    fundDone: line(0, [], () => 'FUNDS TRANSFERRED'),
    paint: line(0, [], () => 'FIND PAINT'),
    paintDone: line(0, [], () => 'PAINT COLLECTED'),
    home: line(0, [], () => 'VISIT HOME'),
    homeSub: line(1, [], () => 'CHEAPER FUEL'),
    homeDone: line(0, [], () => 'HOME REACHED'),
    rebuildDone: line(0, [], () => 'STATION RESTORED'),
    bonus: line(1, ['pay'], (pay) => `+${pay} CR / BONUS`),
  }),
  // The opening chapter's objectives (src/opening.js).
  opening: Object.freeze({
    collect: line(0, [], () => 'GET YOUR SHUTTLE'),
    board: line(0, [], () => 'BOARD YOUR SHUTTLE'),
    brake: line(1, [], () => 'BRAKE TO A STOP', { act: true }),
    service: line(1, ['station'], (station) => `${station} / SERVICE`),
    reached: line(0, ['station'], (station) => `${station} REACHED`),
    serviceBerth: line(1, [], () => 'SERVICE BERTH'),
    berth: line(1, [], () => "SCOOTY'S BERTH"),
    shuttle: line(0, [], () => 'YOUR SHUTTLE'),
    radioFixed: line(1, [], () => 'RADIO REPAIRED'),
    call: line(0, [], () => 'GET DELIVERY INFO'),
    dispatch: line(1, ['station'], (station) => `${station} DISPATCH`),
    fitted: line(0, [], () => 'LOCATOR, MAP FITTED'),
    marked: line(1, ['station'], (station) => `${station} MARKED`),
    freight: line(0, [], () => 'ACCEPT THE FREIGHT'),
    seeMap: line(1, ['station'], (station) => `${station} / SEE MAP`),
    accepted: line(0, [], () => 'FREIGHT ACCEPTED'),
    to: line(1, ['station'], (station) => `TO ${station}`),
    refuel: line(0, ['station'], (station) => `REFUEL AT ${station}`),
    unitPrice: line(1, ['price'], (price) => `${price} CR A UNIT`),
    full: line(0, [], () => 'TANK FULL'),
    station: line(1, ['station'], (station) => station),
    cache: line(0, [], () => 'OPEN SEALED CACHE'),
    cacheSub: line(1, ['sector', 'charge'], (sector, charge) => `${sector} / ${charge}`),
    souvenir: line(0, [], () => 'SOUVENIR COLLECTED'),
    // Slice 3 (chat N2 part 1): the shelf fitted at B, the pilot card (optional), the return load. The return load has no hint to find
    // the map and no list of what to do: the pilot has done this (CAMPAIGN 09: «fewer hints»).
    shelf: line(0, [], () => 'FIT THE SHELF'),
    shelfAt: line(1, ['station'], (station) => `AT ${station}`),
    shelfFitted: line(0, [], () => 'SHELF FITTED'),
    card: line(0, [], () => 'OPEN PILOT CARD'),
    cardSub: line(1, [], () => 'ITEMS AND YOUR LOOK'),
    cardOpened: line(0, [], () => 'CARD OPENED'),
    lookYours: line(1, [], () => 'LOOK IS YOURS'),
    load: line(0, [], () => 'TAKE RETURN LOAD'),
    loadTaken: line(0, [], () => 'LOAD TAKEN'),
    // Slice 4 (chat N2 part 2): the ruin R (A tells of it, a row of A's menu marks it), its guards with the short shooting practice, the
    // first money in, the repair droid, then the work to reopen it. The first money's and the guards' bonuses are the radio's old ones
    // (QL.guide.bonus), once each as claims of the reward ledger.
    askRuin: line(0, ['ruin'], (ruin) => `ASK ABOUT ${ruin}`),
    ruinAt: line(1, ['station'], (station) => `AT ${station}`),
    ruinMarked: line(0, ['ruin'], (ruin) => `${ruin} MARKED`),
    ruinCost: line(1, ['cr'], (cr) => `${cr} CR TO REBUILD`),
    guards: line(0, [], () => 'CLEAR THE PIRATES'),
    guardsAt: line(1, ['ruin', 'ships'], (ruin, n) => `${ruin} / ${n} SHIPS`),
    fire: line(1, [], () => 'AIM AND FIRE', { act: true }),
    guardsBack: line(1, [], () => 'PIRATES ARE BACK'),
    fund: line(0, ['ruin'], (ruin) => `FUND ${ruin}`),
    funds: line(1, ['cr', 'cr'], (put, cost) => `${put} / ${cost} CR`),
    earn: line(0, [], () => 'EARN CREDITS'),
    earnSub: line(1, [], () => 'TAKE FREIGHT', { act: true }),
    repairer: line(0, [], () => 'FIND REPAIR DROID'),
    checkHull: line(1, [], () => 'CHECK YOUR HULL', { act: true }),
    hullSound: line(0, [], () => 'HULL IS SOUND'),
    hullMended: line(0, [], () => 'HULL REPAIRED'),
    droidMet: line(1, [], () => 'REPAIR DROID'),
    reopen: line(0, ['ruin'], (ruin) => `REOPEN ${ruin}`),
  }),
  // The first-dock support (src/starterSupport.js; the economy handoff's section 6): offered once, a delivery after the offer builds the
  // start ruin's construction, never the wallet.
  support: Object.freeze({
    title: line(0, [], () => 'RECOVERY RUN'),
    run: line(1, ['ruin'], (ruin) => `RUN FUNDS ${ruin}`),
    ready: line(0, [], () => 'SUPPORT IS READY'),
    go: line(1, ['ruin'], (ruin) => `GO TO ${ruin}`),
    clear: line(1, ['ruin'], (ruin) => `CLEAR ${ruin}`),
    done: line(0, ['ruin'], (ruin) => `${ruin} SUPPORTED`),
    doneSub: line(1, ['cr'], (cr) => `+${cr} CR BUILT`),
    none: line(1, [], () => 'YOU NEED NO HELP'),
  }),
  // The six reference ships' quests (src/specialQuests.js; src/specials.js gives the done row its pay).
  // The boss TOLLKEEPER's quest (src/bossQuest.js): story purple, its mark EXPLORE; in its fight its own name; the banners at its waking,
  // after a wreck and when it is beaten.
  boss: Object.freeze({
    pointer: line(0, [], () => 'EXPLORE'),
    title: line(0, [], () => 'STRANGE ACTIVITY'),
    sub: line(1, ['sector'], (sector) => `${sector} / EXPLORE`, { act: true }),
    name: line(0, [], () => 'TOLLKEEPER'),
    fight: line(0, [], () => 'TOLLKEEPER'),
    fightSub: line(1, [], () => 'BRING IT DOWN', { act: true }),
    waitSub: line(1, ['sector'], (sector) => `${sector} / TAKE IT DOWN`, { act: true }),
    offered: line(0, [], () => 'STRANGE ACTIVITY', { banner: true }),
    offeredSub: line(1, ['sector'], (sector) => `IN ${sector} / EXPLORE`, { banner: true }),
    woke: line(0, [], () => 'TOLLKEEPER', { banner: true }),
    wokeSub: line(1, [], () => 'PIRATE TUG / BRING IT DOWN', { banner: true }),
    moved: line(0, [], () => 'TOLLKEEPER WITHDREW', { banner: true }),
    movedSub: line(1, ['sector'], (sector) => `NOW IN ${sector}`, { banner: true }),
  }),
  special: Object.freeze({
    race: line(0, ['station'], (station) => `RACE TO ${station}`),
    raceSub: line(1, [], () => 'FIND THE DOC', { timed: true }),
    reached: line(0, ['station'], (station) => `${station} REACHED`),
    runFailed: line(0, [], () => 'RUN FAILED'),
    missed: line(1, [], () => 'DESTINATION MISSED'),
    bounty: line(0, ['sector'], (sector) => `BOUNTY IN ${sector}`),
    outlaws: line(1, ['sector', 'count'], (sector, n) => `${sector} / ${n} OUTLAWS`),
    down: line(1, ['count', 'count'], (down, total) => `${down} OF ${total} DOWN`),
    bountyDone: line(0, [], () => 'BOUNTY COMPLETE'),
    failed: line(0, [], () => 'MISSION FAILED'),
    escaped: line(1, [], () => 'TARGETS ESCAPED'),
    battle: line(0, ['station'], (station) => `BATTLE AT ${station}`),
    battleSub: line(1, [], () => 'CLEAR THE PIRATES', { act: true }),
    clear: line(0, ['station'], (station) => `${station} IS CLEAR`),
    stillThere: line(1, [], () => 'PIRATES STILL THERE'),
    load: line(0, ['count'], (cars) => `LOAD ${cars} CRATES`),
    loadSub: line(1, ['planet'], (planet) => `AT ${planet}`),
    tow: line(0, ['count'], (cars) => `TOW ${cars} CRATES`),
    towSub: line(1, ['count', 'count', 'station'], (done, cars, station) => `${done}/${cars} TO ${station}`),
    delivered: line(0, [], () => 'CRATES DELIVERED'),
    deliveryFailed: line(1, [], () => 'DELIVERY FAILED'),
    serenity: line(0, ['station'], (station) => `FLY TO ${station}`),
    hull: line(1, [], () => 'HULL FAILING', { timed: true }),
    arrived: line(0, [], () => 'SERENITY ARRIVED'),
    run: line(0, ['place'], (place) => `RUN: ${place}`),
    tail: line(1, [], () => 'ON YOUR TAIL', { timed: true }),
    shaken: line(0, [], () => 'PIRATES SHAKEN OFF'),
    paid: line(1, ['cr'], (cr) => `+${cr} CR / GIFTS`),
  }),
  // Banners that carried the same names past their 27 characters (the defaults round, 2026-10-04).
  banner: Object.freeze({
    // A cargo's notice (labs/graphics/notices.js): what it is and the station it goes to (the sector is the map's).
    cargo: line(1, ['cargo', 'station'], (cargo, station) => `${cargo} → ${station}`, { banner: true }),
    // A cargo the pirates carried off (it was «… IS HELD BY PIRATES»).
    held: line(1, ['cargo'], (cargo) => `PIRATES HAVE ${cargo}`, { banner: true }),
    // The opening's dispatch call (src/opening.js).
    smallDelivery: line(1, ['station'], (station) => `${station} NEEDS A DELIVERY`, { banner: true }),
    // A toast when K finds no other pointer (labs/graphics/main.js).
    moreCursors: line(0, [], () => 'SIDE QUESTS GIVE CURSORS', { banner: true }),
  }),
});

// The station's label alone from World.stationLabelOf's «LABEL / SECTOR» (a banner that names the sector's map leaves it off).
export const stationOnly = (labelAndSector) => String(labelAndSector ?? '').split(' / ')[0];

// What the pilot does now, read from a quest's detail as it stands (its plate's second row, the task slot's `sub`): the last part of
// a detail made by a line marked `act`, or null. Each marked line is matched by its own words with its parts left open, so a new
// marked line needs nothing more here (checks/helmet-notch.mjs runs every one).
const ACTS = Object.values(QUEST_LINES).flatMap((group) => Object.values(group)).filter((l) => l.act && l.row === 1).map((l) => {
  const open = l.args.map((_, i) => `\u0001${i}\u0001`);
  const words = l(...open).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\u0001\d+\u0001/g, '(.+?)');
  return new RegExp(`^${words}$`);
});
export function actionOf(detail) {
  if (!detail) return null;
  const said = String(detail);
  return ACTS.some((re) => re.test(said)) ? said.split(' / ').at(-1) : null;
}
