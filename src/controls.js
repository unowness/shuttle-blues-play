// The one bindings table (chat C, SX's item 12, 2026-10-04: «Нужно полностью перепроектировать управление, хочу чтобы почти всем
// можно было управлять чисто с клавиатуры, мышка + клавиатура и просто мышка only должны быть самодостаточными, также обнови
// инструкции»; his picks on labs/graphics/sketches/controls.html, chat C0: K3 F2 B3 R1, the quests on R). Every action of the game,
// the keys that take it and how the mouse takes it, in the two modes the pause's CONTROLS row switches between (SX, 2026-10-07: «С мышью
// у нас в принципе не понятно, давай переключать управление в меню паузы два варианта "клавиатура + клик в кнопки " "мышь + хоткейс"
// в первом случае мышь только может крутить паралакс и нажимать кнопки на экране остальное с клавиатуры, во втором случае кораблем
// управляем только мышью, а действия кнопок можно вызывать как хоткеями так и кликом в экран по ним управление на клавиатуру кораблем не
// задействовано, можно оставить пробел для прыжка в данной раскладке»):
//
//   K    KEYS + CLICKS     the keys fly (an action that `flies`: its keys alone); the mouse leans the parallax and clicks what the
//                          screen shows (a menu's row, a keycap, a window, the map), never a gesture of the flight; the keyboard's
//                          focus stands while the pointer rests (a pause's row, the garage room's thing, the map's middle)
//   M    MOUSE + HOTKEYS   the mouse alone flies (its gestures); every action that does not fly by its key or a click on it on the
//                          screen; no key flies but `mKeys` (Space, the jump)
//
// Until then the three schemes K, MK and M only hinted, and the keys and the mouse both flew in every one (AUTO saw which hands
// played); MK and AUTO went, a kept choice of them reads as K. The keycaps on the screen show their letters in both modes (SX,
// 2026-10-06: «в режиме мышки кнопки клавиатурных шорткатов не убирать»). `checks/controls-coverage.mjs` holds the table: every action
// reachable in both modes, an action that flies by its mode's hand alone, every key the code reads named here, and the other way
// round.
//
// One layout, C0's (SX's word of 2026-10-04: «on by default»): R is the quests (Q and E the jump of grammar D), the lab's respawn a
// drawer button, Enter and the arrows reach the windows. The bindings from before chat C, kept behind the page's `?controls=old` to
// compare, went on 2026-10-08. Rebinding (R1) is a later step: this table is the seam it writes into.
//
// A station or a ship is acted on only through its window's rows up close, in every mode and layout (SX, 2026-10-07: «нет убери клик в
// станцию саму везде только по контекстной меню», «(б) убрать фокус на носу совсем: и со станциями, и с кораблями всё делается только
// через их контекстное окно вблизи»): no click on the thing itself, no key on what the nose points at.
//
// Pure: no DOM.
import { CONFIG } from './config.js';

// ------------------------------------------------------------------------------------------------ the modes

// GAMEPLAY's CONTROLS row, in this order; a new pilot's is KEYS + CLICKS (the orchestrator's pick of 2026-10-07, until SX says).
export const SCHEMES = Object.freeze(['K', 'M']);
export const SCHEME_NAMES = Object.freeze({ K: 'KEYS + CLICKS', M: 'MOUSE + HOTKEYS' });
export const DEFAULT_SCHEME = 'K';
// A kept choice, the old ones too (AUTO, K, MK, M; kept in this browser until 2026-10-07): M stays the mouse's, the rest the keys'.
export const fitScheme = (v) => (v === 'M' ? 'M' : DEFAULT_SCHEME);

// ------------------------------------------------------------------------------------------------ the mouse's ways
// How the mouse takes an action, by name: the help's words for it (`says`), the README's (`how`) and the file that does it (the
// coverage check reads `proof`,
// an export of that file that must name the way, where the way is a list's member: a gesture of the flight). The corner row under the
// shelf (B3: PAUSE, SCREEN, SOUND, HOME) was taken off the screen on SX's word of 2026-10-06 («кнопки для мышки убрать»): the mouse
// pauses on the pilot's screen (its ESC PAUSE), and finds the screen filter, the sound and the home bearing in the pause.

export const MOUSE_WAYS = Object.freeze({
  // The flight (labs/graphics/mouse-flight.js GESTURES; grammar D's mouse, B on the M0 page).
  'hold-l-ahead': { says: 'HOLD L', how: 'hold the left button, the pointer ahead', by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  'hold-l-aside': { says: ' ASIDE', how: "hold the left button; point beside your course", by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  'hold-l-behind': { says: ' BEHIND', how: 'hold the left button, the pointer behind', by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  'pointer': { says: 'POINTER', how: 'the pointer, a button held', by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  'hold-r': { says: 'HOLD R', how: 'hold the right button', by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  'double-l': { says: 'L L, HOLD', how: "double-click and hold the left button, or scroll up", by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  'wheel-up': { says: 'WHEEL UP', how: 'turn the wheel up', by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  'r-in-air': { says: 'R, IN AIR', how: "right-click while airborne", by: 'labs/graphics/mouse-flight.js', proof: 'GESTURES' },
  // What the screen shows, clicked (labs/graphics/input-router.js and the screen's own hit tests).
  'click:row': { says: 'CLICK', how: 'click its row or its [key]', by: 'labs/graphics/clicks.js' },                        // a menu's row, a [KEY] in a panel's text
  'click:away': { says: 'CLICK AWAY', how: 'click outside the window', by: 'labs/graphics/input-router.js' },            // outside the pop-up on top
  'click:banner': { says: 'CLICK', how: 'click the banner', by: 'labs/graphics/notices.js' },
  'click:locator': { says: 'LOCATOR', how: 'click the locator', by: 'labs/graphics/locator.js' },
  'click:legend': { says: 'LEGEND', how: 'click the legend\'s key', by: 'labs/graphics/locator.js' },
  'click:radio': { says: 'RADIO', how: 'click the radio\'s row', by: 'labs/graphics/radio.js' },
  'click:tracker': { says: "RUINS", how: 'click the tracker\'s button', by: 'labs/graphics/tracker.js' },
  'click:deck': { says: 'BUTTON', how: 'click its button on the pilot\'s screen', by: 'labs/graphics/hud.js' },                         // the pilot's screen's C, L, ? and P
  'click:quest': { says: 'CLICK', how: 'click a quest\'s plate', by: 'labs/graphics/quest-list.js' },
  'click:panel': { says: 'CLICK', how: 'click it on the panel', by: 'labs/graphics/screens.js' },                     // a card's tile and lines, a ship, a word
  'click:room': { says: 'CLICK', how: 'click the thing', by: 'labs/graphics/garage-room.js' },
  'click:map': { says: 'CLICK', how: 'click the map', by: 'labs/graphics/map-screen.js' },
  'drag:map': { says: 'DRAG', how: 'drag the map', by: 'labs/graphics/map-screen.js' },
  'wheel:map': { says: 'WHEEL', how: 'the wheel', by: 'labs/graphics/map-screen.js' },
  'drag:panel': { says: 'DRAG', how: 'drag the panel', by: 'labs/graphics/hud-place.js' },
  'click:pause': { says: 'CLICK', how: 'click it in the pause', by: 'labs/graphics/pause-menu.js' },
  'click:title': { says: 'CLICK', how: 'click it', by: 'labs/graphics/title-final.js' },
  'hover': { says: 'POINT', how: 'point at it', by: 'src/hover.js' },
});

// ------------------------------------------------------------------------------------------------ the actions
// One row each: `id` (what the code asks for: `tapped(input, id)`, `keyName(id)`), `name` (what a list of the controls calls it: the
// README's table, R1's rebinding page to come), `on` (where it is read: flight, a screen, the
// page everywhere, the lab), `keys` (KeyboardEvent codes), `via` (the
// keyboard's other way: the actions whose keys it takes), `mouse` (a MOUSE_WAYS name), `flies` (it moves the ship: KEYS + CLICKS takes it by
// its keys alone, MOUSE + HOTKEYS by the mouse alone and `mKeys`), `mKeys` (the keys it keeps in MOUSE + HOTKEYS), `gap` (a mode it is
// not yet reachable in, and why: the check lists them and fails on any other), `lab` (the workshop's: outside the modes), `own` (read
// by another file's own listener, not through the router: the check finds its codes there).

const ROWS = [
  // The flight: grammar D (SX's pick on M0). Read by src/input.js (the verbs) and the input router (the rest).
  { id: 'thrust', name: 'Thrust', on: 'flight', keys: ['KeyW', 'ArrowUp'], mouse: 'hold-l-ahead', flies: true },
  // Grammar D's mouse has no reverse: the pointer behind brakes, then the nose turns to it (C0's M table).
  { id: 'retro', name: 'Reverse thrust', on: 'flight', keys: ['KeyS', 'ArrowDown'], mouse: 'hold-l-behind', flies: true },
  { id: 'turnLeft', name: 'Turn left', on: 'flight', keys: ['KeyA', 'ArrowLeft'], mouse: 'pointer', flies: true },
  { id: 'turnRight', name: 'Turn right', on: 'flight', keys: ['KeyD', 'ArrowRight'], mouse: 'pointer', flies: true },
  { id: 'brake', name: 'Brake', on: 'flight', keys: ['Space'], mouse: 'hold-l-behind', flies: true },
  // The drift is Space with a turn key above 300 u/s (src/drift.js; the game's G1, SX 2026-10-06, a slide with no brake); the tail's
  // swing in the air Space up there (src/trick.js).
  { id: 'drift', name: 'Drift (Space and a turn, above 300 u/s)', on: 'flight', keys: [], via: 'brake turnLeft turnRight', mouse: 'hold-l-aside', flies: true },
  // GAMEPLAY's STEERING SCREEN (src/steering.js; SX, 2026-10-05): the four verbs' keys are one direction on the screen, each key its own
  // side, two a diagonal; the brake with one drifts to it. TANK, the default, is the four rows above as they read.
  { id: 'steer', name: 'SCREEN steering (GAMEPLAY): each key flies toward its side of the screen, two a diagonal; with the brake, a drift to it',
    on: 'flight', keys: [], via: 'thrust turnLeft retro turnRight', mouse: 'hold-l-ahead', flies: true },
  { id: 'fire', name: 'Fire', on: 'flight', keys: ['ShiftLeft', 'ShiftRight'], mouse: 'hold-r', flies: true },
  // The jump and the trick on one pair of keys (SX, 2026-10-05, docs/plans/picks.md «Q and E, jump and trick»): either key jumps, the
  // first pressed, and held keeps the ship up; the other, pressed in the air, plays the figure, turned to its own side (`sides`, one a
  // key in order: -1 the left, 1 the right; src/shipStep.js, `stuntPair` below).
  // The mouse's jump and figure have no side (its pass is in BACKLOG). In MOUSE + HOTKEYS Space is the jump, the one key that flies
  // there (SX, 2026-10-07: «можно оставить пробел для прыжка в данной раскладке»).
  { id: 'jump', name: "Jump with either key; hold to stay airborne", on: 'flight', keys: ['KeyQ', 'KeyE'], sides: [-1, 1],
    mouse: 'double-l', shares: ['nextQuest', 'figure'], flies: true, mKeys: ['Space'] },
  { id: 'figure', name: "Trick in the air: the other key sets the side", on: 'flight', keys: ['KeyQ', 'KeyE'],
    mouse: 'r-in-air', shares: ['jump'], flies: true },
  { id: 'undock', name: 'Leave a berth', on: 'flight', keys: ['KeyW', 'ArrowUp'], mouse: 'click:row', shares: ['thrust'], flies: true },
  // Near an object: its window's rows, the one way to act on a station or a ship (no click on the thing, no key on the nose's pick).
  { id: 'choices', name: "Choose a menu action", on: 'flight', keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], mouse: 'click:row' },
  { id: 'close', name: 'Close', on: 'everywhere', keys: ['Digit0'], mouse: 'click:away' },
  { id: 'back', name: 'Back, close, pause', on: 'everywhere', keys: ['Escape'], mouse: 'click:away' },
  { id: 'banner', name: "Open or acknowledge a notice", on: 'flight', keys: ['Enter', 'NumpadEnter'], mouse: 'click:banner' },
  // The pilot and the cockpit.
  // M the map, P the pilot card, the pause on Escape alone, the legend on N (SX, 2026-10-16: «M карта, P карточка пилота ... давай перераспределим
  // и исправим»): the map keeps TAB as its second key; P again, or Escape, closes the card.
  { id: 'map', name: 'Map', on: 'flight', keys: ['KeyM', 'Tab'], mouse: 'click:locator' },
  { id: 'card', name: 'Pilot card', on: 'flight', keys: ['KeyP'], mouse: 'click:deck' },
  { id: 'sign', name: 'Leave a sign', on: 'flight', keys: ['KeyL'], mouse: 'click:deck' },
  { id: 'help', name: 'Controls', on: 'everywhere', keys: ['Slash', 'F1'], mouse: 'click:deck' },
  // R attaches the keys to the quest list (arrows, Enter, Escape); Q is the jump.
  { id: 'nextQuest', name: "Focus the quest list", on: 'flight', keys: ['KeyR'], mouse: 'click:quest' },
  { id: 'listUp', name: 'Quest list: up', on: 'quests', keys: ['ArrowUp'], mouse: 'click:quest' },
  { id: 'listDown', name: 'Quest list: down', on: 'quests', keys: ['ArrowDown'], mouse: 'click:quest' },
  // In the pause, GAMEPLAY's HOME BEARING (labs/graphics/pause.js); the pause itself, the pilot's screen's ESC PAUSE (labs/graphics/hud.js): Escape,
  // which pauses once nothing else it closes is open (labs/graphics/input-router.js), since P went to the pilot card (2026-10-16).
  { id: 'homeGuide', name: 'Home bearing', on: 'flight', keys: ['KeyG'], mouse: 'click:pause' },
  { id: 'pause', name: 'Pause', on: 'flight', keys: ['Escape'], mouse: 'click:deck', shares: ['back'] },
  { id: 'legend', name: 'Locator legend', on: 'flight', keys: ['KeyN'], mouse: 'click:legend', shares: ['rename'] },
  // The radio under the quests shown or hidden to its row (SX's W1 POCKET, 2026-10-05; labs/graphics/radio.js). T: free in the flight
  // (the sign composer's T is its own screen's), beside R QUESTS on the keyboard.
  { id: 'radio', name: 'Radio: show or hide', on: 'flight', keys: ['KeyT'], mouse: 'click:radio' },
  // The ruins' tracker on the deck's left shoulder, shown or hidden (SX, 2026-10-08: «позволил бы скрывать как и легенду»; labs/graphics/
  // tracker.js). B: free in the flight, as the legend's M and the radio's T are.
  { id: 'tracker', name: "Ruin tracker: show or hide", on: 'flight', keys: ['KeyB'], mouse: 'click:tracker' },
  // The camera's height over the world (src/zoom.js; SX, 2026-10-17: «в идеале было бы прикольно на плюс-минус дать пользователю выбирать
  // масштаб»): − a step higher, more of the world in the screen, = a step lower; in the pause, GRAPHICS's CAMERA (the wheel is the jump in
  // grammar D, so the mouse's way is the pause's row). Free everywhere; with Cmd or Ctrl they stay the browser's own zoom (src/input.js).
  { id: 'cameraUp', name: 'Camera: higher, more of the world', on: 'flight', keys: ['Minus'], mouse: 'click:pause' },
  { id: 'cameraDown', name: 'Camera: lower', on: 'flight', keys: ['Equal'], mouse: 'click:pause' },
  // In the pause: GRAPHICS's DISPLAY and AUDIO's SOUND.
  { id: 'display', name: 'Screen filter', on: 'page', keys: ['KeyV'], mouse: 'click:pause' },
  { id: 'sound', name: 'Sound on / off', on: 'page', keys: ['KeyO'], mouse: 'click:pause' },
  { id: 'nextCursor', name: 'Next cursor', on: 'page', keys: ['KeyK'], mouse: 'click:pause' },
  // The screens: each owns its keys while it stands, the flight's let go under it.
  { id: 'left', name: 'Choose: left', on: 'screens', keys: ['ArrowLeft', 'KeyA'], mouse: 'click:panel' },
  { id: 'right', name: 'Choose: right', on: 'screens', keys: ['ArrowRight', 'KeyD'], mouse: 'click:panel' },
  { id: 'up', name: 'Choose: up', on: 'screens', keys: ['ArrowUp', 'KeyW'], mouse: 'click:panel' },
  { id: 'down', name: 'Choose: down', on: 'screens', keys: ['ArrowDown', 'KeyS'], mouse: 'click:panel' },
  // Enter (or Space, where the flight is not under it) clicks where the keyboard's focus is parked: a pause's row, a thing of the
  // garage's room, the middle of the map (a flag put there).
  { id: 'confirm', name: "Confirm selection", on: 'screens', keys: ['Enter', 'NumpadEnter', 'Space'], mouse: 'click:pause' },
  // The name is typed (C0 conflict 11 would give the mouse a grid of letters on the card): N in both modes, the keyboard being there for the
  // hotkeys in MOUSE + HOTKEYS too (no gap since 2026-10-07).
  { id: 'rename', name: 'Pilot card: name', on: 'card', keys: ['KeyN'], mouse: null },
  { id: 'nextPaint', name: 'Pilot card: paint', on: 'card', keys: ['KeyC'], mouse: 'click:panel' },
  { id: 'nextCockpit', name: 'Pilot card: cockpit', on: 'card', keys: ['KeyK'], mouse: 'click:panel', shares: ['nextCursor'] },
  { id: 'nextLook', name: 'Pilot card: look', on: 'card', keys: ['KeyL'], mouse: 'click:panel', shares: ['sign'] },
  // The charm that hangs from the locator (labs/graphics/charm.js; SX, 2026-10-08: «можно отключить отображание сувенира в карточке
  // пилота»): none, then each souvenir found, in the order found. J, beside K and L, free everywhere.
  { id: 'nextCharm', name: 'Pilot card: charm', on: 'card', keys: ['KeyJ'], mouse: 'click:panel' },
  { id: 'choose', name: 'Hangar: buy or fly', on: 'hangar', keys: ['Digit1', 'Enter'], mouse: 'click:row' },
  { id: 'addWord', name: 'Sign: add the word', on: 'sign', keys: ['Enter', 'NumpadEnter'], mouse: 'click:panel' },
  { id: 'removeWord', name: 'Sign: take a word off', on: 'sign', keys: ['Backspace'], mouse: 'click:row' },
  { id: 'signType', name: 'Sign: its type', on: 'sign', keys: ['KeyT'], mouse: 'click:row' },
  { id: 'placeSign', name: 'Sign: leave it', on: 'sign', keys: ['KeyL'], mouse: 'click:row', shares: ['sign'] },
  { id: 'zoomIn', name: 'Map: zoom in', on: 'map', keys: ['KeyE'], mouse: 'wheel:map', shares: ['figure'] },
  { id: 'zoomOut', name: 'Map: zoom out', on: 'map', keys: ['KeyQ'], mouse: 'wheel:map', shares: ['jump', 'nextQuest'] },
  { id: 'fit', name: 'Map: the whole map', on: 'map', keys: ['KeyF'], mouse: 'click:row' },
  { id: 'mapPan', name: 'Map: move', on: 'map', keys: [], via: 'up down left right', mouse: 'drag:map' },
  { id: 'flagPut', name: 'Map: put a flag', on: 'map', keys: [], via: 'confirm', mouse: 'click:map' },
  { id: 'roomThing', name: 'Garage room: its things', on: 'room', keys: [], via: 'left right confirm', mouse: 'click:room' },
  // The hangar from the home garage's room (SX, 2026-10-13: «делаем в комнате кнопку change starship и выход, а клик по кораблю ведет на выбор
  // корабля»): S, STARSHIP; the room's arrows are ← → alone, so the screens' ↓ never meets it there.
  { id: 'changeShip', name: 'Garage room: change starship', on: 'room', keys: ['KeyS'], mouse: 'click:room', shares: ['down'] },
  { id: 'pauseRow', name: 'Pause: its rows', on: 'pause', keys: [], via: 'up down left right confirm', mouse: 'click:pause' },
  // The LAYOUT page (chat P): a group taken from its row (Enter), moved by the arrows 4 px a press, put down by Enter; C0 conflict 12's
  // gap closed. 16 px a press with Shift held.
  { id: 'layoutDrag', name: 'Pause: move the panels', on: 'pause', keys: [], via: 'up down left right confirm', mouse: 'drag:panel' },
  { id: 'layoutFar', name: 'Pause: a panel 16 px a press', on: 'pause', keys: ['ShiftLeft', 'ShiftRight'], mouse: 'drag:panel' },
  { id: 'helpScheme', name: 'Controls: the scheme\'s page', on: 'help', keys: [], via: 'left right', mouse: 'click:row' },
  // The title's menu reads its own keys (labs/graphics/title-final.js bindTitleMenu).
  { id: 'titleMove', name: 'Title: choose', on: 'title', keys: ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'], mouse: 'click:title', own: 'labs/graphics/title-final.js' },
  { id: 'titleChoose', name: 'Title: go', on: 'title', keys: ['Enter', 'Space'], mouse: 'click:title', own: 'labs/graphics/title-final.js' },
  // The lab's workshop, outside the schemes: diagnostics (H). Its respawn on the lab's own save is a drawer button (R is the quests).
  { id: 'diagnostics', name: 'Lab: diagnostics', on: 'lab', keys: ['KeyH'], lab: true },
];

export const ACTIONS = Object.freeze(ROWS.map((row) => Object.freeze({ ...row, keys: Object.freeze([...row.keys]),
  ...(row.sides ? { sides: Object.freeze([...row.sides]) } : {}), ...(row.mKeys ? { mKeys: Object.freeze([...row.mKeys]) } : {}) })));
const byId = new Map(ACTIONS.map((a) => [a.id, a]));
export const actionById = (id) => byId.get(id) ?? null;

// ------------------------------------------------------------------------------------------------ the keys

// The verbs src/input.js reads every step (thrust, retro, turn, the brake, fire), each by its codes in the table.
export const FLIGHT_VERBS = Object.freeze(['thrust', 'retro', 'turnLeft', 'turnRight', 'brake', 'fire']);
// The router's KEYS (labs/graphics/input-router.js re-exports it): every action of the keyboard outside the flight's verbs (those are
// src/input.js's), and its keys; an action with no key is not in it.
export const KEYS = (() => {
  const out = {};
  for (const a of ACTIONS) if (!a.own && a.keys.length && !FLIGHT_VERBS.includes(a.id)) out[a.id] = a.keys;
  return Object.freeze(out);
})();
// An action's codes (the flight's verbs too), or none.
const NONE = Object.freeze([]);
export const codesOf = (id) => byId.get(id)?.keys ?? NONE;
// An action's codes in a mode: in MOUSE + HOTKEYS one that flies keeps only its `mKeys` (the jump's Space), no key flying the ship
// there; else the layout's.
export function codesIn(id, scheme) {
  const a = byId.get(id);
  if (!a) return NONE;
  return scheme === 'M' && a.flies ? a.mKeys ?? NONE : a.keys;
}
// Whether a mouse way is a gesture of the flight (labs/graphics/mouse-flight.js GESTURES), which KEYS + CLICKS never takes: its mouse
// only leans the parallax and clicks.
export const flightGesture = (way) => MOUSE_WAYS[way]?.proof === 'GESTURES';
// An action's mouse way in a mode, or null: KEYS + CLICKS takes the clicks alone, MOUSE + HOTKEYS every way.
export function mouseIn(id, scheme) {
  const way = byId.get(id)?.mouse ?? null;
  return way && scheme === 'K' && flightGesture(way) ? null : way;
}

// The pair the jump and the trick share, its keys by side ({ left: [codes], right: [codes] }): the input router sends the world each
// side held (src/shipStep.js reads the rule).
const JUMP = byId.get('jump');
const STUNT_PAIR = Object.freeze({ left: JUMP.keys.filter((_, i) => JUMP.sides[i] < 0), right: JUMP.keys.filter((_, i) => JUMP.sides[i] > 0) });
export const stuntPair = () => STUNT_PAIR;

// ------------------------------------------------------------------------------------------------ names on screen
// A code as the interface writes it, and back (labs/graphics/clicks.js keyCodeOf reads these names: a drawn key is a button).

const NAMES = { Space: 'SPACE', Escape: 'ESC', Tab: 'TAB', Enter: 'ENTER', NumpadEnter: 'ENTER', Backspace: 'BKSP', Slash: '?',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', Minus: '-', Equal: '=' };
export function codeName(code) {
  if (NAMES[code]) return NAMES[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code);
  if (m) return m[1];
  return String(code);
}
// The first key of an action as drawn ('C', 'TAB', '?'), or '' when it has none.
export function keyName(id) {
  const codes = codesOf(id);
  return codes.length ? codeName(codes[0]) : '';
}
// Every key of the actions, as the help lists them: one action's keys joined ('W / ↑', 'SHIFT'), two actions' paired key by key
// ('A D / ← →'), and so more of as many keys each (the four directions: 'W A S D / ↑ ← ↓ →'), the menu's numbers as a range ('1-7').
export function keyText(ids, { range = 0, scheme = null } = {}) {
  const lists = ids.map((id) => [...new Set((scheme ? codesIn(id, scheme) : codesOf(id)).map(codeName))]);
  if (range) { const all = lists.flat(); return all.length ? `${all[0]}-${all[Math.min(range, all.length) - 1]}` : ''; }
  if (lists.length >= 2 && lists.every((l) => l.length > 1) && (lists.length === 2 || lists.every((l) => l.length === lists[0].length))) {
    return lists[0].map((_, i) => lists.map((l) => l[i] ?? '').join(' ').trim()).join(' / ');
  }
  return lists.flat().join(' / ');
}

// ------------------------------------------------------------------------------------------------ the help (? / F1)
// What the controls list says, group by group, from the table: a row's key cell is { keys: [ids] } (their names, as keyText
// writes them; `scheme` the keys a mode keeps, MOUSE + HOTKEYS's Space), { range: [id, n] }, { mouse: way } (MOUSE_WAYS' words), or
// { words } (a way that is no key: a click); its description may name an action's key as {id}. A row that needs
// what not every hull can (src/chassis.js `can`: SCOOTY JR. neither drifts nor fires) says so third: `{ fire: null }` the row is left
// out for a hull that cannot, `{ drift: 'Brake' }` it says that instead. A row of one way of steering (src/steering.js, GAMEPLAY's
// STEERING) says that third too, `{ steer: 'tank' }` or `{ steer: 'screen' }`: shown only while the keys steer so.

const k = (...ids) => ({ keys: ids });
// An object's menu lists this many rows, numbered from 1 (CONFIG.interaction.maxActions).
const MENU_ROWS = CONFIG.interaction.maxActions;
const NO_FIRE = Object.freeze({ fire: null }), NO_DRIFT = Object.freeze({ drift: null }), BRAKE = Object.freeze({ drift: 'Brake' });
const TANK = Object.freeze({ steer: 'tank' }), SCREEN = Object.freeze({ steer: 'screen' });
const TANK_BRAKE = Object.freeze({ ...BRAKE, ...TANK }), SCREEN_BRAKE = Object.freeze({ ...BRAKE, ...SCREEN });
// SCREEN's four directions (the four verbs' keys), in the order a list writes them: 'W A S D / ↑ ← ↓ →' (keyText).
const DIRECTIONS = Object.freeze(['thrust', 'turnLeft', 'retro', 'turnRight']);
const SCREEN_FLY = "Fly in the key's direction";
const HELP = {};
const PILOT_NEXT = ['PILOT', [[k('map'), 'Map'], [k('card'), 'Pilot card'], [k('sign'), 'Leave a sign'], [k('nextQuest'), 'Quests'],
  [k('homeGuide'), 'Home bearing'], [k('pause'), 'Pause']]];
const DISPLAY_NEXT = ['DISPLAY', [[k('legend'), 'Locator legend'], [k('radio'), 'Radio'], [k('tracker'), "Ruin tracker"], [k('display'), 'Screen filter'],
  [k('sound'), 'Sound on / off'], [k('nextCursor'), 'Cursor']]];
// The camera's height (src/zoom.js), the last row of the keys' FLY (the columns of PILOT and DISPLAY are as tall as the window may be, and
// MOUSE + HOTKEYS's are full: its pilot finds it in the pause's GRAPHICS > CAMERA, the mouse's way to it).
const CAMERA = [k('cameraUp', 'cameraDown'), 'Camera higher / lower'];
// A page for each mode (C0's pages of controls.html, «Справка», since 2026-10-07 two), the mode the pilot plays in first, ← → to the
// other. KEYS + CLICKS: the keys fly, a click does what it does on the screen. MOUSE + HOTKEYS: the mouse flies, Space jumps, every key
// of the PILOT and DISPLAY lists still works, a keycap on the screen is a button.
HELP.K = [
  [['FLY', [[k('thrust'), 'Thrust', TANK], [k('retro'), 'Reverse thrust', TANK], [k('turnLeft', 'turnRight'), 'Turn', TANK],
    [k('thrust', 'turnLeft', 'retro', 'turnRight'), SCREEN_FLY, SCREEN], [k('brake'), 'Brake, drift in turns', TANK_BRAKE],
    [k('brake'), 'Brake, drift to a side', SCREEN_BRAKE], [k('fire'), 'Fire', NO_FIRE], [k('jump'), 'Jump; hold to stay airborne'],
    [k('figure'), 'Trick: press the other key'], CAMERA]],
  ['NEAR AN OBJECT', [[{ range: ['choices', MENU_ROWS] }, "Choose or click an action"], [k('close', 'back'), 'Close, or click away'],
    [k('banner'), 'Open the notice']]]],
  [PILOT_NEXT, DISPLAY_NEXT],
];
HELP.M = [
  [['FLY', [[{ mouse: 'hold-l-ahead' }, 'Fly to the cursor'], [{ mouse: 'hold-l-aside' }, 'Drift, when fast', NO_DRIFT], [{ mouse: 'hold-l-behind' }, 'Brake'],
    [{ mouse: 'hold-r' }, 'Fire', NO_FIRE], [{ keys: ['jump'], scheme: 'M' }, 'Jump; hold to stay airborne'], [{ mouse: 'double-l' }, 'Jump; or WHEEL UP'],
    [{ mouse: 'r-in-air' }, 'Trick']]],
  ['CLICK', [[{ words: 'A ROW' }, 'Choose'], [{ words: 'A KEY' }, "Use shortcut"], [{ words: 'AWAY' }, 'Close']]]],
  [PILOT_NEXT, DISPLAY_NEXT, ['TRACKPAD', [[{ words: '2 FINGERS' }, 'Right button']]]],
];
export const HELP_INTRO = Object.freeze({
  K: "Deliver cargo for CR. Dock for fuel and repairs. {map} opens the map.",
  M: "Deliver cargo for CR. Dock for fuel and repairs. Click the locator for the map.",
});

// A help cell as drawn: a string.
function cellOf(c) {
  if (c.words !== undefined) return c.words;
  if (c.mouse) return MOUSE_WAYS[c.mouse]?.says ?? c.mouse;
  if (c.range) return keyText([c.range[0]], { range: c.range[1] });
  return keyText(c.keys, { scheme: c.scheme ?? null });
}
// A description with its {id} named by the table.
export const fillKeys = (text) => String(text).replace(/\{(\w+)\}/g, (_, id) => keyText([id]));
// The controls list's columns for a page (a mode: K, M): [[heading, [[key, words]]]] per column, every
// key read from the table now, for a hull that can do what `can` says (src/chassis.js; every hull's by default), the keys steering as
// `steering` says (src/steering.js: 'tank', the default, or 'screen'); and its intro.
export function helpColumns(page, can = null, steering = 'tank') {
  const groups = HELP[page] ?? HELP[DEFAULT_SCHEME];
  const fit = (rows) => rows.flatMap(([cell, words, needs]) => {
    let say = words;
    for (const [what, instead] of Object.entries(needs ?? {})) {
      if (what === 'steer') { if (instead !== steering) return []; continue; }
      if (can?.[what] !== false) continue;
      if (instead === null) return [];
      say = instead;
    }
    return [[cellOf(cell), fillKeys(say)]];
  });
  return groups.map((col) => col.map(([heading, rows]) => [heading, fit(rows)]));
}
export const helpIntro = (page) => fillKeys(HELP_INTRO[page] ?? HELP_INTRO[DEFAULT_SCHEME]);

// ------------------------------------------------------------------------------------------------ the garage room's plate
// The room's own keys (labs/graphics/garage-room.js, the plate at its top right), as the mode reads them. The words
// are the S5 sketch's (labs/graphics/sketches/garage-interior.html: LOOK AROUND, USE; SX on the picks hub, 2026-10-04), the keys the
// table's.

export function roomControls(page) {
  const leave = { key: keyName('back'), label: 'LEAVE GARAGE' }, card = { key: keyName('card'), label: 'PILOT CARD' };
  const change = { key: keyName('changeShip'), label: 'CHANGE STARSHIP' };
  if (page === 'M') return [{ key: 'POINT', label: 'LOOK AROUND' }, { key: 'CLICK', label: 'USE' }, leave, { key: 'SHUTTLE', label: 'CHANGE STARSHIP' }, { key: 'ARMCHAIR', label: 'PILOT CARD' }];
  return [leave, change, card, { key: `${keyName('left')} ${keyName('right')}`, label: 'LOOK AROUND' }, { key: keyName('confirm'), label: 'USE' }];
}

// ------------------------------------------------------------------------------------------------ a lesson's words
// How a lesson, a banner or a hint names an action for the mode the pilot plays in (C0: «уроки начала, баннеры и справка читают
// схему так же: держи Space в повороте или уведи указатель вбок»): its keys in KEYS + CLICKS, the mouse's way in MOUSE + HOTKEYS. The
// opening (src/opening.js) names its lessons by action ('brake', 'map'); this is what it shows for them.
export function hintFor(id, scheme = DEFAULT_SCHEME) {
  const a = byId.get(id);
  if (!a) return '';
  if (scheme === 'M') return a.mouse ? (MOUSE_WAYS[a.mouse]?.how ?? '').toUpperCase() : '';
  return wayOfKeys(a);
}

// A mouse way as a hint says it: the table's own words, the flight's three holds in full (the table writes the two after 'HOLD L' as the rest
// of it, for the list under it: ' ASIDE', ' BEHIND').
export function mouseSays(way) {
  const says = MOUSE_WAYS[way]?.says ?? '';
  return says.startsWith(' ') ? MOUSE_WAYS['hold-l-ahead'].says + says : says;
}

// The way a skill's one-time hint names (src/skillHints.js; SX, 2026-10-09, «берем Т4 by the ship»): a cell as the controls list writes one
// (labs/graphics/swiss-window.js keyTokens tells a cell of keys from words): the keys the mode flies it by ('SPACE', 'SPACE A D', 'Q E', each
// drawn as a cap) or, where the mode has no key for it, the mouse's own words ('HOLD L BEHIND'). A skill is the action it is named for: the
// brake, the fire, the drift (the brake and a turn's two keys, `via`), the jump, and the trick, which is the figure's key; `by` the side of the
// key that jumped (World.air.by: -1 the pair's left, 1 its right), so the key shown for the trick is the other one, the one that plays it.
// The first flight's (SX, 2026-10-09: «W чтобы ехать вперед ... АД, чтобы рулить, С, чтобы назад»): the thrust, the turn's two (one way, `turn`) and
// the reverse (`back`, the steering's second), each by its first key, the letter, as he says them; the four round the ship (SX, 2026-10-16:
// «w внизу, s наверху a d слева и справа»), each its own (`left`, `right`). The tutorial's (2026-10-16): the screen filter, the controls list,
// the map, the pilot card and the sign, each by its first key; and the trick as it is played from the ground, `combo`: the pair's left key that
// jumps, then its right that plays the figure («q -> e трюк»; the mouse's trick has no pair, its words).
const SKILL_ACTIONS = Object.freeze({ thrust: 'thrust', steer: 'turnLeft turnRight', back: 'retro', left: 'turnLeft', right: 'turnRight',
  brake: 'brake', fire: 'fire', drift: 'drift', jump: 'jump', trick: 'figure', combo: 'figure', display: 'display', help: 'help', map: 'map',
  card: 'card', sign: 'sign' });
const FIRST_KEY = new Set(['thrust', 'steer', 'back', 'left', 'right', 'display', 'help', 'map', 'card', 'sign']);
export function skillWay(skill, scheme = DEFAULT_SCHEME, by = 0) {
  const ids = (SKILL_ACTIONS[skill] ?? '').split(' '), a = byId.get(ids[0]);
  if (!a) return '';
  const names = (codes) => [...new Set(codes.map(codeName))].join(' ');
  if (scheme === 'M') { const codes = codesIn(a.id, 'M'); return names(FIRST_KEY.has(skill) ? codes.slice(0, 1) : codes) || mouseSays(a.mouse); }
  if (skill === 'combo') return names([STUNT_PAIR.left[0], STUNT_PAIR.right[0]]);
  if (skill === 'trick') return names(by < 0 ? STUNT_PAIR.right : by > 0 ? STUNT_PAIR.left : a.keys);
  if (FIRST_KEY.has(skill)) return names(ids.map((id) => codesOf(id)[0]));
  return names(a.via ? a.via.split(' ').map((id) => codesOf(id)[0]) : a.keys);
}

// ------------------------------------------------------------------------------------------------ the README's table
// The README's controls (`node tools/controls-table.mjs` prints it; checks/controls-coverage.mjs holds the README to it): the flight's
// and the cockpit's actions, in each mode: KEYS + CLICKS (the keys; a click where the screen shows it) and
// MOUSE + HOTKEYS (the mouse's way; the key where the action does not fly, and the jump's Space). Each screen says its own keys on
// itself.
const README_PLACES = ['flight', 'quests', 'page', 'everywhere'];
function wayOfKeys(a, scheme = null) {
  const codes = scheme ? codesIn(a.id, scheme) : codesOf(a.id);
  const keys = !codes.length ? '' : a.id === 'choices' ? keyText([a.id], { range: MENU_ROWS }) : keyText([a.id], { scheme });
  if (!a.via) return keys;
  if (scheme === 'M' && a.flies) return keys;
  // The four directions read as one cell, as the help writes them ('W A S D / ↑ ← ↓ →').
  if (a.via === DIRECTIONS.join(' ')) return keyText([...DIRECTIONS]);
  // A turn's two keys read as one, as the help writes them ('A D / ← →').
  const ids = a.via.split(' '), out = [];
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === 'turnLeft' && ids[i + 1] === 'turnRight') { out.push(keyText(['turnLeft', 'turnRight'])); i++; } else out.push(keyText([ids[i]]));
  }
  return out.join(' + ');
}
const howOf = (way) => (way ? MOUSE_WAYS[way]?.how ?? way : '');
export function readmeTable() {
  const lines = [`| Action | ${SCHEME_NAMES.K} | ${SCHEME_NAMES.M} |`, '|---|---|---|'];
  for (const a of ACTIONS) {
    if (a.lab || a.own || !README_PLACES.includes(a.on)) continue;
    const K = [wayOfKeys(a), howOf(mouseIn(a.id, 'K'))].filter(Boolean).join(', or ') || `(${a.gap?.K ?? 'none'})`;
    const M = [howOf(mouseIn(a.id, 'M')), wayOfKeys(a, 'M')].filter(Boolean).join(', or ') || `(${a.gap?.M ?? 'none'})`;
    lines.push(`| ${a.name} | ${K} | ${M} |`);
  }
  return lines.join('\n');
}
