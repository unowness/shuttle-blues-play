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
    lore: 'Your inherited garage, cut into an asteroid. One berth, a solar wing and a door that catches on its lower track.',
    goods: ['SPARE PARTS', 'FUEL DRUMS', 'PATCHES', 'WIRE', 'LAMPS', 'HOSES'],
  },
  'station-drydock-j04': {
    lore: 'Rotating cabins surround a fixed repair hub. Painted floor marks guide crews from the airlocks to their ships.',
    goods: ['HULL PLATES', 'COOLANT CELLS', 'ENGINE CORE', 'HULL SEALS', 'BOLTS', 'WIRE'],
  },
  'station-relay-j05': {
    lore: 'Mail and signals pass through this relay. The dish turns above a sorting room run by two operators. Bearings are checked between transmissions.',
    ruined: 'A seized bearing has locked the dish in place. Unsorted mail fills the racks. The last transmission remains on the operators\' screen.',
    goods: ['ARCHIVE TAPES', 'RADIO VALVES', 'MAIL SACKS', 'DIALS', 'FUSES', 'LENSES'],
  },
  'station-halcyon-j05': {
    lore: 'Power is down across the greenhouse. Water still drips through two roof panes; the seed trays below them are the only wet ones.',
    rebuilt: 'The greenhouse has power again. Water reaches every seed tray, and new sprouts stand in the rows beneath the repaired roof.',
    goods: ['SPROUTS', 'SEED VAULTS', 'HERBS', 'BULBS', 'SOIL', 'FERNS'],
  },
  'station-depot-k04': {
    lore: 'Nine tiers of crates under one gantry crane. Bulky freight goes in the outer pods. Handwritten corrections crowd the cargo index.',
    // SPROUTS in PODS' place since the v1 economy: HALCYON and APIARY, who grow them, start
    // as ruins, and SX's own example of a run («отвези ростки растений») should be met from the start.
    goods: ['FOOD CRATES', 'MEDICAL KITS', 'ICE', 'SIGNAL LAMPS', 'COAL SACKS', 'SPROUTS'],
  },
  'station-foundry-k04': {
    lore: 'The furnace went cold mid-shift. Unfinished hull plates occupy the cooling racks, each marked with a batch number in chalk.',
    rebuilt: 'The furnace is running. Finished hull plates leave the cooling racks in numbered batches. Chalk dust settles on the warm floor.',
    goods: ['COAL SACKS', 'IRON BARS', 'TOOL STEEL', 'ORE', 'SLAG', 'PISTONS'],
  },
  'station-yard-k05': {
    lore: 'Open trusses surround a repair hub. Hull sections move along the arms to the launch points. Welders stamp their initials beside each joint.',
    ruined: 'The repair hub is dark. Incomplete hulls hang from the trusses, their finished joints stamped with the welders\' initials.',
    goods: ['WATER TANKS', 'PAINT DRUMS', 'TOOL KITS', 'HULL RIBS', 'RIVETS', 'STRUTS'],
  },
  // The two sectors east (2026-09-30): names, lore and goods by the copywriter the same evening.
  // COMMONS, SPOOL 8, APIARY and WHARF 9 start as ruins since the v1 economy (2026-10-01):
  // their lore as working stations became `rebuilt`, and the ruin's lore is new (Claude,
  // in the same voice; for SX and the copywriter to read).
  'station-commons-j06': {
    lore: 'A residential ring built for nine thousand. Most doors are sealed. The bakery clock has stopped, with the next shift still posted beneath it.',
    rebuilt: 'The residential ring is filling again. The bakery clock keeps time, and fresh shift notices cover the old schedule. Couriers use the lit outer dock.',
    goods: ['BREAD LOAVES', 'WOOL BLANKETS', 'SCHOOL BOOKS', 'TOYS', 'LAUNDRY', 'JAM'],
  },
  'station-spool-j06': {
    lore: 'The reactor is cold and the habitat drum is still. Below the empty hose bracket, the old coil has left a pale arc on the blue fuel tank.',
    rebuilt: 'The habitat drum turns again. A new fuel hose sits in the old bracket, its coil tracing the pale arc worn into the blue tank.',
    goods: ['FUEL RODS', 'AIR FILTERS', 'GAS BOTTLES', 'PIPES', 'PUMPS', 'BEARINGS'],
  },
  'station-pharos-j06': {
    lore: 'The navigation lamp is out. Its lens is intact, but the service log ends before the fault was found. A test chart covers the control desk.',
    rebuilt: 'The navigation lamp sweeps the lanes. A new entry closes the fault report. The test chart is pinned above the controls, with each reading checked.',
    goods: ['SIGNAL FLARES', 'LAMP OIL', 'LENS GLASS', 'CHARTS', 'TEA TINS', 'WICKS'],
  },
  'station-apiary-k06': {
    lore: 'Climate control has failed in all seven growing cells. A seed drone follows its route over empty trays, stopping at each numbered row.',
    rebuilt: 'Seven growing cells, each with its own weather. The seed drone follows its numbered route through new leaves, pausing where branches cross the aisle.',
    goods: ['HONEY JARS', 'SPROUTS', 'TEA LEAVES', 'WAX', 'FRUIT', 'SEEDS'],
  },
  'station-wharf-k06': {
    lore: 'The curved repair dock is empty. A seized winch holds a half-wound cable. Its repair ticket lists the work still to be done.',
    rebuilt: 'Ships fill the curved repair dock. The winch feeds cable through its guides again. Its completed repair ticket is filed beside the new jobs.',
    goods: ['CABLE REELS', 'WINCH PARTS', 'LIFE RINGS', 'TOWLINES', 'CHAIN', 'FENDERS'],
  },
  'station-hoist-k06': {
    lore: 'The ship lift is locked between two repair tiers. A strip of inspection tape hangs from the rail, its loose end brushing the platform.',
    rebuilt: 'The lift moves ships between the repair tiers. The inspection tape has been cut back to a short tab beside the release lever.',
    goods: ['LIFT CABLES', 'GEAR OIL', 'PULLEY BLOCKS', 'GREASE', 'GEARS', 'NETS'],
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
