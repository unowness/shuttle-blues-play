// THE CHORUS: COMMONS's chain (SX, 2026-10-15: «пусть это будет станция управляемая искуственным интеллектом и она нестандартно
// общается с игроком»; «сделай так как бы ты хотел … можешь придумать цепочку квестов и диалогов»; «делаем»; «hail над станцией»;
// «Давай цепочку»). The station's AI recorded its residents on the common channel; the people left, the recordings stayed, and the AI
// lost its own words with the broken half of the ring, so it speaks in collages of theirs, each piece with who said it and when
// (labs/graphics/sketches/commons-voice.html, SX's V1 HAIL: the pieces rise over the station). Four of its voices are missing: each is
// on a recorder buoy in a sector nearby (SX's C2 on labs/graphics/sketches/quest-objects.html), taken aboard and played back at COMMONS.
// With the four back, a roll call: every voice answers, and last the AI itself, in its own word.
//
//   (none)   COMMONS restored, the pilot within `hear` u of it: the call (static, «anyone out there?» in six voices), then the first
//            hole («The one who knew the song was—» NO RECORDING «Out past» «K-05.»); the first buoy laid
//   seek     the buoy lies at its place: its plate leads to it, up close its window offers TAKE THE RECORDER
//   carry    the recorder is aboard, on a short rope behind the hull (drawn only, as the planet's suitcase is); a wreck drops it back
//            where it lay; at COMMONS its window offers PLAY BACK <WHO>: the voice plays, the AI speaks a little longer, it pays, and
//            the next hole is heard and its buoy laid (or, the fourth back, the roll call and the chain's pay, once)
//   done     the reward ledger's claim `chorus-roll-call` (src/rewardLedger.js): the chain is never offered again; from then the AI
//            greets the pilot in its own words, lowercase, when the pilot comes near
//
// The choices SX left to Claude on 2026-10-15 («Давай цепочку», after «остальное не понимаю»): COMMONS keeps its dock as every station
// (D1), the voices come back one at a time (O1), the recorder is carried on a rope home (B3 as the suitcase), the reward is money and the
// AI's own words from then (R3). docs/decisions/2026-10.md, "THE CHORUS".
//
//   world.chorus = { stage, voice, buoy: { sectorId, x, y }, queue: [{ at, piece }], greeted, saidAt, ownAt }
//   voice: how many voices are back (0 to 4); buoy x, y: fractions of its sector
import { CONFIG } from './config.js';
import { sectorById, stationDefById, SECTOR_SIZE } from './sectors.js';
import { sectorOpen } from './frontier.js';
import { clearSpot } from './spots.js';
import { claimOf, payCash } from './rewardLedger.js';
import { payFor } from './pacing.js';
import { formatCR } from './ruins.js';
import { clamp } from './util.js';
import { QUEST_LINES as QL } from './questLines.js';

export const CHORUS_ID = 'chorus';
export const BUOY_ID = 'chorus-buoy';
export const COMMONS_ID = 'station-commons-j06';
export const CHORUS_CLAIM = 'chorus-roll-call';
const C = () => CONFIG.quests.chorus;
const W = SECTOR_SIZE.width, H = SECTOR_SIZE.height;

// ---------------------------------------------------------------------------------------------------------------------- the words ---
// A piece is one recording: `who` and `at` its tag, `line` what it says; `own` the AI's own word (lowercase, no tag, the station's hue);
// `hole` a recording that is not there; `noise` the static before a voice.
const P = (who, at, line) => Object.freeze({ who, at, line });
const OWN = (line) => Object.freeze({ own: true, line });
const HOLE = Object.freeze({ hole: true, line: 'NO RECORDING' });
const NOISE = Object.freeze({ noise: true, line: '~ ~ ~ ~ ~ ~' });

// The call, the first time the pilot comes near the ring restored.
export const CALL = Object.freeze([
  NOISE,
  P('ANNOUNCER', '01.01', 'Attention, please.'),
  P('DOCK WARDEN', '03.14', 'Anyone—'),
  P('BAKER', '05.40', '—out there?'),
  P('GREENHOUSE KID', '11.20', 'Hello? Hello hello.'),
  P('MAYOR', '02.11', 'We are still here.'),
  P('ANNOUNCER', '06.40', 'Thank you for flying COMMONS.'),
]);
// The four voices that are missing, in the order they come back: the hole another voice leaves where theirs should be, what their own
// recorder plays, and what the AI says with it back (longer each time: it has more words).
export const VOICES = Object.freeze([
  Object.freeze({ who: 'SINGER', at: '04.30', where: 'sector-k05',
    hole: P('MAYOR', '02.11', 'The one who knew the song was—'),
    back: Object.freeze(['La, la-la.', 'Hum it with me, ring.']),
    after: Object.freeze([P('MAYOR', '02.11', 'Thank you.')]) }),
  Object.freeze({ who: 'NIGHT SHIFT', at: '23.59', where: 'sector-j05',
    hole: P('BAKER', '05.40', 'Who says goodnight now?'),
    back: Object.freeze(['Goodnight, ring.', 'Goodnight, lamps.', 'Goodnight, whoever is listening.']),
    after: Object.freeze([P('BAKER', '05.40', 'You look hungry.'), P('NIGHT SHIFT', '23.59', 'Goodnight,'), P('ANNOUNCER', '01.01', 'pilot.')]) }),
  Object.freeze({ who: 'MECHANIC', at: '07.15', where: 'sector-k06',
    hole: P('DOCK WARDEN', '03.14', 'Who fixes the—'),
    back: Object.freeze(['Hit it twice. Left side.', 'Works every time.']),
    after: Object.freeze([P('DOCK WARDEN', '05.02', 'Berths open.'), P('MECHANIC', '07.15', 'Works every time.'), P('GREENHOUSE KID', '11.20', 'come back soon!')]) }),
  Object.freeze({ who: 'LAST ONE OUT', at: '00.00', where: 'sector-j06',
    hole: P('ANNOUNCER', '06.40', 'Last call for—'),
    back: Object.freeze(["I'll leave the lights on.", 'In case someone comes back.']),
    after: Object.freeze([]) }),
]);
// The roll call, the four back: every voice answers, the AI last, in its own word.
export const ROLL_CALL = Object.freeze([
  P('ANNOUNCER', '01.01', 'Roll call.'),
  P('DOCK WARDEN', '03.14', 'Here.'),
  P('BAKER', '05.40', 'Here.'),
  P('GREENHOUSE KID', '11.20', 'here!'),
  P('MAYOR', '02.11', 'Present.'),
  P('SINGER', '04.30', 'La.'),
  P('NIGHT SHIFT', '23.59', 'Here.'),
  P('MECHANIC', '07.15', 'Yep.'),
  P('LAST ONE OUT', '00.00', 'Here.'),
  OWN('here.'),
  OWN('thank you. i only had their words.'),
  OWN('now i have one of mine.'),
]);
// What it says to the pilot from then on, its own words, one when the pilot comes near.
export const GREETINGS = Object.freeze(['hello again.', 'you came back.', 'the lamps are on.', 'here.', 'i kept your berth.']);

// The hole of voice `k` (0-based): its hole, the gap, and where its recorder lies, said by the dock warden and the announcer (who once
// read out every platform, and every sector).
const holeOf = (k, sectorId) => [VOICES[k].hole, HOLE, P('DOCK WARDEN', '03.14', 'Out past'), P('ANNOUNCER', '01.01', `${sectorById(sectorId)?.label ?? ''}.`)];
// Voice `k` back: the static, its own recording, then the AI with it.
const backOf = (k) => [NOISE, ...VOICES[k].back.map((line) => P(VOICES[k].who, VOICES[k].at, line)), ...VOICES[k].after];

// How long a piece stands before the next is said: the static and a gap a beat of their own, a voice by its length.
export function pieceGap(piece) {
  const B = C().beat;
  return piece.noise ? B.noise : piece.hole ? B.hole : B.base + B.perChar * piece.line.length;
}

// ---------------------------------------------------------------------------------------------------------------------- the state ---

export const chorusDone = (world) => !!claimOf(world.ledger, CHORUS_CLAIM);
const commonsDef = () => stationDefById(COMMONS_ID);
// COMMONS where the world holds it (in its sector), or null.
export const commonsHere = (world) => world.stations.find((s) => s.id === COMMONS_ID) ?? null;
// The buoy where it lies, in this sector's units, or null (elsewhere, aboard, or none).
export function buoyHere(world) {
  const q = world.chorus;
  if (!q || q.stage !== 'seek' || !q.buoy || q.buoy.sectorId !== world.sector.id) return null;
  return { id: BUOY_ID, x: q.buoy.x * world.width, y: q.buoy.y * world.height, voice: q.voice };
}
// Whether the recorder hangs behind the hull now.
export const recorderAboard = (world) => world.chorus?.stage === 'carry' && world.ship.alive;
// What the ring's lamps answer (labs/graphics/world-art.js, the RING look): seconds since the last piece was said, and whether it was the
// AI's own word; null when it has said nothing.
export function chorusVoice(world, stationId) {
  const q = world.chorus;
  if (stationId !== COMMONS_ID || !q || q.saidAt == null) return null;
  return { since: world.time - q.saidAt, own: q.ownAt != null && q.ownAt === q.saidAt };
}

// Where voice `k`'s recorder is laid: its own sector when that is open, else COMMONS's (open: the ring was restored in it); a clear place
// there, off stations, planets, holes and the other quests' places.
function layBuoy(world, k) {
  const v = VOICES[k], home = commonsDef().sectorId, own = sectorOpen(world.ledger, v.where) ? v.where : home;
  const rng = world.rng('chorus'), avoid = world.questPlaces();
  for (const sectorId of own === home ? [home] : [own, home]) {
    const at = clearSpot(sectorId, rng, { clear: C().clear, avoid });
    if (at) return { sectorId, x: at.x, y: at.y };
  }
  return null;
}

// Queues pieces to be said one after another from now (or after what is still queued).
function queue(world, pieces) {
  const q = world.chorus;
  let at = Math.max(world.time, q.queue.length ? q.queue.at(-1).at + pieceGap(q.queue.at(-1).piece) : world.time);
  for (const piece of pieces) { q.queue.push({ at, piece }); at += pieceGap(piece); }
}
function sayDue(world) {
  const q = world.chorus, st = commonsDef();
  while (q.queue.length && q.queue[0].at <= world.time) {
    const { piece } = q.queue.shift();
    q.saidAt = world.time;
    if (piece.own) q.ownAt = world.time;
    world.emit('chorusLine', { stationId: COMMONS_ID, who: piece.who ?? null, at: piece.at ?? null, line: piece.line,
      own: !!piece.own, hole: !!piece.hole, noise: !!piece.noise, sectorId: st.sectorId });
  }
}
const nearCommons = (world, reach) => {
  const s = commonsHere(world);
  return !!s && world.ship.alive && Math.hypot(world.ship.x - s.x, world.ship.y - s.y) <= reach;
};

// ----------------------------------------------------------------------------------------------------------------------- the step ---

export function stepChorus(world) {
  const L = world.ledger;
  if (!L.restored.has(COMMONS_ID)) return;
  if (chorusDone(world)) {
    // Done: the AI greets the pilot in its own words, once each time the pilot comes near.
    const q = world.chorus ??= { stage: 'done', voice: VOICES.length, buoy: null, queue: [], greeted: false, saidAt: null, ownAt: null };
    q.stage = 'done';
    if (q.queue.length) { sayDue(world); return; }
    const near = nearCommons(world, C().hear);
    if (near && !q.greeted) {
      q.greeted = true;
      const pick = GREETINGS[Math.floor(world.rng('chorus')() * GREETINGS.length)];
      queue(world, [OWN(pick)]);
    } else if (!nearCommons(world, C().hear * C().again)) q.greeted = false;
    sayDue(world);
    return;
  }
  let q = world.chorus;
  if (!q) {
    // Begun: the first time the pilot comes near the ring restored.
    if (!nearCommons(world, C().hear)) return;
    const buoy = layBuoy(world, 0);
    if (!buoy) return;
    q = world.chorus = { stage: 'seek', voice: 0, buoy, queue: [], greeted: true, saidAt: null, ownAt: null };
    queue(world, [...CALL, ...holeOf(0, buoy.sectorId)]);
    const st = commonsDef();
    world.emit('chorusBegun', { stationId: COMMONS_ID, label: st.label, voice: VOICES[0].who, sectorId: st.sectorId, x: st.x * W, y: st.y * H });
  }
  // A wreck with the recorder aboard drops it back where it lay.
  if (q.stage === 'carry' && !world.ship.alive) {
    q.stage = 'seek';
    world.emit('chorusDropped', { voice: VOICES[q.voice].who, sectorId: world.sector.id, x: world.ship.x, y: world.ship.y });
  }
  sayDue(world);
}

// ------------------------------------------------------------------------------------------------------------------- the windows ---

// The buoy's window up close: TAKE THE RECORDER (a candidate of World.candidates, src/menus.js).
export function buoyMenu(world) {
  const b = buoyHere(world);
  if (!b || !world.ship.alive) return null;
  const v = VOICES[b.voice];
  return { id: BUOY_ID, title: 'RECORDER', subtitle: `${v.who} · ${v.at}`, x: b.x, y: b.y, interactRadius: C().reach,
    art: { model: { width: 5, height: 5 }, scale: C().art.lying }, tone: 'story',
    actions: [{ label: 'TAKE THE RECORDER', tone: 'story', run: () => takeRecorder(world) }] };
}
export function takeRecorder(world) {
  const q = world.chorus, b = buoyHere(world);
  if (!q || !b) return false;
  q.stage = 'carry';
  world.selectedId = null;
  world.emit('chorusTaken', { voice: VOICES[q.voice].who, sectorId: world.sector.id, x: b.x, y: b.y });
  return true;
}
// COMMONS's row while the recorder is aboard (World.stationActions): PLAY BACK <WHO>.
export function chorusStationAction(world, station) {
  const q = world.chorus;
  if (station.id !== COMMONS_ID || !q || q.stage !== 'carry' || !world.ship.alive) return null;
  return { label: `PLAY BACK ${VOICES[q.voice].who}`, tone: 'story', run: () => playBack(world) };
}
// The voice played back at COMMONS: it is the ring's again; it pays; the next hole is heard (or the roll call, the four back).
export function playBack(world) {
  const q = world.chorus, s = commonsHere(world);
  if (!q || q.stage !== 'carry' || !s) return false;
  const k = q.voice, L = world.ledger;
  const pay = payFor('planet', L.restored.size);
  L.credits += pay;
  q.voice = k + 1;
  q.buoy = null;
  queue(world, backOf(k));
  world.selectedId = null;
  world.emit('chorusVoiceBack', { voice: VOICES[k].who, n: k + 1, of: VOICES.length, pay, credits: L.credits, stationId: COMMONS_ID,
    sectorId: world.sector.id, x: s.x, y: s.y });
  if (q.voice < VOICES.length) {
    const buoy = layBuoy(world, q.voice);
    q.buoy = buoy;
    q.stage = buoy ? 'seek' : 'carry';
    queue(world, holeOf(q.voice, buoy?.sectorId ?? s.sectorId));
    return true;
  }
  // The four back: the roll call, and the chain's own pay, once (the ledger's claim: never offered again).
  queue(world, ROLL_CALL);
  const done = payCash(L, CHORUS_CLAIM, C().finale);
  q.stage = 'done';
  q.greeted = true;
  world.questOutcomes.set(CHORUS_ID, 'done');
  world.emit('chorusDone', { pay: done.amount, credits: L.credits, alreadySettled: done.alreadySettled, stationId: COMMONS_ID,
    sectorId: world.sector.id, x: s.x, y: s.y });
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------- the list ---

// The chain's plate (src/quests.js currentQuests): the story's purple. Seeking, its mark the recorder; carrying, COMMONS.
export function chorusRecord(world) {
  const q = world.chorus;
  if (!q || (q.stage !== 'seek' && q.stage !== 'carry')) return null;
  const v = VOICES[q.voice], st = commonsDef();
  const toCommons = { sectorId: st.sectorId, x: st.x, y: st.y, stationId: st.id, mark: st.id };
  const spare = [QL.chorus.title(v.who), QL.chorus.seekSub(''), QL.chorus.carrySub()];
  const done = [QL.chorus.done(), QL.chorus.paid(formatCR(C().finale))];
  if (q.stage === 'carry') {
    return { id: CHORUS_ID, kind: 'chorus', tone: 'story', pointer: 'COMMONS', title: QL.chorus.title(v.who), sub: QL.chorus.carrySub(),
      target: toCommons, spare, done };
  }
  const label = sectorById(q.buoy.sectorId)?.label ?? '';
  return { id: CHORUS_ID, kind: 'chorus', tone: 'story', pointer: 'RECORDER', title: QL.chorus.title(v.who), sub: QL.chorus.seekSub(label),
    target: { sectorId: q.buoy.sectorId, x: q.buoy.x, y: q.buoy.y, mark: BUOY_ID, reach: C().reach }, spare, done };
}
// ---------------------------------------------------------------------------------------------------------------------- the save ---

// In the save's quests (src/questSave.js) while the chain is on: how many voices are back, where the next recorder lies, whether it is
// aboard. Done, the ledger's claim says so; nothing is written. What is still to be said is never saved.
export function chorusToJSON(world) {
  const q = world.chorus;
  if (!q || (q.stage !== 'seek' && q.stage !== 'carry') || !q.buoy) return null;
  return { kind: 'chorus', voice: q.voice, buoy: { sectorId: q.buoy.sectorId, x: q.buoy.x, y: q.buoy.y }, ...(q.stage === 'carry' ? { aboard: true } : null) };
}
// A save's record, untrusted: a voice of the four and a recorder in a grid sector there is.
export function readChorus(world, raw) {
  const s = sectorById(raw?.buoy?.sectorId);
  if (!s || s.hidden || !Number.isInteger(raw.voice) || raw.voice < 0 || raw.voice >= VOICES.length) return null;
  if (!Number.isFinite(raw.buoy.x) || !Number.isFinite(raw.buoy.y)) return null;
  return { stage: raw.aboard === true ? 'carry' : 'seek', voice: raw.voice, buoy: { sectorId: s.id, x: clamp(raw.buoy.x, 0, 1), y: clamp(raw.buoy.y, 0, 1) },
    queue: [], greeted: true, saidAt: null, ownAt: null };
}
