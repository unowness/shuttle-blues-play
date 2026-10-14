import { CONTRACTS } from './contracts.js';
import { COLLECTIBLES, WORDS, collectibleDef } from './progression.js';
import { SECTORS, networkStationIds } from './sectors.js';
import { paintById, PAINT_RENAMED } from './paint.js';
import { SPECIAL_IDS } from './specialShips.js';
import { workingStationIds } from './ruins.js';
import { collectionCount } from './rewards.js';
import { DEFAULT_LOOK, isLookId, nextLook, ownsLook, sanitizeLooks, START_LOOKS } from './looks.js';
import { START_CURSOR, isCursorId, ownsCursor, nextOwnedCursor, sanitizeCursors } from './cursors.js';

// The pilot card. Doc 03 CONFIRMED content: nickname, avatar, thanks received,
// delivered cargo, discovered collectibles and words, and journey progress.
// Locally the card is this pilot's own; exchanging cards with other pilots
// arrives with the social layer. Until then the fixture pilots of src/strangers.js
// stand in: delivering one's lost cargo is a rescue, and they thank the pilot.

// Which souvenir hangs from the locator as a charm (SX, 2026-10-08: «не выбран ни один, но после получения первого он сразу
// появляется на локаторе», «можно отключить отображание сувенира в карточке пилота (то есть сделать стейт)»): `null` not chosen yet (a
// new pilot), CHARM_NONE the pilot took it off, else a souvenir kind's id.
export const CHARM_NONE = 'none';

// The skills the game says once, by the key (SX, 2026-10-09: «Мы нигде не учим пользователя что можно прыгать, тормозить, дрифтить. И
// стрелять»; src/skillHints.js is when and what): the pilot's record of which it has said, in the save (`taught`), so a new game says them
// again and a loaded one does not. The first flight's two, the thrust and the steering, since that evening (SX: «первая подсказка по управлению
// кораблю должна быть, когда ты появляешься в скутере»).
export const SKILL_IDS = Object.freeze(['thrust', 'steer', 'brake', 'fire', 'drift', 'jump', 'trick']);

export const NICKNAME_MAX = 12;
export const DEFAULT_NICKNAME = 'PILOT';

// Capitals, digits, space and . _ - only: the card is drawn in the game's own
// glyphs, and a name is identity, not a message. The name field shows only these
// as it is typed, so it never shows a letter the save would drop (audit FE-03).
export const nicknameChars = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9 ._-]/g, '');

export function sanitizeNickname(raw) {
  const name = nicknameChars(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_MAX)
    .trim();
  return name || DEFAULT_NICKNAME;
}

export class Pilot {
  constructor() {
    this.nickname = DEFAULT_NICKNAME;
    this.recovered = 0;     // the pilot's own stranded cargo taken on again
    this.rescued = 0;       // other pilots' lost cargo delivered
    this.thanks = 0;        // thanks received from other pilots, one per rescue
    // Paints for the ship (src/paint.js): those found in paint caches
    // (src/rewards.js), and the one worn.
    this.paints = new Set();
    this.paint = 'standard';
    // What the reference ships' rare quests leave (src/specials.js; SX, 2026-10-02): a cockpit colour scheme in each ship's
    // style (`cockpits`, the ships' ids, and `cockpit`, the one worn, null for the interface's own), and a memento note
    // each, read in the garage (`notes`, the same ids). A quest done gives all three; the paint it gives is among `paints`.
    this.cockpits = new Set();
    this.cockpit = null;
    this.notes = new Set();
    // The reference ship whose turn ended last, met or not (src/specials.js): the round of their quests goes on from the one after
    // it (src/pacing.js nextSpecial). Null until one has stood.
    this.lastSpecial = null;
    // The boss TOLLKEEPER beaten (src/bossQuest.js): the main game done. Optional in the save, read leniently (no SAVE_VERSION step).
    this.bossDefeated = false;
    // Two things the quest pacing and the radio's line need to know that no other record keeps (src/pacing.js, src/guide.js):
    // a first pirate fight won (a ship is pestered only after the pilot has defended itself), and the home garage docked once.
    this.fought = false;
    this.homed = false;
    // The interface's looks (src/looks.js, INTERFACE_LOOKS_HANDOFF.md): the found ones (NOW and ORIGINAL are owned from the
    // start and not stored here), and the one worn, as the paints are kept. A new pilot wears NOW.
    this.looks = new Set();
    this.look = DEFAULT_LOOK;
    // The pointers (src/cursors.js): the found ones (CORNERS is owned from the start and not stored), the one worn, and the
    // random quests done, which give them.
    this.cursors = new Set();
    this.cursor = START_CURSOR;
    this.randomDone = 0;
    // The radio under the quests (labs/graphics/radio.js), the pilot's own once given (SX, 2026-10-05: «Виджет радио появляется только
    // когда тебе радио выдают с квестами»): a new pilot's comes with the shuttle (src/opening.js boardShuttle), any other pilot's with the
    // next quest handed in (src/questHooks.js giveRadio). A save from before it was given one by its chapter's stage (src/storage.js v21).
    this.radio = false;
    // The charm (labs/graphics/charm.js): null until the first souvenir is found, which hangs at once; CHARM_NONE once the pilot took it
    // off (the card's CHARM line); a later find never changes the choice. A save from before it reads as null and is settled on load.
    this.charm = null;
    // When the radio's first NPC quest is due, on the pilot's clock (src/questHooks.js stepRadioCall; SX, 2026-10-06: «первый квест нпс,
    // мы получаем по радио через 1 минуту после его получения»), or null: none due (made, or no radio yet). Set as the radio is given.
    this.npcCallAt = null;
    // The skills the one-time hints (src/skillHints.js) have said, by SKILL_IDS: said once in the whole game, never again.
    this.taught = new Set();
  }

  // A skill's hint said (it went by the key, the deed or its seconds): true when it was not said before.
  teach(skill) {
    if (!SKILL_IDS.includes(skill) || this.taught.has(skill)) return false;
    this.taught.add(skill);
    return true;
  }

  // The radio given, and its first NPC quest due at `callAt` (the pilot's clock; null: none); true when it is new.
  grantRadio(callAt = null) {
    if (this.radio) return false;
    this.radio = true;
    this.npcCallAt = Number.isFinite(callAt) ? callAt : null;
    return true;
  }

  // A souvenir kind found for the first time: with no charm chosen yet it hangs (the first find is the only one that does).
  charmFound(defId) {
    if (this.charm === null) this.charm = defId;
  }

  // Hangs a kind the pilot owns, or CHARM_NONE (the card's CHARM line); returns the choice.
  wearCharm(id, collection) {
    if (id === CHARM_NONE || collection.discovered.has(id)) this.charm = id;
    return this.charm;
  }

  // The next choice after the one made: NONE, then each kind owned in the order found, round to NONE.
  nextCharm(collection) {
    const list = [CHARM_NONE, ...collection.kindsFound()];
    return list[(list.indexOf(this.charm) + 1) % list.length];
  }

  // After a load: a choice naming a kind no longer owned is dropped, and a pilot who owns souvenirs but has chosen nothing (a save from
  // before the charm) has the newest found hang. Nothing for a pilot with none: the first find hangs by charmFound.
  settleCharm(collection) {
    if (this.charm !== null && this.charm !== CHARM_NONE && !collection.discovered.has(this.charm)) this.charm = null;
    if (this.charm === null) this.charm = collection.kindsFound().at(-1) ?? null;
  }

  // Puts on a pointer the pilot owns (K); returns the one worn.
  wearCursor(id) {
    if (ownsCursor(this.cursors, id)) this.cursor = id;
    return this.cursor;
  }

  // Adds a found pointer; true when it is new.
  grantCursor(id) {
    if (!isCursorId(id) || id === START_CURSOR || this.cursors.has(id)) return false;
    this.cursors.add(id);
    return true;
  }

  nextCursor() {
    return nextOwnedCursor(this.cursors, this.cursor);
  }

  // Puts on a look the pilot owns (the pilot card's LOOK line); returns the one worn.
  wearLook(id) {
    if (ownsLook(this.looks, id)) this.look = id;
    return this.look;
  }

  // Adds a found look to the pilot's own; true when it is new (the start looks and unknown ids are never new).
  grantLook(id) {
    if (!isLookId(id) || START_LOOKS.includes(id) || this.looks.has(id)) return false;
    this.looks.add(id);
    return true;
  }

  nextLook() {
    return nextLook(this.looks, this.look);
  }

  // Puts on a cockpit scheme the pilot owns, or the interface's own (null); returns the one worn.
  wearCockpit(id) {
    if (id === null || this.cockpits.has(id)) this.cockpit = id;
    return this.cockpit;
  }

  // Puts on the next paint owned (the pilot card's [P]); returns it.
  wearPaint(id) {
    if (id === 'standard' || this.paints.has(id)) this.paint = id;
    return this.paint;
  }

  // The next cockpit scheme after the one worn: the interface's own (null), then those owned, in the ships' order.
  nextCockpit() {
    const list = [null, ...SPECIAL_IDS.filter((id) => this.cockpits.has(id))];
    return list[(list.indexOf(this.cockpit) + 1) % list.length];
  }

  rename(raw) {
    this.nickname = sanitizeNickname(raw);
    return this.nickname;
  }

  toJSON() {
    return { nickname: this.nickname, recovered: this.recovered, rescued: this.rescued, thanks: this.thanks,
      paints: [...this.paints], paint: this.paint, cockpits: [...this.cockpits], cockpit: this.cockpit, notes: [...this.notes],
      fought: this.fought, homed: this.homed, looks: [...this.looks], look: this.look,
      cursors: [...this.cursors], cursor: this.cursor, randomDone: this.randomDone, radio: this.radio, npcCallAt: this.npcCallAt, charm: this.charm,
      // Written only once a hint has been said, and once a reference ship has stood: a pilot with neither writes the save it always wrote.
      ...(this.taught.size ? { taught: SKILL_IDS.filter((id) => this.taught.has(id)) } : null),
      ...(this.lastSpecial ? { lastSpecial: this.lastSpecial } : null),
      ...(this.bossDefeated ? { bossDefeated: true } : null) };
  }

  // Untrusted like the rest of a save. A save from before rescues has no count,
  // which reads as none.
  static fromJSON(raw) {
    const p = new Pilot();
    if (!raw || typeof raw !== 'object') return p;
    p.nickname = sanitizeNickname(raw.nickname);
    const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
    p.recovered = count(raw.recovered);
    p.rescued = count(raw.rescued);
    p.thanks = count(raw.thanks);
    // Only paints the catalogue still has, never STANDARD (always owned); the
    // one worn only if owned. A save from before paints wears STANDARD.
    // A paint an older save knew by another name is the one it became (PAINT_RENAMED).
    const now = (id) => PAINT_RENAMED[id] ?? id;
    for (const id of Array.isArray(raw.paints) ? raw.paints.map(now) : []) if (paintById(id) && id !== 'standard') p.paints.add(id);
    p.wearPaint(typeof raw.paint === 'string' ? now(raw.paint) : 'standard');
    // The reference ships' rewards: only ships the catalogue still has; the scheme worn only if owned. A save from before
    // them holds none and wears the interface's own.
    const ships = (list) => (Array.isArray(list) ? list.filter((id) => SPECIAL_IDS.includes(id)) : []);
    for (const id of ships(raw.cockpits)) p.cockpits.add(id);
    for (const id of ships(raw.notes)) p.notes.add(id);
    // The round's place: a ship the catalogue still has; a save from before it starts the round from the first of the order.
    p.lastSpecial = SPECIAL_IDS.includes(raw.lastSpecial) ? raw.lastSpecial : null;
    p.bossDefeated = raw.bossDefeated === true;
    p.wearCockpit(typeof raw.cockpit === 'string' ? raw.cockpit : null);
    p.fought = raw.fought === true;
    p.homed = raw.homed === true;
    // The looks found, only those the catalogue has; the one worn only if owned. A save from before the looks holds none
    // and wears NOW.
    const { found, worn } = sanitizeLooks(raw.looks, raw.look);
    for (const id of found) p.looks.add(id);
    p.look = worn;
    // The pointers found, the one worn and the random quests done; a save from before them holds none (src/storage.js v14 gave
    // an older save them all).
    const pointers = sanitizeCursors(raw.cursors, raw.cursor);
    for (const id of pointers.found) p.cursors.add(id);
    p.cursor = pointers.worn;
    p.randomDone = count(raw.randomDone);
    // The radio: owned only when the save says so (src/storage.js v21 decided it for every older save).
    p.radio = raw.radio === true;
    // The first NPC quest's time, only with the radio owned (src/storage.js v22 decided it for every older save).
    p.npcCallAt = p.radio && Number.isFinite(raw.npcCallAt) && raw.npcCallAt >= 0 ? raw.npcCallAt : null;
    // The charm: NONE, or a kind the catalogue has (that it is owned is settled once the collection is read, src/rewards.js
    // reconcileFinds); anything else, and a save from before it, is not chosen yet.
    p.charm = raw.charm === CHARM_NONE ? CHARM_NONE : typeof raw.charm === 'string' && collectibleDef(raw.charm) ? raw.charm : null;
    // The skills said: only those the game still has; a save from before the hints (SX's own among them) has been told none.
    for (const id of Array.isArray(raw.taught) ? raw.taught : []) p.teach(id);
    return p;
  }
}

// What the card shows, read from records the game already keeps: the ledger,
// the collection and the visit log. Only `recovered`, `rescued` and `thanks` are
// counted on their own. Journey progress is the mean of the finite catalogues, so it
// reaches 100 % when every station works and every delivery, souvenir kind, paint,
// word and sector has been found once. The v1 economy's three goals come
// first (ECONOMY_V1_HANDOFF.md: STATIONS 4/12, SOUVENIRS 0/12, PAINTS 0/12), each a
// milestone of its own. CACHES went (the two collections are what the caches hold), and
// SIGNALS (every signal teaches one word, so WORDS already counts them), which keeps the
// card's six rows; the reference ships' stories (STORIES, a note each) make it seven (the card gave THANKS up for it).
export function journey(world) {
  const paints = collectionCount(world.ledger, 'paint');
  const rows = [
    { key: 'stations', label: 'STATIONS', have: workingStationIds(world.ledger).length, of: networkStationIds().length },
    { key: 'souvenirs', label: 'SOUVENIRS', have: world.collection.discovered.size, of: COLLECTIBLES.length },
    { key: 'paints', label: 'PAINTS', have: paints.have, of: paints.of },
    // The authored contracts; repeatable runs are extra and do not count here.
    { key: 'deliveries', label: 'DELIVERIES', have: CONTRACTS.filter((c) => world.ledger.completed.has(c.id)).length, of: CONTRACTS.length },
    { key: 'words', label: 'WORDS', have: world.collection.words.size, of: WORDS.length },
    // A hidden sector counts only once it has been found: the card must not give
    // the secret away (2026-09-29).
    { key: 'sectors', label: 'SECTORS', have: world.visits.size,
      of: SECTORS.filter((sector) => !sector.hidden || world.visits.has(sector.id)).length },
    // The stories the reference ships told: a note in the garage each (src/specials.js), of the six ships.
    { key: 'stories', label: 'NOTES', have: world.pilot.notes.size, of: SPECIAL_IDS.length },
  ];
  const progress = rows.reduce((sum, row) => sum + Math.min(1, row.have / Math.max(1, row.of)), 0) / rows.length;
  return { rows, progress, recovered: world.pilot.recovered, rescued: world.pilot.rescued, thanks: world.pilot.thanks };
}
