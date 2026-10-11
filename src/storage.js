// Local prototype persistence.
//
// Two rules shape this file.
//
// First, local and online are separate namespaces from day one. A local save is
// a convenience for one browser on one machine; it is not an account, it is not
// authoritative, and it must never be promoted into an online wallet. The key
// says `local` so that boundary is visible at a glance.
//
// Second, a save that cannot be read must not destroy the one before it. Every
// write promotes the current valid save to a backup slot first, so a corrupt or
// half-written primary costs at most one session.
//
// The backend is injected rather than reaching for `localStorage` directly, so
// the same operation shapes can be pointed at a remote adapter later, and so
// this can be tested without a browser.

// The payload version. The key keeps its `v1`: it names the local namespace,
// not the schema, and renaming it would orphan every existing save.
export const SAVE_VERSION = 24;
const PRIMARY = 'spaser.local.v1';
const BACKUP = 'spaser.local.v1.previous';
// The id of the Storage (one per tab) that loaded the save last, and so may write it.
const OWNER = 'spaser.local.v1.owner';

// Each step lifts a save one version. v1 -> v2 adds M4 progress: claimed
// pickups, opened caches and the collection. A v1 save has none of those, and
// the loaders already treat a missing field as empty, so the step only
// relabels it. Written as a step rather than a special case so the next
// version adds one line here instead of a branch in parse().
const MIGRATIONS = {
  1: (data) => ({ ...data, version: 2 }),
  // v2 -> v3 adds cargo stranded by a wreck, with its trace. A v2 save has
  // none, which the ledger already reads as an empty list.
  2: (data) => ({ ...data, version: 3 }),
  // v3 -> v4 adds the pilot card (nickname, recovered, thanks) and heard
  // signals. A v3 save has neither; both read as a fresh card and none heard.
  3: (data) => ({ ...data, version: 4 }),
  // v4 -> v5 adds the signs a pilot has left. A v4 save has none.
  4: (data) => ({ ...data, version: 5 }),
  // v5 -> v6 adds the hull. A v5 save has none, which World.restore already
  // reads as a full hull, so this step only relabels it.
  5: (data) => ({ ...data, version: 6 }),
  // v6 -> v7 is the v1 economy (ECONOMY_V1_HANDOFF.md, 2026-10-01), and changes more
  // than a label. Ruins were rebuilt a part at a time, at 400-700 CR; now each is
  // restored in one payment at 2,500-4,000, and four stations that worked are ruins.
  // Every credit an older save put into ruins, whole or in part, goes back into its
  // wallet (each held to what that ruin cost then), and every ruin starts unrestored:
  // no restoration bought at the old price stands under the new one. The record of
  // old cache openings goes too: the souvenirs they gave are in the collection, and
  // World.restore records them as found so they are never sold twice
  // (src/rewards.js reconcileFinds). Carried and lost cargo keep their ids; the
  // ledger resolves them as the old build did (src/contracts.js legacyJob).
  6: (data) => {
    const ledger = data.ledger && typeof data.ledger === 'object' ? { ...data.ledger } : data.ledger;
    if (ledger && typeof ledger === 'object') {
      const refund = (Array.isArray(ledger.invested) ? ledger.invested : []).reduce((sum, r) => {
        const cap = LEGACY_RUIN_COST[r?.id] ?? 0;
        return sum + (Number.isInteger(r?.amount) && r.amount > 0 ? Math.min(r.amount, cap) : 0);
      }, 0);
      const had = Number.isFinite(ledger.credits) && ledger.credits >= 0 ? Math.floor(ledger.credits) : 0;
      ledger.credits = had + refund;
      delete ledger.invested;
      delete ledger.opened;
      ledger.restored = [];
    }
    return { ...data, ledger, version: 7 };
  },
  // v7 -> v8: the hulls grew (2026-10-01: the standard 8 -> 10, the courier 6 -> 8, the hauler 12 -> 15),
  // and a hull is kept at the share it had, rounded, never under one: a full ship stays full. The flown
  // ship's hull and every stored ship's in the hangar.
  7: (data) => {
    const grown = { standard: [8, 10], courier: [6, 8], hauler: [12, 15] };
    const scale = (id, hull) => {
      const [was, now] = grown[id] || grown.standard;
      return Number.isFinite(hull) ? Math.max(1, Math.min(now, Math.round((hull * now) / was))) : hull;
    };
    const hangar = data.hangar && typeof data.hangar === 'object' ? { ...data.hangar } : data.hangar;
    const flying = hangar && typeof hangar.flying === 'string' ? hangar.flying : 'standard';
    if (hangar && Array.isArray(hangar.stored)) {
      hangar.stored = hangar.stored.map((s) => (s && typeof s === 'object' && typeof s.id === 'string' ? { ...s, hull: scale(s.id, s.hull) } : s));
    }
    return { ...data, hull: scale(flying, data.hull), hangar, version: 8 };
  },
  // v9 (2026-10-01, late): the hull went to 100 points (SX: «давай ... сделаем 100 хп»), every ship's ten times
  // what it had: what a pilot had left is kept as a share, flown and stored alike.
  8: (data) => {
    const scale = (hull) => (Number.isFinite(hull) ? Math.max(1, Math.round(hull * 10)) : hull);
    const hangar = data.hangar && typeof data.hangar === 'object' ? { ...data.hangar } : data.hangar;
    if (hangar && Array.isArray(hangar.stored)) {
      hangar.stored = hangar.stored.map((s) => (s && typeof s === 'object' ? { ...s, hull: scale(s.hull) } : s));
    }
    return { ...data, hull: scale(data.hull), hangar, version: 9 };
  },
  // v10 (2026-10-01, the night): the keyboard souvenir became a manga book (SX: «Удаляем его ... Давай это будет книжка
  // с мангой»), its id 'keyboard' now 'manga': the owned copies (their kind and the find they came from), the kinds
  // discovered and the find claimed in the ledger, nothing else.
  9: (data) => {
    const kind = (v) => (v === 'keyboard' ? 'manga' : v), find = (v) => (v === 'find-keyboard' ? 'find-manga' : v);
    const c = data.collection && typeof data.collection === 'object' ? { ...data.collection } : data.collection;
    if (c && typeof c === 'object') {
      if (Array.isArray(c.instances)) c.instances = c.instances.map((i) => (i && typeof i === 'object' ? { ...i, defId: kind(i.defId), source: find(i.source) } : i));
      if (Array.isArray(c.discovered)) c.discovered = c.discovered.map(kind);
    }
    const ledger = data.ledger && typeof data.ledger === 'object' ? { ...data.ledger } : data.ledger;
    if (ledger && Array.isArray(ledger.found)) {
      ledger.found = ledger.found.map((f) => (f && typeof f === 'object' ? { ...f, id: find(f.id), content: kind(f.content) } : f));
    }
    return { ...data, collection: c, ledger, version: 10 };
  },
  // v11 (2026-10-02): the interface's looks as collectibles (src/looks.js; the pilot's `looks`, the found ones, and `look`, the
  // one worn). A v10 save has none, which Pilot.fromJSON reads as the start: NOW and ORIGINAL owned (never stored), NOW worn,
  // so this step only relabels it.
  10: (data) => ({ ...data, version: 11 }),
  // v12 (2026-10-02): the secret hole into O-08 roams the open sectors, and its place is saved (`secretHole`: { sectorId, x, y },
  // fractions; src/secretHole.js). A v11 save has none, which World.restore reads as a fresh place, so this step only relabels it.
  11: (data) => ({ ...data, version: 12 }),
  // v13 (2026-10-02): the frontier (src/frontier.js; SX: «видимо нам надо постепенно открывать сектора», his pick «Руина открывает
  // сектор», and for his long save «Вернуть вложенное»). The save itself gains nothing: which sectors are open is derived from the
  // ruins restored. What moves it to the rule is World.restore, at every load (settleFrontier): the money put into ruins past a
  // closed border back in the wallet, cargo bound past one called off, a ship there at HOME's berth, the secret hole moved out.
  // The step marks the save as moved, so a build from before the frontier, which would let it fly past the borders, does not
  // load it, and the save as it was is kept once in its own slot (`spaser.local.v1.before-v13`).
  12: (data) => ({ ...data, version: 13 }),
  // v14 (2026-10-02): the pointers as collectibles (src/cursors.js; the pilot's `cursors`, the found ones, `cursor`, the one
  // worn, and `randomDone`). A new pilot owns CORNERS and finds the others on random quests; a save from before them is given
  // them all (SX: «в мой сейв запиши что все доступны»), and kept as it was in its own slot (`spaser.local.v1.before-v14`).
  // The ids are a literal, the three found pointers as src/cursors.js FOUND_CURSORS had them when v14 came in (85aba5f): a
  // migration is a fact about the past, and a pointer added to the catalogue later is not one an old save was ever given.
  13: (data) => ({ ...data, pilot: { ...(data.pilot && typeof data.pilot === 'object' ? data.pilot : {}), cursors: ['C2', 'C1', 'C4'] },
    version: 14 }),
  // v15 (2026-10-03, PLAN C1; SX: «Сделать как обещано»): the map's flags are kept (`flags`, src/flags.js: the ones put, each
  // { colour, sector, x, y }) and so are the quests open at the save (`quests`, src/questSave.js: the side quests, the radio's step,
  // a ship pestered, a reference ship standing). A v14 save had neither, so it gets both lists empty: no flag, no quest, as it
  // was met on its last load. The save as it was is kept once in its own slot (`spaser.local.v1.before-v15`).
  14: (data) => ({ ...data, flags: [], quests: [], version: 15 }),
  // v16 (2026-10-04, chat E1: the economy SX chose, his answers on labs/graphics/sketches/economy-decisions.html, 1A «an accepted
  // delivery keeps its own terms ... an invested ruin takes the lower of its old and new price; an overpayment goes back to the
  // wallet once, as REFUND n CR»). Two things, each from literals of the two builds (a migration is a fact about the past):
  //   jobs   every cargo carried or lying in space has its terms written into it, the ones it was accepted under: the tariff
  //          1 + 0.2 a station restored then, and the delivery clock of v15 (src/contracts.js reads a job's own terms since v16).
  //   ruins  the ruins have new fixed prices (Codex's economy study, proposal.json). A ruin with money in it is paid at the lower
  //          of its two prices: one whose price fell takes the new one, and if what is in it already covers that, it is
  //          restored now (it stands in peace from now, CONFIG.raids.quiet) and the rest goes back to the wallet; one whose price
  //          rose keeps what was left to pay, its funding raised by the rise. A ruin past a closed border is left as it is: the
  //          load's frontier gives its money back (src/frontier.js settleFrontier). What went back is said once (`refund`, which
  //          World.restore hands to the page and no save keeps).
  15: (data) => {
    const ledger = data.ledger && typeof data.ledger === 'object' ? { ...data.ledger } : data.ledger;
    let refund = null;
    if (ledger && typeof ledger === 'object') {
      const terms = (job) => (job && typeof job === 'object' && Number.isInteger(job.network) && job.network >= 0 && job.tariff === undefined
        ? { ...job, tariff: Math.round((1 + 0.2 * job.network) * 100) / 100, timing: { ...V15_TIMING } } : job);
      if (ledger.active && typeof ledger.active === 'object' && ledger.active.job) ledger.active = { ...ledger.active, job: terms(ledger.active.job) };
      if (Array.isArray(ledger.stranded)) ledger.stranded = ledger.stranded.map((s) => (s && typeof s === 'object' && s.job ? { ...s, job: terms(s.job) } : s));
      refund = repriceRuins(ledger);
    }
    return { ...data, ledger, ...(refund ? { refund } : {}), version: 16 };
  },
  // v17 (2026-10-04, chat N1: the opening chapter, src/opening.js; SX's answer 10A on labs/graphics/sketches/economy-decisions.html:
  // «old saves: what is done counts as done, nothing is taken; SCOOTY JR. does not appear; the chapter goes on from the first step not
  // done, as a quiet hint»). The save gains `opening`, the chapter's record. Every save from before it is a pilot who played before the
  // chapter: a veteran's record, so no loaner, the radio, the locator and the map fitted as they were, and the old radio line as the
  // hint it always was. Nothing else in the save changes.
  16: (data) => ({ ...data, opening: { version: 1, status: 'veteran' }, version: 17 }),
  // v18 (2026-10-04, SX's pick H3 LURE on labs/graphics/sketches/secret-hole-rules.html): the secret hole no longer stands; it comes to
  // a pilot alone in the void and goes again (src/secretHole.js), its timers saved (`lure`: { calm, sawAt, openedAt }, the pilot's
  // clock). A v17 save's hole stood always: it is taken away, and its lure rests from the save's clock, as after a meeting. Nothing
  // else changes.
  17: (data) => ({ ...data, secretHole: null, lure: { calm: Number.isFinite(data.ledger?.clock) ? data.ledger.clock : 0, sawAt: null, openedAt: null }, version: 18 }),
  // v19 (2026-10-04, chat SC: the world twice as wide, src/worldScale.js; SX: «размер старых секторов и разброс был лучше»). A sector is
  // 14,400 u where it was 7,200, every authored place at the same fraction of it. What a save holds in a sector's u moves to the same
  // place of the map's shape, times V19_SCALE: the ship, the pilot's signs, the map's flags, the cargo lying in space (its ghost's flight
  // and the rock it hit go with it unscaled: the same crash, replayed where it now lies), a ship pestered, a reference ship standing
  // (its way's length, and the clock of a timed run grown as its way did), a planet's errand's way; a carried or lost cargo's target
  // time grows with its way, its pay as it was quoted. What a save holds as fractions (the caches laid, the secret hole, a ship in
  // trouble, a wreck asking for help) needs nothing. Nothing the pilot owns changes.
  18: (data) => ({ ...scaledToV19(data), version: 19 }),
  // v20 (2026-10-04, chat W2: the top speeds two thirds of what they were, src/chassis.js, and the world one and a half times the layout
  // where it was twice, src/worldScale.js; SX: «уменьшить скорость тысячу пятьсот до тысячи и заскейлить мир чуть-чуть поменьше»).
  // What a save holds in a sector's u moves to the same place of the map's shape, times V20_SCALE, as v19 did; a way's length too. A
  // route takes the seconds it took, so a carried or lost cargo's target time and a timed reference-ship run's clock stay as they are.
  19: (data) => ({ ...scaledToV20(data), version: 20 }),
  // v21 (2026-10-05, SX: «Виджет радио появляется только когда тебе радио выдают с квестами»; «у нас радио вместе с шатлом выдается»):
  // the radio is the pilot's own (Pilot.radio, `pilot.radio`), given with the shuttle or by the next quest handed in. A v20 pilot whose
  // chapter runs and has boarded the shuttle (its stage `call` or later) had the radio working: owned. One whose chapter runs and is still
  // in SCOOTY JR. had none yet, and gets it at BOARD MY SHUTTLE, as a new pilot does. A pilot with no running chapter (a veteran, a
  // skipped start) does not own it: SX's word, the old pilot earns it with the next quest. Nothing else changes.
  20: (data) => {
    const owned = V21_RADIO_STAGES.includes(obj(data.opening) && data.opening.status === 'active' ? data.opening.stage : null);
    const pilot = obj(data.pilot) ? { ...data.pilot, radio: owned } : (owned ? { radio: true } : data.pilot);
    return { ...data, pilot, version: 21 };
  },
  // v22 (2026-10-06, SX: «первый квест нпс, мы получаем по радио через 1 минуту после его получения»; «У разбитой первой станции поставь
  // сразу 3 пиратов, которые раз в 15 минут респавнятся там, пока станцию не починят»). Two times on the pilot's clock:
  //   pilot.npcCallAt       when the radio's first NPC quest is due (src/questHooks.js stepRadioCall). A pilot whose chapter runs and
  //                         who owns the radio has been held by the chapter's calm from every side quest: his call is due a minute
  //                         from the save's clock. Any other pilot with the radio has met the side quests already, and one without
  //                         it gets the call with the radio: none due.
  //   ledger.startGuardsAt  when the start ruin's guards were last beaten whole (src/raids.js startGuarded). A start ruin not restored
  //                         whose guards a v21 pilot beat (`cleared`) has them back a quarter of an hour from the save's clock; else
  //                         none (they stand now, as the rule says).
  // Nothing the pilot owns changes.
  21: (data) => {
    const L = obj(data.ledger) ? data.ledger : null, clock = fin(L?.clock) ? L.clock : 0;
    const running = obj(data.opening) && data.opening.status === 'active' && V22_CALM_STAGES.includes(data.opening.stage);
    const pilot = obj(data.pilot) ? { ...data.pilot, npcCallAt: data.pilot.radio === true && running ? clock + V22_CALL_AFTER : null } : data.pilot;
    let ledger = data.ledger;
    if (L) {
      const ruin = typeof L.startRuin === 'string' ? L.startRuin : V22_CATALOGUE_START_RUIN;
      const beaten = Array.isArray(L.cleared) && L.cleared.includes(ruin) && !(Array.isArray(L.restored) && L.restored.includes(ruin));
      ledger = { ...L, startGuardsAt: beaten ? clock : null };
    }
    return { ...data, pilot, ledger, version: 22 };
  },
  // v23 (2026-10-08, chat N2 part 1: the one reward ledger, src/rewardLedger.js; economy handoff section 9's legacy policy: «Prefer
  // marking corresponding historical episode records settled, avoiding cash compensation inflation»). The ledger gains `claims`, the
  // rights a pilot has earned by stable id. A save is read for what its chapter had already given, so that none of it is given again
  // and nothing new is given back: a running chapter that has passed its first delivery has the radio's thanks for it (`guide-first-run`,
  // 50 CR, paid), one that has passed its cache stage the thanks for the souvenir (`guide-first-souvenir`, 25 CR); one in its cache
  // stage has the free first souvenir earned for the cache it bound (`intro-souvenir`), spent on it when the ledger has it opened at 0.
  // A pilot with no running chapter (a veteran, a skipped start, a save from before the chapter) is given no claim: no retroactive free
  // finds and no cash. The chapter's own stage `shelf` becomes `look`, below.
  22: (data) => {
    const L = obj(data.ledger) ? data.ledger : null;
    if (!L) return { ...data, version: 23 };
    const clock = fin(L.clock) && L.clock >= 0 ? L.clock : 0, claims = [];
    const op = obj(data.opening) && data.opening.status === 'active' && V23_STAGES.includes(data.opening.stage) ? data.opening : null;
    if (op) {
      const at = V23_STAGES.indexOf(op.stage), past = (stage) => at > V23_STAGES.indexOf(stage);
      const opened = typeof op.c === 'string' && Array.isArray(L.found) && L.found.some((f) => obj(f) && f.id === op.c);
      if (past('deliver')) claims.push({ id: 'guide-first-run', kind: 'cash', earnedAt: clock, amount: V23_PAY['first-run'] });
      if (op.stage === 'cache' && typeof op.c === 'string') {
        claims.push({ id: 'intro-souvenir', kind: 'waiver', earnedAt: clock, find: op.c, station: null, of: null, redeemedFindId: opened ? op.c : null });
      } else if (past('cache') && opened && L.found.some((f) => obj(f) && f.id === op.c && f.price === 0)) {
        claims.push({ id: 'intro-souvenir', kind: 'waiver', earnedAt: clock, find: op.c, station: null, of: null, redeemedFindId: op.c });
      }
      if (past('cache')) claims.push({ id: 'guide-first-souvenir', kind: 'cash', earnedAt: clock, amount: V23_PAY['a-souvenir'] });
    }
    // And slice 3 (src/opening.js): the old resting stage `shelf` is now the stage where the shelf is fitted at B. A chapter that rested
    // there had been shown the shelf with its souvenir and has not had the return load: it goes on at `look` (the card, then the load).
    const opening = op && op.stage === 'shelf' ? { ...data.opening, stage: 'look' } : data.opening;
    return { ...data, ledger: { ...L, claims }, ...(opening === undefined ? {} : { opening }), version: 23 };
  },
  // v24 (2026-10-08, chat N2 part 2: slices 4 and 5 of the opening, the first-dock support, the stations' free finds, the cursors' gates;
  // the economy handoff's section 9: «Existing found caches remain owned ... Prefer marking corresponding historical episode records
  // settled, avoiding cash compensation inflation»). Three changes, none of which takes or gives anything the pilot owns:
  //   ledger.support  the first-dock support's offer: none made (a pilot who is eligible is offered it at the next look).
  //   the chapter     the record gains `fired` (the shooting practice) and `repair` (the lesson at the droid), both unmade. A chapter
  //                   that rested at `ruin` (v23's rest) is now where A tells of the old station; it stays there and the pilot asks. The
  //                   radio's old line it was running at that rest (the chapter now holds it until the station is restored) is dropped
  //                   with its plate, and the thanks the old line had paid for the pirates beaten, the first money and the station
  //                   restored are recorded as claims, so that the chapter does not pay them a second time.
  //   nothing else    a station restored before this version earned no free find (the waivers are earned at a restoration, and the past
  //                   ones never pass through it again), and the cursors keep every one given, whatever the new gates say.
  23: (data) => {
    const L = obj(data.ledger) ? data.ledger : null;
    const op = obj(data.opening) && data.opening.status === 'active' ? data.opening : null;
    const ledger = L ? { ...L, support: null } : data.ledger;
    if (!op) return { ...data, ledger, version: 24 };
    const resting = op.stage === 'ruin', has = (key, id) => !!L && Array.isArray(L[key]) && L[key].some((e) => e === id || (obj(e) && e.id === id));
    const claims = L && Array.isArray(L.claims) ? [...L.claims] : [];
    if (resting && L) {
      const clock = fin(L.clock) && L.clock >= 0 ? L.clock : 0, ruin = typeof L.startRuin === 'string' ? L.startRuin : V22_CATALOGUE_START_RUIN;
      const gave = (id, amount) => { if (!claims.some((c) => obj(c) && c.id === id)) claims.push({ id, kind: 'cash', earnedAt: clock, amount }); };
      if (has('cleared', ruin)) gave('guide-the-guards', V24_PAY['the-guards']);
      if (has('invested', ruin) || has('restored', ruin)) gave('guide-first-coins-in', V24_PAY['first-coins-in']);
      if (has('restored', ruin)) gave('guide-rebuild', V24_PAY.rebuild);
    }
    const quests = resting && Array.isArray(data.quests) ? data.quests.filter((q) => !(obj(q) && q.kind === 'guide')) : data.quests;
    return { ...data, ledger: ledger && resting ? { ...ledger, claims } : ledger, ...(quests === undefined ? {} : { quests }),
      opening: { ...op, fired: false, repair: null }, version: 24 };
  },
};

// The v24 step's literal (a migration is a fact about the past): what the radio's old line paid for the three acts the chapter now asks
// of the pilot (CONFIG.quests.guide.pay as it stood).
const V24_PAY = Object.freeze({ 'the-guards': 100, 'first-coins-in': 50, rebuild: 200 });

// The v23 step's literals (a migration is a fact about the past): the opening chapter's stages as slices 1-2 had them (src/opening.js
// STAGES as they stood) and what the radio's two thanks paid (CONFIG.quests.guide.pay).
const V23_STAGES = Object.freeze(['loaner', 'service', 'call', 'freight', 'deliver', 'fuel', 'cache', 'shelf']);
const V23_PAY = Object.freeze({ 'first-run': 50, 'a-souvenir': 25 });

// The v22 step's literals: the chapter's stages with the radio owned and the side quests held (src/opening.js STAGES and openingCalm
// as they stood), the call's minute, and the catalogue's start ruin (src/sectors.js, HALCYON) for a ledger with none of its own.
const V22_CALM_STAGES = Object.freeze(['call', 'freight', 'deliver']);
const V22_CALL_AFTER = 60;
const V22_CATALOGUE_START_RUIN = 'station-halcyon-j05';

// The v21 step's literal (a migration is a fact about the past): the opening chapter's stages from the first call on (src/opening.js
// STAGES as they stood), where the radio worked.
const V21_RADIO_STAGES = Object.freeze(['call', 'freight', 'deliver', 'fuel', 'cache', 'shelf']);

// The v19 step's literals (a migration is a fact about the past): the world's scale it lifts a v18 save to, and the slack the two timed
// reference-ship runs added to their way's time in v18 (CONFIG.quests.special: DELOREAN 15 s, SERENITY 20 s; X-WING's 160 s is flat).
const V19_SCALE = 2;
const V18_RUN_SLACK = Object.freeze({ delorean: 15, serenity: 20 });
// The v20 step's: the scale it takes a v19 save from (2) to (1.5).
const V20_SCALE = 1.5 / 2;

const fin = Number.isFinite, obj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// A carried or lost cargo's target time, grown with its way (a twentieth of the pay cut every started 15 s late would be its share of a
// way the pilot never chose); to 5 s, as a par is. The v19 step's: the ship as fast, the way twice as long.
function scaledToV19(data) {
  const k = V19_SCALE;
  const job = (j) => (obj(j) && fin(j.par) && j.par > 0 ? { ...j, par: Math.round((j.par * k) / 5) * 5 } : j);
  const plan = (p, ship) => {
    const slack = V18_RUN_SLACK[ship];
    if (slack !== undefined && fin(p.time)) p.time = Math.round((p.time - slack) * k + slack);
  };
  return scaledPlaces(data, k, { job, plan });
}
function scaledToV20(data) {
  return scaledPlaces(data, V20_SCALE);
}

// What a save holds in a sector's u, times `k`: the ship, the pilot's signs, the map's flags, the cargo lying in space (its ghost's
// flight and the rock it hit go with it unscaled: the same crash, replayed where it now lies), a ship pestered, a reference ship standing
// and its way's length, a planet's errand's way. `job` is what becomes of a carried or lost cargo's job, `plan` of a reference ship's
// plan (a copy, its distance already scaled) beside it.
function scaledPlaces(data, k, { job = (j) => j, plan = () => {} } = {}) {
  const at = (p) => (obj(p) && fin(p.x) && fin(p.y) ? { ...p, x: p.x * k, y: p.y * k } : p);
  const list = (v, f) => (Array.isArray(v) ? v.map((e) => (obj(e) ? f(e) : e)) : v);
  // Lost cargo: its place scaled, the ghost's flight and the rock it hit moved with it as they are.
  const lost = (c) => {
    if (!fin(c.x) || !fin(c.y)) return c;
    const dx = c.x * (k - 1), dy = c.y * (k - 1);
    const trace = Array.isArray(c.trace) ? c.trace.map((q) => (Array.isArray(q) && q.length === 5 && fin(q[1]) && fin(q[2]) ? [q[0], q[1] + dx, q[2] + dy, q[3], q[4]] : q)) : c.trace;
    const obstacle = obj(c.obstacle) && fin(c.obstacle.x) && fin(c.obstacle.y) ? { ...c.obstacle, x: c.obstacle.x + dx, y: c.obstacle.y + dy } : c.obstacle;
    return { ...c, x: c.x * k, y: c.y * k, trace, obstacle, job: job(c.job) };
  };
  const quest = (q) => {
    if (q.kind === 'pester') return at(q);
    if (q.kind === 'special') {
      const p = obj(q.plan) ? { ...q.plan } : q.plan;
      if (obj(p) && fin(p.distance)) p.distance = Math.round(p.distance * k);
      if (obj(p)) plan(p, q.ship);
      return { ...q, site: at(q.site), plan: p };
    }
    if (q.kind === 'planet' && obj(q.errand)) {
      const e = { ...q.errand };
      for (const key of ['travelled', 'length', 'ambushAt']) if (fin(e[key])) e[key] *= k;
      return { ...q, errand: e };
    }
    return q;
  };
  const ledger = obj(data.ledger) ? { ...data.ledger } : data.ledger;
  if (obj(ledger)) {
    if (obj(ledger.active)) ledger.active = { ...ledger.active, job: job(ledger.active.job) };
    ledger.stranded = list(ledger.stranded, lost);
  }
  const signs = obj(data.signs) ? { ...data.signs, placed: list(data.signs.placed, at) } : data.signs;
  return { ...data, ledger, signs, ship: at(data.ship), flags: list(data.flags, at), quests: list(data.quests, quest) };
}

// The delivery clock of every job accepted before v16 (CONFIG.delivery as it stood).
const V15_TIMING = Object.freeze({ fastShare: 0.6, fastBonus: 0.25, lateStep: 15, lateCut: 0.1, floor: 0.5 });
// The ruins' prices before and from v16, by id, and the sector each stands in; the start ruin's role (whichever of the three
// stations a pilot's is, src/sectors.js START_STATIONS) has one price of its own. The frontier as it stood: the first two sectors
// open, one more for each ruin restored, and any sector a restored ruin stands in.
const V16_START = Object.freeze(['station-relay-j05', 'station-halcyon-j05', 'station-yard-k05']);
const V16_START_PRICE = Object.freeze([2500, 1900]);
const V16_RUIN_PRICES = Object.freeze({
  'station-foundry-k04': [2800, 2000, 'sector-k04'], 'station-hoist-k06': [4000, 2600, 'sector-j04'],
  'station-commons-j06': [3000, 3000, 'sector-j06'], 'station-spool-j06': [3200, 3400, 'sector-j06'],
  'station-pharos-j06': [3400, 3800, 'sector-j06'], 'station-apiary-k06': [3600, 4300, 'sector-k06'],
  'station-wharf-k06': [3800, 4700, 'sector-k06'],
});
const V16_FRONTIER = Object.freeze(['sector-j05', 'sector-k05', 'sector-k04', 'sector-j04', 'sector-j06', 'sector-k06']);

// The v16 ruin step on a ledger copy (MIGRATIONS[15]): returns { amount, restored } of what went back, or null when nothing did.
function repriceRuins(ledger) {
  const start = V16_START.includes(ledger.startRuin) ? ledger.startRuin : 'station-halcyon-j05';
  const priceOf = (id) => (id === start ? [...V16_START_PRICE, 'sector-j05'] : V16_RUIN_PRICES[id] ?? null);
  const restored = new Set((Array.isArray(ledger.restored) ? ledger.restored : []).filter((id) => priceOf(id)));
  const open = (sector) => V16_FRONTIER.indexOf(sector) < 2 + restored.size || [...restored].some((id) => priceOf(id)[2] === sector);
  const clock = Number.isFinite(ledger.clock) && ledger.clock >= 0 ? ledger.clock : 0;
  const list = (Array.isArray(ledger.invested) ? ledger.invested : []).map((r) => (r && typeof r === 'object' ? { ...r } : r));
  // The start's first, then in the order the frontier opens their sectors: a ruin restored here may open the next one's sector.
  const order = list.filter((r) => r && priceOf(r.id) && Number.isInteger(r.amount) && r.amount > 0 && !restored.has(r.id))
    .sort((a, b) => V16_FRONTIER.indexOf(priceOf(a.id)[2]) - V16_FRONTIER.indexOf(priceOf(b.id)[2]));
  let amount = 0;
  const done = [];
  for (const r of order) {
    const [was, now, sector] = priceOf(r.id);
    if (!open(sector)) continue;
    const put = Math.min(r.amount, was), price = Math.min(was, now);
    if (put >= price) {
      amount += put - price;
      restored.add(r.id);
      done.push(r.id);
      r.amount = 0;
    } else r.amount = now > was ? put + (now - was) : put;
  }
  ledger.invested = list.filter((r) => !(r && done.includes(r.id)));
  if (done.length) {
    ledger.restored = [...(Array.isArray(ledger.restored) ? ledger.restored : []), ...done];
    ledger.restoredAt = [...(Array.isArray(ledger.restoredAt) ? ledger.restoredAt : []), ...done.map((id) => ({ id, at: clock }))];
    ledger.credits = (Number.isFinite(ledger.credits) && ledger.credits >= 0 ? Math.floor(ledger.credits) : 0) + amount;
  }
  return done.length ? { amount, restored: done } : null;
}

// What each ruin cost before the v1 economy, the most its migration gives back.
const LEGACY_RUIN_COST = Object.freeze({
  'station-halcyon-j05': 400, 'station-foundry-k04': 600, 'station-pharos-j06': 500, 'station-hoist-k06': 700,
});

// A save migrated from an older version is also kept as it was, once, in a slot of
// its own named for that version (`spaser.local.v1.before-v7` for a v6 save): the
// primary and backup slots turn over with every write, and this copy never does.
export const beforeKey = (version) => `${PRIMARY}.before-v${version}`;
// A save this build must not write over is kept the same way, once: one from a newer
// build (`spaser.local.v1.from-v9`), or one that did not load (`spaser.local.v1.unloadable`).
export const keptKey = (name) => `${PRIMARY}.${name}`;

export function memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function browserBackend() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = '__spaser_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    // Private windows, blocked site data, embedded frames.
    return null;
  }
}

function parse(raw) {
  if (typeof raw !== 'string' || !raw) return { ok: false, reason: 'missing' };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'corrupt' };
  const found = data.version;
  // Written by a newer build: this one cannot read it, and must not write over it.
  if (Number.isInteger(found) && found > SAVE_VERSION) return { ok: false, reason: 'newer', found };
  while (Number.isInteger(data.version) && data.version < SAVE_VERSION && MIGRATIONS[data.version]) {
    data = MIGRATIONS[data.version](data);
  }
  // Older than any step we still carry.
  if (data.version !== SAVE_VERSION) return { ok: false, reason: 'version', found };
  return { ok: true, data, migratedFrom: found !== SAVE_VERSION ? found : null };
}

// Two tabs of the game share one save, and each holds its own world (audit EN-01,
// 2026-10-01: a tab left open wrote its old wallet over the other's, both slots). Two
// rules keep one writer. The tab that loaded last owns the save: a load writes this
// Storage's id to the owner slot, and a Storage that finds another id there writes no
// more. And a Storage writes only over the primary as it last saw it, at its load or its
// own last write: anything else there (an erase in another tab, an older build that
// knows no owner) means someone else wrote it. Either way the Storage is held from then
// on, writing nothing, until the page reloads, loads what is there and owns it again.
// A save from a newer build holds it as well (EN-02), and so does a save the page could
// not apply (EN-03, `hold('unloadable')`). `held` names why.
export class Storage {
  constructor(backend = browserBackend()) {
    this.backend = backend;
    this.available = !!backend;
    this.lastError = null;
    this.recoveredFromBackup = false;
    this.held = null;
    // The primary as this Storage last saw it; undefined until a load or a save, and
    // then the first save takes the slot as it finds it.
    this.seen = undefined;
    this.id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
    this.claimed = false;
  }

  // Whether this Storage may still write: false, and held from then on, once another tab
  // has loaded the save since this one did. One that never loaded claims nothing to lose.
  owns() {
    if (this.held) return false;
    if (!this.claimed) return true;
    let owner;
    try { owner = this.backend.getItem(OWNER); } catch { return true; }
    if (owner !== null && owner !== this.id) { this.hold('conflict'); return false; }
    return true;
  }

  // Stop writing; with a `copyName`, keep the primary as it is under a slot of its own, once,
  // so not even the erase (which clears the two slots) can take it.
  hold(reason, copyName = null) {
    this.held = reason;
    this.lastError = reason;
    if (!copyName || !this.available) return;
    try {
      const raw = this.backend.getItem(PRIMARY);
      const key = keptKey(copyName);
      if (typeof raw === 'string' && raw && this.backend.getItem(key) === null) this.backend.setItem(key, raw);
    } catch {
      // Quota or storage revoked: the slot itself is not written over anyway.
    }
  }

  // A read can throw as well as return garbage: storage revoked mid-session,
  // a sandboxed frame. Either way the slot is unreadable; it is not a crash.
  read(key) {
    try {
      return parse(this.backend.getItem(key));
    } catch {
      return { ok: false, reason: 'read' };
    }
  }

  load() {
    this.recoveredFromBackup = false;
    this.lastError = null;
    this.held = null;
    if (!this.available) { this.lastError = 'unavailable'; return null; }
    try { this.seen = this.backend.getItem(PRIMARY); } catch { this.seen = undefined; }
    try { this.backend.setItem(OWNER, this.id); this.claimed = true; } catch { this.claimed = false; }

    const primary = this.read(PRIMARY);
    if (primary.ok) {
      if (primary.migratedFrom !== null) this.keepBefore(this.backend.getItem(PRIMARY));
      return primary.data;
    }

    // The primary is unreadable. Fall back, and leave both slots untouched: the
    // next successful save is what replaces them. One from a newer build is never
    // replaced by this one: the backup may be played, and nothing is saved.
    if (primary.reason === 'newer') this.hold('newer', `from-v${primary.found}`);
    else if (primary.reason !== 'missing') this.lastError = primary.reason;
    const backup = this.read(BACKUP);
    if (backup.ok) {
      this.recoveredFromBackup = true;
      if (backup.migratedFrom !== null) this.keepBefore(this.backend.getItem(BACKUP));
      return backup.data;
    }
    if (primary.reason === 'missing' && backup.reason === 'missing') this.lastError = null;
    return null;
  }

  // The copy of a save as it was before its migration to this version, written only
  // when the slot is empty. A failure here costs the copy, never the load.
  keepBefore(raw) {
    try {
      const key = beforeKey(SAVE_VERSION);
      if (typeof raw === 'string' && raw && this.backend.getItem(key) === null) this.backend.setItem(key, raw);
    } catch {
      // Quota or storage revoked: the save itself still loads.
    }
  }

  save(state) {
    if (!this.available) { this.lastError = 'unavailable'; return false; }
    if (!this.owns()) { this.lastError = this.held; return false; }
    const payload = { version: SAVE_VERSION, savedAt: Date.now(), ...state };
    let serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      this.lastError = 'serialize';
      return false;
    }
    try {
      const raw = this.backend.getItem(PRIMARY);
      // Someone else wrote the slot since this Storage last saw it: another tab.
      if (this.seen !== undefined && raw !== this.seen) { this.hold('conflict'); return false; }
      // Promote the current valid save before overwriting it.
      if (parse(raw).ok) this.backend.setItem(BACKUP, raw);
      this.backend.setItem(PRIMARY, serialized);
      this.seen = serialized;
      this.lastError = null;
      return true;
    } catch {
      // Quota, or storage disabled mid-session. The previous save survives.
      this.lastError = 'write';
      return false;
    }
  }

  // The erase: the two slots go (the copies kept beside them stay), and this Storage
  // starts again from an empty slot.
  clear() {
    if (!this.available) return;
    try {
      this.backend.removeItem(PRIMARY);
      this.backend.removeItem(BACKUP);
      this.seen = null;
      this.held = null;
    } catch {
      this.lastError = 'write';
    }
  }
}
