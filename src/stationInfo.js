// What each station is (SX, 2026-09-30: «напиши для каждой станции info с лорам в
// их тематике, каждая станция дает тематические заказы типо "отвези уголь" или
// отвези "ростки растений"»): its lore, shown on its INFO panel
// (src/stationPanel.js), and the goods its runs carry (src/contracts.js). Where a
// station is and what it does (freight, garage, ruin) is in src/sectors.js; its
// drawing is its `look` there.

// A ruin's entry also holds `rebuilt`, the lore of the station it has become, which
// the panel shows once it is restored (copy by the same hand, 2026-09-30, for
// SX to read: a ruin's own lore says what rebuilding would do, and is wrong after it).
//
// Lore: at most four lines of 44 on the panel. Goods: six each, short enough that
// the list fits the panel's two lines; SX's two examples, coal and plant sprouts,
// come from working stations (DEPOT 7, APIARY) as well as from the ruins they
// belong to (FOUNDRY 2, HALCYON), so a pilot meets them before rebuilding. The
// copy and its reasons: reports/2026-09-30-station-lore.md; sixteen passages and four goods rewritten by
// the copy pass of 2026-10-01 (codex/COPY_REWRITE_HANDOFF_FOR_CLAUDE.md; reports/2026-10-01-copy-pass-ledger.md).
export const STATION_INFO = Object.freeze({
  // The pilot's home garage (src/home.js; 2026-10-02, Claude, in the same voice, for SX and the copywriter to read): the
  // title's lore says a shuttle and a small garage were inherited. It sends and receives no freight; its goods are what
  // the garage keeps to mend and refuel a ship with.
  'station-home-j04': {
    lore: 'The garage came with the shuttle: one berth cut into an asteroid, a workbench, a sticking door. The lamp takes two clicks to come on.',
    goods: ['SPARE PARTS', 'FUEL DRUMS', 'PATCHES', 'WIRE', 'LAMPS', 'HOSES'],
  },
  'station-drydock-j04': {
    lore: 'Cabins rotate around a fixed repair hub. Marked paths run from the airlocks to separate berths. Older colours show through the new paint in places.',
    goods: ['HULL PLATES', 'COOLANT CELLS', 'ENGINE CORE', 'HULL SEALS', 'BOLTS', 'WIRE'],
    people: {
      role: 'MECHANIC',
      welcome: 'HEY. NEED REPAIRS, OR LOOKING FOR A JOB?' },
  },
  'station-relay-j05': {
    lore: 'Mail and signals pass through the same hub. Beneath the rotating dish, two operators check addresses and route deliveries. Unconfirmed transmissions remain in the queue.',
    ruined: 'A seized bearing has stopped the dish. Mail has accumulated on the racks. The last transmission is still on screen, unacknowledged.',
    goods: ['ARCHIVE TAPES', 'RADIO VALVES', 'MAIL SACKS', 'DIALS', 'FUSES', 'LENSES'],
    people: {
      role: 'POSTMASTER',
      welcome: 'HELLO. I HANDLE INCOMING DELIVERIES FOR POSTMARK.',
      ruin: "THE DISH WON'T TURN. DON'T DELETE ANYTHING UNSENT. WE'LL RESUME AFTER THE LAST ACKNOWLEDGED MESSAGE.",
      restored: 'AN ACKNOWLEDGEMENT. THE MESSAGE GOT THROUGH. NOW WE CAN WORK THROUGH THE QUEUE.' },
  },
  'station-halcyon-j05': {
    lore: 'The greenhouse has lost power. Its pumps are stopped and the seed trays are dry. Two rows still hold moisture from a damaged water feed line.',
    rebuilt: 'Water reaches every tray again. Shoots have appeared beneath the repaired dome. New batches are kept apart from those that survived the shutdown.',
    goods: ['SPROUTS', 'SEED VAULTS', 'HERBS', 'BULBS', 'SOIL', 'FERNS'],
    people: {
      role: 'GROWER',
      welcome: 'HELLO. GOOD TO SEE YOU.',
      ruin: "THE PUMPS AREN'T WORKING. MARK THE TWO ROWS THAT ARE STILL WET; WE'LL LEAVE THOSE FOR NOW. THE OTHER TRAYS HAVE DRIED OUT.",
      restored: "WATER'S REACHED THE FAR ROW. SOME OF THE SEEDS SURVIVED. I'LL START WITH THOSE." },
  },
  'station-depot-k04': {
    lore: 'One gantry crane serves nine tiers of crates. Bulky loads go in the outer pods. Addresses in the register have been corrected by hand, sometimes over an earlier correction.',
    // SPROUTS in PODS' place since the v1 economy: HALCYON and APIARY, who grow them, start
    // as ruins, and SX's own example of a run («отвези ростки растений») should be met from the start.
    goods: ['FOOD CRATES', 'MEDICAL KITS', 'ICE', 'SIGNAL LAMPS', 'COAL SACKS', 'SPROUTS'],
    people: {
      role: 'CLERK',
      welcome: 'COLLECTING OR DROPPING OFF? LET ME GET THE LIST.' },
  },
  'station-foundry-k04': {
    lore: 'The furnace died mid-shift. Unfinished hull plates lie on the racks, their batch numbers written in chalk. A pair of gloves remains on the bench.',
    rebuilt: 'The furnace is running. Finished plates leave the racks in numbered batches. Footprints cross the chalk dust on the warm floor.',
    goods: ['COAL SACKS', 'IRON BARS', 'TOOL STEEL', 'ORE', 'SLAG', 'PISTONS'],
    people: {
      role: 'SMELTER',
      welcome: 'I CAN HEAR YOU. SPEAK UP A BIT; THE FURNACE IS RIGHT BESIDE ME.',
      ruin: "THE FURNACE IS DOWN. LEAVE THOSE PLATES ALONE FOR NOW. ONCE THEY'VE COOLED, WE'LL SEE IF WE CAN FINISH THEM.",
      restored: "IT'S UP TO TEMPERATURE. WE'LL FINISH THAT BATCH BEFORE WE START ANOTHER." },
  },
  'station-yard-k05': {
    lore: "Open trusses surround an assembly hub. Hull sections travel along its arms to the building slips. Every completed weld carries its welder's mark.",
    ruined: 'The assembly hub is offline. Unfinished hulls remain on the trusses, their last seams still open. Marks on the sections show where work stopped.',
    goods: ['WATER TANKS', 'PAINT DRUMS', 'TOOL KITS', 'HULL RIBS', 'RIVETS', 'STRUTS'],
    people: {
      role: 'WELDER',
      welcome: 'GO AHEAD. JUST FINISHED A WELD.',
      ruin: "STOP ASSEMBLY. I'VE MARKED THE UNFINISHED WELDS. LEAVE THE HULLS ON THEIR MOUNTS UNTIL WE'VE FINISHED THEM.",
      restored: "POWER'S BACK. GLAD I MARKED THOSE WELDS. I CAN SEE WHERE WE LEFT OFF." },
  },
  // The two sectors east (2026-09-30): names, lore and goods by the copywriter the same evening.
  // COMMONS, SPOOL 8, APIARY and WHARF 9 start as ruins since the v1 economy (2026-10-01):
  // their lore as working stations became `rebuilt`, and the ruin's lore is new (Claude,
  // in the same voice; for SX and the copywriter to read).
  'station-commons-j06': {
    lore: 'The residential ring was built for nine thousand people. Most sections are sealed. Its internal network retains announcements and conversations recorded before the station shut down.',
    rebuilt: "The outer dock is working again. The AI's speech memory is damaged; it replies with stored phrases from former residents. Missing recordings remain on external recorders.",
    goods: ['BREAD LOAVES', 'WOOL BLANKETS', 'SCHOOL BOOKS', 'TOYS', 'LAUNDRY', 'JAM'],
  },
  'station-spool-j06': {
    lore: 'The reactor is cold and the habitat drum is still. The hose bracket is empty. A pale arc on the fuel tank marks where the coil used to rest.',
    rebuilt: 'The habitat drum is turning. A new hose sits in the old bracket and the fuel supply is restored. Loading has resumed outside the reactor section.',
    goods: ['FUEL RODS', 'AIR FILTERS', 'GAS BOTTLES', 'PIPES', 'PUMPS', 'BEARINGS'],
    people: {
      role: 'ENGINEER',
      welcome: 'HELLO. DO YOU NEED FUEL?',
      ruin: "REACTOR STOPPED. FUEL SUPPLY ISOLATED. KEEP THE BRACKETS WHEN DISMANTLING; THEY'RE UNDAMAGED.",
      restored: "I'VE TESTED IT UNDER LOAD. THE SUPPLY IS STABLE AND THE DRUM IS RUNNING AGAIN." },
  },
  'station-pharos-j06': {
    lore: 'The navigation beacon is dark. Its lens is intact, but no cause is recorded for the outage. An unfinished test chart remains open on the console.',
    rebuilt: 'The beacon sweeps the lanes. Testing is complete and the fault report is closed. Transmitter readings are reaching the console again.',
    goods: ['SIGNAL FLARES', 'LAMP OIL', 'LENS GLASS', 'CHARTS', 'TEA TINS', 'WICKS'],
    people: {
      role: 'KEEPER',
      welcome: 'PHAROS HERE. WELCOME.',
      ruin: "THE BEACON IS OUT. I'VE CHECKED THE LENS; IT'S INTACT. I'LL TRY THE TRANSMITTER NEXT.",
      restored: 'TEST COMPLETE. A FULL SWEEP WITHOUT A SINGLE GAP.' },
  },
  'station-apiary-k06': {
    lore: 'Climate control has failed in seven isolated cells. The trays are empty. A drone continues its rounds, checking each row against the stored planting layout.',
    rebuilt: 'Each of the seven cells maintains its own conditions. New leaves extend beyond the trays. The drone pauses before overgrown branches, then continues its round.',
    goods: ['HONEY JARS', 'SPROUTS', 'TEA LEAVES', 'WAX', 'FRUIT', 'SEEDS'],
    people: {
      role: 'AGRONOMIST',
      welcome: 'HELLO. HOW CAN I HELP?',
      ruin: "CLIMATE CONTROL OFFLINE. SEVEN CELLS. LAST CYCLE'S DATA SAVED.",
      recording: 'DRONE · OLD RECORDING',
      restored: "CONDITIONS HAVE BEEN RESTORED IN ALL SEVEN CELLS. WE'LL REPLANT ONE CELL AT A TIME." },
  },
  'station-wharf-k06': {
    lore: 'The curved repair dock is empty. The winch has seized with its cable still in the guides. The last ship has been released from its clamps; the next has not been admitted.',
    rebuilt: 'The winch is working and cable runs through its guides. Damaged ships are secured along the inside of the dock. Repair crews move between them.',
    goods: ['CABLE REELS', 'WINCH PARTS', 'LIFE RINGS', 'TOWLINES', 'CHAIN', 'FENDERS'],
    people: {
      role: 'RIGGER',
      welcome: 'I CAN SEE YOU. DO YOU NEED REPAIRS?',
      ruin: "THE WINCH HAS JAMMED. DON'T TAKE THE NEXT SHIP IN; WE WON'T BE ABLE TO MOVE IT.",
      restored: "THE CABLE'S RUNNING SMOOTHLY. WE CAN TAKE SHIPS IN AGAIN." },
  },
  'station-hoist-k06': {
    lore: 'The ship lift is stuck between repair decks. The platform remains under load. Inspection tape on the rail marks its last position.',
    rebuilt: 'The lift carries ships between decks again. At each berth, the platform settles onto its locks. The old inspection mark remains between floors.',
    goods: ['LIFT CABLES', 'GEAR OIL', 'PULLEY BLOCKS', 'GREASE', 'GEARS', 'NETS'],
    people: {
      role: 'LIFT OPERATOR',
      welcome: "LIFT'S WORKING. COME OVER IF YOU NEED REPAIRS.",
      ruin: "STUCK BETWEEN DECKS. THE PLATFORM'S SECURED. DON'T TAKE ANYTHING OFF IT YET.",
      restored: 'ALL THE WAY UP, ALL THE WAY DOWN. NOTHING CATCHING. WE CAN LIFT SHIPS AGAIN.' },
  },
});

export const stationInfo = (id) => STATION_INFO[id] || null;

// The lore to show now: a rebuilt ruin's own rebuilt lore, else the station's lore.
export function stationLore(id, rebuilt = false) {
  const info = STATION_INFO[id];
  return (rebuilt && info?.rebuilt) || info?.lore || '';
}

// The start's three (src/sectors.js START_STATIONS) are a ruin for one pilot and working for another (SX, 2026-10-02: «каждому
// игроку из 3 станций рандомно достается первая сломанная»): RELAY 12 and YARD 3 also hold `ruined`, the lore of the ruin
// each is when it is the pilot's broken one (Claude, 2026-10-02, in the same voice, for SX and the copywriter to read); HALCYON,
// a ruin in the catalogue, works with its `rebuilt` lore when another is. The lore by what the station is for this pilot now:
// `ruin` true for one not restored, false for one that works, restored or never broken.
export function stationLoreNow(id, ruin) {
  const info = STATION_INFO[id];
  if (!info) return '';
  return (ruin ? info.ruined ?? info.lore : info.rebuilt ?? info.lore) || '';
}

// The goods a station's runs carry, or null (a station without its own list).
export const stationGoods = (id) => STATION_INFO[id]?.goods ?? null;
