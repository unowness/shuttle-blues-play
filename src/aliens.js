// The humanoids of the hidden sector (SX, 2026-09-26: "нарисуй там инопланетян
// и планеты, где стоят гуманоиды-инопланетяне"; the block-silhouette version
// was accepted, labs/graphics/sketches/aliens.html). Seen from above, they stand
// on the rim of their planet, feet on the ground and heads out, like the Little
// Prince on his asteroid. Presentation only: they do not collide, move or save.
//
// A planet that has them carries `aliens: { at: [angles], waving: index }` in
// its sector definition (angles in radians, 0 to the right, y down). The one
// at `waving` lifts an arm and lowers it again.

const FIGURES = {
  standing: [' ▚ ▞ ', ' ▐█▌ ', '▐▜█▛▌', ' ▐ ▌ '],
  waving: [' ▚ ▞▗', ' ▐█▌▐', '▐▜██▘', ' ▐ ▌ '],
};
const ALIEN_INK = '#d6dce3';
const SCALE = 0.8;
const WAVE_PERIOD = 1.2;   // s for the arm to go up and come down again

export function drawAliens(r, planet, sx, sy, t) {
  const A = planet.aliens;
  if (!A || !Array.isArray(A.at)) return;
  const cw = r.cellW * SCALE, ch = r.cellH * SCALE;
  const rim = planet.radius + 4;
  A.at.forEach((a, n) => {
    const up = n === A.waving && Math.floor((t / WAVE_PERIOD) * 2) % 2 === 0;
    const rows = up ? FIGURES.waving : FIGURES.standing;
    const turn = a + Math.PI / 2;
    const ca = Math.cos(turn), s = Math.sin(turn);
    const fx = sx + Math.cos(a) * rim, fy = sy + Math.sin(a) * rim;
    rows.forEach((row, j) => Array.from(row).forEach((glyph, i) => {
      if (glyph === ' ') return;
      const lx = (i - 2) * cw, ly = -(rows.length - j - 0.5) * ch;
      r.glyphRot(glyph, fx + lx * ca - ly * s, fy + lx * s + ly * ca, turn, ALIEN_INK, 1, SCALE);
    }));
  });
}
