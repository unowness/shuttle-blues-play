import { SCREENS, SCREEN_START } from './filmGrade.js';
import { Screen } from './filmGradeScreen.js';
import { projectToScreen, unprojectFromScreen } from './crt.js';
import { PREFS, readDisplay, writeDisplay } from './prefs.js';

// The game's screen, one at a time, V stepping through them: CRT, LCD, VHS and FLAT (SX, 2026-10-02: «Ещё экраны:
// изогнутый CRT как база, LCD, VHS ... Цифры мои, лежат в film-grade.js»; the handoff: «ровного интерфейса не будем
// больше делать. Может, только для проверок оставим. Но база теперь вот такой изогнутый»).
//
// The screens are SX's, tuned in his editor (labs/graphics/sketches/film-grade.html) and drawn by his module
// (film-grade-screen.js, a `Screen`), so there is one drawing and one table of numbers: the modes, their order, their
// labels and every setting come from SCREENS and SCREEN_START of film-grade.js, none is copied here. SX tunes there; the
// game follows. A screen is texture and motion only: no colour of its own, no CSS filter, no lifted black (SX rejected
// the first LCD and VHS for shifting colour: «за цвет у нас цветовые гаммы решают»). FLAT is no glass at all, kept for
// checks.
//
// No WebGL, as in src/crt.js (a shader over a Canvas 2D game costs Firefox and Safari 16-25 ms a frame for the copy):
// the screen's texture is drawn canvas to canvas, then the tube's two passes of strips, then the veil (rounded corners
// and vignette) as a static canvas the browser lays over them.
//
// Presentation only: nothing the game computes reads any of this back, except the pointer and the few HTML things laid
// over the canvas, which go through project() and unproject() so that what the player sees bent is where it answers.
// A display choice of this browser, kept apart from the save.

export const DISPLAY_MODES = Object.freeze(Object.keys(SCREENS));
export const DISPLAY_LABELS = Object.freeze(Object.fromEntries(DISPLAY_MODES.map((mode) => [mode, SCREENS[mode].label])));

// What a browser starts on, and what anything unknown means: the curved tube.
export const START_MODE = PREFS.display.fallback;
export const FLAT_MODE = 'flat';

// The preference's key is src/prefs.js's (`spaser.display.v2`). v1 (2026-10-02, the first filters: off, crt, lcd, vhs) is not read:
// a browser that had `off` stored from trying them would otherwise never meet the new base. A new key puts every browser on CRT
// once, and from its first V on the choice is kept.
export const readDisplayMode = (store) => readDisplay(DISPLAY_MODES, store);
export const writeDisplayMode = (mode, store) => writeDisplay(mode, store);

export const nextDisplayMode = (mode) => DISPLAY_MODES[(DISPLAY_MODES.indexOf(mode) + 1) % DISPLAY_MODES.length];

// The face the page talks to: render(), project(), unproject(), enabled, mode, setMode(), next().
//
// `source` is the game's 2D canvas, `target` the canvas laid over it that the screen draws on (the page's #crt), `doc`
// the page. The screen is made on first use, so FLAT from the start makes nothing. `start` is the settings table to
// read: SX's, unless a check hands in another.
export class Display {
  constructor(source, target, { doc = globalThis.document, now = () => performance.now(), start = SCREEN_START } = {}) {
    this.source = source;
    this.target = target;
    this.doc = doc;
    this.now = now;
    this.start = start;
    this.screen = null;
    this.mode = FLAT_MODE;
    this.available = !!doc;
    this.error = null;
  }

  get enabled() { return this.mode !== FLAT_MODE; }

  // Turns `mode` on; a name that is not a mode means the base, a screen that cannot be had (no 2D canvas) leaves the
  // display flat and says why. Returns the mode now on.
  setMode(mode) {
    if (!DISPLAY_MODES.includes(mode)) mode = START_MODE;
    if (mode !== FLAT_MODE && !this.screen) {
      try {
        this.screen = new Screen(this.source, this.doc, { target: this.target, zIndex: 1 });
      } catch (error) {
        this.available = false;
        this.error = error?.message || 'no 2d canvas';
        mode = FLAT_MODE;
      }
    }
    this.mode = mode;
    if (this.screen) {
      this.screen.set(mode, this.start[mode]);
      // Flat is drawn by hiding both canvases: said now, not at the next frame.
      if (mode === FLAT_MODE) this.screen.render(0);
    }
    return this.mode;
  }

  next() { return this.setMode(nextDisplayMode(this.mode)); }

  // Once a frame, after everything else has been drawn: the finished frame through the screen.
  render() {
    const { screen, source } = this;
    if (!screen || this.mode === FLAT_MODE) return;
    // The canvases take the game canvas's size on the page, which the renderer sets: written when it changes, not every frame
    // (chat R, 2026-10-04: a style written is the page's to restyle, in Firefox too when the value is the same).
    const width = source.style.width, height = source.style.height;
    if (width) {
      for (const canvas of [screen.out.canvas, screen.veil.canvas]) {
        if (canvas.style.width !== width) canvas.style.width = width;
        if (canvas.style.height !== height) canvas.style.height = height;
      }
    }
    screen.render(this.now() / 1000);
  }

  // Where the screen shows a point of the flat canvas, in CSS pixels: the identity on FLAT.
  project(x, y) {
    if (!this.enabled) return { x, y };
    const { source } = this;
    return projectToScreen(x, y, source.clientWidth || source.width, source.clientHeight || source.height, this.screen.tube());
  }

  // A pointer on the screen, in the flat canvas's pixels: where the player sees a tile is where the tile answers.
  unproject(x, y) {
    if (!this.enabled) return { x, y };
    const { source } = this;
    return unprojectFromScreen(x, y, source.clientWidth || source.width, source.clientHeight || source.height, this.screen.tube());
  }
}
