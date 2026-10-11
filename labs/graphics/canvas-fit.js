// The canvas fitted to its window, cut from labs/graphics/main.js (PLAN D4, toward createGame). The HTML over the canvas follows a resized
// window too (QA, 2026-09-30: the name field stayed where the card had been, 140 px off): the name field is placed again every frame it is
// open. A window moved between a 1x and a 2x display changes its pixel ratio and maybe not its size, and no event is promised for that
// (audit FE-05: the canvas stayed at the old ratio). So every frame compares the ratio with the one the canvas was fitted at (`follow`).
// `window` is the page's (only its devicePixelRatio is read), `renderer` the canvas's, `world` the one whose ship is measured again.
export function createCanvasFit({ window, renderer, world }) {
  let fitted = window.devicePixelRatio;
  function fit() {
    fitted = window.devicePixelRatio;
    renderer.resize();
    world.ship.measureDrawing(renderer.cellW, renderer.cellH);
  }
  function follow() {
    if (window.devicePixelRatio !== fitted) fit();
  }
  return { fit, follow };
}
