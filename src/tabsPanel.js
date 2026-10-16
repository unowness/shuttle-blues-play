// The words of the window about two tabs on one save (src/tabs.js), drawn by labs/graphics/tabs-window.js in the
// cargo plate's way (SX, 2026-10-01: «Мне не нравится, как ты сделал дизайн notification о том, что открыто второе
// окно, какой-то он ненарядный, непонятный, и при этом он пропадает без предупреждения, когда второе окно закрыто. Я
// бы там менял просто статус и нажимал, типа, press any button to start game»). A state is its title plate (the
// kind's ink, the strip's mark), the lines under it, the status line that says what happens now, and a key to leave
// it by, if there is one.
//   waiting: this tab was opened last; it plays and saves, and an older one is still open.
//   clear:   the older one has closed; any key plays on here.
//   older:   a newer tab was opened; this one is paused for good and saves nothing.
// The key is read from the bindings (src/controls.js), never typed (Codex's text pass UD03, 2026-10-16).
import { keyName } from './controls.js';

export const TAB_WINDOWS = {
  waiting: {
    kind: 'refusal', mark: '!', title: 'GAME OPEN ELSEWHERE',
    lines: ['GAME OPEN IN ANOTHER TAB.', 'THIS TAB WILL SAVE YOUR PROGRESS.', 'THE OTHER TAB IS PAUSED.'],
    status: "READY TO PLAY HERE", waiting: true,
    key: `[${keyName('back')}] CONTINUE HERE`,
  },
  clear: {
    kind: 'gain', mark: '+', title: 'READY TO CONTINUE',
    lines: ['THE OTHER TAB IS CLOSED.', 'PROGRESS WILL BE SAVED HERE.'],
    status: 'CLICK OR PRESS A KEY TO CONTINUE', breathes: true,
    key: null,
  },
  older: {
    kind: 'danger', mark: '!', title: 'ACTIVE IN ANOTHER TAB',
    lines: ['GAME OPENED IN ANOTHER TAB.', 'THIS TAB IS PAUSED AND WILL NOT SAVE.', "CONTINUE IN THE OTHER TAB."],
    status: "RELOAD TO PLAY IN THIS TAB",
    key: null,
  },
};
