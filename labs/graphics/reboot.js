// The ship's return after a wreck, its numbers (labs/graphics/respawn-fx.js draws it): the sweep across the screen and the ship's rise
// from under its place. Apart from the drawing so the docking's rise (labs/graphics/dock-fx.js), the respawn's own, reads them without
// the world's painters.
export const REBOOT = Object.freeze({
  sweep: 0.5, lean: 0.7, band: 0.1, ragged: 0.03, glyphs: '01/:·_', tick: 0.05, ink: '#000000',
  rise: Object.freeze({ start: 0.85, from: 150, small: 0.4, fade: 0.3, zeta: 0.55, peak: 0.42, time: 1.1, hands: 0.6 }),
});
