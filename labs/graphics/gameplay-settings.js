// The pause's GAMEPLAY SETTINGS (SX, 2026-10-02: «засунуть в настройки геймплея пункт GAMEPLAY в котором можно регулировать это»,
// then «в меню геймплея должна быть настройка паралакса сила реакции дальность слоев и количество движения в целом»): each a row
// of ten steps, kept in this browser under one key. The mouse's turn is read by labs/graphics/mouse-flight.js, the parallax's
// three by labs/graphics/depth.js, how the keys steer (STEERING: TANK or SCREEN, 2026-10-06) by src/steering.js; here only how they
// are kept.
// The key and how it is read and written are src/prefs.js's (PLAN C3, 2026-10-03): the store is the last argument, this browser's own
// when it is left out; a write is merged into what is kept, so one setting written does not drop the others.
export { readGameplay, writeGameplay } from '../../src/prefs.js';
