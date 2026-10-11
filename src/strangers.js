import { SECTOR_SIZE, stationDefById } from './sectors.js';
import { sectorOpen, stationOpen } from './frontier.js';
import { isRestored } from './ruins.js';
import { STRANGER_RECORDS } from './strangerTraces.generated.js';

// Other pilots' lost cargo (FEATURE_PLAN.md 4.1, 8 step 1). SX, 2026-09-30: «у нас
// пропали призраки игроков»: the ghost of a wreck was the one trace of another
// pilot the game had, and only the pilot's own wrecks left one. Until there are
// real pilots (doc 08: cards, signs and thanks are local fixtures) a few stand in,
// one per grid sector, each an author already on a sign (signs.js FIXTURE_SIGNS)
// whose cargo lies where it fell, with the ghost of the flight that lost it.
//
// A story is authored here: who, what the cargo is and where it was bound, what
// destroyed the ship. Where the cargo came to rest and how the ship flew into it are
// not authored: tools/record-stranger-traces.mjs flies the real World into the real
// planet or a placed rock with scripted input, and the world's own recorder
// freezes what happened into src/strangerTraces.generated.js. The replay therefore
// shows a ship hitting what is really there, and the cargo lies where restingPoint
// leaves it after that wreck. Move a planet and checks/strangers.mjs says so.
//
// Each contract is known to contractById, so the ledger can hold its id (carried,
// stranded again by the pilot, delivered) and a save keeps it, but no station
// offers it and it is not one of CONTRACTS: DELIVERIES on the pilot card counts the
// authored nine, and a rescue is counted by RESCUED. It pays like the authored ones
// (the freight rule, src/contracts.js freightReward, which sets `reward` on these), and its delivery
// clock starts when the cargo is taken. Each cargo lies nearer its destination than
// its origin station is, so the pilot has less than the full distance left and the
// par is generous: a straight flight usually beats it, and the FAST bonus with it.
//
// Menu lines are held to 30 columns, the width of the lab's callout: the title is
// LOST CARGO / <author>, the subtitle <cargo> -> <station> / <sector>.
export const STRANGER_STORIES = [
  // Marty's sign, HELLO FUTURE, stands in BACKSTAGE (SX's map layout, 2026-10-02); RELAY 12 is his home port.
  // He was flying a case of coils home to it from DEPOT 7 and put the ship into SORREL, a short hop from the door.
  // (Bound for DEPOT 7 until 2026-10-02: past the frontier's first border, so no lost cargo lay in the start's sectors;
  // SX: «Почему-то совсем пропали брошенные грузы». Turned round, the run and its pay are the same.)
  {
    id: 'stranger-marty', sector: 'sector-j05', author: 'MARTY MCFLY', cause: 'planet',
    contract: { id: 'contract-coils-01', label: 'FLUX COILS', from: 'station-depot-k04', to: 'station-relay-j05' },
    thanks: 'MARTY MCFLY / CARGO RECEIVED',
  },
  // C-3PO's sign, ODDS NOT GOOD, is by the black hole. He had worked out the odds of
  // the rocks between DRY DOCK and YARD 3 and took them, weaving, all the same.
  {
    id: 'stranger-threepio', sector: 'sector-j04', author: 'C-3PO', cause: 'asteroid',
    contract: { id: 'contract-translators-01', label: 'TRANSLATORS', from: 'station-drydock-j04', to: 'station-yard-k05' },
    thanks: 'C-3PO / CARGO RECEIVED',
  },
  // Han's sign, NEVER TELL ODDS, is at the top of K-04. The straight line from DEPOT 7
  // to DRY DOCK passes close by GLOAMING; he never asked how close.
  {
    id: 'stranger-han', sector: 'sector-k04', author: 'HAN SOLO', cause: 'planet',
    contract: { id: 'contract-charts-01', label: 'STAR CHARTS', from: 'station-depot-k04', to: 'station-drydock-j04' },
    thanks: 'HAN SOLO / CARGO RECEIVED',
  },
  // Leela's sign by YARD 3 says CARGO NEVER WAIT. Hers has, since a rock the chart did
  // not show. She was bringing rush parcels home to YARD 3 from DEPOT 7 (from YARD 3 to DEPOT 7 until 2026-10-02, and
  // to RELAY 12 before SX's map layout of that day; turned round as MARTY's was, the same run and pay).
  {
    id: 'stranger-leela', sector: 'sector-k05', author: 'LEELA', cause: 'asteroid',
    contract: { id: 'contract-parcels-01', label: 'RUSH PARCELS', from: 'station-depot-k04', to: 'station-yard-k05' },
    thanks: 'LEELA / CARGO RECEIVED',
  },
];

// The contracts, known even where no record has been made yet.
export const STRANGER_CONTRACTS = STRANGER_STORIES.map((s) => s.contract);

// Story and record together. A story whose record is missing is left out, and
// checks/strangers.mjs fails on it: the tool has to be run.
export const STRANGERS = STRANGER_STORIES.flatMap((story) => {
  const record = STRANGER_RECORDS[story.id];
  if (!record) return [];
  // The place is kept as a fraction of the sector, like every authored object.
  return [{
    ...story, x: record.x / SECTOR_SIZE.width, y: record.y / SECTOR_SIZE.height,
    obstacle: record.obstacle, trace: record.trace,
  }];
});

export const strangerByContract = (contractId) => STRANGERS.find((s) => s.contract.id === contractId) || null;

// The strangers whose cargo lies in a sector now: not delivered, not carried and
// not lost again by the pilot. Once the pilot has taken one it is the pilot's
// contract, and where it lies after a wreck is the pilot's own record.
// Since the frontier (src/frontier.js, 2026-10-02) one bound for a station past a closed border waits until that sector
// opens, and one bound for a ruin until it is restored, as a run bound for a ruin waits: taken, it would lead the pilot where
// he cannot deliver. MARTY's and LEELA's lie in the start's sectors bound for stations there; whichever of those is the
// pilot's broken one waits for it.
export function openStrangersIn(sectorId, ledger) {
  return STRANGERS.filter((s) => s.sector === sectorId && strangerOpen(s, ledger) &&
    !ledger.completed.has(s.contract.id) && ledger.active?.id !== s.contract.id && !ledger.stranded.has(s.contract.id));
}

// Whether a stranger's cargo can be had now: it lies in an open sector and is bound for a working station in one.
export const strangerOpen = (s, ledger) => sectorOpen(ledger, s.sector) && stationOpen(ledger, s.contract.to) &&
  isRestored(ledger, stationDefById(s.contract.to));
