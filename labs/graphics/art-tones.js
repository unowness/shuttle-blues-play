// The tones the world's art shares with the stations' (station-art.js) and the garage's (garage-art.js): the block planets'
// steps from one hue, and the rocks' outline and shading. In world-art.js until PLAN D2 (2026-10-04), where the three files
// imported each other for them; world-art.js re-exports them.
import { mixHex } from '../../src/util.js';

// The block family's tones, derived from the planet's one authored hue
// (`planetHue` in src/sectors.js), so retuning a hue retunes every step (SX, 2026-09-30:
// "цветные планеты"). Lit land is the tint itself; the rest step down from it:
// `mid` is the tint mixed toward the planet's own dark, `shadow` a very dark
// tint for the night side, `rim` the tint dimmed for the ring of dots. On
// black these read 4.3 to 8.9 (mid and rim) and 1.5 to 2.0 (the night side) to
// 1 across the twelve planets, under the lit tone's 7.3 to 14 (checks/planets.mjs
// holds the order and the floors).
export const BLOCK_TONES = Object.freeze({ mid: 0.7, shadow: 0.3, rim: 0.8 });
export function planetTones(planet) {
  const { tint, dark } = planet;
  return {
    lit: tint,
    mid: mixHex(dark, tint, BLOCK_TONES.mid),
    shadow: mixHex('#000000', tint, BLOCK_TONES.shadow),
    rim: mixHex('#000000', tint, BLOCK_TONES.rim),
  };
}

// The outline's strength (SX, 2026-10-03: «у астероидов слишком яркий край ... на 30% приглушеннее или может быть 50 даже ...
// чтобы его легко все равно было заметить, но не очень, и чтобы они поспокойнее выглядели»): 30 % quieter. Its blue half then
// reads 2.9:1 on black and its gray half 4.0 (5.0 and 7.5 at full); at 50 % the blue would be 1.95, under the 3:1 an edge
// that must be seen wants, and the rocks would be lost on the dark.
export const ROCK_EDGE = 0.7;

// The field rocks' own inks (SX's pick R1 SLATE on labs/graphics/sketches/space-tones.html, 2026-10-04: «R1 K4 V1 E1», after «у них
// [облаков] ... должен быть другой оттенок не такой как у астероидов ... розово фиолетовый»): the outline's lit half, its shaded half
// and the '░' step in one cool slate nearly without chroma (OKLCH 0.62 and 0.50, chroma 0.03 and 0.045, hue 245), so the clouds'
// pink-violet is the only coloured tone in empty space. The outline at `edge`, the '░' at `fill`. Through the grade and the look NOW
// the lit edge reads 3.4:1 on black (3.9 in the gray and blue before), the shaded 2.2 (2.6), the fill 1.7 (3.4: it was louder than
// the shaded edge, and a rock read as a heavy mass). SX named the rocks only: the garage's stone keeps ROCK_EDGE and the roles'
// inks, the fog past a dead edge its blue.
export const ROCK_INKS = Object.freeze({ lit: '#788897', shade: '#4E667C', edge: 0.75, fill: 0.6 });

// The inside of a rock: lit from the upper left like the planets (CONFIG.planet.light), on a ball. From 2026-10-01 its
// dark side was shaded in the structure blue, '▒' where darkest and '░' in the half-light (SX, of
// labs/graphics/sketches/rock-fills.html: «У камня берем версию Shade», then «поярче»). The same night SX turned it
// away: «у астероидов все-таки уберем, наверное, шейдинг. Сделаем какой-то другой, более легкий, более невесомый.
// Сейчас у них серьезный шейдинг» — the rocks read heavy and too big. Then the dark side was hatched (the
// sheet's HATCH made sparser): short '╱' strokes along the cells' diagonals, one diagonal in two where it is darkest
// and one in three in the half-light, each broken every third cell, in the structure blue at part strength; the lit
// side is empty. SX turned the hatching away too, of the four ways on labs/graphics/sketches/garage-setting.html
// (2026-10-01, late: «штриховки у камней не понравились у астероидов нормальный второй вариант который упрощенный
// подойдет»): S1 ONE STEP, the half-light's '░' at 0.85 over the whole shaded side (ROCK_SHADE.half where `lit` is under
// ROCK_LIT), the denser '▒' step gone. The light is the sky's, so the shading stays put while the rock turns under it;
// only the outline turns. A cell is inside when its middle is more than SHADE_GAP cells within the outline.
export const ROCK_LIT = 0.42;
// The two steps of the former shading, a glyph and its alpha: the rocks draw `half` alone; the garage's own rock keeps
// both (SX picked its S0 tile).
export const ROCK_SHADE = Object.freeze({ dark: Object.freeze({ ch: '▒', alpha: 1 }), half: Object.freeze({ ch: '░', alpha: 0.85 }) });
// A cell of black between the shading and the outline, whichever way (SX, 2026-10-01: «шейдинг ... слишком близко к
// рамке астероида ... сохранял какой-то размер одной клетки шейдинга, черный отступ до рамки»): a shaded cell's middle
// stands SHADE_GAP cells inside the outline along its own direction from the middle, a cell being as wide or as tall
// as the game's cell that way.
export const SHADE_GAP = 2;

// The rocks' relief (labs/graphics/world-art.js shadeAsteroid has the why and the rule): their dents and knobs, the grain, and how far
// each moves the light. Here since chat G (2026-10-04), so the garage's stone (garage-art.js) is shaded by the same numbers.
export const ROCK_RELIEF = Object.freeze({
  level: 0.5,             // the light the ball's shading is pulled toward, and
  ball: 0.45,             // how much of the ball's own light is kept (1: all of it, the crescent)
  bumps: [9, 13],         // dents and knobs on a rock, from-to
  size: [0.07, 0.18],     // their radius, in the rock's radii
  knobs: 0.3,             // the share that stand out rather than dent in
  strength: 1.7,          // how far a bump's slope moves the light
  grain: 0.12,            // the fine roughness's lattice, in the rock's radii
  grit: 0.28,             // and how much it moves the light, either way
});
