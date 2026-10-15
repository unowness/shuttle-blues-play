// The world's events (World.emit, src/world.js): every type the simulation puts on its queue, the keys its payload carries, and the
// save it calls for. The page drains the queue once a frame and hands each event to three readers: the sound (src/audio.js
// handle), the labels at things (src/feedback.js handle) and the notices (labs/graphics/notices.js handleEvents, which also saves).
// Chat B's refactoring piece (code review finding 14, docs/plans/2026-10-04-roadmap.md): the types had no list and the moments
// that save lived as `persist(...)` calls in the notices' switch; now `saves` here is the one place a type is told to save, and
// checks/events.mjs holds that every emit is listed, every listed type is emitted, and every reader's case is a listed type.
//
// An entry: `keys`, the payload's own keys, space-separated (`...at` is a place spread in: sectorId, x, y); `saves`, the reason
// the page's persist is called with as the event is read (the state is final when its event is read), or null. Events that move
// money, a ruin, the pilot's place or what the pilot owns save at once, so a crash no longer takes back up to a save interval.
const E = (keys, saves = null) => Object.freeze({ keys: Object.freeze(keys ? keys.split(' ') : []), saves });

export const EVENTS = Object.freeze({
  // The flight and the map.
  sectorEntered: E('sectorId label title visit', 'sector'),
  sectorLeft: E('from to'),
  holeTransit: E('from to label title holeId exitId turned', 'transit'),
  boundaryBlocked: E('sectorId label depth'),
  orbitContact: E('sectorId x y'),
  // The drift and the trick (src/drift.js, src/trick.js): the push out of a drift (none in the game's G1 GLIDE), a
  // jump taken, its contact (clean or not), a planet's pinball in it.
  driftBoost: E('sectorId x y tier boost links'),
  jumped: E('sectorId x y hang'),
  landed: E('sectorId x y clean figures'),
  jumpBounced: E('sectorId x y speed'),
  // The smoke clouds (src/clouds.js; the lab's ?clouds= until SX picks): a hull going into one and out of it on the ground, and a jump
  // coming down onto one (it cuts on through from where it touched).
  cloudEntered: E('cloudId sectorId x y'),
  cloudLeft: E('cloudId sectorId x y'),
  cloudSplash: E('cloudId sectorId x y'),
  shipBumped: E('sectorId x y speed what'),
  shipDamaged: E('sectorId x y amount cause hull landed'),
  shipWrecked: E('sectorId cause strandedContract returnedContract returnedTo', 'wrecked'),
  rescueCharged: E('cost paid hull fuel credits sectorId x y', 'rescue'),
  fuelLow: E('fuel'),
  fuelEmpty: E(''),
  rockBroken: E('tier x y sectorId'),
  shotFired: E('owner kind x y sectorId'),
  outatime: E('x y'),
  // What the ship picks up in space.
  pickupClaimed: E('pickupId reward credits x y sectorId drop', 'pickup'),
  fuelClaimed: E('pickupId units gained fuel x y sectorId drop', 'fuel'),
  partClaimed: E('pickupId gained hull x y sectorId', 'part'),
  tankFull: E('pickupId x y sectorId'),
  coinsSpilled: E('sectorId x y amount credits', 'spilled'),
  creditsSeized: E('sectorId x y amount credits'),
  // Cargo (src/contracts.js, src/tow.js) and its traces.
  contractAccepted: E('contractId label destination reward par', 'accepted'),
  delivered: E('contractId label stationId x y sectorId reward credits alreadySettled timing rescued author thanks fee', 'delivered'),
  cargoRecovered: E('contractId label destination x y sectorId alreadySettled', 'recovered'),
  cargoReturned: E('contractId label returnedTo sectorId', 'returned'),
  cargoBumped: E('sectorId x y speed what'),
  tetherSnapped: E('sectorId x y pull'),
  traceRequested: E('contractId sectorId trace cause obstacle x y shift author'),
  // Stations, the home garage and the hangar.
  docked: E('stationId label', 'docked'),
  undocked: E('stationId'),
  homeDocking: E('stationId label'),
  homeEntered: E('stationId label fuel hull credits'),
  homeLeaving: E('stationId'),
  refueled: E('...at units cost fuel credits', 'refuel'),
  hullRepaired: E('...at points cost hull credits', 'repair'),
  chalkBought: E('sectorId x y pieces cost chalk credits', 'chalk'),
  stationInvested: E('stationId label amount invested cost share credits by ...at', 'invest'),
  stationRestored: E('stationId label becomes price credits restored finds gift ...at', 'restore'),
  stationBroken: E('stationId label cost sectorId x y', 'station'),
  stationWorn: E('stationId label wear sectorId x y', 'station'),
  stationRepaired: E('stationId label cost credits sectorId x y mended', 'station'),
  stationLog: E('stationId label sector visit'),
  hangarRequested: E('stationId'),
  shipBought: E('shipId label price credits stationId sectorId x y', 'ship'),
  shipChanged: E('shipId from label hull fuel stationId sectorId x y', 'ship'),
  actionRefused: E('reason'),
  // The frontier and the collections.
  sectorOpened: E('opened label title ...at cache'),
  networkComplete: E('stations ...at'),
  collectionComplete: E('kind of ...at'),
  // Finds (src/rewards.js, src/looks.js, src/cursors.js), the radio a quest gives (src/questHooks.js giveRadio), and the signs.
  cacheOpened: E('cacheId defId label isNew slot price free credits alreadySettled ...at', 'cache'),
  paintFound: E('cacheId paintId label price free credits alreadySettled ...at', 'paint'),
  lookFound: E('lookId label source ...at', 'look'),
  cursorFound: E('cursorId label sectorId', 'cursor'),
  radioGiven: E('questId sectorId', 'radio'),
  findMarked: E('findId label kind sectorId', 'mark'),
  signalHeard: E('signalId kind wordId text amount credits x y sectorId tip', 'signal'),
  signPlaced: E('signId sectorId x y text chalk replaced', 'sign'),
  signRemoved: E('signId sectorId x y text', 'sign'),
  flagRemoved: E('slot colour sectorId x y', 'flag'),
  // Pirates (src/pirates.js, src/raids.js).
  pirateAttackPhase: E('pirateId kind phase heading reason partnerId'),
  piratePattern: E('pirateId kind phase'),
  mineLaid: E('id pirateId x y', 'combat'),
  mineRemoved: E('id reason x y'),
  repairSupplySpent: E('pirateId left', 'combat'),
  repairPulse: E('pirateId patientId amount'),
  repairInterrupted: E('pirateId amount'),
  capsuleSecured: E('capsuleId pirateId exit', 'combat'),
  capsuleEscaped: E('capsuleId pirateId', 'combat'),
  capsuleDropped: E('capsuleId pirateId reason x y', 'combat'),
  capsuleRecovered: E('capsuleId owner', 'combat'),
  newEnemySystemsEnded: E('reason encounterId'),
  piratesEngaged: E('count kinds total sectorId bearing distance post stationId label'),
  pirateHit: E('pirateId kind cause left hp x y sectorId'),
  pirateDown: E('pirateId kind cause coins held left x y sectorId post'),
  pirateFled: E('pirateId kind why x y sectorId post'),
  pirateGreed: E('pirateId kind x y sectorId'),
  pirateGreedEnd: E('pirateId kind got reason sectorId'),
  pirateLoot: E('pirateId kind coins hold x y sectorId'),
  pirateShout: E('pirateId kind trait line x y sectorId'),
  encounterEnded: E('cause sectorId size left seconds'),
  // The boss TOLLKEEPER (src/boss.js): there, a pattern's step, its escort let out, a part hit, a sled shot off, its phase, beaten; whole
  // again after the pilot's wreck.
  bossSpawned: E('sectorId x y'),
  bossPattern: E('pattern phase sectorId x y'),
  bossLaunch: E('count sectorId x y'),
  bossHit: E('part left sectorId x y'),
  bossSledOff: E('side why sectorId x y'),
  bossPhase: E('phase rage sectorId x y'),
  bossDefeated: E('sectorId x y'),
  bossHealed: E('sectorId'),
  // Its quest (src/bossQuest.js): offered at 8 of 8, woken at its mark, moved next door after a wreck, beaten (the main game done).
  bossQuestOffered: E('sectorId label x y', 'quest'),
  bossWoke: E('sectorId x y'),
  bossMoved: E('from to label', 'quest'),
  bossQuestDone: E('sectorId x y', 'quest'),
  // COMMONS's chain THE CHORUS (src/chorus.js): begun near the ring restored, a piece said over the station, a voice's recorder taken,
  // dropped by a wreck, a voice played back at COMMONS, the four back (the roll call and its pay, once).
  chorusBegun: E('stationId label voice sectorId x y', 'quest'),
  chorusLine: E('stationId who at line own hole noise sectorId'),
  chorusTaken: E('voice sectorId x y', 'quest'),
  chorusDropped: E('voice sectorId x y', 'quest'),
  chorusVoiceBack: E('voice n of pay credits stationId sectorId x y', 'quest'),
  chorusDone: E('pay credits alreadySettled stationId sectorId x y', 'quest'),
  raidStarted: E('label sectorLabel ruin stationId size time sectorId', 'raid'),
  raidWon: E('label sectorLabel ruin stationId seconds sectorId pay credits', 'raid'),
  raidLost: E('label sectorLabel ruin stationId cost costText sectorId', 'raid'),
  ruinCleared: E('stationId label sectorId x y', 'raid'),
  // The opening chapter (src/opening.js): a stage passed (saved: the record moved), a line of A's or B's people on the radio, the
  // braking practice done, the locator and the map fitted or the shelf fitted at B (`what`), SCOOTY JR. handed back and the pilot in
  // their own shuttle.
  openingStage: E('stage from', 'opening'),
  openingCall: E('who line'),
  openingPractice: E('what'),
  openingFitted: E('what stationId label owned cost', 'opening'),
  loanerReturned: E('stationId label shipId', 'ship'),
  // Quests (src/quests.js and its kinds) and the radio.
  questOffered: E('questId kind'),
  guideHeard: E('step line'),
  guidePaid: E('step pay credits x y sectorId', 'quest'),
  // The first-dock support (src/starterSupport.js): offered, qualified by a delivery ('ready'), built into the start ruin ('built').
  starterSupport: E('stage stationId label amount left', 'support'),
  drifterHelped: E('fuel pay credits x y sectorId'),
  pesterStarted: E('questId name sectorId size'),
  pesterFreed: E('questId name pay credits x y sectorId', 'quest'),
  pesterLost: E('questId name x y sectorId'),
  wreckHelped: E('ask hint credits name x y sectorId', 'quest'),
  errandTaken: E('planet station sectorId'),
  suitcaseTaken: E('planet x y sectorId'),
  suitcaseDelivered: E('planet pay credits x y sectorId', 'quest'),
  suitcaseLost: E('planet x y sectorId'),
  specialSeen: E('id label sectorId'),
  specialBoarded: E('id label x y sectorId'),
  specialStage: E('id stage x y sectorId left'),
  specialDone: E('id label x y sectorId paint cockpit note pay credits', 'special'),
  specialFailed: E('id label x y sectorId why'),
  specialGone: E('id sectorId'),
  // Other craft: droids, traffic, NPC ships.
  droidArrived: E('droidId kind name label sectorId'),
  droidLeft: E('droidId kind sectorId'),
  droidServed: E('droidId kind name sectorId x y units cost left fuel hull credits', 'droid'),
  visitorArrived: E('craftId label sectorId'),
  trafficHail: E('craftId label line rows x y sectorId visitor greet to angry'),
  npcDown: E('code label x y sectorId speed'),
});

// The save an event calls for (EVENTS[type].saves), or null for a type that saves nothing or is not listed.
export const savesFor = (type) => EVENTS[type]?.saves ?? null;
