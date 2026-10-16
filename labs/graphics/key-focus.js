// The keyboard's focus (chat C, 2026-10-04; SX's picks on labs/graphics/sketches/controls.html): the keys reach what the mouse
// reaches, and what they reach looks exactly as under the mouse, because the focus IS the game's own pointer parked on it
// (labs/graphics/cursor.js cursorPark; F2: «фокус — это наш курсор, припаркованный на вещи»).
//
//   (the nose    F2's focus on the station or the ship ahead, «1 FLY IN», «1 HAIL», went on 2026-10-07: SX, «(б) убрать фокус на носу
//                совсем: и со станциями, и с кораблями всё делается только через их контекстное окно вблизи»; the keys act on a thing
//                only through its window's rows, its numbers.)
//   the quests   R attaches the keys to the quest list (SX: «когда ты нажимаешь ... ты цепляешься к квестам и можешь клавиатуры
//                типа, управлять»): the pointer parks on a plate, which presses in as under the mouse; ↑ ↓ walk the plates, Enter
//                does what a click on the plate does (its task selected, or let go); R again selects the next quest, as the old Q
//                did (none after the last; SX on the picks hub, 2026-10-04: «a second R steps to the next quest»), the pointer
//                on its plate; Escape lets the list go. The arrows ↑ ↓ are the list's while it holds the keys; W and S still fly.
//   windows      the controls list: ← → page between the modes; the pause: the arrows walk its rows and choices (the buttons it noted, labs/graphics/clicks.js actionBoxes), Enter
//                or Space clicks the one the pointer is parked on, the pointer standing just after the row's words (a row's `rest`,
//                C0's FOCUS 4), else in the button's middle; the garage's room: ← → walk its things, Enter uses the one
//                framed; the map: Enter puts the flag chosen in its middle (with the keys alone the pointer stands there, a sight
//                the arrows move the map under).
//
// `game` is the page's (main.js), read when a function runs.
import { clickQuestBoard, cycleQuestBoard } from './quest-list.js';
import { cursorPark, cursorSleep } from './cursor.js';
import { actionBoxes } from './clicks.js';
import { roomPoint } from './garage-room.js';
import { UI } from '../../src/uiGrid.js';
import { boxMiddle } from '../../src/util.js';

const middle = boxMiddle;
// A walk's next box from `cur` toward `dir`: down and up to the nearest row past it (then the nearest across), right and left
// along its own row. Rows are told apart by more than `ROW_SLOP` px between middles.
const ROW_SLOP = UI.row / 4;
function stepFrom(boxes, cur, dir) {
  const c = middle(cur);
  const others = boxes.filter((b) => b !== cur).map((b) => ({ b, m: middle(b) }));
  const along = dir === 'down' || dir === 'up';
  const ahead = others.filter(({ m }) => (dir === 'down' ? m.y > c.y + ROW_SLOP : dir === 'up' ? m.y < c.y - ROW_SLOP
    : Math.abs(m.y - c.y) <= ROW_SLOP && (dir === 'right' ? m.x > c.x : m.x < c.x)));
  if (!ahead.length) return null;
  const cost = ({ m }) => (along ? Math.abs(m.y - c.y) * 1000 + Math.abs(m.x - c.x) : Math.abs(m.x - c.x));
  return ahead.reduce((a, b) => (cost(b) < cost(a) ? b : a)).b;
}
// Boxes in reading order: row by row, left to right.
const reading = (boxes) => [...boxes].sort((a, b) => (Math.abs(middle(a).y - middle(b).y) > ROW_SLOP ? middle(a).y - middle(b).y : middle(a).x - middle(b).x));

export function createKeyFocus(game) {
  const now = () => performance.now();
  function park(box, by) { const p = box.rest ?? middle(box); cursorPark(game.pointer, p.x, p.y, now(), by); }
  function letGo(by) { if (game.pointer.parked === by) cursorSleep(game.pointer); }

  // ------------------------------------------------------------------------------------------------ the quests
  const quests = { id: null };
  const plates = () => game.questBoard.boxes;          // the last frame's plates as drawn, top to bottom
  function attachQuests() {
    const list = plates();
    if (!list.length) return false;
    const at = list.find((b) => b.id === game.questBoard.activeId) ?? list[0];
    quests.id = at.id;
    park(at, 'quests');
    return true;
  }
  function leaveQuests() {
    if (quests.id === null) return;
    quests.id = null;
    letGo('quests');
  }
  // The keys while the list holds them; true when it took the frame's quest keys. `key(action)`: pressed this frame.
  function questKeys(key) {
    if (quests.id === null) {
      if (key('nextQuest') && attachQuests()) { game.sound.play('blip'); return true; }
      return false;
    }
    if (key('back')) { leaveQuests(); game.sound.play('blip'); return true; }
    const list = plates();
    const at = list.findIndex((b) => b.id === quests.id);
    if (at < 0) { leaveQuests(); return false; }
    // R again: the next quest selected (the list's own cycle: the first, each in turn, none after the last), the pointer on its plate
    // (on the first while none is).
    if (key('nextQuest')) {
      if (cycleQuestBoard(game.questBoard)) {
        const on = list.find((b) => b.id === game.questBoard.activeId) ?? list[0];
        quests.id = on.id;
        park(on, 'quests');
        game.sound.play('blip');
      }
      return true;
    }
    const move = (key('listDown') ? 1 : 0) - (key('listUp') ? 1 : 0);
    if (move) {
      const next = list[Math.max(0, Math.min(list.length - 1, at + move))];
      if (next.id !== quests.id) { quests.id = next.id; park(next, 'quests'); game.sound.play('menu'); }
    }
    if (key('banner')) {
      const p = middle(list.find((b) => b.id === quests.id));
      if (clickQuestBoard(game.questBoard, p.x, p.y)) game.sound.play('blip');
    }
    return true;
  }
  const holdsArrows = () => quests.id !== null;

  // ------------------------------------------------------------------------------------------------ the windows
  // Where the walk stands in a window: what parked the pointer, and the box's place in reading order (a pause's window drifts, a
  // room's things sway: the pointer follows its box each frame).
  const walk = { by: null, index: 0, name: null };
  const walkBoxes = (by) => (by === 'pause' ? reading(actionBoxes()) : by === 'room' ? roomThings() : []);
  function roomThings() {
    const things = game.screens.room.hits?.things ?? [];
    return [...things].sort((a, b) => middle(a).x - middle(b).x);
  }
  function windowOf() {
    const { screens, pause } = game, open = screens.open;
    if (open.help) return 'help';
    if (pause.pauseShown()) return 'pause';
    if (open.room && !open.pilot && !open.hangar && !open.help && screens.room.closingAt === null) return 'room';
    if (open.map && !open.help) return 'map';
    return null;
  }
  function mapMiddle() {
    const a = game.screens.map.layout?.area;
    return a ? { x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2 } : null;
  }
  function parkWalk(by, boxes, index) {
    const box = boxes[Math.max(0, Math.min(boxes.length - 1, index))];
    if (!box) return;
    walk.by = by; walk.index = boxes.indexOf(box); walk.name = box.name ?? null;
    park(box, by);
    if (by === 'room') { const p = middle(box); roomPoint(game.screens.room, p.x, p.y); }
  }
  // The window's keys; true when the walk took the frame's keys.
  function windowKeys(key) {
    const by = windowOf();
    if (!by) return false;
    // The controls list: ← → page between the modes.
    if (by === 'help') {
      const d = (key('right') ? 1 : 0) - (key('left') ? 1 : 0);
      if (!d) return false;
      game.screens.stepHelpPage(d);
      return true;
    }
    if (by === 'map') {
      if (!key('confirm')) return false;
      const p = mapMiddle();
      if (p) game.router.clickAt(p.x, p.y);
      return true;
    }
    const dirs = by === 'room' ? ['right', 'left'] : ['down', 'up', 'right', 'left'];
    const dir = dirs.find((d) => key(d)) ?? null;
    const go = key('confirm');
    if (!dir && !go) return false;
    const boxes = walkBoxes(by);
    if (!boxes.length) return true;
    const on = game.pointer.parked === by && walk.by === by;
    // Enter clicks the box the walk stands on; with none, it starts the walk on the first, as an arrow does (a click on the foot's ENTER does
    // something the pilot sees: SX, 2026-10-16, «все элементы ... кликабельны курсором тоже и выполняли свои действия»).
    if (go) {
      if (on) { const p = middle(boxes[Math.min(walk.index, boxes.length - 1)]); game.router.clickAt(p.x, p.y); } else parkWalk(by, boxes, 0);
      return true;
    }
    if (!on) { parkWalk(by, boxes, 0); return true; }
    const cur = boxes[Math.min(walk.index, boxes.length - 1)];
    const next = by === 'room' ? boxes[walk.index + (dir === 'right' ? 1 : -1)] ?? null : stepFrom(boxes, cur, dir);
    if (next && next !== cur) { parkWalk(by, boxes, boxes.indexOf(next)); game.sound.play('menu'); }
    return true;
  }
  function stepWindows() {
    const by = windowOf();
    if (by === 'map' && game.schemes?.keysOnly() && (!game.pointer.parked || game.pointer.parked === 'map')) {
      const p = mapMiddle();
      if (p) cursorPark(game.pointer, p.x, p.y, now(), 'map');
    } else if (game.pointer.parked === 'map' && by !== 'map') letGo('map');
    // A walk follows its box; a window gone, or the mouse moved, ends it.
    if (walk.by && (game.pointer.parked !== walk.by || by !== walk.by)) {
      letGo(walk.by);
      walk.by = null;
      return;
    }
    if (walk.by) {
      const boxes = walkBoxes(walk.by);
      const index = walk.name ? boxes.findIndex((b) => b.name === walk.name) : walk.index;
      if (boxes.length) parkWalk(walk.by, boxes, index < 0 ? walk.index : index);
    }
  }

  // ------------------------------------------------------------------------------------------------ each frame
  // At the frame's start, on the last frame's boxes: the quest plate kept under the pointer as it moves (a plate eases up when one
  // above it goes), a window's walk. A list emptied, a window closed or the mouse moved let the keys' focus go.
  function stepQuests() {
    if (quests.id === null) return;
    if (game.pointer.parked !== 'quests') { quests.id = null; return; }
    const box = plates().find((b) => b.id === quests.id) ?? plates()[0];
    if (!box || game.screens.anyScreen()) { leaveQuests(); return; }
    quests.id = box.id;
    park(box, 'quests');
  }
  function step() {
    stepQuests();
    stepWindows();
  }

  return { quests, questKeys, attachQuests, leaveQuests, holdsArrows, windowKeys, step };
}
