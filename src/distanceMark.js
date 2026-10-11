// The distance's mark (SX, 2026-10-01: «букву «Ю» надо убрать. Я не понимаю, что это расстояние значит. Туда нужна
// какая-то иконка»; then, of the first try, a dimension line: «иконка расстояния нарисуй просто флажок»). Where a
// distance is printed, the unit `u` gave way to a small flag after the number: a pole as tall as the capitals and a
// pennant off its top, pointing on, in the text's own ink.
//
// In a string the mark is DISTANCE_MARK, one cell of a private character, so every place that counts a label in cells
// (fitText, a label's box) counts it right. The renderer's text() and the halo text draw that cell as the flag below,
// never as the character.

// Made from its code, not written as a character: it is never drawn by the font, so it stays out of the glyphs the
// page warms (labs/graphics/warmup.js, checks/boot.mjs).
const MARK_CHAR = String.fromCharCode(0xE0D1);
const MARK_RUNS = new RegExp(`(${MARK_CHAR}+)`);
export const DISTANCE_MARK = MARK_CHAR;

export const hasDistanceMark = (value) => typeof value === 'string' && value.includes(MARK_CHAR);

// Splits `value` into its runs of text and of marks: [{ text, mark, at }], `at` the run's first cell.
export function markRuns(value) {
  const runs = [];
  let at = 0;
  for (const part of String(value).split(MARK_RUNS)) {
    if (!part) continue;
    const cells = Array.from(part).length;
    if (part[0] === MARK_CHAR) for (let k = 0; k < cells; k++) runs.push({ mark: true, at: at + k });
    else runs.push({ text: part, at });
    at += cells;
  }
  return runs;
}

// The flag's path in a one-cell slot whose left edge is `x`, the text row's top `y` (textBaseline 'top'), with the
// capitals' ink from `capTop` to `capBottom` under it: the pole, then the pennant as a closed triangle. The caller
// strokes it (the pole and the pennant's edge) and fills it (the pennant).
export function traceDistanceMark(ctx, x, y, cellW, capTop, capBottom) {
  const top = Math.round(y + capTop) + 0.5, bottom = Math.round(y + capBottom) + 0.5;
  const pole = Math.round(x + cellW * 0.25) + 0.5;
  const tip = pole + Math.max(4, Math.round(cellW * 0.6));
  const drop = Math.max(4, Math.round((bottom - top) * 0.5));
  ctx.moveTo(pole, bottom); ctx.lineTo(pole, top);
  ctx.moveTo(pole, top); ctx.lineTo(tip, top + drop / 2); ctx.lineTo(pole, top + drop); ctx.closePath();
}
