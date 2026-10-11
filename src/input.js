import { codesOf } from './controls.js';
import { keysAim } from './steering.js';

// The keys whose browser default the game takes (src/controls.js names them): the flight's verbs (W A S D, the arrows, Space,
// Shift); F1 and Slash, the help (F1 would open the browser's own help, and Slash starts a quick-find in some browsers);
// Backspace, which the sign composer takes a word back with and some browsers can be set to read as "go back a page"; Tab, the map
// (labs/graphics/map-screen.js), where the browser would move the focus.
const TRACKED_ACTIONS = Object.freeze(['thrust', 'retro', 'turnLeft', 'turnRight', 'brake', 'fire', 'help', 'removeWord', 'map']);

// Letting go of one of these clears every held key (see the keyup handler).
const MODIFIER_CODES = new Set(['MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight']);

// A focused text field, select or contenteditable owns its own keystrokes.
// Typing a nickname or a lobby code must not thrust, turn or fire.
function editableHasFocus() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable === true;
}

export class Input {
  constructor() {
    const TRACKED = new Set(TRACKED_ACTIONS.flatMap((id) => codesOf(id)));
    this.down = new Set();
    this.pressed = new Set();   // edge-triggered, cleared each frame

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (editableHasFocus()) return;
      // Cmd/Ctrl/Alt with a key is the browser's or the system's (Cmd+R reload,
      // Cmd+C copy, Cmd+P print), not the game's: it must not wreck the ship,
      // open the pilot card or pause, and the browser keeps its default.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (TRACKED.has(e.code)) e.preventDefault();
      this.down.add(e.code);
      this.pressed.add(e.code);
    });

    // Key release is always processed, even while a field has focus: a key held
    // before focus moved must still be released, or thrust would stick on.
    window.addEventListener('keyup', (e) => {
      if (TRACKED.has(e.code) && !editableHasFocus()) e.preventDefault();
      this.down.delete(e.code);
      // macOS sends no keyup for a key let go while Cmd is held, so a key held
      // before the shortcut would stay down for good. Letting go of Cmd or Ctrl
      // drops everything held; at worst a key still held needs one fresh press.
      if (MODIFIER_CODES.has(e.code)) this.down.clear();
    });

    window.addEventListener('blur', () => this.down.clear());
    // Focus moving into a field drops whatever was held, for the same reason.
    document.addEventListener('focusin', () => {
      if (editableHasFocus()) this.down.clear();
    });
  }

  held(...codes) { return codes.some((c) => this.down.has(c)); }
  tapped(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }

  // The flight's verbs, each by its keys in the table (src/controls.js). -1 .. 1, negative is counter-clockwise.
  get turn() {
    return (this.held(...codesOf('turnRight')) ? 1 : 0) - (this.held(...codesOf('turnLeft')) ? 1 : 0);
  }
  // The turn the drift reads (src/drift.js driftTurn): the side of a turn key held, and with both held the one pressed first (SX,
  // 2026-10-05: «пробел плюс кнопка направления, это занос по выбранному направлению»). The held keys are kept in the order they went
  // down (a Set keeps its insertion order; a key let go and pressed again goes to the end).
  get driftTurn() {
    for (const code of this.down) {
      if (codesOf('turnRight').includes(code)) return 1;
      if (codesOf('turnLeft').includes(code)) return -1;
    }
    return 0;
  }
  // The way the four direction keys point on the screen, for GAMEPLAY's STEERING SCREEN (src/steering.js keysAim): the thrust's keys up,
  // the reverse's down, the turns' left and right, rad; null with none held. `freed`: codes left out (the quest list's ↑ ↓ while it
  // holds them, labs/graphics/key-focus.js).
  aimOf(freed = []) { return keysAim((id) => codesOf(id).some((c) => !freed.includes(c) && this.down.has(c))); }
  get thrust() { return this.held(...codesOf('thrust')); }
  get retro() { return this.held(...codesOf('retro')); }
  // SX, 2026-09-24: the brake (dampers) is on Space, fire on Shift.
  get damp() { return this.held(...codesOf('brake')); }
  get fire() { return this.held(...codesOf('fire')); }
}
