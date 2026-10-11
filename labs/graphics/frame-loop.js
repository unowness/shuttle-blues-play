// The frame loop, cut from labs/graphics/main.js (PLAN D4, toward createGame). Behind the title (the boot) the world does not step and
// nothing is saved: the boot's frame is run, the pace sees the refresh, and the next is asked for. A refresh between two drawn frames
// (src/framePace.js) draws nothing and runs nothing; the keys pressed meanwhile wait for the next. Otherwise one flight frame: one fault in
// it costs that frame, not the game, the next frame is asked for and the keys are read as handled whatever happened. The fault is logged
// once, not every frame: the same one sixty times a second would bury it.
//
// `title` ({ active }), `framePace` ({ see, draws }), `bootFrame(now)`, `flightFrame(now)`, `input` ({ endFrame }) are the page's;
// `schedule(frame)` asks for the next refresh (requestAnimationFrame) and `log(...)` is the console's.
export function createFrameLoop({ title, framePace, bootFrame, flightFrame, input, schedule = (next) => requestAnimationFrame(next), log = (...a) => console.error(...a) }) {
  let fault = '';
  function frame(now) {
    if (title.active) { framePace.see(now); bootFrame(now); schedule(frame); return; }
    if (!framePace.draws(now)) { schedule(frame); return; }
    try {
      flightFrame(now);
    } catch (error) {
      const text = String(error?.stack || error);
      if (text !== fault) { fault = text; log('the frame failed; the game keeps running', error); }
    } finally {
      input.endFrame();
      schedule(frame);
    }
  }
  return frame;
}
