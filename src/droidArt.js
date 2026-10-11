// The service droids' drawings, seen from above as the ship, the stations and the garage are (SX, 2026-10-04, on the first
// sheet: «ты дроидов вертикальными придумал а у нас вид сверху»; «Танкер больше всего подходит, ты как в гараже в него можешь
// жидкость налить»). SX's picks on labs/graphics/sketches/droids-v2.html (S2, 2026-10-04): R08B TANKER refuels, F01 SPANNER
// mends, with his two fixes in («в носике точку слишком жирный символ», so the tanker's nose is a thin ring ○; «в починщике ты
// можешь пульс изображать белой линией в центре анимацию»), copied here verbatim from the sheet's droids-v2.js. JERRY and CANTEEN,
// the upright front views they replace, stay on labs/graphics/sketches/droids.html.
//
// Thin line art in the world's family, in rows of glyphs; `parts` says what each cell is:
//
//   b  hull         the interface's white (the spanner's pulse)
//   m  fittings     the material gray: the wrench, its arm
//   s  structure    the interface's blue
//   a  the service  the palette's blue on a fuel droid, its green on a repair droid (src/droids.js DROID_INKS): the body's own outline
//   l  lamp         the service ink, blinking (the tanker's ring)
//   e  jet          the blue, flickering: a pair at the droid's back, the family's mark
//   i  tank         an empty cell inside a tank, where its oil shows (src/tankOil.js), never a glyph
//
// `idle`: a loop of whole frames the drawing's size, { fps, seq, frames }, `seq` a string of frame numbers (0 the drawing, 1.. the
// frames); a frame without `parts` keeps the drawing's. Still under reduced motion. `tank`: the shape its oil is held in.
// The names are the droids' own, said on their menu.

// F01 SPANNER's screen: a heartbeat in the white, three cells inside the crown's frame. At rest a still trace with one beat; the
// loop runs the beat in from the left and out at the right, then rests (4 steps a second, a beat every 1.5 s), and twice in three
// beats the wrench turns.
function spanner() {
  const at = (trace, jaw = '⊂') => ['  ╭─────╮   ', '◦╱ ╭───╮ ╲  ', ` │ │${trace}│ ├─${jaw}`, '◦╲ ╰───╯ ╱  ', '  ╰─────╯   '];
  const traces = ['╲──', '─╱╲', '──╱', '───'];           // frames 1-4; the drawing itself is '╱╲─'
  const beat = '102344';                                    // in, crossing, out, rest
  return {
    name: 'SPANNER',
    rows: at('╱╲─'),
    parts: ['  aaaaaaa   ', 'ea aaaaa a  ', ' a abbba amm', 'ea aaaaa a  ', '  aaaaaaa   '],
    idle: { fps: 4, seq: beat + beat + '102545', frames: [...traces.map((tr) => ({ rows: at(tr) })), { rows: at('───', '∩') }] },
  };
}

export const DROID_ART = Object.freeze({
  // R08B TANKER: a ball tank, as a ship's propellant tanks are, the cab out in front on a short neck; the oil rounds in the ball.
  fuel: [
    {
      name: 'TANKER',
      rows: ['  ╭────╮    ', '◦╱      ╲╭─╮', ' │      ├┤○│', '◦╲      ╱╰─╯', '  ╰────╯    '],
      parts: ['  aaaaaa    ', 'eaiiiiiiaaaa', ' aiiiiiiaala', 'eaiiiiiiaaaa', '  aaaaaa    '],
      tank: { shape: 'round' },
    },
  ],
  // F01 SPANNER: a hard hat seen from above, brim and crown, a pulse on the crown's screen, a wrench held out on one arm.
  repair: [spanner()],
});

// The droids' idle loops run while this is on; the page turns it off under reduced motion (labs/graphics/main.js), as it does the
// souvenirs' (src/souvenirArt.js ART_MOTION).
export const DROID_MOTION = { on: true };

// A drawing's size in cells.
export const droidSize = (art) => ({ width: Math.max(...art.rows.map((r) => [...r].length)), height: art.rows.length });

// The drawing at time `t` (its phase added): the frame its idle loop is on, or the drawing itself.
export function idleFrame(art, t) {
  const idle = art.idle;
  if (!idle || !DROID_MOTION.on || !(t > 0)) return art;
  const k = Number(idle.seq[Math.floor(t * idle.fps) % idle.seq.length]) || 0;
  if (!k) return art;
  const f = idle.frames[k - 1];
  return { rows: f.rows, parts: f.parts || art.parts };
}
