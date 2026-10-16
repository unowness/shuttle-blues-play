// The pilot's tasks and the selected one (chat B, 2026-10-04; Codex's banner package A / Rail revision 5, its model.mjs, picked by
// SX; codex/start-and-narrative/ALIGNMENT.md: «one selected immediate target ... do not add another independent permanent row or a
// second task selector»).
//
// A task is what the pilot is doing now: the cargo carried, a cargo lost in space to go back for, and each open quest
// (src/quests.js currentQuests). Their presence is read from the ledger and the quests, never from a bearing: a target with no
// way to it (past a closed border) is still a task, and a missing bearing is never a task done.
//
// The selected task is ONE state, the quest list's own (labs/graphics/quest-list.js `board.activeId`): a click on a quest's plate
// turns its «!» into the bearing arrow and selects it (SX, 2026-10-04: «кликаешь и восклицательный знак превращается в стрелочку»),
// the opening's objective selects itself as it comes (a red quest did until 2026-10-07), R steps through them. The cargo is selected the same way, by its task id in the same
// field (a click on the top banner while it shows the cargo). The top banner, the locator and the map all read it through
// `selectedTask`; nothing keeps a second copy.
//
// The top banner shows the FOCUSED task: the selected one, else the first by the hierarchy (FOCUS_ORDER below: the story, the raids, the
// NPC quests, the rest). With no task it shows ALL CLEAR for CLEAR_SECONDS of visible time after the last task ended well, and nothing
// otherwise (NO ACTIVE ROUTE is gone: SX, item 6 of 2026-10-03, «надпись убрать»). Which quests show their marks in the sky: `markedQuests`.
import { sectorById, stationDefById, SECTOR_SIZE } from './sectors.js';
import { currentQuests, questTone } from './quests.js';
import { deliveryNavigation, questNavigation, legTo } from './navigation.js';
import { CONFIG } from './config.js';
import { withCourse } from './course.js';
import { isOpeningJob, contractById, parTime } from './contracts.js';
import { QUEST_LINES as QL } from './questLines.js';

// Seconds ALL CLEAR stands, counted only while it can be seen (no screen over the flight, not paused).
export const CLEAR_SECONDS = 30;

// The task of the cargo carried, of a cargo lost at `contractId`: their ids, which share the quest list's `activeId` with the quests'.
// One id for both since 2026-10-16: the cargo is one plate of the quest list from its taking to its delivery, lost and taken back on the
// way (cargoQuests).
export const cargoTaskId = (contractId) => `cargo:${contractId}`;
export const recoveryTaskId = cargoTaskId;

// Every task now, each { id, kind ('cargo' | 'recovery' | 'quest'), tone, ends (the deadline on the pilot's clock, or null), and
// its source: contractId and job, or quest }.
export function currentTasks(world) {
  const L = world.ledger, out = [];
  if (L.active) {
    const job = L.activeJob?.() ?? null;
    out.push({ id: cargoTaskId(L.active.id), kind: 'cargo', tone: 'cargo', contractId: L.active.id, job, ends: null });
  }
  for (const [contractId, s] of L.stranded ?? []) {
    out.push({ id: recoveryTaskId(contractId), kind: 'recovery', tone: 'cargo', contractId, job: s.job ?? null, ends: null });
  }
  for (const quest of currentQuests(world)) {
    out.push({ id: quest.id, kind: 'quest', tone: questTone(quest), quest, ends: quest.ends ?? null });
  }
  return out;
}

// The hierarchy a task is focused by when none is selected (SX, 2026-10-06: «иерархия сюжетка, рейды, нпс итд»), each task's place as
// [tier, place in its tier]; the earlier first, a tie by the clock that runs out first, then the list's order:
//   0 the story    the opening chapter's objective and its first freight (the cargo is that objective while carried), a reference
//                  ship's run, the radio line's step (src/opening.js, src/specials.js, src/guide.js; the story's purple, ◆)
//   1 the raids    a raid on a station, a ship pestered by pirates (red, on a clock: the soonest first)
//   2 the NPCs     a pilot out of fuel, a wreck asking, a planet's errand, another pilot's lost cargo (yellow and blue)
//   3 the rest     the cargo carried, a cargo lost, a cache, a ruin to restore, a signal (green)
export const FOCUS_ORDER = Object.freeze(['story', 'raids', 'npc', 'rest']);
const NPC_KINDS = new Set(['rescue', 'wreck', 'planet', 'stranger']);
export function focusRank(task) {
  if (task.kind === 'cargo' || task.kind === 'recovery') return isOpeningJob(task.contractId) ? [0, 0] : [3, task.kind === 'cargo' ? 0 : 1];
  const q = task.quest ?? {};
  if (q.kind === 'opening') return [0, 0];
  if (q.kind === 'special') return [0, 1];
  if (q.kind === 'guide' || q.kind === 'support') return [0, 2];
  if (q.kind === 'raid' || q.kind === 'pester') return [1, 0];
  // The boss's quest (src/bossQuest.js): the story's until the pilot meets it, a raid's red from then.
  if (q.kind === 'boss') return q.tone === 'red' ? [1, 0] : [0, 3];
  if (NPC_KINDS.has(q.sideKind)) return [2, 0];
  return [3, 2];
}
// The task focused out of `tasks` with `selectedId` selected (the quest list's activeId): the selected one, else the first by the
// hierarchy (focusRank).
export function focusedTask(tasks, selectedId = null) {
  const chosen = selectedId == null ? null : tasks.find((t) => t.id === selectedId);
  if (chosen) return chosen;
  let best = null, bestKey = null;
  for (const t of tasks) {
    const [tier, place] = focusRank(t), key = [tier, place, t.ends ?? Infinity];
    if (!best || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) { best = t; bestKey = key; }
  }
  return best;
}
// The focused quest's marks and plate (SX's M3 PING on labs/graphics/sketches/marks-v2.html, 2026-10-08: «Плашки берем Ping, только не
// рисуй рамочки, пусть 2 раза моргнет типо прозрачностью, активный квест по которому кликнули и его метка выделена, должен и в списке
// квестов выделяться, а остальные чуть затемняться, снять фокус можно повторным кликом или кликом в другой квест»). While a quest is
// selected (the quest list's activeId: a click on it again or on another lets it go or moves it), every other pointer on the rim and
// every other plate of the list stand at `dim` of their light (labs/graphics/rim-marks.js, quest-list.js). A change pings its mark:
// it comes, it is selected, or its clock passes `clock` s; the ping blinks the mark `blinks` times by its opacity, down to `low` of it,
// over `life` s (no frame, no corners), one mark at a time, `gap` s apart.
export const MARK_FOCUS = Object.freeze({ dim: 0.6, ping: Object.freeze({ blinks: 2, life: 0.8, low: 0.15, gap: 0.5, clock: 30 }) });
// The share of its light a mark pinged `age` s ago shows: 1 outside a ping and under reduced motion, else `blinks` dips to `low`.
export function pingShare(age, reduced = false) {
  const P = MARK_FOCUS.ping;
  if (reduced || !(age >= 0) || age >= P.life) return 1;
  return 1 - (1 - P.low) * (0.5 - 0.5 * Math.cos(2 * Math.PI * P.blinks * (age / P.life)));
}

// The quests whose marks stand in the sky (their pointer on the rim, or by their thing on the screen: labs/graphics/flight-frame.js): every
// quest, as it comes and while it stands (SX, 2026-10-09: «все квесты, когда они появляются, они показывают метки на карте»); the pilot's
// pick dims the others' (MARK_FOCUS), it hides none. From 2026-10-09 to SX's W8 «B» (2026-10-15) a click on a quest's plate switched its
// marks off and picked nothing; a click picks again now (labs/graphics/quest-list.js clickQuestBoard). Until 2026-10-09 only a clicked quest
// and the purple, the timed and a stranger's lost cargo showed them (SX, 2026-10-07). The cargo is no quest: its pointer (to its station
// while carried, to where it lies once lost) is drawn whatever is selected, until it is delivered or goes back to its station
// (src/navigation.js deliveryNavigation). `board` is the quest list's, read by no rule now. `out` (an array kept by the caller) is filled.
export function markedQuests(world, board, out = []) {
  out.length = 0;
  for (const q of currentQuests(world)) out.push(q);
  return out;
}

// The selected task, one state for the banner, the locator and the map: the task whose id the quest list's `board.activeId`
// holds, or null when none is selected (or the one selected is gone).
export function selectedTask(world, board) {
  const id = board?.activeId ?? null;
  return id == null ? null : currentTasks(world).find((t) => t.id === id) ?? null;
}
// Selects `taskId` (a quest's id, or a cargo's task id), or nothing with null: the quest list's field, as its own click sets it.
export function selectTask(board, taskId) { board.activeId = taskId ?? null; board.auto = null; return board.activeId; }

// The bearing to a task's target ({ dx, dy, distance, sectorId, label, ... } as src/navigation.js gives one), or null where no way
// leads (another sector past a closed border, a torus): the cargo's to its station, a lost cargo's to where it lies, a quest's to its
// target.
export function taskNavigation(world, task) {
  if (!task) return null;
  if (task.kind === 'quest') return questNavigation(world, task.quest);
  if (task.kind === 'cargo') { const r = deliveryNavigation(world); return r?.kind === 'delivery' ? r : null; }
  const s = world.ledger.stranded?.get(task.contractId);
  const leg = s && legTo(world, s.sectorId, s.x, s.y);
  if (!leg) return null;
  return withCourse(world, { kind: 'recovery', targetId: `stranded:${task.contractId}`, contractId: task.contractId, label: task.job?.label ?? '',
    sectorLabel: sectorById(s.sectorId)?.label ?? '', sectorId: s.sectorId, ...leg,
    arrived: leg.local && leg.distance <= CONFIG.stranded.interactRadius, clock: null });
}

// ------------------------------------------------------------------------------------------------ ALL CLEAR

// What the top banner's empty state keeps: the task ids of the last update, how long ALL CLEAR stands yet, and how many times it
// began (each a new occurrence, so one dismissed does not hide the next).
export function createTaskLog() { return { ids: [], clearLeft: 0, clears: 0 }; }

// One complete update: `tasks` now, and how each task that ended went (`outcome(id)`: 'done', 'late' or null). ALL CLEAR begins
// when the last tasks are gone in this update and every one of them ended 'done'; a task that came in the same update (a lost cargo
// taken back is the cargo again, a quest's next step) is no empty board, nor is a failure, an expiry, a withdrawal or the first
// empty session. Any task ends it.
export function reconcileTasks(log, tasks, outcome) {
  const ids = tasks.map((t) => t.id);
  if (ids.length) { log.clearLeft = 0; }
  else if (log.ids.length && log.ids.every((id) => outcome(id) === 'done')) { log.clearLeft = CLEAR_SECONDS; log.clears += 1; }
  else if (log.ids.length) log.clearLeft = 0;
  log.ids = ids;
  return log;
}
// Its clock: `dt` seconds pass, only while it is `visible`.
export function advanceTaskLog(log, dt, visible = true) {
  if (visible && !log.ids.length && log.clearLeft > 0) log.clearLeft = Math.max(0, log.clearLeft - Math.max(0, dt));
  return log;
}
export const allClear = (log) => !log.ids.length && log.clearLeft > 0;

// Where a task leads, for the map (labs/graphics/map-screen.js): { sectorId, x, y } in fractions of the sector, or null. The same target
// the top banner's bearing and the locator lead to (chat N1: the opening's one objective is on all three).
export function taskTarget(world, task) {
  if (!task) return null;
  if (task.kind === 'quest') { const t = task.quest?.target; return t && Number.isFinite(t.x) ? { sectorId: t.sectorId, x: t.x, y: t.y } : null; }
  if (task.kind === 'cargo') { const d = stationDefById(task.job?.to); return d ? { sectorId: d.sectorId, x: d.x, y: d.y } : null; }
  const s = world.ledger.stranded?.get(task.contractId);
  return s ? { sectorId: s.sectorId, x: s.x / SECTOR_SIZE.width, y: s.y / SECTOR_SIZE.height } : null;
}

// The cargo as plates of the quest list, the last of it (labs/graphics/quest-list.js QUEST_ORDER; SX, 2026-10-16: «о доставке груза пусть
// теперь будет квест с грузом висеть самый нижний по приоритету в полоске квестов просто. Появился, когда взял груз, когда потерял груз
// какой-то, тайм-аут висит о том, что нужно его подобрать, как только время закончилось, он пропадает. Если подобрал, то квест
// продолжается, когда сдал, анимация, что квест сдал. Сверху убираем это»): one by its contract, carried or lying in space (cargoTaskId),
// its name over TO <station> after its delivery clock (`left` s of its par, below 0 late), or PICK IT UP after the seconds before it goes
// back to its station (`lost`). Its end is the page's, by its event (labs/graphics/notices.js: its pay as it lights green, red when it
// went back). Added onto `out` (the world's quests, src/quests.js currentQuests), which it returns.
export function cargoQuests(world, out = []) {
  const L = world.ledger;
  if (L.active) {
    const job = L.activeJob?.() ?? contractById(L.active.id), elapsed = L.elapsed(L.active.id), par = parTime(job);
    out.push({ id: cargoTaskId(L.active.id), kind: 'cargo', tone: 'cargo', contractId: L.active.id, lost: false, par,
      left: elapsed == null ? null : par - elapsed, title: QL.cargo.title(job?.label ?? ''), sub: QL.cargo.to(stationDefById(job?.to)?.label ?? '') });
  }
  for (const [id, s] of L.stranded ?? []) {
    const job = s.job ?? contractById(id);
    out.push({ id: cargoTaskId(id), kind: 'cargo', tone: 'cargo', contractId: id, lost: true, par: null, left: L.returnsIn(id),
      title: QL.cargo.title(job?.label ?? ''), sub: QL.cargo.lost() });
  }
  return out;
}
// What the quest list holds: the world's quests and the cargo (the page's frame syncs the list with it).
export const boardQuests = (world) => cargoQuests(world, currentQuests(world));

// The station a cargo goes to, for its words: { label, sectorLabel } or null.
export function cargoDestination(task) {
  const def = task?.job ? stationDefById(task.job.to) : null;
  return def ? { label: def.label, sectorLabel: def.sectorLabel } : null;
}
