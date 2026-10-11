// The interface's presentations a pilot earns (chat P, 2026-10-04; the economy's section 10, codex/economy-2026-10-03/CLAUDE_HANDOFF.md:
// «Locator: compact display presentation at restoration 1 · Radio: separate history module at restoration 2 · Souvenirs: extended
// display layout at restoration 3 · Photo frame: frame at restoration 5, using game captures first», each joining its station's
// episode). A presentation is a choice the layout editor offers once earned (labs/graphics/hud-place.js, the pause's LAYOUT page);
// the default stays, and nothing essential sits behind one: the hull, the fuel, the notices and the task the pilot follows are the
// game's whatever is earned, and no presentation changes what a module can tell (the handoff: «Cosmetics must not change
// precision/range/detection»).
//
// Earned by the number of stations restored (World.ledger.restored, a set that never shrinks: a raid breaks a station, it never
// un-restores it), so nothing earned is ever taken back and an old save holds every presentation it qualifies for with no migration.
// The one reward ledger (chat N2) may record them as `widgetLooks` later; this is the rule it would record.
//
// `drawn`: whether the game draws it yet. LOCATOR COMPACT and SOUVENIRS DISPLAY are drawn by the locator's and the shelf's painters
// (labs/graphics/locator.js, labs/graphics/hud.js: chat H's files): they are earned and named here, and the editor offers them once
// a painter draws them (the seam: set `drawn` and read lookOf in that painter). Pure: no DOM.

export const WIDGETS = Object.freeze([
  // Drawn by labs/graphics/locator.js since chat H (2026-10-04): the scope at its size before S3, the column's width kept.
  Object.freeze({ id: 'locator-compact', group: 'column', look: 'compact', label: 'COMPACT', restorations: 1, drawn: true }),
  // The radio's log and the photo frame are not drawn since SX's word of 2026-10-05 (on labs/graphics/sketches/widgets.html: «лог радио в
  // принципе не нужно делать я скорее про графический виджет анимированный где изображено радио ... украшалка пока можно не делать»):
  // the radio is a picture under the quests now, every pilot's once the opening fits it (labs/graphics/radio.js), not a presentation.
  // Their painters (labs/graphics/radio-log.js, photo-frame.js) are kept until SX says they go.
  Object.freeze({ id: 'radio-log', group: 'radio', look: 'log', label: 'LOG', restorations: 2, drawn: false }),
  Object.freeze({ id: 'shelf-display', group: 'shelf', look: 'display', label: 'DISPLAY', restorations: 3, drawn: false }),
  Object.freeze({ id: 'photo-frame', group: 'photo', look: 'frame', label: 'FRAME', restorations: 5, drawn: false }),
]);
// Each group's own presentation (the one a new pilot has), and what the editor calls it; a group whose own is 'off' is not drawn
// until a presentation is worn (the radio's log, the photo frame: modules of their own, not on the screen before).
export const BASE_LOOKS = Object.freeze({ column: Object.freeze({ look: 'full', label: 'FULL' }), shelf: Object.freeze({ look: 'shelf', label: 'SHELF' }),
  radio: Object.freeze({ look: 'off', label: 'OFF' }), photo: Object.freeze({ look: 'off', label: 'OFF' }) });

export const restoredCount = (ledger) => ledger?.restored?.size ?? 0;
export const widgetEarned = (ledger, w) => restoredCount(ledger) >= w.restorations;
// The presentations earned and drawn, for a group or all.
export const earnedWidgets = (ledger, group = null) => WIDGETS.filter((w) => w.drawn && widgetEarned(ledger, w) && (!group || w.group === group));
// Whether a drawn presentation is still to be earned (the editor says more come with the ruins).
export const widgetsToCome = (ledger) => WIDGETS.some((w) => w.drawn && !widgetEarned(ledger, w));
// The looks a group can wear now, its own first: [{ look, label }].
export function looksFor(ledger, group) {
  const base = BASE_LOOKS[group];
  return [...(base ? [{ look: base.look, label: base.label }] : []), ...earnedWidgets(ledger, group).map((w) => ({ look: w.look, label: w.label }))];
}
// The look a group wears, given the one kept for it (`kept`): kept if this pilot has earned it, else its own.
export function wornLook(ledger, group, kept) {
  const own = BASE_LOOKS[group]?.look ?? null;
  return kept && kept !== own && earnedWidgets(ledger, group).some((w) => w.look === kept) ? kept : own;
}
