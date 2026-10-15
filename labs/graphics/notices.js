// The banners above the top of the screen, as one system (chat B, 2026-10-04; SX's items 5, 6 and 7; his pick, Codex's A / Rail
// revision 5, drawn by labs/graphics/rail.js): the task slot at the top, one notice under it, and what each of the world's events
// says. Cut from labs/graphics/main.js by chat F; chat B owns it (docs/plans/2026-10-04-roadmap.md); the events' list and their
// saves are src/events.js, the tasks and the selected one src/tasks.js.
//
//   The task slot  the focused task (src/tasks.js focusedTask: the selected one, a red quest's clock, the cargo, a quest), WRECKED
//                  while the ship is gone, ALL CLEAR for 30 visible seconds after the last task ended well, else nothing (NO ACTIVE
//                  ROUTE is gone: SX, item 6, «надпись убрать»). Since S8 (SX's V1+, 2026-10-04) one bare line in the notch of the
//                  helmet's top, not a banner; since N3 FITTED (2026-10-05) the arrow, what to do and the timer as one phrase on the
//                  notch's axis, the notch as wide as it (labs/graphics/helmet.js notchLine, `notch` here); since SX's word of
//                  2026-10-06 («квесты не выводить в челке, выводить там только таймеры и статусы») a timed task alone (an untimed
//                  one is the quest list's): its sign, its title and its clock since 2026-10-07 (SX: «выводи пожалуйста сверху все
//                  таки какой-то текст о чем речь»; the sign and the clock alone for a day), WRECKED, ALL CLEAR and the notices'
//                  flips; the notch stands empty
//                  (today's width) without one. A click selects the task (the quest list's «!» becomes its arrow; the locator and the
//                  map read the same state) and puts that occurrence away; on ALL CLEAR and WRECKED it acknowledges. The task goes
//                  on; the quest list holds it.
//   The notice     one at a time under the slot, the newest in place of the last; a cargo's outranks the rest; a find's waits
//                  for the one standing. A click (or the keyboard's confirm, input-router.js KEYS.banner) presses it, it goes,
//                  then its action runs: a find's opens what it is, any other is acknowledged. No coins for closing anything.
//   The page's notes (toast): a notice like the game's, a danger when something broke.
//
// Where each says itself, its fate (SX, 2026-10-05: «Согласен с тобой, выполненные квесты могут отмечаться в спике квестов, про
// панельку о доставке груза пока оставляем»; «но можно только панельку о том что он доставлен показывать, она быстрая»), named at each
// call (`fate`):
//   card   the notice under the notch, as above: the cargo delivered, every find and gift, the big steps of progress
//   flip   the notch's line turns over to it for 2 to 3 s, a split-flap row in the notch's own line work (labs/graphics/helmet.js
//          drawNotchRow), then back to the task: dangers, a refusal, the radio's words, the cargo lost or back, money taken, the
//          page's warnings; a long one in pages; two in a row wait their turn, a danger first, and cuts short one that is not
//   gone   nothing: what the pilot sees on screen anyway or just did himself
// A quest done is said by its plate in the quest list (quest-list.js D3), not by a notice. The saves at events are untouched (they
// follow src/events.js). The lab's `?notices=old` says everything as a card, as before (`NOTICE_FATES`).
//
// Every banner presses in under the pointer as every panel does (src/hover.js) and its one detail turns white; the keyboard's focus
// looks the same (`game.keysOnly`, chat C's scheme, shows it on the notice Enter acts on). `game` is the page's (main.js), read
// when a function runs.
import { CONFIG } from '../../src/config.js';
import { savesFor } from '../../src/events.js';
import { endsQuest, questTone } from '../../src/quests.js';
import { deliveryTiming } from '../../src/feedback.js';
import { networkMultiplier, formatCR } from '../../src/ruins.js';
import { findDef, placeOf } from '../../src/rewards.js';
import { SECTORS } from '../../src/sectors.js';
import { shipModel } from '../../src/hangar.js';
import { HULL } from '../../src/shipLooks.js';
import { hoverItem } from '../../src/hover.js';
import { clockText, isOpeningJob } from '../../src/contracts.js';
import { PALETTE, ROLES } from '../../src/roles.js';
import { keptDraw } from '../../src/grade.js';
import { routeInk } from '../../src/interface.js';
import { courseOf } from '../../src/course.js';
import { clamp, inBox, glyphs } from '../../src/util.js';
import {
  currentTasks, focusedTask, taskNavigation, selectTask, cargoTaskId, createTaskLog, reconcileTasks, advanceTaskLog, allClear,
  cargoDestination,
} from '../../src/tasks.js';
import { NOTICE, NOTICE_KINDS, QUEST_NOTICE, CARGO_MARKS, TASK_TOP, noticeTop, drawNotice, noticeRect, noticeDone, noticeMotion, bannerOut } from './notice.js';
import { helmetOf, notchLine, drawNotchLine, drawNotchRow, taskLineBox, FLIP, HELMET } from './helmet.js';
import { giftWords, FIND_LIFE } from './find-notice.js';
import { RAIL_TIMES, railFit, moneyRuns } from './rail.js';
import { bearingGlyph, QUEST_TONES } from './quest-list.js';
import { crackCockpit, knockCockpit } from './cockpit-fx.js';
import { toggleRadio } from './radio.js';
import { offsetOf, shifted } from './hud-place.js';
import { QUEST_LINES as QL, stationOnly } from '../../src/questLines.js';

// The task slot's own words: an empty board after the last task done, and the ship gone (Codex's specimens).
export const SLOT_WORDS = Object.freeze({ clear: 'ALL CLEAR', wrecked: 'WRECKED', tow: 'TOW INBOUND' });

// What a save says (open since 2026-10-03; three ways on labs/graphics/sketches/banners.html, SX to pick): [title, detail, kind] for a
// save made, one that failed (src/storage.js: the save before it stays: «The previous save survives»), and no storage at all.
// T1 TODAY is the words as they were; T2 (built, the recommendation) says the fact and what it means; T3 one word.
export const SAVE_NOTES = Object.freeze({
  T1: Object.freeze({ saved: ['GAME SAVED', null, 'news'], failed: ['SAVE FAILED ({reason})', null, 'danger'], unavailable: ['SAVING UNAVAILABLE IN THIS BROWSER', null, 'danger'] }),
  // T2's failure said LAST SAVE KEPT, untrue on a first save that fails, and STORAGE IS OFF, which the page cannot know (Codex's text
  // pass UXN06, UXN09; SX, 2026-10-07: «берем все»).
  T2: Object.freeze({ saved: ['GAME SAVED', 'IN THIS BROWSER', 'gain'], failed: ['SAVE FAILED', 'PROGRESS NOT SAVED', 'danger'], unavailable: ['NOT SAVING', 'STORAGE UNAVAILABLE', 'danger'] }),
  T3: Object.freeze({ saved: ['SAVED', null, 'gain'], failed: ['NOT SAVED', 'LAST SAVE KEPT', 'danger'], unavailable: ['NOT SAVED', 'STORAGE IS OFF', 'danger'] }),
});
export const SAVE_NOTE = 'T2';

// 'new': each notice by its fate (above); 'old': every one a card under the notch, as until 2026-10-05 (the lab's ?notices=old).
export const NOTICE_FATES = { mode: 'new' };
// A flip's page stands `least` to `most` s by its length (`perChar` s a character over `base`); the notch holds `HELMET.widest` columns,
// so a longer one is said in pages, cut at words. At most `queue` pages wait.
export const FLIP_LIFE = Object.freeze({ least: 2, most: 3, base: 0.9, perChar: 0.055, queue: 6 });
const DOT = ' · ';
const count = (s) => glyphs(s).length;
// The pages of a flip's words: the title (in the danger's ink for a danger, else white), a spaced dot and the detail (gray; money in
// gold but where it is lost, a danger's), at most `room` columns a page; a page past the first carries on the detail.
export function flipPages(title, sub, { kind = 'news', mark = null, room = HELMET.widest - 2 } = {}) {
  const k = NOTICE_KINDS[kind] ?? NOTICE_KINDS.news, danger = kind === 'danger', head = railFit(title, room);
  const quiet = (text) => (danger ? [{ text, ink: ROLES.textSecondary }] : moneyRuns(text, ROLES.textSecondary).map(([t, ink]) => ({ text: t, ink })));
  // The detail by page: its clauses (words up to a stop, a comma, a colon, a question) kept whole where they fit, the first page what
  // fits after the title and the dot, each next one what fits a row; a clause longer than a row goes word by word.
  const words = sub ? String(sub).split(' ').filter(Boolean).map((w) => railFit(w, room)) : [];
  const clauses = [];
  let clause = [];
  for (const w of words) { clause.push(w); if (/[.,:;?!]$/.test(w)) { clauses.push(clause); clause = []; } }
  if (clause.length) clauses.push(clause);
  const groups = [[]];
  let used = count(head) + (words.length ? count(DOT) : 0);
  const put = (list) => {
    const g = groups.at(-1), add = (g.length ? 1 : 0) + count(list.join(' '));
    if (used + add <= room) { g.push(...list); used += add; return true; }
    if (count(list.join(' ')) <= room) { groups.push([...list]); used = count(list.join(' ')); return true; }
    return false;
  };
  for (const c of clauses) if (!put(c)) for (const w of c) put([w]);
  return groups.filter((g, i) => i === 0 || g.length).map((g, i) => {
    const runs = i === 0 ? [{ text: head, ink: danger ? k.ink : ROLES.textPrimary }, ...(g.length ? [{ text: DOT, ink: ROLES.textSecondary }, ...quiet(g.join(' '))] : [])]
      : quiet(g.join(' '));
    const need = 2 + runs.reduce((n, run) => n + count(run.text), 0);
    return { mark: mark ?? k.mark, markInk: k.ink, runs, need, life: clamp(FLIP_LIFE.base + FLIP_LIFE.perChar * (need - 2), FLIP_LIFE.least, FLIP_LIFE.most) };
  });
}

export function createNotices(game) {
  const state = { notice: null, queue: [], serial: 0 };
  // The task slot: the banner standing (`cur`) and the one waiting for it to go (`next`), the occurrences put away by a click, the
  // tasks' log (ALL CLEAR), the wrecks counted (each WRECKED a new occurrence), and its own clock (s, the page's: it runs under
  // the pause, as the quest list's does).
  const slot = { cur: null, next: null, dismissed: new Set(), log: createTaskLog(), wrecks: 0, time: 0 };
  // The cargo tasks that ended well, by their task id (the quests' outcomes are the world's: World.questOutcomes).
  const tasksDone = new Set();
  const outcomeOf = (id) => (tasksDone.has(id) ? 'done' : game.world.questOutcomes?.get(id) ?? null);

  // The notice under the slot (labs/graphics/notice.js): one at a time, the newest in place of the last. `waits`: an event's notice
  // waits while the game does (P, a screen), so one that lands just before C is seen when the card closes; a note from the page does
  // not. It is `state.notice`, and the ones waiting `state.queue`.
  // A cargo banner outranks the rest (SX, 2026-10-01: the plates for cargo taken or lost «перестали показываться»: a
  // wreck says CARGO STRANDED and, in the same frame, STATION DAMAGED or PIRATES took its place). Only another cargo
  // banner or a refusal (the answer to a key just pressed) replaces one; anything else waits here and stands after it.
  // A refusal that cuts in sends the cargo banner back to the front to stand again, and a lesser notice a cargo banner replaces
  // young waits too. Newest last, at most NOTICE_QUEUE notices, one per title.
  const NOTICE_QUEUE = 3;
  function queueNotice(n) {
    const i = state.queue.findIndex((q) => q.title === n.title);
    if (i >= 0) state.queue.splice(i, 1);
    state.queue.push(n);
    if (state.queue.length > NOTICE_QUEUE) state.queue.shift();
  }
  function showNotice(n) {
    state.notice = n;
    if (n) game.announcementEl.textContent = n.sub ? `${n.title} / ${n.sub}` : n.title;
  }
  // A notice put back to stand again: from its start, unpressed.
  const again = (n, extra = {}) => ({ ...n, age: 0, clicked: null, after: null, ...extra });
  // Under reduced motion a notice is `instant`: no sweep, no press, it goes at once.
  // While an event of the opening is said (`beat`, handleEvents), its notice goes to the opening's focus (labs/graphics/opening-focus.js,
  // the lab's ?focus=): kept to stand in its turn, longer, after a calm; under F0 it stands at once, as every notice does.
  let beat = null;
  // `now`: a flip that is an answer with a deadline (the erase's question, main.js) stands at once, ahead of every page waiting, dangers too.
  function notify(title, sub = null, { kind = 'news', cargo = false, mark = null, life = NOTICE.life, waits = true, after = false, find = null, fate = 'card', now = false } = {}) {
    if (NOTICE_FATES.mode !== 'old' && fate === 'gone') return;
    if (NOTICE_FATES.mode !== 'old' && fate === 'flip') { flip(String(title).toUpperCase(), sub ? String(sub).toUpperCase() : null, { kind, mark, waits, now }); return; }
    const next = { title: String(title).toUpperCase(), sub: sub ? String(sub).toUpperCase() : null, kind, cargo, mark, life, waits, age: 0,
      instant: game.feedback.reducedMotion, find, seed: ++state.serial, clicked: null, after: null };
    next.out = bannerOut(next);
    if (beat && game.focus?.hold(next, beat)) return;
    stand(next, { after });
  }
  // A notice put up: at once, or after the one standing, by the rules above. A beat of the opening's focus standing is kept as a cargo
  // banner is (only a cargo banner or a refusal replaces it).
  function stand(next, { after = false } = {}) {
    const standing = state.notice && !noticeDone(state.notice) ? state.notice : null;
    // `after`: it stands once the notice now standing has gone, not over it (a look found with a restoration).
    if (after && standing) { queueNotice(next); return; }
    if ((standing?.cargo || standing?.beat) && !next.cargo && !next.beat) {
      if (next.kind !== 'refusal') { queueNotice(next); return; }
      state.queue.unshift(again(standing, { life: Math.max(1.6, standing.life - standing.age) }));
    } else if (standing && !standing.cargo && next.cargo && standing.age < standing.life / 2) {
      state.queue.unshift(again(standing));
    }
    showNotice(next);
  }
  // A find's card (a gift, labs/graphics/rail.js family 03): its kind, what it is (`id`), its two rows (find-notice.js giftWords) and
  // what a click on it does (`open`, after it has gone); it stands longer than a plain notice, and after the one standing.
  function notifyFind(kind, id, e, open, { life = FIND_LIFE } = {}) {
    const words = giftWords(kind, { ...e, priceText: Number.isFinite(e.price) ? formatCR(e.price) : e.price });
    notify(words.title ?? '', words.sub, { kind: 'gain', life, after: true,
      find: { kind, id, tag: String(words.sub ?? '').toUpperCase(), name: String(words.title ?? '').toUpperCase(), open } });
  }
  // A bundle's card (chat N2 emits the bundles; the economy's «one display card per achievement bundle»): a gift card with the
  // bundle's title, what it holds, the picture of one thing in it (`picture`: { kind, id }, as a find's), and what a click opens.
  function notifyBundle({ title, sub = null, picture = null, open = null, life = FIND_LIFE } = {}) {
    notify(title ?? '', sub, { kind: 'gain', life, after: true,
      find: { kind: picture?.kind ?? 'bundle', id: picture?.id ?? null, tag: String(sub ?? '').toUpperCase(), name: String(title ?? '').toUpperCase(), open } });
  }
  function clearNotices() {
    state.notice = null;
    state.queue.length = 0;
    flips.cur = null; flips.queue.length = 0;
  }

  // The notch's flips (`fate: 'flip'`): the page standing (`cur`: its row, `life`, `age` since it began to turn over) and the pages
  // waiting. A page's way in is FLIP.turn of its life; after its life it turns over to the next page waiting, else back to the task
  // (or to nothing) over FLIP.turn. A danger goes ahead of the pages that are not, and cuts one of those standing short.
  const flips = { cur: null, queue: [] };
  function flip(title, sub, { kind = 'news', mark = null, waits = true, now = false } = {}) {
    game.announcementEl.textContent = sub ? `${title} / ${sub}` : title;
    const danger = kind === 'danger';
    const pages = flipPages(title, sub, { kind, mark }).map((p, i) => ({ ...p, age: 0, danger, waits, now, seed: ++state.serial, key: `${title}|${sub}|${i}` }));
    const keys = new Set(pages.map((p) => p.key));
    for (let i = flips.queue.length - 1; i >= 0; i--) if (keys.has(flips.queue[i].key)) flips.queue.splice(i, 1);
    const cur = flips.cur;
    if (now) {
      // Ahead of everything: the page standing turns over at once (after its own way in), these first in the queue.
      if (cur && cur.age < cur.life) cur.life = Math.max(cur.age, FLIP.turn);
      flips.queue.unshift(...pages);
    } else if (danger) {
      if (cur && !cur.danger && cur.age < cur.life) cur.life = Math.max(cur.age, FLIP.turn);
      const at = flips.queue.findIndex((f) => !f.danger);
      flips.queue.splice(at < 0 ? flips.queue.length : at, 0, ...pages);
    } else flips.queue.push(...pages);
    while (flips.queue.length > FLIP_LIFE.queue) {
      const at = flips.queue.findIndex((f) => !f.danger && !f.now);
      flips.queue.splice(at < 0 ? flips.queue.findIndex((f) => !f.now) : at, 1);
    }
    if (!flips.cur) flips.cur = flips.queue.shift() ?? null;
  }
  function stepFlips(dt) {
    const f = flips.cur;
    if (!f || (f.waits && (game.world.paused || game.labOpen))) return;
    f.age += dt;
    if (f.age >= f.life && flips.queue.length) { flips.cur = flips.queue.shift(); return; }
    if (f.age >= f.life + (game.feedback.reducedMotion ? 0 : FLIP.turn)) flips.cur = null;
  }
  // A flip's page standing (not turning back), or null.
  const flipShown = () => (flips.cur && flips.cur.age < flips.cur.life ? flips.cur : null);

  // How long an event's notice stands: `life`, and longer when it is a quest's end (SX, 2026-10-02: «в конце квестов нужно чуть
  // помедленнее говорить о том что он выполнен»).
  const questLife = (e, life = NOTICE.life) => (endsQuest(game.world, e) ? life + QUEST_NOTICE.extra : life);

  function handleEvents() {
    const { world, sound, feedback, renderer, ghost, announcementEl } = game, screens = game.screens;
    for (const e of world.drainEvents()) {
      sound.handle(e, world, renderer);
      beat = game.focus?.beatOf(e, world) ?? null;
      if (feedback.handle(e, world)) {
        announcementEl.textContent = feedback.items.at(-1).label;
      }
      switch (e.type) {
        case 'sectorEntered':
          // The address and the sector's name (src/sectors.js sectorTitle), as the locator's header says it.
          // A first visit flips the notch to the sector's name; a sector come back to is gone (the locator's header says it).
          notify(e.title ?? e.label, e.visit > 1 ? `VISIT ${e.visit}` : 'FIRST VISIT', { life: CONFIG.sector.bannerTime, fate: e.visit > 1 ? 'gone' : 'flip' });
          ghost.stop();
          break;
        // The rope past a dead edge threw the ship back (World.stepBoundary): its sound only, no notice (SX,
        // 2026-10-02: «не надоедливый»; the fog says where the grid ends).
        case 'holeTransit':
          // Comes after the sector's own entry event, so this notice wins.
          notify('BLACK HOLE TRANSIT', `NOW IN ${e.title ?? e.label}`, { life: 3, fate: 'flip' });
          ghost.stop();
          break;
        case 'undocked': toast('undocked', 'news', { fate: 'gone' }); break;
        // The cargo plates SX picked (F of labs/graphics/sketches/cargo-plates.html, its words): → taken, + delivered,
        // ! lost. The label at the cargo or the station no longer says it again (src/feedback.js).
        case 'contractAccepted':
          // (The station alone: «LABEL / SECTOR» ran past the banner's 27 characters; src/questLines.js.)
          notify('CARGO ACCEPTED', QL.banner.cargo(e.label, stationOnly(e.destination)), { cargo: true, mark: CARGO_MARKS.taken, fate: 'gone' });
          break;
        case 'delivered':
          // The cargo's task ended well (src/tasks.js: ALL CLEAR may follow when it was the last).
          if (!e.alreadySettled && e.contractId) tasksDone.add(cargoTaskId(e.contractId));
          if (e.alreadySettled) notify('ALREADY DELIVERED', 'NO EXTRA PAYMENT', { cargo: true, mark: CARGO_MARKS.delivered, life: 2.4, fate: 'gone' });
          // The opening's first freight (src/opening.js): its receipt says the time it took against its target, then the pay, apart.
          else if (isOpeningJob(e.contractId) && e.timing) {
            const inside = e.timing.elapsed <= e.timing.par;
            notify(`DELIVERED ${clockText(e.timing.elapsed)} / ${clockText(e.timing.par)}`, `${inside ? 'WITHIN TARGET' : 'LATE'} / +${formatCR(e.reward)} CR`,
              { kind: 'gain', cargo: true, mark: CARGO_MARKS.delivered, life: 4 });
          }
          // The whole sum paid, a finder's fee in it (Codex's text pass UXN08: «+930 CR + 75 FEE / FAST +25%» was cut on the card).
          else notify('CARGO DELIVERED', `+${formatCR(e.reward + (e.fee ?? 0))} CR${deliveryTiming(e.timing)}`, { kind: 'gain', cargo: true, mark: CARGO_MARKS.delivered });
          break;
        case 'shipWrecked':
          ghost.stop();
          slot.wrecks += 1;
          // The deck breaks with the ship (cockpit-fx.js crackCockpit), till it comes back.
          if (e.cause !== 'reset') crackCockpit(performance.now() / 1000);
          if (e.strandedContract) {
            // Pirates carry the cargo off to their den; any other wreck leaves it where it fell.
            if (e.cause === 'pirate') notify('CARGO TAKEN', QL.banner.held(e.strandedContract), { kind: 'danger', cargo: true, mark: CARGO_MARKS.lost, fate: 'flip' });
            else notify('CARGO STRANDED', `${e.strandedContract} AT THE WRECK`, { cargo: true, mark: CARGO_MARKS.lost, fate: 'flip' });
          }
          // A wreck in the hidden sector sends the cargo home instead (src/world.js).
          if (e.returnedContract) notify('CARGO RETURNED', QL.banner.cargo(e.returnedContract, stationOnly(e.returnedTo)), { cargo: true, mark: CARGO_MARKS.lost, fate: 'flip' });
          break;
        // A lost cargo left five minutes goes home (CONFIG.stranded.returnAfter).
        case 'cargoReturned':
          notify('CARGO RETURNED', QL.banner.cargo(e.label, stationOnly(e.returnedTo)), { cargo: true, mark: CARGO_MARKS.lost, fate: 'flip' });
          break;
        case 'piratesEngaged':
          // A squad at a post (src/raids.js) says what it was doing there.
          notify('PIRATES', e.post ? `${e.count} ${e.post === 'raid' ? 'RAIDING' : e.post === 'pester' ? 'ATTACKING' : e.post === 'gather' ? 'GATHERED AT' : 'GUARDING'} ${e.label ?? 'THE STATION'}`
            : `${e.count} ${e.count === 1 ? 'SHIP' : 'SHIPS'} INCOMING`, { kind: 'danger', life: 2.6, fate: 'flip' });
          break;
        // Raids are said by their plate in the quest list (its coming, its turning green or red) and the alarm; the second round of
        // quests (src/pester.js, src/wrecked.js, src/errands.js) by their plates, hails and labels: nothing here but their saves
        // (src/events.js). A ruin's guards beaten is news of its own: the ruin takes money now.
        // The radio's line (src/guide.js): a step is heard as another pilot's call, said once when its plate comes.
        case 'guideHeard': notify('RADIO', e.line, { kind: 'news', life: 3.2, fate: 'flip' }); break;
        // The opening chapter (src/opening.js): a line of A's or B's people on the radio; the braking practice done; the locator and the
        // map fitted, B marked on both, or the shelf fitted at B; SCOOTY JR. handed back and the pilot's own shuttle drawn (its model, as a ship changed).
        case 'openingCall': notify(e.who, e.line, { kind: 'news', life: 4.2, fate: 'flip' }); break;
        case 'openingPractice':
          if (e.what === 'fire') notify('SHOTS AWAY', 'KEEP MOVING WHILE YOU FIRE', { kind: 'gain', life: 2.8, fate: 'flip' });
          else notify('STOPPED', `DOCK BELOW ${CONFIG.station.dockSpeed}`, { kind: 'gain', life: 2.8, fate: 'flip' });
          break;
        // The panel a stage gives appears by itself (the shelf, the locator and the map: nothing said). The old station asked about is a
        // card: the one new fact on the board, what it costs to rebuild.
        case 'openingFitted':
          if (e.what === 'shelf') notify('SHELF FITTED', e.owned ? 'FIRST SOUVENIR ON DISPLAY' : 'THE RACK IS YOURS TO FILL', { kind: 'gain', life: 3.6, fate: 'gone' });
          else if (e.what === 'ruin') notify(`${e.label} MARKED`, `${e.cost} CR TO REBUILD`, { kind: 'gain', life: 3.8 });
          else notify('LOCATOR AND MAP FITTED', `${e.label} IS MARKED`, { kind: 'gain', life: 3.6, fate: 'gone' });
          break;
        case 'loanerReturned': {
          const model = shipModel(e.shipId);
          if (model) game.applyModel(model);
          notify('YOUR SHUTTLE', 'RADIO REPAIRED / NO CHARGE', { kind: 'gain', life: 3.6, fate: 'gone' });
          break;
        }
        // The reference ships' quests (src/specials.js): the plate and the pointer say how it goes; what the page says is that a
        // ship is yours for the run, that it is over, and what it left (saved at once: it is the pilot's for good).
        case 'specialBoarded': notify(e.label, 'SHIP BORROWED / YOUR SHIP PARKED HERE', { kind: 'news', life: 3.2, fate: 'gone' }); break;
        // What it left is one bundle, one gift card (codex/economy-2026-10-03/CLAUDE_HANDOFF.md: «One display card per achievement
        // bundle»): its paint's picture; its pay is said by its plate in the quest list as it lights (`+300 CR / PAINT, COCKPIT, NOTE`).
        case 'specialDone':
          notifyBundle({ title: e.label, sub: 'PAINT, COCKPIT, NOTE', picture: e.paint ? { kind: 'paint', id: e.paint } : null,
            open: () => screens.openCardOn(), life: 4.6 });
          break;
        case 'specialFailed': notify(`${e.label} / FAILED`, 'YOUR SHIP RETURNED', { kind: 'danger', life: 3.2, fate: 'flip' }); break;
        // The guards beaten: what the ruin takes now, short (the fight was the pilot's own).
        case 'ruinCleared':
          notify(`${e.label} IS CLEAR`, 'FUND TO RESTORE', { kind: 'gain', life: 3.2, fate: 'flip' });
          break;
        // The v1 economy's milestones (ECONOMY_V1_HANDOFF.md section 8.7): a short
        // confirmation, the marker and the world's own change say the rest. Its caches past a closed border are not counted
        // (src/frontier.js): with none to be had, nothing is said of them.
        case 'stationRestored':
          // The card's 27 columns: «NEW DELIVERY PAY ×1.15 / 2 CACHES MARKED» was cut to «/ 2…» (Codex's text pass UXN04). The restoration's
          // bundle is this one card (the economy's «one display card per achievement bundle»): the new pay, and the free find it earned
          // (src/stationGifts.js) in place of the caches' count, whose two the sector's card and the map say.
          notify(`${e.label} RESTORED`, e.gift ? `PAY ×${networkMultiplier(e.restored)} / 1 ${e.gift} FREE`
            : `NEW PAY ×${networkMultiplier(e.restored)}${e.finds ? ` / ${e.finds} CACHES` : ''}`, { kind: 'gain', life: questLife(e, 3.6) });
          break;
        // The first-dock support (src/starterSupport.js): the offer and the run done are the radio's words (`guideHeard`, said above: a line of
        // the notch); what was built into the ruin, a card (the one achievement of its own), its amount apart from the wallet.
        case 'starterSupport':
          if (e.stage === 'built') notify(e.amount > 0 ? `${e.label} SUPPORTED` : 'NO SUPPORT NEEDED', e.amount > 0 ? `+${formatCR(e.amount)} CR BUILT` : 'THE REST IS YOURS TO FUND', { kind: 'gain', life: 3.8 });
          break;
        // A restoration opened the next sector (src/frontier.js; SX, 2026-10-02: «Руина открывает сектор»): said after the
        // restoration's own notice; the border beside the pilot is already a seam.
        case 'sectorOpened':
          // The sector's name over what it means, with the souvenir the opening gave and where it was laid (World.openFrontier): the map
          // shows it too. The card cut the cache's place off when the name stood in its detail (Codex's text pass UXN05).
          notify(e.title ?? e.label, e.cache ? `SECTOR OPEN / CACHE IN ${e.cache.sectorLabel}` : 'SECTOR OPEN',
            { kind: 'gain', life: e.cache ? 4.4 : 3.6, after: true });
          break;
        // After the last restoration's own card, never over it (until 2026-10-14 it stood in the same frame and the card was gone at once).
        case 'networkComplete':
          notify('ALL STATIONS OPEN', `${e.stations} OF ${e.stations}`, { kind: 'gain', life: 4, after: true });
          break;
        // The boss's quest (src/bossQuest.js): it comes after the restoration's cards; its waking stands at once, in the danger's red; a
        // wreck that sent it next door says where, after the wreck's own; beaten, the window that the main game is done.
        case 'bossQuestOffered':
          notify(QL.boss.offered(), QL.boss.offeredSub(e.label), { kind: 'news', life: 4.4, after: true });
          break;
        case 'bossWoke':
          notify(QL.boss.woke(), QL.boss.wokeSub(), { kind: 'danger', life: 3.6 });
          break;
        case 'bossMoved':
          notify(QL.boss.moved(), QL.boss.movedSub(e.label), { kind: 'news', life: 4.4, after: true });
          break;
        case 'bossQuestDone':
          screens.openFinale?.();
          break;
        // COMMONS's chain (src/chorus.js): begun, the first voice to find; a recorder dropped by a wreck, after the wreck's own; a voice
        // back, how many of the four; the four back, the roll call and its pay. The collage itself is said over the station (src/feedback.js).
        case 'chorusBegun':
          notify(QL.chorus.begun(), QL.chorus.begunSub(e.voice), { kind: 'news', life: 4.4, after: true });
          break;
        case 'chorusDropped':
          notify(QL.chorus.dropped(), QL.chorus.droppedSub(), { kind: 'news', life: 3.6, after: true });
          break;
        case 'chorusVoiceBack':
          notify(QL.chorus.back(e.voice), QL.chorus.backSub(e.n), { kind: 'gain', life: 3.6 });
          break;
        case 'chorusDone':
          if (!e.alreadySettled) notify(QL.chorus.roll(), QL.chorus.rollSub(formatCR(e.pay)), { kind: 'gain', life: 4.4, after: true });
          break;
        case 'collectionComplete':
          notify(`${e.kind === 'paint' ? 'PAINTS' : 'SOUVENIRS'} ${e.of} OF ${e.of}`, 'COLLECTION COMPLETE', { kind: 'gain', life: 4 });
          break;
        case 'cargoRecovered':
          if (!e.alreadySettled) notify('CARGO RECOVERED', QL.banner.cargo(e.label, stationOnly(e.destination)), { cargo: true, mark: CARGO_MARKS.taken, life: questLife(e), fate: 'flip' });
          break;
        // The tow back after a wreck is paid for (src/world.js chargeRescue): said after the cargo's plate.
        case 'rescueCharged':
          notify('RESCUE TOW', e.paid === 0 ? 'NO CHARGE / NO CREDITS'
            : `-${formatCR(e.paid)} CR${e.paid < e.cost ? ` / ${formatCR(e.cost - e.paid)} CR WAIVED` : ''}`, { kind: 'danger', life: 3.2, fate: 'flip' });
          break;
        // What is found is said as a notice, not a label at the thing (SX, 2026-10-01: «добавь еще когда мы
        // подбираем сигнал нотификацию в стиле нотификаций и также для сундуков и красок»); coins and fuel keep theirs.
        case 'signalHeard':
          if (!e.alreadySettled) {
            if (e.kind === 'word') notifyFind('signal', null, e, () => screens.openCardOn(), { life: Math.max(FIND_LIFE, questLife(e)) });
            else notify(`+${e.amount} CR`, 'ALL SIGN WORDS FOUND', { kind: 'gain', life: questLife(e) });
          }
          break;
        case 'signPlaced':
          // A full board made room: say which sign went, and where.
          if (e.replaced) {
            notify('OLDEST SIGN REMOVED', `${e.replaced.sectorLabel} / ${e.replaced.text}`, { fate: 'gone' });
          }
          break;
        case 'traceRequested':
          ghost.start(e);
          break;
        case 'cacheOpened':
          if (e.alreadySettled) notify('ALREADY OPENED', 'NO EXTRA CHARGE', { life: 2.4, fate: 'gone' });
          else notifyFind('souvenir', e.defId, e, () => screens.openCardOn(e.defId), { life: Math.max(FIND_LIFE, questLife(e)) });
          break;
        case 'paintFound':
          if (!e.alreadySettled) notifyFind('paint', e.paintId, e, () => screens.openCardOn(), { life: Math.max(FIND_LIFE, questLife(e)) });
          break;
        // A look given (src/looks.js): a notice like a paint's, standing after the restoration's own; it is not put on, the card does that.
        case 'lookFound':
          notifyFind('look', e.lookId, e, () => screens.openCardOn());
          break;
        // A blow to the hull shakes the cockpit by how hard it was and throws sparks off its bars (labs/graphics/cockpit-fx.js).
        case 'shipDamaged': knockCockpit(e.amount, performance.now() / 1000); break;
        // A pointer given for random quests (src/cursors.js): not put on, K walks the ones owned.
        case 'cursorFound':
          notifyFind('pointer', e.cursorId, e, () => { game.applyCursor(world.pilot.wearCursor(e.cursorId)); game.pointerAsked = null; game.persist(savesFor('cursorFound')); toast(`cursor applied / ${e.label.toLowerCase()}`, 'news', { fate: 'gone' }); });
          break;
        // The radio a quest gave (src/questHooks.js giveRadio): a find's card; a click shows it, if this browser kept it hidden.
        case 'radioGiven':
          notifyFind('radio', 'radio', e, () => { if (game.radio?.hidden) toggleRadio(game.radio); });
          break;
        // A cache marked (a station's MARK, a wreck's hint): its card, the map a click away.
        case 'findMarked': {
          const f = findDef(e.findId, world.ledger), sector = f ? SECTORS.find((x) => x.id === placeOf(f, world.ledger).sector) : null;
          notifyFind('mark', e.findId, { ...e, sector: sector?.label ?? null }, () => screens.openMapScreen());
          break;
        }
        // A station a wreck or hard blows broke (src/stationService.js breakStation, the bill of a lost raid), and repaired.
        case 'stationBroken': notify(`${e.label} DAMAGED`, `REOPEN FOR ${formatCR(e.cost)} CR`, { kind: 'danger', life: 3.6, fate: 'flip' }); break;
        // A station worn by hard blows says so at a tenth lost (CONFIG.station.wear.warn); at a fifth it breaks, as above. The words are
        // the agent's, for SX to read (2026-10-08).
        case 'stationWorn': notify(`${e.label} STRAINED`, `${Math.round(100 * e.wear)} % LOST / BREAKS AT ${Math.round(100 * CONFIG.station.wear.breaks)} %`, { kind: 'danger', life: 3.6, fate: 'flip' }); break;
        case 'stationRepaired': notify(`${e.label} REPAIRED`, `${e.mended ? 'MENDED' : 'REOPENED'} / -${formatCR(e.cost)} CR`, { kind: 'gain', fate: 'gone' }); break;
        // A service droid comes into the sector (src/droids.js): news, and the locator shows where.
        case 'droidArrived': notify(`${e.label} IN SECTOR`, e.name, { life: 3, fate: 'gone' }); break;
        // A rare visitor out of O-08 (src/traffic.js): an event, said as one; it hails when the pilot comes near.
        case 'visitorArrived': notify(e.label, 'PASSING THROUGH', { life: 4, fate: 'gone' }); break;
        case 'actionRefused':
          if (screens.open.hangar) screens.hangarMessage(e.reason); else notify(e.reason, null, { kind: 'refusal', life: 2.6, waits: false, fate: 'flip' });
          break;
        // The hangar (src/hangar.js): opened from a garage's menu; a ship bought or
        // changed is saved at once, and the one now flown is drawn with its own model.
        case 'hangarRequested': screens.openHangar(); break;
        case 'shipBought':
          screens.hangarMessage(`${e.label} PURCHASED / -${e.price} CR`);
          screens.hangarUI.bought = e.shipId;
          break;
        case 'shipChanged': {
          const model = shipModel(e.shipId);
          if (model) game.applyModel(model);
          // A ship just bought is flown at once; its purchase is the message. The STANDARD is said by the look it wears (src/shipLooks.js), as
          // the hangar's squares name it.
          const look = e.shipId === HULL && game.shipLook ? game.shipLook.looks().find((l) => l.id === game.shipLook.worn)?.label : null;
          if (screens.hangarUI.bought !== e.shipId) screens.hangarMessage(`SHIP SELECTED / ${look ?? e.label}`);
          screens.hangarUI.bought = null;
          break;
        }
        case 'stationLog': screens.openStationInfo(e.stationId); break;
        // Docked at home, the garage's room opens (labs/graphics/garage-room.js) once the ship is inside.
        case 'homeEntered': screens.openGarageRoom(); break;
        default: break;
      }
      beat = null;
      // What money, a ruin, the pilot's place or what the pilot owns changed is saved as its event is read (src/events.js `saves`):
      // the state is final then, so one save holds a restoring investment's second event as well.
      const reason = savesFor(e.type);
      if (reason) game.persist(reason);
    }
  }

  // A note from the page itself (a setting changed, a save that failed): a notice like the game's
  // (labs/graphics/notice.js), a danger when something broke. The live region says it aloud.
  // `fate`: a flip by default (a warning, an answer to a key); 'gone' for a confirmation of what the pilot just did (a setting).
  function toast(msg, kind = 'news', { fate = 'flip' } = {}) {
    notify(msg, null, { kind, life: 2.6, waits: false, fate });
  }
  // What a save came to ('saved', 'failed' with the storage's reason, 'unavailable'), in SAVE_NOTES[SAVE_NOTE]'s words.
  function saveNote(outcome, reason = '') {
    const [title, sub, kind] = SAVE_NOTES[SAVE_NOTE][outcome];
    // A save made is said by the pause's SAVE GAME row (when it was written); one that failed flips the notch.
    notify(title.replace('{reason}', String(reason ?? '')), sub, { kind, life: 2.6, waits: false, fate: outcome === 'saved' ? 'gone' : 'flip' });
  }

  // ------------------------------------------------------------------------------------------------ the task slot

  // The banner the slot wants now, { occ (its occurrence's id), banner }, or null: WRECKED while the ship is gone, the focused task,
  // ALL CLEAR; none that a click has put away.
  function wanted(tasks) {
    const { world } = game, board = game.questBoard;
    let want = null;
    if (!world.ship.alive) {
      want = { occ: `wrecked:${slot.wrecks}`, kind: 'wrecked',
        banner: { family: 'task', ink: ROLES.danger, mark: '!', title: SLOT_WORDS.wrecked, sub: SLOT_WORDS.tow } };
    } else {
      // Only a timer and the statuses stand in the notch (SX, 2026-10-06: «давай квесты не выводить в челке, выводить там только таймеры
      // и статусы»): of the tasks with a clock (a quest's deadline, the cargo's), the one focused as the slot focuses (the selected one,
      // a red quest by its clock, the cargo, a quest); its sign or bearing, its title and its clock (SX, 2026-10-07: «выводи пожалуйста
      // сверху все таки какой-то текст о чем речь, а не только таймер со стрелкой»): the title its plate in the quest list wears
      // (src/questLines.js, made to fit a plate's row, so it fits the notch uncut), never the detail's action; no detail.
      const banners = new Map(tasks.map((t) => [t.id, taskBanner(t, board?.activeId === t.id)]));
      const timed = tasks.filter((t) => banners.get(t.id).clock);
      const task = focusedTask(timed, board?.activeId ?? null);
      if (task) want = { occ: `task:${task.id}`, kind: 'task', task, banner: { ...banners.get(task.id), sub: null } };
      else if (allClear(slot.log)) want = { occ: `clear:${slot.log.clears}`, kind: 'clear',
        banner: { family: 'task', ink: PALETTE.green, mark: '+', title: SLOT_WORDS.clear } };
    }
    return want && !slot.dismissed.has(want.occ) ? want : null;
  }
  // A task's banner: its tone's ink and sign, the bearing's arrow once it is selected (as the quest list turns «!» into it), its
  // title over its timer (in its own ink) and what to do.
  function taskBanner(task, selected) {
    const { world } = game, way = taskNavigation(world, task), aim = courseOf(way);
    const arrow = selected && way ? bearingGlyph(Math.atan2(aim.dy, aim.dx)) : null;
    if (task.kind === 'quest') {
      const q = task.quest, tone = QUEST_TONES[questTone(q)] ?? QUEST_TONES.green;
      const timer = q.ends != null ? clockText(Math.ceil(Math.max(0, q.ends - world.ledger.clock))) : null;
      return { family: 'task', ink: tone.ink, mark: arrow ?? tone.mark, title: q.title, sub: q.sub, clock: timer, clockInk: tone.ink };
    }
    // The cargo, as the garage room's list says it (DELIVER <cargo> / TO <station>), in the route's ink: green, yellow as its fast
    // pay melts, red once late (src/interface.js routeInk), its clock first.
    const ink = routeInk(way), left = way?.clock?.left;
    const timer = Number.isFinite(left) ? `${left < 0 ? 'LATE ' : ''}${clockText(Math.abs(left))}` : null;
    const label = task.job?.label ?? '';
    if (task.kind === 'cargo') {
      const to = cargoDestination(task);
      return { family: 'task', ink, mark: arrow ?? CARGO_MARKS.taken, title: `DELIVER ${label}`, sub: to ? `TO ${to.label}` : null, clock: timer, clockInk: ink };
    }
    return { family: 'task', ink, mark: arrow ?? CARGO_MARKS.lost, title: `RECOVER ${label}`, sub: way?.sectorLabel ? `AT THE WRECK / ${way.sectorLabel}` : 'AT THE WRECK',
      clock: timer, clockInk: ink };
  }
  // The widest timer a line has shown (its characters), kept while its occurrence stands: the notch fits it once and does not narrow as
  // 10:00 becomes 9:59 (it widens once, when a cargo turns LATE).
  const clockRoom = (cur, banner) => Math.max(cur?.clockRoom ?? 0, glyphs(banner?.clock ?? '').length);
  const born = (want) => ({ ...want, born: slot.time, seed: ++state.serial, clicked: null, exitAt: null, action: null, clockRoom: clockRoom(null, want.banner) });
  // Each frame: the tasks' log (one complete update: src/tasks.js reconcileTasks), ALL CLEAR's visible seconds, and the slot's
  // line: a new occurrence takes its place once the one standing has gone (at once: the line has no way out, S8); the standing one's
  // words follow its task.
  function stepSlot(rawDt) {
    const { world } = game;
    slot.time += rawDt;
    const tasks = currentTasks(world);
    reconcileTasks(slot.log, tasks, outcomeOf);
    if (!tasks.length) tasksDone.clear();
    // A task put away by a click stays away while it lasts; once it has ended, a later task of the same id is a new occurrence.
    for (const occ of slot.dismissed) if (occ.startsWith('task:') && !tasks.some((t) => `task:${t.id}` === occ)) slot.dismissed.delete(occ);
    advanceTaskLog(slot.log, rawDt, !world.paused && !game.labOpen && !game.screens?.anyScreen?.());
    const want = wanted(tasks), reduced = game.feedback.reducedMotion;
    if (!slot.cur) { if (want) slot.cur = born(want); return; }
    const cur = slot.cur;
    if (cur.exitAt == null) {
      if (want && want.occ === cur.occ) { cur.banner = want.banner; cur.task = want.task; cur.clockRoom = clockRoom(cur, want.banner); return; }
      cur.exitAt = slot.time;
    }
    if (want?.occ !== cur.occ) slot.next = want;
    if (reduced || slot.time >= cur.exitAt) {
      slot.cur = null;
      cur.action?.();
      const next = slot.next && !slot.dismissed.has(slot.next.occ) ? slot.next : wanted(currentTasks(world));
      slot.next = null;
      if (next) slot.cur = born(next);
    }
  }
  // A click on the slot's banner: it presses, goes, and its action runs: a task's selects it (src/tasks.js selectTask, the quest
  // list's own field), ALL CLEAR and WRECKED are acknowledged; the occurrence is put away (the task goes on: the list holds it).
  function pressSlot() {
    const cur = slot.cur;
    if (!cur || cur.exitAt != null || cur.clicked != null) return false;
    slot.dismissed.add(cur.occ);
    cur.clicked = slot.time;
    cur.exitAt = slot.time + (game.feedback.reducedMotion ? 0 : RAIL_TIMES.press);
    if (cur.kind === 'task') { const id = cur.task.id; cur.action = () => { selectTask(game.questBoard, id); game.sound?.play?.('blip'); }; }
    if (game.feedback.reducedMotion) stepSlot(0);
    return true;
  }
  // The notice's offset (hud-place.js, SX's layout) held so its top stays at the upper groups' line or under it: the whole banner on
  // the screen, never under the screen's top edge (SX, 2026-10-04: the top banner «сверстаны» cut by the top; the layout's safe area
  // lets a group reach the edge itself, where the tube's rim takes the first rows).
  const onScreen = (o, top) => (top + o.y >= TASK_TOP ? o : { x: o.x, y: TASK_TOP - top });
  const noticeOffset = () => onScreen(offsetOf(game.hud.place, 'notice'), noticeTop(game.renderer));
  // The slot's line stands while its task does, and while a click's press plays; then the notch is empty till the next one is born
  // (the page draws no motion for the line: it comes and goes at once).
  const lineShown = (cur) => !!cur && (cur.exitAt == null || slot.time < cur.exitAt);
  // The helmet's notch this frame (labs/graphics/helmet.js helmetOf): as wide as the slot's line while one stands (N3 FITTED), today's
  // with none. The page draws the helmet with it (main.js), so the walls and the line agree in the same frame.
  function notch(r = game.renderer) {
    const now = notchNow();
    return helmetOf(r, now ? (now.line ?? notchLine(now.task.banner, { clockRoom: now.task.clockRoom }))?.need ?? null : null);
  }
  // What the notch's line holds now: a flip's page (`line`), turning over to it or standing; the task's line (`task`), at rest or turning
  // back to after a flip; a flip's page turning to nothing; or null. `turn` ({ age, seed, gone }) while it turns over (none under reduced
  // motion).
  function notchNow() {
    const f = flips.cur, task = lineShown(slot.cur) ? slot.cur : null, still = game.feedback.reducedMotion;
    if (f && f.age < f.life) return { line: f, turn: still || f.age >= FLIP.turn ? null : { age: f.age, seed: f.seed } };
    if (f) {
      const turn = still ? null : { age: f.age - f.life, seed: f.seed + 7 };
      return task ? { task, turn } : still ? null : { line: f, turn: { ...turn, gone: true } };
    }
    return task ? { task, turn: null } : null;
  }
  // The task the slot holds when it is a quest's, or null: the quest list marks its plate (quest-list.js `focusId`), as the notch
  // says what to do and not the quest's name.
  const focusedQuestId = () => (lineShown(slot.cur) && slot.cur.kind === 'task' && slot.cur.task?.kind === 'quest' ? slot.cur.task.id : null);
  // The slot's line where the pointer finds it (the notch's inside over its floor), or null. The notch is the helmet's: it does not
  // move with the layout (the TASK group left the LAYOUT page with S8).
  function taskRect() {
    return lineShown(slot.cur) || flipShown() ? taskLineBox(game.renderer, notch()) : null;
  }
  // Where the slot stands, empty or not: the notch's inside.
  const taskHome = () => taskLineBox(game.renderer, notch());
  // The slot's line in the helmet's notch, a group (main.js `group`), steady while the deck shakes, in the kept layer as the
  // banners were (src/grade.js keptDraw: a look never repaints it). Under the pointer it presses in as every panel does (src/hover.js).
  const drawLine = keptDraw((r, banner, h, room, turn) => drawNotchLine(r, banner, h, { clockRoom: room, turn }));
  const drawRow = keptDraw((r, line, h, turn) => drawNotchRow(r, line, h, { turn }));
  function drawTaskPlaced(r = game.renderer) {
    const now = notchNow(), { pointer } = game;
    if (!now) return null;
    const h = notch(r), box = taskLineBox(r, h), cur = now.task, still = !cur || cur.exitAt == null;
    const over = !!pointer?.inside && inBox(box, pointer.x, pointer.y) && !game.screens.anyScreen() && still;
    return hoverItem(r, 'banner:task', box, () => (cur ? drawLine(r, cur.banner, h, cur.clockRoom, now.turn) : drawRow(r, now.line, h, now.turn)),
      { kind: 'panel', over, disabled: !still });
  }

  // ------------------------------------------------------------------------------------------------ the notice

  // The keyboard's focus is on the notice Enter acts on while the keyboard alone is in use (chat C's scheme, `game.keysOnly`).
  const keyboardFocus = () => !!game.keysOnly?.();
  // The notice where SX put its place (labs/graphics/hud-place.js), a group (main.js `group`). Under the pointer, or with the
  // keyboard's focus, it gives as if pressed, a little smaller and darker (a panel, src/hover.js; SX, 2026-10-03: «Нотификейшн.
  // Квесты. Локатор. Должны быть как будто продавливанием их»), its corner white; a gift's corner folds in over RAIL_TIMES.fold.
  let lastFold = null;
  function drawNoticePlaced(r = game.renderer) {
    const { pointer } = game, notice = state.notice;
    if (!notice || noticeDone(notice)) return null;
    const o = noticeOffset(), moved = o.x || o.y;
    const box = currentNoticeRect();
    const pointed = !!box && !!pointer?.inside && inBox(box, pointer.x, pointer.y) && !game.screens.anyScreen();
    const over = (pointed || keyboardFocus()) && notice.clicked == null && notice.age < notice.life;
    // The fold's progress, eased toward the pointer's (Codex: «180 ms with cubic ease-out, and reverses smoothly from its current
    // position»), at once under reduced motion.
    const now = slot.time, dt = lastFold == null ? 0 : Math.max(0, now - lastFold);
    lastFold = now;
    notice.fold = notice.instant ? (over ? 1 : 0) : clamp((notice.fold ?? 0) + (over ? 1 : -1) * dt / RAIL_TIMES.fold, 0, 1);
    if (moved) { r.ctx.save(); r.ctx.translate(o.x, o.y); }
    const laid = noticeRect(r, notice);
    const m = noticeMotion(notice, { over, fold: notice.fold });
    const drawn = hoverItem(r, 'notice', laid, () => drawNotice(r, notice, laid.x, laid.y, m),
      { kind: 'panel', over: pointed || (keyboardFocus() && over), disabled: notice.clicked != null });
    if (moved) r.ctx.restore();
    return drawn;
  }
  // The standing notice's box where it is drawn (its place moved under the pause included), or null.
  function currentNoticeRect() {
    const { renderer } = game;
    if (!state.notice || noticeDone(state.notice)) return null;
    return shifted(noticeRect(renderer, state.notice), noticeOffset());
  }

  // Each frame: the standing notice ages (an event's waits while the game does: P, a screen; a note from the page does not); once it
  // has gone its action runs (a click's) and the next waiting one stands. Then the task slot.
  function age(rawDt) {
    const { world } = game, notice = state.notice;
    if (notice && (!notice.waits || (!world.paused && !game.labOpen))) {
      notice.age += rawDt;
      if (noticeDone(notice)) { showNotice(state.queue.shift() ?? null); notice.after?.(); }
    }
    // The opening's beats, one after another (labs/graphics/opening-focus.js): on the notices' own time.
    if (!world.paused && !game.labOpen) game.focus?.step(rawDt);
    stepFlips(rawDt);
    stepSlot(rawDt);
  }

  // The standing notice pressed (a click on it, or the keyboard's confirm): it goes after the press, then its action runs, a find's
  // what it is (`find.open`), any other nothing more (acknowledged). A second press while it goes is let be. True when it took it.
  function press(notice) {
    if (!notice || noticeDone(notice) || notice.clicked != null || notice.age >= notice.life) return false;
    notice.clicked = notice.age;
    notice.life = notice.age + (notice.instant ? 0 : RAIL_TIMES.press);
    notice.after = notice.find?.open ?? null;
    if (notice.instant) { notice.age = notice.life + notice.out; showNotice(state.queue.shift() ?? null); notice.after?.(); }
    return true;
  }
  // A click at (x, y), with no screen open: on the notice or on the task slot's banner (SX, 2026-10-03: everything the pointer lifts
  // answers it). True when it took the click.
  function click(x, y) {
    if (game.screens.anyScreen()) return false;
    if (inBox(currentNoticeRect(), x, y)) { press(state.notice); return true; }
    // A flip standing in the notch: a click ends it (it turns back to the task).
    if (flipShown() && inBox(taskRect(), x, y)) { flips.cur.life = flips.cur.age; return true; }
    if (inBox(taskRect(), x, y)) { pressSlot(); return true; }
    return false;
  }
  // The keyboard's confirm (input-router.js KEYS.banner, Enter: C0's answer, Space being the brake in flight): the standing notice.
  const confirm = () => press(state.notice);

  return { state, slot, flips, notify, stand, notifyFind, notifyBundle, toast, saveNote, clearNotices, questLife, handleEvents, drawNoticePlaced, drawTaskPlaced,
    currentNoticeRect, taskRect, taskHome, notch, focusedQuestId, age, click, confirm, pressSlot };
}
