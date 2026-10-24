import { CONFIG } from './config.js';
import { STATION_INFO } from './stationInfo.js';
import { contractById } from './contracts.js';
import { workingKind } from './ruins.js';
import { chorusDone, COMMONS_ID } from './chorus.js';
import { openingStage, REST } from './opening.js';

// What a station's people say (the text pass SX approved on 2026-10-24, codex/text-review/2026-10-24): the station's window is a talk while it
// has something to say (src/menus.js stationMenu; labs/graphics/talk-beat.js), and only then: once the pilot has heard all of it, the window
// is the station's rows again, with no TALK before them (the talk's `quiet`). What it says, in order:
//   a ruin       its old recording (STATION_INFO people.ruin): what its people said as it stopped, never a live voice
//   working      its person's hello (people.welcome), once in the whole game: heard, never again (Pilot.greeted, in the save; SX,
//                2026-10-24: «Пусть приветствие станции звучит один раз за игру»); what happened here a moment ago (`news`: its restoration's word, people.restored, once;
//                a cargo delivered here, the receiver's word, CONTRACTS handoff); and of each authored cargo it offers now, why it goes
//                (CONTRACTS offer). CONCOURSE has no person: its archive speaks, and once its AI has its own words back (src/chorus.js)
//                the AI, lowercase (offerOwn, handoffOwn)
// Nothing while the opening chapter runs (its A and B speak by its own words, src/opening.js), nor at HOME, nor while a borrowed ship is flown
// (a station says only INFO then). The news are the world's, never saved: a word said a moment ago, kept `CONFIG.station.news` s.
//
//   world.stationNews = Map(stationId -> [{ who, line, key, at }])

const THREAD = (id) => `station:${id}`;
const RECORDING = 'OLD RECORDING';
// CONCOURSE's voices: its archive's (the residents' words, before its own came back) and its AI's own, in the station's own ink.
const ARCHIVE = 'STATION ARCHIVE', AI = 'AI';

// A word said at station `id` now (its restoration's, a cargo delivered): kept for the station's talk a while.
export function noteStation(world, id, who, line, key) {
  if (!line) return;
  const news = (world.stationNews ??= new Map());
  const list = (news.get(id) ?? []).filter((n) => world.time - n.at < CONFIG.station.news && n.key !== key);
  list.push({ who, line, key, at: world.time });
  news.set(id, list.slice(-4));
}

// Station `s` restored: its person's word on it, once (src/ruinWork.js).
export function noteRestored(world, s) {
  const p = STATION_INFO[s.id]?.people;
  if (p?.restored) noteStation(world, s.id, p.role, p.restored, `restored:${s.id}`);
}
// Cargo `contract` delivered at station `to`: the receiver's word (src/delivery.js). An authored contract's only.
export function noteDelivered(world, contract) {
  const c = contractById(contract?.id);
  if (!c?.handoff || c.to !== contract.to) return;
  const own = c.to === COMMONS_ID && chorusDone(world) && c.handoffOwn;
  noteStation(world, c.to, own ? AI : whoAt(world, c.to), own || c.handoff, `handoff:${c.id}`);
}

// A station's conversation ended (LATER, or the ship gone from it: labs/graphics/talk-beat.js), its talk `thread`, `said` the keys of what its
// script holds: its hello, if it was said there, is heard for good (a ruin's recording heard is no hello).
export function talkEnded(world, thread, said = null) {
  const id = typeof thread === 'string' && thread.startsWith('station:') ? thread.slice('station:'.length) : null;
  if (id && said?.has(`welcome:${id}`)) world.pilot?.greet(id);
}

// Who speaks for station `id`: its person's role; CONCOURSE its archive, or its AI.
function whoAt(world, id) {
  if (id === COMMONS_ID) return chorusDone(world) ? AI : ARCHIVE;
  return STATION_INFO[id]?.people?.role ?? null;
}

// Station `s`'s talk (its menu's `talk`), or null: `actions` its rows as the menu has them (the authored cargo it offers among them, `contractId`).
export function stationTalk(world, s, actions = []) {
  const people = STATION_INFO[s.id]?.people, commons = s.id === COMMONS_ID;
  if ((!people && !commons) || world.special?.boarded) return null;
  const stage = openingStage(world);
  if (stage !== null && stage !== REST) return null;
  const lines = [];
  if (workingKind(world.ledger, s) === 'ruin') {
    if (people?.ruin) lines.push({ who: people.recording ?? RECORDING, line: people.ruin, key: `ruin:${s.id}` });
  } else {
    const own = commons && chorusDone(world), who = whoAt(world, s.id), ink = own ? CONFIG.quests.chorus.art.own : null;
    if (people?.welcome && !world.pilot?.greeted?.has(s.id)) lines.push({ who, line: people.welcome, key: `welcome:${s.id}` });
    for (const n of world.stationNews?.get(s.id) ?? []) if (world.time - n.at < CONFIG.station.news) lines.push({ who: n.who, line: n.line, key: n.key, ...(n.who === AI ? { ink } : null) });
    for (const a of actions) {
      const c = a.offer && contractById(a.contractId);
      if (!c?.offer) continue;
      lines.push({ who, line: (own && c.offerOwn) || c.offer, key: `offer:${c.id}:${own ? 'own' : 'archive'}`, ...(own ? { ink } : null) });
    }
  }
  return lines.length ? { name: s.label, place: s.label, lines, thread: THREAD(s.id), quiet: true } : null;
}
