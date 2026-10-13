// M4 progression: credit pickups, collectibles, words and rock drops. The caches
// that sell souvenirs and paints are src/rewards.js.
//
// Every amount, price and pool in this file is a PLACEHOLDER. Pricing, pacing
// and drop policy are open (Q06, Q07); doc 04 says not to finalise any of it
// from a content sample this small. What is not a placeholder is the shape of
// the operations: each one is safe to repeat, and each one either changes
// everything it touches or nothing at all.

import { CONFIG } from './config.js';

// ------------------------------------------------------------ catalogues ---

// Credit pickups, the three authored 25 CR coins each in the lee of a moored rock, were cut on 2026-10-01
// (SX: «вот такие огромные гредитсы мы вырезаем»): coins come out of broken rocks and destroyed pirates.
// A save's record of the ones taken is no longer read.

// Sealed caches: since the v1 economy (2026-10-01) every cache holds one known
// souvenir or paint for a fixed price, and there are 24 of them (src/rewards.js).
// The twenty caches that sold a random souvenir, cheapest first and dearer as the
// collection grew, are gone: they would sell what the restored stations unlock.

// Doc 04: a definition is the kind of object; an instance is one owned copy;
// a discovery means the pilot has found this kind at least once.
export const COLLECTIBLES = [
  { id: 'gamepad', label: 'GAMEPAD', kind: 'souvenir' },
  { id: 'basketball', label: 'BASKETBALL', kind: 'souvenir' },
  { id: 'figurine', label: 'FIGURINE', kind: 'souvenir' },
  // Doc 01/04 name CD-like objects among the souvenirs. The first of the new
  // set, drawn and shown before the rest (2026-09-24).
  { id: 'disc', label: 'CD', kind: 'souvenir' },
  // The rest of the catalogue (SOUVENIR_CATALOGUE.md), 2026-09-30, once every
  // souvenir was a dithered photograph (src/souvenirPictures.js): a picture each
  // and no drawing, so the pilot card and the inventory show them the same way.
  { id: 'mixtape', label: 'MIXTAPE', kind: 'souvenir' },
  { id: 'videotape', label: 'VHS TAPE', kind: 'souvenir' },
  { id: 'instant-photo', label: 'INSTANT PHOTO', kind: 'souvenir' },
  { id: 'manga', label: 'MANGA', kind: 'souvenir' },
  { id: 'handheld', label: 'HANDHELD', kind: 'souvenir' },
  { id: 'floppy', label: 'FLOPPY', kind: 'souvenir' },
  { id: 'virtual-pet', label: 'VIRTUAL PET', kind: 'souvenir' },
  { id: 'crt-monitor', label: 'MINI CRT', kind: 'souvenir' },
];

// Doc 04 PROPOSED: basic consent and refusal must never depend on a drop, so
// the starter words are known from the first minute.
export const WORDS = [
  { id: 'hello', text: 'HELLO', starter: true },
  { id: 'yes', text: 'YES', starter: true },
  { id: 'no', text: 'NO', starter: true },
  { id: 'thanks', text: 'THANKS', starter: true },
  { id: 'wait', text: 'WAIT', starter: true },
  { id: 'bye', text: 'BYE', starter: true },
  { id: 'star', text: 'STAR' },
  { id: 'cargo', text: 'CARGO' },
  { id: 'help', text: 'HELP' },
  { id: 'home', text: 'HOME' },
  // Words for signs (2026-09-24): enough to say where the danger is.
  { id: 'danger', text: 'DANGER' },
  { id: 'ahead', text: 'AHEAD' },
  { id: 'hole', text: 'HOLE' },
  { id: 'rock', text: 'ROCK' },
  { id: 'slow', text: 'SLOW' },
  { id: 'good', text: 'GOOD' },
  { id: 'look', text: 'LOOK' },
  { id: 'here', text: 'HERE' },
  // Words for more interesting signs (SX, 2026-09-26: "придумай поинтереснее
  // надписи"), each also useful to a pilot: TRY NOT, NEVER SLOW, GOOD ODDS.
  { id: 'news', text: 'NEWS' },
  { id: 'everyone', text: 'EVERYONE' },
  { id: 'future', text: 'FUTURE' },
  { id: 'never', text: 'NEVER' },
  { id: 'tell', text: 'TELL' },
  { id: 'odds', text: 'ODDS' },
  { id: 'try', text: 'TRY' },
  { id: 'not', text: 'NOT' },
  // With the two sectors east (2026-09-30, the copywriter): a word for the game's threat, one for
  // the thing a pilot runs out of, and coffee and tea for the two captains' signs there.
  { id: 'pirates', text: 'PIRATES' },
  { id: 'fuel', text: 'FUEL' },
  { id: 'coffee', text: 'COFFEE' },
  { id: 'tea', text: 'TEA' },
];

// Signals: where words are found (doc 04 CONFIRMED: "find words in space").
// Flying through one tunes it in and teaches a word not yet known, once; when
// every word is known it pays the explicit fallback instead. Five per sector,
// twenty in all, one for each word that is not a starter, so the dictionary
// can be finished. In open space, like the caches.
export const SIGNALS = [
  { id: 'signal-j04-a', sector: 'sector-j04', x: 0.931, y: 0.82 },
  { id: 'signal-j04-b', sector: 'sector-j04', x: 0.535, y: 0.85 },
  { id: 'signal-j04-c', sector: 'sector-j04', x: 0.15, y: 0.56 },
  { id: 'signal-j05-a', sector: 'sector-j05', x: 0.84, y: 0.4 },
  { id: 'signal-j05-b', sector: 'sector-j05', x: 0.88, y: 0.82 },
  { id: 'signal-j05-c', sector: 'sector-j05', x: 0.5, y: 0.85 },
  { id: 'signal-k04-a', sector: 'sector-k04', x: 0.5, y: 0.85 },
  { id: 'signal-k04-b', sector: 'sector-k04', x: 0.15, y: 0.56 },
  { id: 'signal-k04-c', sector: 'sector-k04', x: 0.42, y: 0.69 },
  { id: 'signal-k05-a', sector: 'sector-k05', x: 0.88, y: 0.82 },
  { id: 'signal-k05-b', sector: 'sector-k05', x: 0.5, y: 0.85 },
  { id: 'signal-k05-c', sector: 'sector-k05', x: 0.15, y: 0.56 },
  // Two more per sector for the eight new words (2026-09-26), each at least
  // 1300 u from every other object so the sky fills evenly.
  { id: 'signal-j04-d', sector: 'sector-j04', x: 0.42, y: 0.69 },
  { id: 'signal-j04-e', sector: 'sector-j04', x: 0.68, y: 0.14 },
  { id: 'signal-j05-d', sector: 'sector-j05', x: 0.15, y: 0.56 },
  { id: 'signal-j05-e', sector: 'sector-j05', x: 0.42, y: 0.69 },
  { id: 'signal-k04-d', sector: 'sector-k04', x: 0.68, y: 0.14 },
  { id: 'signal-k04-e', sector: 'sector-k04', x: 0.14, y: 0.36 },
  { id: 'signal-k05-d', sector: 'sector-k05', x: 0.42, y: 0.69 },
  { id: 'signal-k05-e', sector: 'sector-k05', x: 0.68, y: 0.14 },
  // Four more for the four words of 2026-09-30, two in each sector east.
  { id: 'signal-j06-a', sector: 'sector-j06', x: 0.15, y: 0.56 },
  { id: 'signal-j06-b', sector: 'sector-j06', x: 0.42, y: 0.69 },
  { id: 'signal-k06-a', sector: 'sector-k06', x: 0.14, y: 0.36 },
  { id: 'signal-k06-b', sector: 'sector-k06', x: 0.6, y: 0.26 },
];

// The cockpit's souvenir inventory: nine slots, three by three (SX, 2026-09-30:
// "инвентарь из 9 клеток"). It was three.
export const SLOT_COUNT = 9;

const collectibleById = new Map(COLLECTIBLES.map((c) => [c.id, c]));
const wordById = new Map(WORDS.map((w) => [w.id, w]));
const signalById = new Map(SIGNALS.map((s) => [s.id, s]));

export const collectibleDef = (id) => collectibleById.get(id) || null;
export const wordDef = (id) => wordById.get(id) || null;
export const signalDef = (id) => signalById.get(id) || null;
export const signalsIn = (sectorId) => SIGNALS.filter((s) => s.sector === sectorId);

// ------------------------------------------------------------ collection ---

export class Collection {
  constructor() {
    this.instances = [];            // [{ id, defId, source }]
    this.discovered = new Set();    // definition ids found at least once
    this.equipped = new Array(SLOT_COUNT).fill(null);   // instance ids
    this.words = new Set(WORDS.filter((w) => w.starter).map((w) => w.id));
    this.serial = 0;
  }

  owns(instanceId) {
    return this.instances.some((i) => i.id === instanceId);
  }

  instance(instanceId) {
    return this.instances.find((i) => i.id === instanceId) || null;
  }

  // Adds one owned copy. A copy of a kind already discovered is a real item —
  // it can be displayed, and later gifted — but it is not a new discovery.
  // Newly owned items take the first free slot, so a reward is visible the
  // moment it is earned.
  grant(defId, { source = null } = {}) {
    const isNew = !this.discovered.has(defId);
    // The counter is restored ahead of every issued id; the loop is the second
    // guarantee that a copy never takes an identity another copy already has.
    let id;
    do { this.serial += 1; id = `${defId}-${this.serial}`; } while (this.owns(id));
    const inst = { id, defId, source };
    this.instances.push(inst);
    this.discovered.add(defId);
    const free = this.equipped.indexOf(null);
    if (free >= 0) this.equipped[free] = inst.id;
    return { ...inst, isNew, slot: free };
  }

  // The kinds owned, each once, in the order each was first found (the pilot card's CHARM line steps through them; the newest found is
  // the last). A kind the catalogue no longer has is left out.
  kindsFound() {
    const out = [];
    for (const inst of this.instances) if (collectibleById.has(inst.defId) && !out.includes(inst.defId)) out.push(inst.defId);
    return out;
  }

  // How many copies of a kind the pilot owns.
  copiesOf(defId) {
    return this.instances.filter((i) => i.defId === defId).length;
  }

  // Manual layout: put a copy of `defId` in cockpit slot `slot`. A copy not
  // shown elsewhere is used if there is one; otherwise the copy already shown
  // moves. Pressing the slot that already shows this kind empties it, so the
  // same key puts a souvenir up and takes it down.
  placeKind(defId, slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return { ok: false, reason: 'NO SUCH SLOT' };
    const shown = this.equipped[slot] ? this.instance(this.equipped[slot]) : null;
    if (shown && shown.defId === defId) {
      this.equipped[slot] = null;
      return { ok: true, removed: true, slot };
    }
    const copies = this.instances.filter((i) => i.defId === defId);
    if (!copies.length) return { ok: false, reason: 'NOT FOUND YET' };
    const spare = copies.find((i) => !this.equipped.includes(i.id)) || copies[0];
    const res = this.equip(slot, spare.id);
    return res.ok ? { ok: true, removed: false, slot, instanceId: spare.id } : res;
  }

  // Refuses anything the pilot does not own, and never lets one item sit in
  // two slots at once.
  equip(slot, instanceId) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) return { ok: false, reason: 'NO SUCH SLOT' };
    if (instanceId !== null && !this.owns(instanceId)) return { ok: false, reason: 'NOT OWNED' };
    if (instanceId !== null) {
      const already = this.equipped.indexOf(instanceId);
      if (already >= 0) this.equipped[already] = null;
    }
    this.equipped[slot] = instanceId;
    return { ok: true };
  }

  toJSON() {
    return {
      instances: this.instances.map((i) => ({ ...i })),
      discovered: [...this.discovered],
      equipped: [...this.equipped],
      words: [...this.words],
      serial: this.serial,
    };
  }

  // A save is untrusted input. Items whose kind has left the catalogue are
  // dropped, slots may only point at items that survived, and the starter
  // words come back even if a save lost them.
  static fromJSON(raw) {
    const c = new Collection();
    if (!raw || typeof raw !== 'object') return c;
    const seen = new Set();
    c.instances = (Array.isArray(raw.instances) ? raw.instances : [])
      .filter((i) => i && typeof i.id === 'string' && collectibleById.has(i.defId) && !seen.has(i.id) && seen.add(i.id))
      .map((i) => ({ id: i.id, defId: i.defId, source: typeof i.source === 'string' ? i.source : null }));
    c.discovered = new Set((Array.isArray(raw.discovered) ? raw.discovered : []).filter((id) => collectibleById.has(id)));
    for (const i of c.instances) c.discovered.add(i.defId);
    const eq = Array.isArray(raw.equipped) ? raw.equipped : [];
    const used = new Set();
    c.equipped = Array.from({ length: SLOT_COUNT }, (_, s) => {
      const id = eq[s];
      if (typeof id !== 'string' || !c.owns(id) || used.has(id)) return null;
      used.add(id);
      return id;
    });
    // A save from before the inventory had fewer slots: the slots it did not
    // have take the owned items no slot shows, in the order they were found,
    // as a new find would. Slots the pilot emptied on purpose stay empty.
    for (const inst of c.instances) {
      if (used.has(inst.id)) continue;
      const free = c.equipped.findIndex((id, s) => id === null && s >= eq.length);
      if (free < 0) break;
      c.equipped[free] = inst.id;
      used.add(inst.id);
    }
    for (const w of Array.isArray(raw.words) ? raw.words : []) if (wordById.has(w)) c.words.add(w);
    // Resume after the highest id already issued, not after the item count:
    // a save may hold `gamepad-2` on its own.
    const issued = c.instances.reduce((n, i) => Math.max(n, serialOf(i.id)), 0);
    c.serial = Math.max(Number.isInteger(raw.serial) && raw.serial > 0 ? raw.serial : 0, issued);
    return c;
  }
}

function serialOf(instanceId) {
  const m = /-(\d+)$/.exec(instanceId);
  return m ? Number(m[1]) : 0;
}

// ----------------------------------------------------------------- words ---

// Words. The fallback when every word is known is explicit: the caller pays
// the fallback reward instead. It never loops, never grants a duplicate as a
// new discovery, and never punishes a finished dictionary.
export const WORD_FALLBACK_CREDITS = 10;

export function pickWord(collection, rand) {
  const unknown = WORDS.filter((w) => !collection.words.has(w.id));
  if (!unknown.length) return null;
  return unknown[Math.min(unknown.length - 1, Math.floor(rand() * unknown.length))].id;
}

export function grantWordOrFallback(ledger, collection, rand) {
  const id = pickWord(collection, rand);
  if (id) {
    collection.words.add(id);
    return { kind: 'word', wordId: id, text: wordDef(id).text };
  }
  ledger.credits += WORD_FALLBACK_CREDITS;
  return { kind: 'credits', amount: WORD_FALLBACK_CREDITS, credits: ledger.credits };
}

// ------------------------------------------------------------ rock drops ---

// How many pieces one broken rock releases. `tier` is 0 for a big rock, 2 for
// the smallest. The config gives a range for the EXPECTED count, which may be a
// fraction. Two draws, no loop: the first picks the expected count in the range,
// the second rounds its fraction up or down (2.4 is 3 forty times in a hundred),
// so the count averages the middle of the range. `table` is the coin ranges by
// default; the fuel ranges are passed in by rollRockScatter. The numbers are
// placeholders explained in CONFIG.asteroid.drops.
// The most a single loose coin may be worth. A rock's coin is 1 CR; but what pirates take from a wreck (scatterSeized)
// and what a pirate shot down gives back (dropPirateLoot) are shared into at most CONFIG.pirates.loot.seized.pieces coins,
// so a 240 CR loss is 24 coins of 10. The cap was 5 until 2026-10-02, and such a coin vanished unpaid when touched (the
// world removed it before the ledger refused it): «kill the thief, take it back» could not work.
export const ROCK_COIN_MAX = 50;

export function rollRockDrop(tier, rng, cfg = CONFIG.asteroid.drops, table = cfg.coins) {
  const range = table[tier];
  if (!range) return 0;
  const [min, max] = range;
  const expected = min + rng() * (max - min);
  const whole = Math.floor(expected);
  return whole + (rng() < expected - whole ? 1 : 0);
}

// What one broken rock releases (SX, 2026-09-30: "с шансом 70/30 вылетало либо
// горючее либо монетки"): fuel as often as fuelShareAt says for a tank `fill`
// full (0..1), coins otherwise, never
// both and never nothing. Returns the kind and the value of each piece: 1 CR a
// coin, `fuel.units` (a whole number drawn per piece) a canister. Draws, in order:
// the kind, the count, then one per canister.
// How much of the time a break is fuel, by how full the tank is (0..1): the
// fuller, the rarer (CONFIG.asteroid.drops.fuelShare).
export function fuelShareAt(fill, cfg = CONFIG.asteroid.drops) {
  const [empty, full] = cfg.fuelShare;
  const f = Math.max(0, Math.min(1, Number.isFinite(fill) ? fill : 0));
  return empty + (full - empty) * f;
}

export function rollRockScatter(tier, rng, cfg = CONFIG.asteroid.drops, fill = 0) {
  if (rng() < fuelShareAt(fill, cfg)) {
    const count = Math.max(1, rollRockDrop(tier, rng, cfg, cfg.fuel.pieces));
    const [lo, hi] = cfg.fuel.units;
    return { kind: 'fuel', pieces: Array.from({ length: count }, () => lo + Math.floor(rng() * (hi - lo + 1))) };
  }
  const count = Math.max(1, rollRockDrop(tier, rng, cfg));
  return { kind: 'coin', pieces: Array.from({ length: count }, () => cfg.value) };
}

// Tuning in a signal: the word and the record are committed together, and a
// repeat returns the recorded result instead of a second word. Same shape as
// settleCache.
export function hearSignal(ledger, collection, signal, rand) {
  const prior = ledger.heard.get(signal.id);
  if (prior) return { ok: true, alreadySettled: true, ...prior, credits: ledger.credits };
  const got = grantWordOrFallback(ledger, collection, rand);
  const result = got.kind === 'word'
    ? { kind: 'word', wordId: got.wordId, text: got.text }
    : { kind: 'credits', amount: got.amount };
  ledger.heard.set(signal.id, result);
  return { ok: true, alreadySettled: false, ...result, credits: ledger.credits };
}
